import express from 'express'
import { AppError } from '../utils/AppError.js'
import { loggingService, LOG_CATEGORIES } from '../services/loggingService.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'
import { pool } from '../lib/db.js'

export const operationsRouter = express.Router()

operationsRouter.use(authenticate)

operationsRouter.get('/logs', async (req, res) => {
  try {
    const { category = 'all', level = 'all', limit = 100 } = req.query
    
    let logs
    if (category === 'all') {
      logs = loggingService.getAllLogs(parseInt(limit))
    } else {
      logs = loggingService.getLogs(category, parseInt(limit))
    }

    if (level !== 'all') {
      logs = logs.filter(log => log.level === level)
    }

    res.json(logs)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ success: false, error: error.message, code: error.code, status: error.status })
    }
    res.status(500).json({ success: false, error: 'Failed to fetch logs', code: 'INTERNAL_ERROR', status: 500 })
  }
})

operationsRouter.get('/stats', async (req, res) => {
  try {
    const stats = loggingService.getStats()
    res.json(stats)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ success: false, error: error.message, code: error.code, status: error.status })
    }
    res.status(500).json({ success: false, error: 'Failed to fetch stats', code: 'INTERNAL_ERROR', status: 500 })
  }
})

operationsRouter.delete('/logs', requireRole('admin'), async (req, res) => {
  try {
    const { category = 'all' } = req.query
    
    if (category === 'all') {
      loggingService.clearAll()
    } else {
      loggingService.clearCategory(category)
    }

    res.json({ success: true })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ success: false, error: error.message, code: error.code, status: error.status })
    }
    res.status(500).json({ success: false, error: 'Failed to clear logs', code: 'INTERNAL_ERROR', status: 500 })
  }
})

operationsRouter.get('/status', async (req, res) => {
  const startTime = Date.now()
  const results = {}

  try {
    const akStart = Date.now()
    await authentikClient.getUsers()
    results.authentik = {
      status: 'up',
      latency: Date.now() - akStart,
      url: process.env.AUTHENTIK_URL,
    }
  } catch (error) {
    results.authentik = {
      status: 'down',
      error: error.message,
      url: process.env.AUTHENTIK_URL,
    }
  }

  try {
    const ldapStart = Date.now()
    await ldapClient.getUsers()
    results.ldap = {
      status: 'up',
      latency: Date.now() - ldapStart,
      url: `ldap://${process.env.LDAP_HOST}:${process.env.LDAP_PORT}`,
    }
  } catch (error) {
    results.ldap = {
      status: 'down',
      error: error.message,
      url: `ldap://${process.env.LDAP_HOST}:${process.env.LDAP_PORT}`,
    }
  }

  try {
    const dbStart = Date.now()
    await pool.query('SELECT 1')
    results.postgresql = {
      status: 'up',
      latency: Date.now() - dbStart,
      url: `postgresql://${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
    }
  } catch (error) {
    results.postgresql = {
      status: 'down',
      error: error.message,
      url: `postgresql://${process.env.DB_HOST}:${process.env.DB_PORT}`,
    }
  }

  try {
    const mailStart = Date.now()
    const mailUrl = process.env.MAILSERVER_ENABLED !== 'false' 
      ? `http://${process.env.MAILSERVER_CONTAINER || 'mailserver'}:8080/health`
      : null
    
    if (mailUrl) {
      const response = await fetch(mailUrl, { signal: AbortSignal.timeout(5000) })
      results.mailserver = {
        status: response.ok ? 'up' : 'degraded',
        latency: Date.now() - mailStart,
        url: mailUrl,
      }
    } else {
      results.mailserver = {
        status: 'not_configured',
        url: null,
      }
    }
  } catch (error) {
    results.mailserver = {
      status: 'down',
      error: error.message,
      url: 'http://mailserver:8080/health',
    }
  }

  results.totalLatency = Date.now() - startTime
  results.timestamp = new Date().toISOString()

  const allUp = Object.values(results).every(r => r.status === 'up' || r.status === 'not_configured')
  results.overallStatus = allUp ? 'healthy' : 'degraded'

  res.json(results)
})

export default operationsRouter