import express from 'express'
import { getSyncState, startSyncService, stopSyncService, triggerManualSync } from '../services/syncService.js'
import { authenticate } from '../middleware/auth.js'

export const syncRouter = express.Router()

syncRouter.use(authenticate)

// GET /api/sync/status - Current sync state
syncRouter.get('/status', (req, res) => {
  res.json(getSyncState())
})

// GET /api/sync/history - Sync history
syncRouter.get('/history', (req, res) => {
  const state = getSyncState()
  res.json(state.history)
})

// POST /api/sync/run - Trigger manual sync
syncRouter.post('/run', async (req, res) => {
  const state = getSyncState()

  if (state.status === 'running') {
    return res.status(409).json({ error: 'Sync already running' })
  }

  // Trigger async - don't wait for it to finish
  triggerManualSync(req.app.get('io')).catch(err => {
    console.error('Manual sync error:', err)
  })

  res.json({ message: 'Sync triggered', status: 'running' })
})

// POST /api/sync/stop - Stop sync scheduler
syncRouter.post('/stop', (req, res) => {
  stopSyncService()
  res.json({ message: 'Sync service stopped' })
})

// POST /api/sync/start - Start sync scheduler
syncRouter.post('/start', async (req, res) => {
  await startSyncService(req.app.get('io'))
  res.json({ message: 'Sync service started' })
})
