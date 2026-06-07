import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'
import { createAuditLog } from './auditService.js'

const discoveryState = {
  interval: null,
  running: false,
}

export async function runSchemaDiscoveryCycle(io) {
  if (discoveryState.running) {
    logger.info('Schema discovery already running, skipping cycle')
    return
  }
  discoveryState.running = true
  try {
    const apps = await pool.query(
      'SELECT slug, name, schema_endpoint FROM apps WHERE schema_endpoint IS NOT NULL AND is_active = true'
    )
    if (apps.rows.length === 0) {
      return
    }
    logger.info('Schema discovery polling ' + apps.rows.length + ' app(s)')
    let totalUpdated = 0
    let totalFailed = 0
    for (const app of apps.rows) {
      try {
        const response = await fetch(app.schema_endpoint, {
          signal: AbortSignal.timeout(10000),
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          logger.warn('Schema endpoint returned ' + response.status + ' for ' + app.slug, { endpoint: app.schema_endpoint })
          totalFailed++
          continue
        }
        const body = await response.json()
        const modules = body.modules || body
        if (!Array.isArray(modules)) {
          logger.warn('Schema endpoint for ' + app.slug + ' did not return an array', { endpoint: app.schema_endpoint })
          totalFailed++
          continue
        }
        await pool.query(
          `INSERT INTO app_schemas (app_slug, modules, source, last_synced, updated_at)
          VALUES ($1, $2, 'auto_poll', NOW(), NOW())
          ON CONFLICT (app_slug) DO UPDATE
            SET modules = EXCLUDED.modules,
                source = CASE WHEN app_schemas.source = 'admin_override' THEN app_schemas.source ELSE 'auto_poll' END,
                last_synced = NOW(),
                updated_at = NOW()
        `, [app.slug, JSON.stringify(modules)])
        await createAuditLog({
          action: 'rbac_schema_auto_discovered',
          actor: 'system',
          entity_type: 'rbac_schema',
          entity_id: app.slug,
          changes: { moduleCount: modules.length, source: 'auto_poll' },
          source: 'system',
          success: true,
        })
        logger.info('Schema auto-discovered for ' + app.slug, { moduleCount: modules.length })
        totalUpdated++
      } catch (err) {
        logger.warn('Schema discovery failed for ' + app.slug, { error: err.message, endpoint: app.schema_endpoint })
        totalFailed++
      }
    }
    logger.info('Schema discovery cycle complete', { updated: totalUpdated, failed: totalFailed })
    if (io) {
      io.to('logs').emit('log', {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Schema discovery cycle complete: ' + totalUpdated + ' updated, ' + totalFailed + ' failed',
        context: { updated: totalUpdated, failed: totalFailed },
      })
    }
  } catch (err) {
    logger.error('Schema discovery cycle error', { error: err.message })
  } finally {
    discoveryState.running = false
  }
}

export function startSchemaDiscoveryService(io) {
  const intervalMinutes = parseInt(process.env.SCHEMA_DISCOVERY_INTERVAL_MINUTES || '5', 10)
  const enabled = process.env.SCHEMA_DISCOVERY_ENABLED !== 'false'
  if (!enabled) {
    logger.info('Schema discovery service disabled via SCHEMA_DISCOVERY_ENABLED=false')
    return
  }
  if (discoveryState.interval) {
    clearInterval(discoveryState.interval)
  }
  runSchemaDiscoveryCycle(io).catch(err => {
    logger.error('Initial schema discovery cycle failed:', err.message)
  })
  discoveryState.interval = setInterval(() => {
    runSchemaDiscoveryCycle(io).catch(err => {
      logger.error('Schema discovery cycle failed:', err.message)
    })
  }, intervalMinutes * 60 * 1000)
  logger.info('Schema discovery service started', { intervalMinutes })
}

export function stopSchemaDiscoveryService() {
  if (discoveryState.interval) {
    clearInterval(discoveryState.interval)
    discoveryState.interval = null
  }
  discoveryState.running = false
  logger.info('Schema discovery service stopped')
}
