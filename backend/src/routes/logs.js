import express from 'express'
import { getCachedLogs, searchLogs } from '../services/logCache.js'
import { logger } from '../utils/logger.js'
import { authenticate } from '../middleware/auth.js'

export const logsRouter = express.Router()

logsRouter.use(authenticate)

logsRouter.get('/', async (req, res) => {
  try {
    const { search, level, limit } = req.query
    
    let logs
    if (search || (level && level !== 'all')) {
      logs = searchLogs(search || '', level || 'all')
    } else {
      logs = getCachedLogs(parseInt(limit) || 1000)
    }
    
    res.json(logs)
  } catch (error) {
    logger.error('Error fetching logs:', error)
    res.status(500).json({ error: error.message })
  }
})
