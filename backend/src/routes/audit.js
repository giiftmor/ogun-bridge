import express from 'express'
import { getAuditLogs, getAuditStats, createAuditLog } from '../services/auditService.js'
import { logger } from '../utils/logger.js'
import { authenticate } from '../middleware/auth.js'

export const auditRouter = express.Router()

auditRouter.use(authenticate)

auditRouter.get('/', async (req, res) => {
  try {
    const filters = {
      action: req.query.action,
      entity_type: req.query.entity_type,
      actor: req.query.actor,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      search: req.query.search,
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
    }

    const logs = await getAuditLogs(filters)
    res.json(logs)
  } catch (error) {
    logger.error('Error fetching audit logs:', error)
    res.status(500).json({ error: error.message })
  }
})

auditRouter.get('/stats', async (req, res) => {
  try {
    const stats = await getAuditStats()
    res.json(stats)
  } catch (error) {
    logger.error('Error fetching audit stats:', error)
    res.status(500).json({ error: error.message })
  }
})

auditRouter.post('/', async (req, res) => {
  try {
    const log = await createAuditLog(req.body)
    res.status(201).json(log)
  } catch (error) {
    logger.error('Error creating audit log:', error)
    res.status(500).json({ error: error.message })
  }
})
