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
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'
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

    let snapshotData = version.snapshot_data
    if (typeof snapshotData === 'string') {
      try {
        snapshotData = JSON.parse(snapshotData)
      } catch (e) {
        // already parsed by pg
      }
    }

    // Snapshot current state before rollback, using snapshotData keys as guide
    let preRollbackSnapshot = null
    try {
      let currentState = {}
      if (entityType === 'user') {
        try {
          const ldapUser = await ldapClient.getUser(entityId)
          if (ldapUser) {
            currentState = {
              uid: ldapUser.uid,
              cn: ldapUser.cn,
              mail: ldapUser.mail,
              sn: ldapUser.sn,
              telephoneNumber: ldapUser.telephoneNumber,
            }
          }
        } catch (e) {
          logger.warn(`Could not snapshot current LDAP user ${entityId}: ${e.message}`)
        }
      } else if (entityType === 'group') {
        try {
          const ldapGroup = await ldapClient.getGroup(entityId)
          if (ldapGroup) {
            currentState = { cn: ldapGroup.cn, member: ldapGroup.member }
          }
        } catch (e) {
          logger.warn(`Could not snapshot current LDAP group ${entityId}: ${e.message}`)
        }
      }
      preRollbackSnapshot = await createSnapshot(
        entityType, entityId, currentState, actor,
        `Auto-snapshot before rollback to v${versionNumber}`
      )
    } catch (snapErr) {
      logger.warn('Failed to create pre-rollback snapshot:', snapErr.message)
    }

    // Restore data
    let restoreErrors = []
    let restoredTargets = []

    if (entityType === 'user') {
      // Restore LDAP
      const ldapAttrs = {}
      if (snapshotData.cn) ldapAttrs.cn = snapshotData.cn
      if (snapshotData.mail) ldapAttrs.mail = snapshotData.mail
      if (snapshotData.sn) ldapAttrs.sn = snapshotData.sn
      if (snapshotData.telephoneNumber) ldapAttrs.telephoneNumber = snapshotData.telephoneNumber
      if (snapshotData.uid) ldapAttrs.uid = snapshotData.uid

      if (Object.keys(ldapAttrs).length > 0) {
        try {
          await ldapClient.updateUser(entityId, ldapAttrs)
          restoredTargets.push('ldap')
        } catch (e) {
          restoreErrors.push({ target: 'ldap', error: e.message })
        }
      }

      // Restore Authentik
      const authUpdates = {}
      if (snapshotData.name) authUpdates.name = snapshotData.name
      if (snapshotData.email) authUpdates.email = snapshotData.email
      if (snapshotData.username) authUpdates.username = snapshotData.username

      if (Object.keys(authUpdates).length > 0) {
        try {
          await authentikClient.updateUser(entityId, authUpdates)
          restoredTargets.push('authentik')
        } catch (e) {
          if (!e.message.includes('404')) {
            restoreErrors.push({ target: 'authentik', error: e.message })
          }
        }
      }
    } else if (entityType === 'group') {
      // Restore LDAP group
      const ldapAttrs = {}
      if (snapshotData.cn) ldapAttrs.cn = snapshotData.cn
      if (snapshotData.description) ldapAttrs.description = snapshotData.description
      if (snapshotData.member) ldapAttrs.member = snapshotData.member

      if (Object.keys(ldapAttrs).length > 0) {
        try {
          await ldapClient.updateGroup(entityId, ldapAttrs)
          restoredTargets.push('ldap')
        } catch (e) {
          if (e.message.includes('No Such Object')) {
            try {
              await ldapClient.createGroup(entityId, ldapAttrs)
              restoredTargets.push('ldap (recreated)')
            } catch (e2) {
              restoreErrors.push({ target: 'ldap', error: e2.message })
            }
          } else {
            restoreErrors.push({ target: 'ldap', error: e.message })
          }
        }
      }

      // Restore Authentik group
      const authUpdates = {}
      if (snapshotData.name) authUpdates.name = snapshotData.name
      if (snapshotData.description) authUpdates.description = snapshotData.description

      if (Object.keys(authUpdates).length > 0) {
        try {
          await authentikClient.updateGroup(entityId, authUpdates)
          restoredTargets.push('authentik')
        } catch (e) {
          restoreErrors.push({ target: 'authentik', error: e.message })
        }
      }
    }

    await client.query('BEGIN')

    await client.query(
      `INSERT INTO audit_log (action, actor, entity_type, entity_id, changes, source)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`rollback_to_v${versionNumber}`, actor, entityType, entityId,
       {
         rolled_back_from: version.snapshot_data,
         pre_rollback_snapshot_version: preRollbackSnapshot?.version || null,
         restored_targets: restoredTargets,
         errors: restoreErrors,
       }, 'manual']
    )

    await client.query('COMMIT')

    res.json({
      success: restoreErrors.length === 0,
      message: `Rolled back ${entityType}:${entityId} to version ${versionNumber}`,
      snapshot: version.snapshot_data,
      restored: restoredTargets,
      errors: restoreErrors.length > 0 ? restoreErrors : undefined,
      rollbackSnapshot: preRollbackSnapshot
    })
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error('Failed to rollback:', error)
    res.status(500).json({ error: 'Failed to rollback' })
  } finally {
    client.release()
  }
})
