import express from 'express'
import { getCachedLogs, searchLogs } from '../services/logCache.js'
import { logger } from '../utils/logger.js'
import { authenticate } from '../middleware/auth.js'
import { AppError } from '../utils/AppError.js'

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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error fetching logs:', error)
    res.status(500).json({ error: 'Failed to fetch logs', code: 'INTERNAL_ERROR', status: 500 })
  }
})
