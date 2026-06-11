import express from 'express'
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'
import { getSyncState } from '../services/syncService.js'
import { getChanges } from '../services/changeDetector.js'
import { logger } from '../utils/logger.js'
import { authenticate } from '../middleware/auth.js'
import { AppError } from '../utils/AppError.js'

export const dashboardRouter = express.Router()

dashboardRouter.use(authenticate)

let lastActivityCache = null

dashboardRouter.get('/stats', async (req, res) => {
  try {
    const syncState = getSyncState()
    
    const [authentikUsers, ldapUsers, pendingChanges, authentikGroups, ldapGroups] = await Promise.all([
      authentikClient.getUsers(),
      ldapClient.getUsers(),
      getChanges({ status: 'pending', limit: 1000 }),
      authentikClient.getGroups(),
      ldapClient.getGroups(),
    ])
    
    res.json({
      authentikUsers: authentikUsers.length,
      ldapUsers: ldapUsers.length,
      authentikGroups: authentikGroups.length,
      ldapGroups: ldapGroups.length,
      pendingChanges: pendingChanges.length,
      failedSyncs: syncState.recentErrors.length,
      lastSyncTime: syncState.lastSyncTime,
      lastSyncDuration: syncState.lastSyncDuration,
      syncStatus: syncState.status,
      syncConfig: syncState.config,
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error fetching dashboard stats:', error)
    res.status(500).json({ error: 'Failed to fetch dashboard stats', code: 'INTERNAL_ERROR', status: 500 })
  }
})

dashboardRouter.get('/activity', async (req, res) => {
  const syncState = getSyncState()

  const activity = syncState.history.map(h => ({
    action: h.errors > 0 ? 'warning' : 'success',
    message: `Sync: ${h.created} created, ${h.updated} updated, ${h.deleted} deleted${h.errors > 0 ? `, ${h.errors} errors` : ''}`,
    timestamp: h.timestamp,
    details: h,
  }))

  // Compare with last result
  const currentStr = JSON.stringify(activity)
  if (lastActivityCache && lastActivityCache === currentStr) {
    // Return "no new changes" message
    return res.json([{
      action: 'info',
      message: 'No new changes. Sync is up to date.',
      timestamp: new Date().toISOString(),
      details: null,
    }])
  }

  lastActivityCache = currentStr
  res.json(activity)
})

dashboardRouter.get('/health', async (req, res) => {
  const syncState = getSyncState()

  try {
    await Promise.all([
      authentikClient.getUsers(),
      ldapClient.getUsers(),
    ])

    res.json({
      status: 'healthy',
      services: {
        authentik: 'up',
        ldap: 'up',
        sync: syncState.status,
      },
      timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    })
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    })
  }
})
