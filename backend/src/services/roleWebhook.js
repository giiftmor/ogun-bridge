import fetch from 'node-fetch'
import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'

export async function notifyRoleChange(appSlug, sub, email, oldRole, newRole, groups) {
  try {
    const app = await pool.query('SELECT slug, api_key, schema_endpoint FROM apps WHERE slug = $1', [appSlug])
    if (app.rows.length === 0) return
    const { api_key, schema_endpoint } = app.rows[0]
    if (!schema_endpoint) return

    const webhookUrl = `${schema_endpoint.replace(/\/+$/, '')}/role-change`

    const body = {
      event: 'role_change',
      app_slug: appSlug,
      sub,
      email,
      old_role: oldRole,
      new_role: newRole,
      groups: groups || [],
      timestamp: new Date().toISOString(),
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': api_key,
      },
      body: JSON.stringify(body),
      timeout: 10000,
    })

    if (!response.ok) {
      logger.warn('Role webhook returned non-ok', { appSlug, sub, status: response.status })
    } else {
      logger.info('Role webhook sent', { appSlug, sub, newRole })
    }
  } catch (error) {
    logger.warn('Role webhook failed', { appSlug, sub, error: error.message })
  }
}

export async function notifyAppSync(appSlug, results) {
  try {
    const app = await pool.query('SELECT slug, api_key, schema_endpoint FROM apps WHERE slug = $1', [appSlug])
    if (app.rows.length === 0) return
    const { api_key, schema_endpoint } = app.rows[0]
    if (!schema_endpoint) return

    const webhookUrl = `${schema_endpoint.replace(/\/+$/, '')}/sync-notify`

    const body = {
      event: 'sync_complete',
      app_slug: appSlug,
      results,
      timestamp: new Date().toISOString(),
    }

    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': api_key,
      },
      body: JSON.stringify(body),
      timeout: 10000,
    }).catch(err => {
      logger.warn('Sync webhook failed', { appSlug, error: err.message })
    })
  } catch (error) {
    logger.warn('Sync webhook lookup failed', { appSlug, error: error.message })
  }
}
