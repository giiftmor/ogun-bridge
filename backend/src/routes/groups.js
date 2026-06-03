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
    const { search, status, source, limit } = req.query
    
    let groups = []
    
    if (source === 'ldap') {
      // Fetch from LDAP, check against Authentik
      const ldapGroups = await ldapClient.getGroups()
      const authentikGroups = await authentikClient.getGroups({ search, page_size: limit || undefined })
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
      const authentikGroups = await authentikClient.getGroups({ search, page_size: limit || undefined })
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
          parent: aGroup.parent || null,
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
// Get group tree (hierarchy)
groupsRouter.get('/tree', async (req, res) => {
  let authentikGroups = []
  let ldapTree = []

  try {
    authentikGroups = await authentikClient.getGroups()
  } catch (error) {
    logger.warn('Could not fetch Authentik groups for tree:', error.message)
  }

  try {
    ldapTree = await ldapClient.getGroupTree()
  } catch (error) {
    logger.warn('Could not fetch LDAP group tree:', error.message)
  }

  // Build tree from Authentik parent field
  const groupMap = new Map()
  const rootGroups = []

  for (const g of authentikGroups) {
    groupMap.set(g.pk, { ...g, children: [] })
  }

  for (const g of authentikGroups) {
    const node = groupMap.get(g.pk)
    if (g.parent && groupMap.has(g.parent)) {
      groupMap.get(g.parent).children.push(node)
    } else if (!g.parent) {
      rootGroups.push(node)
    }
  }

  res.json({
    authentik: rootGroups,
    ldap: ldapTree,
    timestamp: new Date().toISOString(),
  })
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
    
    const aGroup = await authentikClient.getGroup(id, { includeChildren: true })
    const lGroup = await ldapClient.getGroup(aGroup.name)
    
    const client = await pool.connect()
    
    const syncConfigResult = await client.query(
      'SELECT * FROM group_sync_config WHERE group_name = $1',
      [aGroup.name]
    )
    
    client.release()
    
    const children = (aGroup.children_obj || []).map(c => ({
      pk: c.pk,
      name: c.name,
      group_uuid: c.group_uuid,
    }))

    // Build parent name if parent exists
    let parentName = null
    if (aGroup.parent) {
      try {
        const parentGroup = await authentikClient.getGroup(aGroup.parent)
        parentName = parentGroup.name
      } catch (e) {
        logger.warn(`Could not fetch parent group ${aGroup.parent}:`, e.message)
      }
    }

    res.json({
      id: aGroup.pk,
      name: aGroup.name,
      description: aGroup.description || '',
      parent: aGroup.parent,
      parentName,
      children,
      childCount: children.length,
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
        const sanitizedDesc = authGroup.description
          ? authGroup.description.replace(/[^\x20-\x7E]/g, '').trim()
          : null
        if (lGroup) {
          try {
            const updates = {}
            if (sanitizedDesc) updates.description = sanitizedDesc
            if (Object.keys(updates).length > 0) {
              await ldapClient.updateGroup(authGroup.name, updates)
            }
            results.authentikToLdap++
          } catch (err) {
            results.errors.push({ group: authGroup.name, error: err.message })
          }
        } else {
          try {
            const baseDN = process.env.LDAP_BASE_DN || 'dc=example,dc=com'
            const attrs = { member: [`uid=placeholder,ou=people,${baseDN}`] }
            if (sanitizedDesc) attrs.description = sanitizedDesc
            await ldapClient.createGroup(authGroup.name, attrs)
            results.authentikToLdap++
          } catch (err) {
            if (!err.message.includes('Already Exists')) {
              results.errors.push({ group: authGroup.name, error: err.message })
            }
          }
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

// Update sync direction for a group
groupsRouter.patch('/:id/sync-direction', async (req, res) => {
  try {
    const { id } = req.params
    const { sync_direction } = req.body

    const validDirections = ['authentik-to-ldap', 'ldap-to-authentik', 'bidirectional']
    if (!validDirections.includes(sync_direction)) {
      return res.status(400).json({ error: 'Invalid sync direction' })
    }

    const aGroup = await authentikClient.getGroup(id)
    const client = await pool.connect()

    await client.query(
      `INSERT INTO group_sync_config (group_name, sync_direction, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (group_name)
       DO UPDATE SET sync_direction = $2, updated_at = NOW()`,
      [aGroup.name, sync_direction]
    )

    client.release()

    res.json({ success: true, group_name: aGroup.name, sync_direction })
  } catch (error) {
    logger.error('Error updating sync direction:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get group members from both systems
groupsRouter.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params
    
    const aGroup = await authentikClient.getGroup(id, { includeChildren: true })
    const lGroup = await ldapClient.getGroup(aGroup.name)

    const authMembers = aGroup.users_obj || []
    const ldapMembers = lGroup?.member?.map(m => {
      const match = m.match(/^uid=([^,]+)/)
      return match ? match[1] : m
    }) || []

    // Resolve effective (transitive) members from nested groups
    let effectiveMembers = []
    let nestedGroupRefs = []
    try {
      effectiveMembers = await authentikClient.resolveEffectiveMembers(id)
      nestedGroupRefs = (aGroup.children_obj || []).map(c => ({
        pk: c.pk,
        name: c.name,
      }))
    } catch (err) {
      logger.warn(`Failed to resolve effective members for ${id}:`, err.message)
      effectiveMembers = authMembers.map(m => typeof m === 'string' ? m : m.username)
    }

    const directUsernames = authMembers.map(m => typeof m === 'string' ? m : m.username)

    // LDAP side: resolve nested groups
    let effectiveLdapMembers = []
    try {
      if (lGroup) {
        effectiveLdapMembers = await ldapClient.resolveNestedGroupMembers(lGroup.dn)
      }
    } catch (err) {
      logger.warn(`Failed to resolve LDAP nested members for ${aGroup.name}:`, err.message)
      effectiveLdapMembers = ldapMembers
    }

    res.json({
      group_name: aGroup.name,
      authentik: authMembers,
      ldap: ldapMembers,
      effective_authentik: effectiveMembers,
      effective_ldap: effectiveLdapMembers,
      nested_groups: nestedGroupRefs,
      summary: {
        authentik_count: authMembers.length,
        ldap_count: ldapMembers.length,
        effective_authentik_count: effectiveMembers.length,
        effective_ldap_count: effectiveLdapMembers.length,
        nested_group_count: nestedGroupRefs.length,
        in_authentik_only: authMembers.filter(m => !ldapMembers.includes(typeof m === 'string' ? m : m.username)),
        in_ldap_only: ldapMembers.filter(m => !authMembers.some(a => (typeof a === 'string' ? a : a.username) === m)),
      }
    })
  } catch (error) {
    logger.error('Error fetching group members:', error)
    res.status(500).json({ error: error.message })
  }
})
