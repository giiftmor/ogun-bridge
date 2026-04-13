import express from 'express'
import { loggingService, LOG_CATEGORIES } from '../services/loggingService.js'
import { authenticate, requireRole } from '../middleware/auth.js'

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
    res.status(500).json({ error: error.message })
  }
})

operationsRouter.get('/stats', async (req, res) => {
  try {
    const stats = loggingService.getStats()
    res.json(stats)
  } catch (error) {
    res.status(500).json({ error: error.message })
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
    res.status(500).json({ error: error.message })
  }
})

export default operationsRouter