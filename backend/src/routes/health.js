import express from 'express'
import pool from '../lib/db.js'
import { getSyncState } from '../services/syncService.js'
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'
import { getMailConfig } from '../routes/mail.js'
import nodemailer from 'nodemailer'
import { logger } from '../utils/logger.js'
import { loggingService } from '../services/loggingService.js'
import { sqlNowSAST, TIMEZONE } from '../utils/timezone.js'

export const healthRouter = express.Router()

async function checkService(name, fn, timeout = 5000) {
  const start = Date.now()
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
    ])
    return {
      status: 'up',
      latency: Date.now() - start,
      lastCheck: new Date().toISOString(),
      details: result || {},
    }
  } catch (error) {
    return {
      status: 'down',
      latency: Date.now() - start,
      lastCheck: new Date().toISOString(),
      error: error.message,
    }
  }
}

async function checkDatabase() {
  const start = Date.now()
  try {
    const result = await pool.query(`SELECT ${sqlNowSAST()} as now, version() as version`)
    const tablesResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM auth_users) as users,
        (SELECT COUNT(*) FROM user_profiles) as profiles,
        (SELECT COUNT(*) FROM audit_log) as audit_logs
    `)
    return {
      connected: true,
      latency: Date.now() - start,
      version: result.rows[0].version?.split(' ')[0] || 'Unknown',
      tables: {
        users: tablesResult.rows[0].users,
        profiles: tablesResult.rows[0].profiles,
        auditLogs: tablesResult.rows[0].audit_logs,
      }
    }
  } catch (error) {
    return {
      connected: false,
      error: error.message,
    }
  }
}

async function checkSMTP() {
  try {
    const config = await getMailConfig()
    
    if (!config.host || config.host === 'smtp.example.com') {
      return {
        configured: false,
        status: 'not_configured',
        message: 'SMTP not configured',
      }
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465 || config.secure,
      requireTLS: config.port !== 465,
      tls: {
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    })

    const start = Date.now()
    await transporter.verify()
    const latency = Date.now() - start

    loggingService.logMailEvent('connection_test', {
      host: config.host,
      port: config.port,
      latency,
      success: true,
    })

    return {
      configured: true,
      status: 'up',
      host: config.host,
      port: config.port,
      fromAddress: config.fromAddress,
      latency,
      lastCheck: new Date().toISOString(),
    }
  } catch (error) {
    loggingService.logMailEvent('connection_test', {
      success: false,
      error: error.message,
    })

    return {
      configured: true,
      status: 'down',
      error: error.message,
      lastCheck: new Date().toISOString(),
    }
  }
}

async function getMetrics() {
  try {
    const userCount = await pool.query('SELECT COUNT(*) as count FROM auth_users')
    const activeSessions = await pool.query(`
      SELECT COUNT(*) as count FROM auth_sessions 
      WHERE expires_at > ${sqlNowSAST()}
    `)
    const failedLogins = await pool.query(`
      SELECT COUNT(*) as count FROM audit_log 
      WHERE action LIKE '%login%' AND success = false 
      AND created_at > ${sqlNowSAST()} - INTERVAL '24 hours'
    `)
    const recentSync = await pool.query(`
      SELECT created_at, status FROM sync_history 
      ORDER BY created_at DESC LIMIT 1
    `)

    return {
      totalUsers: parseInt(userCount.rows[0].count),
      activeSessions: parseInt(activeSessions.rows[0].count),
      failedLogins24h: parseInt(failedLogins.rows[0].count),
      lastSync: recentSync.rows[0]?.created_at || null,
      lastSyncStatus: recentSync.rows[0]?.status || 'unknown',
    }
  } catch (error) {
    logger.error('Error getting metrics:', error.message)
    return {}
  }
}

healthRouter.get('/', async (req, res) => {
  const startTotal = Date.now()

  const [authentik, ldap, database, smtp, metrics] = await Promise.all([
    checkService('authentik', () => authentikClient.getUsers()),
    checkService('ldap', () => ldapClient.getUsers()),
    checkDatabase(),
    checkSMTP(),
    getMetrics(),
  ])

  const syncState = getSyncState()

  const overallStatus = 
    authentik.status === 'up' && 
    ldap.status === 'up' && 
    database.connected

  const responseTime = Date.now() - startTotal

  loggingService.logSystemEvent('health_check', {
    overallStatus: overallStatus ? 'healthy' : 'degraded',
    responseTime,
    services: {
      authentik: authentik.status,
      ldap: ldap.status,
      database: database.connected ? 'up' : 'down',
      smtp: smtp.status,
    },
  })

  res.json({
    status: overallStatus ? 'healthy' : 'degraded',
    responseTime,
    services: {
      authentik,
      ldap,
      database,
      smtp,
    },
    sync: {
      status: syncState.status,
      lastSync: syncState.lastSync,
      lastChange: syncState.lastChange,
      errors: syncState.errors,
    },
    metrics,
    timestamp: new Date().toISOString(),
    timezone: TIMEZONE,
  })
})

healthRouter.post('/test-service/:service', async (req, res) => {
  const { service } = req.params
  const start = Date.now()

  try {
    let result
    switch (service) {
      case 'authentik':
        result = await checkService('authentik', () => authentikClient.getUsers())
        break
      case 'ldap':
        result = await checkService('ldap', () => ldapClient.getUsers())
        break
      case 'database':
        result = await checkDatabase()
        break
      case 'smtp':
        result = await checkSMTP()
        break
      default:
        return res.status(400).json({ error: 'Unknown service' })
    }

    loggingService.logSystemEvent('service_test', {
      service,
      status: result.status,
      latency: Date.now() - start,
    })

    res.json({
      service,
      ...result,
      testDuration: Date.now() - start,
    })
  } catch (error) {
    loggingService.logSystemEvent('service_test_failed', {
      service,
      error: error.message,
    })

    res.status(500).json({
      service,
      status: 'down',
      error: error.message,
    })
  }
})