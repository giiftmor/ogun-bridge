import express from 'express'
import { getChanges, getPendingChanges, getChangeById, updateChangeStatus, applyChange } from '../services/changeDetector.js'
import { logger } from '../utils/logger.js'
import { AppError } from '../utils/AppError.js'
import { authenticate } from '../middleware/auth.js'

export const changesRouter = express.Router()

changesRouter.use(authenticate)

// GET /api/changes - List all changes with optional filters
changesRouter.get('/', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      entity_type: req.query.entity_type,
      change_type: req.query.change_type,
      search: req.query.search,
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
    }

    const changes = await getChanges(filters)
    res.json(changes)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error fetching changes:', error)
    res.status(500).json({ error: 'Failed to fetch changes', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// GET /api/changes/pending - Get pending changes only
changesRouter.get('/pending', async (req, res) => {
  try {
    const changes = await getPendingChanges()
    res.json(changes)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error fetching pending changes:', error)
    res.status(500).json({ error: 'Failed to fetch pending changes', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// GET /api/changes/:id - Get specific change
changesRouter.get('/:id', async (req, res) => {
  try {
    const change = await getChangeById(parseInt(req.params.id))
    
    if (!change) {
      throw new AppError('NOT_FOUND', 'Change not found')
    }

    res.json(change)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error fetching change:', error)
    res.status(500).json({ error: 'Failed to fetch change', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// POST /api/changes/:id/approve - Approve a change
changesRouter.post('/:id/approve', async (req, res) => {
  try {
    const changeId = parseInt(req.params.id)
    const approver = req.user?.username || 'system'

    // Apply the change FIRST, before marking approved
    try {
      await applyChange(changeId)
      logger.info('Change applied, now approving', { changeId })
    } catch (applyError) {
      if (applyError instanceof AppError) {
        return res.status(applyError.status).json({ success: false, error: applyError.message, code: applyError.code, status: applyError.status })
      }
      logger.error('Failed to apply change', { changeId, error: applyError.message })
      return res.status(500).json({
        success: false,
        error: 'Failed to apply change',
        code: 'INTERNAL_ERROR',
        status: 500
      })
    }

    // Only mark approved if apply succeeded
    const change = await updateChangeStatus(changeId, 'approved', approver)

    res.json({
      success: true,
      change,
      message: 'Change approved and applied'
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error approving change:', error)
    res.status(500).json({ error: 'Failed to approve change', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// POST /api/changes/:id/reject - Reject a change
changesRouter.post('/:id/reject', async (req, res) => {
  try {
    const changeId = parseInt(req.params.id)
    const { rejected_by, reason } = req.body

    // Update status to rejected
    const change = await updateChangeStatus(changeId, 'rejected', rejected_by || 'system')

    logger.info('Change rejected', { id: changeId, reason })

    res.json({
      success: true,
      change,
      message: 'Change rejected'
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error rejecting change:', error)
    res.status(500).json({ error: 'Failed to reject change', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// GET /api/changes/stats - Get change statistics
changesRouter.get('/stats/summary', async (req, res) => {
  try {
    const [pending, approved, rejected] = await Promise.all([
      getChanges({ status: 'pending', limit: 1000 }),
      getChanges({ status: 'approved', limit: 1000 }),
      getChanges({ status: 'rejected', limit: 1000 }),
    ])

    res.json({
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      total: pending.length + approved.length + rejected.length,
      pendingByType: {
        orphan: pending.filter(c => c.change_type === 'orphan').length,
        field_mismatch: pending.filter(c => c.change_type === 'field_mismatch').length,
      }
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error fetching change stats:', error)
    res.status(500).json({ error: 'Failed to fetch change stats', code: 'INTERNAL_ERROR', status: 500 })
  }
})