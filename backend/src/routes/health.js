import express from 'express'
import { getSyncState } from '../services/syncService.js'
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'

export const healthRouter = express.Router()

healthRouter.get('/', async (req, res) => {
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
