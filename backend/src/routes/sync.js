import express from 'express'
import { getSyncState, startSyncService, stopSyncService, triggerManualSync, getDashboardData, getGlobalDirection, setGlobalDirection } from '../services/syncService.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'

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
// Query params: ?force=true to sync all users including inactive
syncRouter.post('/run', async (req, res) => {
  const state = getSyncState()
  const force = req.query.force === 'true'

  if (state.status === 'running') {
    return res.status(409).json({ error: 'Sync already running' })
  }

  // Trigger async - don't wait for it to finish
  triggerManualSync(req.app.get('io'), force).catch(err => {
    console.error('Sync error:', err)
  })

  const type = force ? 'Force' : 'Manual'
  res.json({ message: `${type} sync triggered`, status: 'running', force })
})

// POST /api/sync/stop - Stop sync scheduler
syncRouter.post('/stop', (req, res) => {
  stopSyncService()
  res.json({ message: 'Sync service stopped' })
})

// POST /api/sync/preview - Preview changes before syncing
syncRouter.post('/preview', async (req, res) => {
  try {
    const { direction, group_name } = req.body
    
    const validDirections = ['authentik-to-ldap', 'ldap-to-authentik', 'bidirectional']
    if (direction && !validDirections.includes(direction)) {
      return res.status(400).json({ error: 'Invalid sync direction' })
    }
    
    const authentikGroups = await authentikClient.getGroups()
    const ldapGroups = await ldapClient.getGroups()
    
    let changes = []
    let summary = { toCreate: 0, toUpdate: 0, toDelete: 0, membersToAdd: 0, membersToRemove: 0 }
    
    if (group_name) {
      // Preview for specific group
      const aGroup = authentikGroups.find(g => g.name === group_name)
      const lGroup = ldapGroups.find(g => g.cn === group_name)
      
      if (!aGroup && !lGroup) {
        return res.status(404).json({ error: 'Group not found in either system' })
      }
      
      if (direction === 'authentik-to-ldap' || direction === 'bidirectional') {
        if (aGroup && !lGroup) {
          changes.push({ action: 'create_ldap_group', group: group_name, reason: 'Exists in Authentik but not in LDAP' })
          summary.toCreate++
        } else if (aGroup && lGroup) {
          // Compare members
          const authMembers = aGroup.users_obj?.map(u => u.username) || []
          const ldapMembers = lGroup.member?.map(m => {
            const match = m.match(/^uid=([^,]+)/)
            return match ? match[1] : m
          }) || []
          
          const toAdd = authMembers.filter(m => !ldapMembers.includes(m))
          const toRemove = ldapMembers.filter(m => !authMembers.includes(m))
          
          if (toAdd.length > 0) {
            changes.push({ action: 'add_members_to_ldap', group: group_name, members: toAdd })
            summary.membersToAdd += toAdd.length
          }
          if (toRemove.length > 0) {
            changes.push({ action: 'remove_members_from_ldap', group: group_name, members: toRemove })
            summary.membersToRemove += toRemove.length
          }
        }
      }
      
      if (direction === 'ldap-to-authentik' || direction === 'bidirectional') {
        if (lGroup && !aGroup) {
          changes.push({ action: 'create_authentik_group', group: group_name, reason: 'Exists in LDAP but not in Authentik' })
          summary.toCreate++
        } else if (lGroup && aGroup) {
          // Compare members
          const authMembers = aGroup.users_obj?.map(u => u.username) || []
          const ldapMembers = lGroup.member?.map(m => {
            const match = m.match(/^uid=([^,]+)/)
            return match ? match[1] : m
          }) || []
          
          const toAdd = ldapMembers.filter(m => !authMembers.includes(m))
          const toRemove = authMembers.filter(m => !ldapMembers.includes(m))
          
          if (toAdd.length > 0) {
            changes.push({ action: 'add_members_to_authentik', group: group_name, members: toAdd })
            summary.membersToAdd += toAdd.length
          }
          if (toRemove.length > 0) {
            changes.push({ action: 'remove_members_from_authentik', group: group_name, members: toRemove })
            summary.membersToRemove += toRemove.length
          }
        }
      }
    } else {
      // Preview for all groups
      const authMap = new Map(authentikGroups.map(g => [g.name, g]))
      const ldapMap = new Map(ldapGroups.map(g => [g.cn, g]))
      
      if (direction === 'authentik-to-ldap' || direction === 'bidirectional') {
        for (const [name, aGroup] of authMap) {
          if (!ldapMap.has(name)) {
            changes.push({ action: 'create_ldap_group', group: name })
            summary.toCreate++
          }
        }
      }
      
      if (direction === 'ldap-to-authentik' || direction === 'bidirectional') {
        for (const [name, lGroup] of ldapMap) {
          if (!authMap.has(name)) {
            changes.push({ action: 'create_authentik_group', group: name })
            summary.toCreate++
          }
        }
      }
    }
    
    res.json({ success: true, changes, summary, direction: direction || 'all' })
  } catch (error) {
    logger.error('Error previewing sync:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/sync/dashboard - Aggregated sync dashboard data
syncRouter.get('/dashboard', async (req, res) => {
  try {
    const data = await getDashboardData()
    res.json(data)
  } catch (error) {
    logger.error('Error fetching dashboard data:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/sync/config - Get global sync direction
syncRouter.get('/config', async (req, res) => {
  try {
    const direction = await getGlobalDirection()
    res.json({ globalDirection: direction })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/sync/config - Set global sync direction
syncRouter.put('/config', async (req, res) => {
  try {
    const { direction } = req.body
    const result = await setGlobalDirection(direction)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// POST /api/sync/start - Start sync scheduler
syncRouter.post('/start', async (req, res) => {
  await startSyncService(req.app.get('io'))
  res.json({ message: 'Sync service started' })
})
