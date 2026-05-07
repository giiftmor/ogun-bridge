import express from 'express'
import { pool } from '../lib/db.js'
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'
import { logger } from '../utils/logger.js'
import { authenticate } from '../middleware/auth.js'
import { detectGroupChanges } from '../services/changeDetector.js'

export const groupsRouter = express.Router()

groupsRouter.use(authenticate)

groupsRouter.get('/', async (req, res) => {
  try {
    const { search, status, source } = req.query
    
    let groups = []
    
    if (source === 'ldap') {
      // Fetch from LDAP, check against Authentik
      const ldapGroups = await ldapClient.getGroups()
      const authentikGroups = await authentikClient.getGroups({ search })
      const authMap = new Map(authentikGroups.map(g => [g.name, g]))
      
      // Helper to extract OU from DN
      const parseOU = (dn) => {
        const match = dn.match(/ou=([^,]+)/i)
        return match ? match[1] : 'ungrouped'
      }
      
      groups = ldapGroups.map(lGroup => {
        const aGroup = authMap.get(lGroup.cn)
        const syncStatus = aGroup ? 'synced' : 'not_synced'
        
        return {
          id: lGroup.cn,
          name: lGroup.cn,
          dn: lGroup.dn,
          ou: parseOU(lGroup.dn),
          description: lGroup.description || '',
          source: 'ldap',
          syncStatus,
          memberCount: lGroup.member?.length || 0,
          authentikExists: !!aGroup,
          authentikId: aGroup?.pk || null,
        }
      })
    } else {
      // Default: Fetch from Authentik, check against LDAP
      const authentikGroups = await authentikClient.getGroups({ search })
      const ldapGroups = await ldapClient.getGroups()
      const ldapMap = new Map(ldapGroups.map(g => [g.cn, g]))
      
      groups = authentikGroups.map(aGroup => {
        const lGroup = ldapMap.get(aGroup.name)
        const syncStatus = lGroup ? 'synced' : 'not_synced'
        
        return {
          id: aGroup.pk,
          name: aGroup.name,
          description: aGroup.description || '',
          source: 'authentik',
          syncStatus,
          userCount: aGroup.users_count,
          ldapExists: !!lGroup,
        }
      })
    }
    
    const filtered = (status && status !== 'all')
      ? groups.filter(g => g.syncStatus === status)
      : groups
    
    res.json(filtered)
  } catch (error) {
    logger.error('Error fetching groups:', error)
    res.status(500).json({ error: error.message })
  }
})

groupsRouter.get('/:id/compare', async (req, res) => {
  try {
    const aGroup = await authentikClient.getGroup(req.params.id)
    const lGroup = await ldapClient.getGroup(aGroup.name)
    
    const differences = {}
    
    if (lGroup) {
      if (aGroup.description !== lGroup.description) {
        differences.description = {
          authentik: aGroup.description,
          ldap: lGroup.description,
        }
      }
    }
    
    res.json({
      authentik: {
        name: aGroup.name,
        description: aGroup.description,
        users_count: aGroup.users_count,
      },
      ldap: lGroup ? {
        cn: lGroup.cn,
        description: lGroup.description,
        member: lGroup.member,
      } : null,
      differences,
    })
  } catch (error) {
    logger.error('Error comparing group:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get group details with sync config
groupsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    const aGroup = await authentikClient.getGroup(id)
    const lGroup = await ldapClient.getGroup(aGroup.name)
    
    const client = await pool.connect()
    
    const syncConfigResult = await client.query(
      'SELECT * FROM group_sync_config WHERE group_name = $1',
      [aGroup.name]
    )
    
    client.release()
    
    res.json({
      id: aGroup.pk,
      name: aGroup.name,
      description: aGroup.description || '',
      parent: aGroup.parent,
      attributes: aGroup.attributes || {},
      sync_config: syncConfigResult.rows[0] || null,
      ldap_exists: !!lGroup,
    })
  } catch (error) {
    logger.error('Error fetching group:', error)
    res.status(500).json({ error: error.message })
  }
})

// Trigger group sync
groupsRouter.post('/sync', async (req, res) => {
  try {
    const { direction, group_name } = req.body
    
    const authentikGroups = await authentikClient.getGroups()
    const ldapGroups = await ldapClient.getGroups()
    
    let result
    
    if (group_name) {
      const aGroup = authentikGroups.find(g => g.name === group_name)
      const lGroup = ldapGroups.find(g => g.cn === group_name)
      
      if (aGroup && lGroup) {
        result = await detectGroupChanges([aGroup], [lGroup])
      } else {
        return res.status(404).json({ error: 'Group not found in both systems' })
      }
    } else {
      result = await detectGroupChanges(authentikGroups, ldapGroups)
    }
    
    res.json({ success: true, ...result })
  } catch (error) {
    logger.error('Error triggering group sync:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get all group sync configs
groupsRouter.get('/config', async (req, res) => {
  try {
    const client = await pool.connect()
    const result = await client.query('SELECT * FROM group_sync_config ORDER BY group_name')
    client.release()
    res.json(result.rows)
  } catch (error) {
    logger.error('Error fetching group sync configs:', error)
    res.status(500).json({ error: error.message })
  }
})

// Force sync now with specific direction
groupsRouter.post('/sync-now', async (req, res) => {
  try {
    const { direction, group_name } = req.body
    
    const validDirections = ['authentik-to-ldap', 'ldap-to-authentik', 'bidirectional']
    if (direction && !validDirections.includes(direction)) {
      return res.status(400).json({ error: 'Invalid direction' })
    }

    const authentikGroups = await authentikClient.getGroups()
    const ldapGroups = await ldapClient.getGroups()

    let results = {
      authentikToLdap: 0,
      ldapToAuthentik: 0,
      errors: []
    }

    for (const authGroup of authentikGroups) {
      if (group_name && authGroup.name !== group_name) continue

      const lGroup = ldapGroups.find(g => g.cn === authGroup.name)

      if (direction === 'authentik-to-ldap' || direction === 'bidirectional') {
        if (lGroup) {
          results.authentikToLdap++
        }
      }

      if (direction === 'ldap-to-authentik' || direction === 'bidirectional') {
        if (!lGroup) {
          try {
            await authentikClient.createGroup({
              name: authGroup.name,
              description: authGroup.description || '',
            })
            results.ldapToAuthentik++
          } catch (err) {
            if (!err.message.includes('already exists')) {
              results.errors.push({ group: authGroup.name, error: err.message })
            }
          }
        }
      }
    }

    res.json({
      success: true,
      direction,
      group_name: group_name || null,
      results
    })
  } catch (error) {
    logger.error('Error during sync-now:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get group members from both systems
groupsRouter.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params
    
    const aGroup = await authentikClient.getGroup(id)
    const lGroup = await ldapClient.getGroup(aGroup.name)

    const authMembers = aGroup.users_obj || []
    const ldapMembers = lGroup?.member?.map(m => {
      const match = m.match(/^uid=([^,]+)/)
      return match ? match[1] : m
    }) || []

    res.json({
      group_name: aGroup.name,
      authentik: authMembers,
      ldap: ldapMembers,
      summary: {
        authentik_count: authMembers.length,
        ldap_count: ldapMembers.length,
        in_authentik_only: authMembers.filter(m => !ldapMembers.includes(typeof m === 'string' ? m : m.username)),
        in_ldap_only: ldapMembers.filter(m => !authMembers.some(a => (typeof a === 'string' ? a : a.username) === m)),
      }
    })
  } catch (error) {
    logger.error('Error fetching group members:', error)
    res.status(500).json({ error: error.message })
  }
})
