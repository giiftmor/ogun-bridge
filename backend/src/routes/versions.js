import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { 
  createSnapshot, 
  getVersionHistory, 
  getVersion, 
  getLatestVersion,
  getAllEntitiesWithVersions,
  getVersionCount
} from '../services/versionService.js'
import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'

export const versionRouter = express.Router()

versionRouter.use(authenticate)

versionRouter.post('/snapshot', async (req, res) => {
  try {
    const { entity_type, entity_id, snapshot_data, description } = req.body
    const created_by = req.user?.username || 'system'

    if (!entity_type || !entity_id || !snapshot_data) {
      return res.status(400).json({ error: 'entity_type, entity_id, and snapshot_data required' })
    }

    const result = await createSnapshot(entity_type, entity_id, snapshot_data, created_by, description)
    res.json({ success: true, ...result })
  } catch (error) {
    logger.error('Failed to create snapshot:', error)
    res.status(500).json({ error: 'Failed to create snapshot' })
  }
})

versionRouter.get('/history/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params
    const limit = parseInt(req.query.limit) || 20

    const history = await getVersionHistory(entityType, entityId, limit)
    const count = await getVersionCount(entityType, entityId)

    res.json({ history, count })
  } catch (error) {
    logger.error('Failed to get version history:', error)
    res.status(500).json({ error: 'Failed to get version history' })
  }
})

versionRouter.get('/:entityType/:entityId/latest', async (req, res) => {
  try {
    const { entityType, entityId } = req.params
    const version = await getLatestVersion(entityType, entityId)

    if (!version) {
      return res.status(404).json({ error: 'No versions found' })
    }

    res.json(version)
  } catch (error) {
    logger.error('Failed to get latest version:', error)
    res.status(500).json({ error: 'Failed to get latest version' })
  }
})

versionRouter.get('/:entityType/:entityId/:versionNumber', async (req, res) => {
  try {
    const { entityType, entityId, versionNumber } = req.params
    const version = await getVersion(entityType, entityId, parseInt(versionNumber))

    if (!version) {
      return res.status(404).json({ error: 'Version not found' })
    }

    res.json(version)
  } catch (error) {
    logger.error('Failed to get version:', error)
    res.status(500).json({ error: 'Failed to get version' })
  }
})

versionRouter.get('/entities', async (req, res) => {
  try {
    const entities = await getAllEntitiesWithVersions()
    res.json(entities)
  } catch (error) {
    logger.error('Failed to get entities:', error)
    res.status(500).json({ error: 'Failed to get entities' })
  }
})

versionRouter.post('/rollback/:entityType/:entityId/:versionNumber', async (req, res) => {
  const client = await pool.connect()
  try {
    const { entityType, entityId, versionNumber } = req.params
    const actor = req.user?.username || 'system'

    const version = await getVersion(entityType, entityId, parseInt(versionNumber))
    if (!version) {
      return res.status(404).json({ error: 'Version not found' })
    }

    await client.query('BEGIN')

    await client.query(
      `INSERT INTO audit_log (action, actor, entity_type, entity_id, changes, source)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`rollback_to_v${versionNumber}`, actor, entityType, entityId, 
       { rolled_back_from: version.snapshot_data }, 'manual']
    )

    await client.query('COMMIT')

    res.json({ 
      success: true, 
      message: `Rolled back ${entityType}:${entityId} to version ${versionNumber}`,
      snapshot: version.snapshot_data
    })
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error('Failed to rollback:', error)
    res.status(500).json({ error: 'Failed to rollback' })
  } finally {
    client.release()
  }
})
