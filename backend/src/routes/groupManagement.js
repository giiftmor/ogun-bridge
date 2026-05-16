import express from 'express'
import { pool } from '../lib/db.js'
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'
import { logger } from '../utils/logger.js'
import { authenticate } from '../middleware/auth.js'
import { createAuditLog } from '../services/auditService.js'

export const groupManagementRouter = express.Router()

groupManagementRouter.use(authenticate)

async function snapshotGroup(id) {
  try {
    const aGroup = await authentikClient.getGroup(id)
    const groupName = aGroup?.name
    const lGroup = groupName ? await ldapClient.getGroup(groupName) : null
    return { authentik: aGroup || null, ldap: lGroup || null }
  } catch {
    return { authentik: null, ldap: null }
  }
}

groupManagementRouter.post('/groups', async (req, res) => {
  try {
    const { name, description, parent } = req.body
    if (!name) return res.status(400).json({ error: 'Group name is required' })

    const groupData = { name, description: description || '' }
    if (parent) groupData.parent = parent

    const authentikGroup = await authentikClient.createGroup(groupData)

    try {
      const attrs = { description: description || '' }
      await ldapClient.createGroup(name, attrs)
    } catch (ldapErr) {
      logger.warn('LDAP group creation failed (non-fatal):', ldapErr.message)
    }

    await createAuditLog({
      action: 'group_created',
      actor: req.user?.username || 'api',
      entity_type: 'group',
      entity_id: name,
      changes: { name, description, parent },
      source: 'api',
    })

    res.json({ success: true, message: `Group '${name}' created`, group: authentikGroup })
  } catch (error) {
    logger.error('Error creating group:', error)
    res.status(500).json({ error: error.message })
  }
})

groupManagementRouter.put('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, parent } = req.body

    const before = await snapshotGroup(id)

    const updates = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (parent !== undefined) updates.parent = parent

    const authentikGroup = await authentikClient.updateGroup(id, updates)

    try {
      if (description !== undefined) {
        await ldapClient.updateGroup(before.authentik?.name || id, { description })
      }
    } catch (ldapErr) {
      logger.warn('LDAP group update failed (non-fatal):', ldapErr.message)
    }

    await createAuditLog({
      action: 'group_updated',
      actor: req.user?.username || 'api',
      entity_type: 'group',
      entity_id: before.authentik?.name || id,
      changes: { before, after: updates },
      source: 'api',
    })

    res.json({ success: true, message: 'Group updated', group: authentikGroup })
  } catch (error) {
    logger.error('Error updating group:', error)
    res.status(500).json({ error: error.message })
  }
})

groupManagementRouter.delete('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params

    const before = await snapshotGroup(id)
    const groupName = before.authentik?.name || id

    await authentikClient.deleteGroup(id)

    try {
      await ldapClient.deleteGroup(groupName)
    } catch (ldapErr) {
      logger.warn('LDAP group deletion failed (non-fatal):', ldapErr.message)
    }

    await createAuditLog({
      action: 'group_deleted',
      actor: req.user?.username || 'api',
      entity_type: 'group',
      entity_id: groupName,
      changes: { before },
      source: 'api',
    })

    res.json({ success: true, message: `Group '${groupName}' deleted` })
  } catch (error) {
    logger.error('Error deleting group:', error)
    res.status(500).json({ error: error.message })
  }
})

groupManagementRouter.post('/groups/:id/members', async (req, res) => {
  try {
    const { id } = req.params
    const { usernames } = req.body

    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'usernames array is required' })
    }

    const aGroup = await authentikClient.getGroup(id)
    const results = []

    for (const username of usernames) {
      try {
        await authentikClient.addUserToGroup(id, username)
        results.push({ username, success: true })
      } catch (err) {
        results.push({ username, success: false, error: err.message })
      }
    }

    await createAuditLog({
      action: 'group_members_added',
      actor: req.user?.username || 'api',
      entity_type: 'group',
      entity_id: aGroup.name,
      changes: { added: results.filter(r => r.success).map(r => r.username) },
      source: 'api',
    })

    res.json({ success: true, message: `Added ${results.filter(r => r.success).length} member(s)`, results })
  } catch (error) {
    logger.error('Error adding group members:', error)
    res.status(500).json({ error: error.message })
  }
})

groupManagementRouter.delete('/groups/:id/members/:username', async (req, res) => {
  try {
    const { id, username } = req.params

    const aGroup = await authentikClient.getGroup(id)
    await authentikClient.removeUserFromGroup(id, username)

    await createAuditLog({
      action: 'group_member_removed',
      actor: req.user?.username || 'api',
      entity_type: 'group',
      entity_id: aGroup.name,
      changes: { removed: username },
      source: 'api',
    })

    res.json({ success: true, message: `User '${username}' removed from group` })
  } catch (error) {
    logger.error('Error removing group member:', error)
    res.status(500).json({ error: error.message })
  }
})
