import express from 'express'
import rateLimit from 'express-rate-limit'
import { pool } from '../lib/db.js'
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'
import { Change, Attribute } from 'ldapts'
import { logger } from '../utils/logger.js'
import { getAuditLogs, getLastAuditLogByAction, getLastPasswordAction } from '../services/auditService.js'
import { addLogToCache } from '../services/logCache.js'
import { createAuditLog } from '../services/auditService.js'
import { authenticate, requireModule } from '../middleware/auth.js'
import { AppError } from '../utils/AppError.js'

const publicListLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
})

function getServiceAccessMethod(serviceType) {
  const methods = {
    web: 'Login with your Ogun Bridge credentials',
    vpn: 'WireGuard config from administrator',
    api: 'API credentials from administrator',
    database: 'Database credentials from administrator',
  }
  return methods[serviceType] || 'Contact administrator for access'
}

export const usersRouter = express.Router()

// Public endpoint for user dropdown - MUST be before authenticate middleware
// This route does NOT require authentication
usersRouter.get('/public-list', publicListLimiter, async (req, res) => {
  try {
    logger.info('Fetching public user list...')
    const authentikUsers = await authentikClient.getUsers()
    logger.info(`Found ${authentikUsers.length} users from Authentik`)
    
    const users = authentikUsers
      .filter(u => !isServiceAccount(u))
      .map(u => ({
        id: u.pk,
        username: u.username,
        email: u.email,
      }))
      .sort((a, b) => a.username.localeCompare(b.username))
    
    logger.info(`Returning ${users.length} users after filtering`)
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    res.json(users)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error fetching public user list:', error)
    res.status(500).json({ error: 'Failed to fetch users', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// All routes below this require authentication
usersRouter.use(authenticate)

// Helper to check if user is a service account
const isServiceAccount = (user) => {
  // Check Authentik is_service_account flag
  if (user.is_service_account) return true
  
  // Check username patterns common for service accounts
  const username = user.username?.toLowerCase() || ''
  if (username.startsWith('ak-')) return true // Authentik outpost
  if (username.includes('-outpost-')) return true
  if (username.includes('_outpost_')) return true
  if (username === 'ldap_api') return true
  
  return false
}

usersRouter.get('/', requireModule('users', 'read'), async (req, res) => {
  try {
    const { search, status, limit } = req.query
    
    let authentikUsers = await authentikClient.getUsers({ search, page_size: limit || undefined })
    
    // Filter out service accounts
    authentikUsers = authentikUsers.filter(u => !isServiceAccount(u))
    
    const ldapUsers = await ldapClient.getUsers()
    
    // Create map of LDAP users by uid
    const ldapMap = new Map(ldapUsers.map(u => [u.uid, u]))
    
    // Combine and add sync status
    const users = await Promise.all(authentikUsers.map(async (aUser) => {
      const lUser = ldapMap.get(aUser.username)
      
      let syncStatus = 'not_synced'
      let error = null
      
      if (lUser) {
        // Check if data matches
        const matches = 
          lUser.mail === aUser.email &&
          lUser.cn === (aUser.name || aUser.username)
        
        syncStatus = matches ? 'synced' : 'pending'
      }
      
      const hasPassword = !!aUser.password_change_date
      
      // Get last password action
      let lastPasswordAction = null
      try {
        const lastAction = await getLastPasswordAction(aUser.username)
        if (lastAction) {
          lastPasswordAction = {
            action: lastAction.action,
            timestamp: lastAction.timestamp,
            actor: lastAction.actor,
          }
        }
      } catch (e) {
        // Ignore errors - non-critical
      }
      
      return {
        id: aUser.pk,
        username: aUser.username,
        email: aUser.email,
        name: aUser.name,
        isActive: aUser.is_active,
        syncStatus,
        error,
        hasPassword,
        lastPasswordAction,
      }
    }))
    
    // Filter by status if requested
    const filtered = (status && status !== 'all')
      ? users.filter(u => u.syncStatus === status)
      : users


    res.json(filtered)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error fetching users:', error)
    res.status(500).json({ error: 'Failed to fetch users', code: 'INTERNAL_ERROR', status: 500 })
  }
})

usersRouter.post('/:id/test-mapping', requireModule('users', 'write'), async (req, res) => {
  try {
    const aUser = await authentikClient.getUser(req.params.id)
    
    // Generate LDAP entry based on current mapping logic
    const ldapEntry = {
      uid: aUser.username,
      cn: aUser.name || aUser.username,
      sn: aUser.name || aUser.username, // THIS IS THE FIX!
      mail: aUser.email || `${aUser.username}@spectres.co.za`,
      objectClass: ['inetOrgPerson', 'organizationalPerson', 'person', 'top'],
    }
    
    // Validate
    const validation = {
      valid: true,
      errors: [],
    }
    
    // Check required attributes
    if (!ldapEntry.uid) validation.errors.push('Missing required attribute: uid')
    if (!ldapEntry.cn) validation.errors.push('Missing required attribute: cn')
    if (!ldapEntry.sn) validation.errors.push('Missing required attribute: sn')
    if (!ldapEntry.mail) validation.errors.push('Missing required attribute: mail')
    
    validation.valid = validation.errors.length === 0
    
    res.json({
      authentikData: aUser,
      ldapEntry,
      validation,
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error testing mapping:', error)
    res.status(500).json({ error: 'Failed to test mapping', code: 'INTERNAL_ERROR', status: 500 })
  }
})

usersRouter.get('/:username/detail', requireModule('users', 'read'), async (req, res) => {
  try {
    const { username } = req.params
    
    // Get Authentik user
    const aUser = await authentikClient.getUserByUsername(username)
    
    // Get LDAP user
    const lUser = await ldapClient.getUser(username)
    
    // Get password expiration
    const passwordExpiration = await ldapClient.getPasswordExpiration(username)
    
    // Get password history from audit logs
    const passwordHistory = await getAuditLogs({
      action: 'password_synced',
      entity_id: username,
      limit: 5,
    })
    
    // Get user groups from LDAP
    let groups = []
    if (lUser?.memberOf) {
      groups = lUser.memberOf.map(g => {
        const cn = g.split(',')[0].replace('cn=', '')
        return cn
      })
    }
    
    // Get all changes for this user
    const userChanges = await getAuditLogs({
      entity_id: username,
      limit: 10,
    })
    
    res.json({
      username,
      authentik: aUser ? {
        pk: aUser.pk,
        email: aUser.email,
        name: aUser.name,
        is_active: aUser.is_active,
        last_login: aUser.last_login,
        password_change_date: aUser.password_change_date,
      } : null,
      ldap: lUser ? {
        uid: lUser.uid,
        mail: lUser.mail,
        cn: lUser.cn,
        sn: lUser.sn,
        dn: lUser.dn,
        memberOf: groups,
      } : null,
      password: {
        expiration: passwordExpiration,
        history: passwordHistory.map(h => ({
          timestamp: h.timestamp,
          success: h.success,
          ldap: h.changes?.ldap,
          authentik: h.changes?.authentik,
        })),
      },
      recentChanges: userChanges.map(h => ({
        timestamp: h.timestamp,
        action: h.action,
        actor: h.actor,
        source: h.source,
        success: h.success,
      })),
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error getting user detail:', error)
    res.status(500).json({ error: 'Failed to get user detail', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Get users without passwords
usersRouter.get('/no-password', requireModule('users', 'read'), async (req, res) => {
  try {
    let authentikUsers = await authentikClient.getUsers()
    const ldapUsers = await ldapClient.getUsers()
    
    // Filter out service accounts
    authentikUsers = authentikUsers.filter(u => !isServiceAccount(u))
    
    // Users who have never logged in (inactive)
    const usersWithoutLogin = authentikUsers.filter(u => !u.last_login)
    
    // Map with LDAP data
    const ldapMap = new Map(ldapUsers.map(u => [u.uid, u]))
    
    const users = usersWithoutLogin.map(aUser => {
      const lUser = ldapMap.get(aUser.username)
      return {
        username: aUser.username,
        name: aUser.name,
        email: aUser.email,
        altEmail: lUser?.altEmail ? (Array.isArray(lUser.altEmail) ? lUser.altEmail[0] : lUser.altEmail) : null,
        ldapExists: !!lUser,
      }
    })
    
    res.json(users)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error getting users without passwords:', error)
    res.status(500).json({ error: 'Failed to get users without passwords', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Get user profile with services access
usersRouter.get('/:username/profile', requireModule('users', 'read'), async (req, res) => {
  try {
    const { username } = req.params
    
    let aUser = null
    let lUser = null
    
    try {
      aUser = await authentikClient.getUserByUsername(username)
    } catch (e) {
      logger.error('Authentik error getting user profile:', e.message)
    }
    
    try {
      lUser = await ldapClient.getUser(username)
    } catch (e) {
      logger.error('LDAP error getting user profile:', e.message)
    }
    
    if (!aUser && !lUser) {
      throw new AppError('NOT_FOUND', 'User not found')
    }
    
    // Get user's groups from Authentik (original approach - more reliable)
    const groups = await authentikClient.getGroups()
    const userPk = aUser?.pk || lUser?.uid?.[0]
    const authGroups = groups.filter(g => 
      g.users && userPk && g.users.includes(userPk)
    )
    const directGroupNames = authGroups.map(g => g.name)

    // Resolve inherited (ancestor) groups
    const directGroupIds = authGroups.map(g => g.pk)
    const allAncestors = []
    for (const gid of directGroupIds) {
      try {
        const ancestors = await authentikClient.getGroupAncestors(gid)
        allAncestors.push(...ancestors)
      } catch (err) {
        logger.warn(`Failed to resolve ancestors for group ${gid}:`, err.message)
      }
    }

    // Deduplicate ancestors by pk
    const seenAncestor = new Set()
    const inheritedGroups = allAncestors.filter(a => {
      if (seenAncestor.has(a.pk)) return false
      seenAncestor.add(a.pk)
      return true
    })

    // Build hierarchy for each direct group: [direct, parent, grandparent, ...]
    const groupHierarchy = []
    for (const g of authGroups) {
      const chain = [{ pk: g.pk, name: g.name }]
      const ancestors = allAncestors.filter(a => {
        // Find ancestors that are reachable from this group
        return directGroupIds.some(dgId => {
          const ancestorsForGroup = allAncestors.filter(aa => aa.pk === dgId)
          return ancestorsForGroup.length > 0
        })
      })
      // Simplified: attach all ancestors found
      groupHierarchy.push({
        group: { pk: g.pk, name: g.name },
        inheritedFrom: ancestors,
      })
    }

    // Flatten unique ancestor names for service queries
    const inheritedGroupNames = inheritedGroups.map(g => g.name)
    const allGroupNames = [...new Set([...directGroupNames, ...inheritedGroupNames])]

    // Also query local database for services (more up-to-date than hardcoded)
    let accessibleServices = []
    if (allGroupNames.length > 0) {
      try {
        const servicesResult = await pool.query(
          `SELECT gs.service_name, gs.service_url, gs.service_type, gs.description, gs.icon,
                  array_agg(gs.group_name) as groups
           FROM group_services gs
           WHERE gs.group_name = ANY($1) AND gs.is_active = true
           GROUP BY gs.service_name, gs.service_url, gs.service_type, gs.description, gs.icon
           ORDER BY gs.service_name`,
          [allGroupNames]
        )
        
        accessibleServices = servicesResult.rows.map(row => ({
          id: row.service_name.toLowerCase().replace(/\s+/g, '-'),
          name: row.service_name,
          description: row.description,
          url: row.service_url,
          type: row.service_type,
          icon: row.icon || 'default',
          accessMethod: getServiceAccessMethod(row.service_type),
          hasAccess: true,
          groups: row.groups,
        }))
      } catch (err) {
        logger.warn('No services in database yet:', err.message)
      }
    }
    
    // Get password status
    const passwordExpiration = lUser ? await ldapClient.getPasswordExpiration(username) : null
    
    // Get last password reset from audit logs
    const lastPasswordReset = await getLastAuditLogByAction(username, 'password_force_reset')
    const lastPasswordInvite = await getLastAuditLogByAction(username, 'password_invite_sent')
    
    // Use the most recent one
    const lastResetInfo = lastPasswordReset?.timestamp 
      ? { timestamp: lastPasswordReset.timestamp, type: 'force_reset' }
      : lastPasswordInvite?.timestamp 
        ? { timestamp: lastPasswordInvite.timestamp, type: 'invite' }
        : null
    
    // Determine user role based on groups (check if systems_admins)
    const isAdmin = allGroupNames.some(g => g.toLowerCase() === 'systems_admins')
    
    // Get altEmail - prefer Authentik, then LDAP
    const altEmail = aUser?.attributes?.alt_email || 
      (lUser?.altEmail ? (Array.isArray(lUser.altEmail) ? lUser.altEmail[0] : lUser.altEmail) : null)
    
    const employeeNumber = lUser?.employeeNumber
      ? (Array.isArray(lUser.employeeNumber) ? lUser.employeeNumber[0] : lUser.employeeNumber)
      : (aUser?.attributes?.employee_number || null)

    res.json({
      username,
      name: aUser?.name || lUser?.cn?.[0] || username,
      email: aUser?.email || lUser?.mail?.[0],
      altEmail: altEmail,
      employeeNumber,
      groups: directGroupNames,
      directGroups: directGroupNames,
      inheritedGroups: inheritedGroups.map(g => ({ pk: g.pk, name: g.name })),
      groupHierarchy,
      role: isAdmin ? 'admin' : 'user',
      isAdmin: isAdmin,
      services: accessibleServices,
      password: {
        hasPassword: !!aUser?.password_change_date,
        lastChanged: aUser?.password_change_date,
        hasLoggedIn: !!aUser?.last_login,
        lastLogin: aUser?.last_login,
        expires: passwordExpiration,
        lastReset: lastResetInfo,
      },
      created: aUser?.date_joined,
      lastLogin: aUser?.last_login,
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error getting user profile:', error)
    res.status(500).json({ error: 'Failed to get user profile', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Set alt-email for user
usersRouter.put('/:username/alt-email', requireModule('users', 'write'), async (req, res) => {
  try {
    const { username } = req.params
    const { altEmail } = req.body
    
    // Validate email format
    if (altEmail && !altEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid email format')
    }
    
    // Update Authentik custom attributes
    const aUser = await authentikClient.getUserByUsername(username)
    if (aUser) {
      const currentAttrs = aUser.attributes || {}
      const newAttrs = { ...currentAttrs }
      
      if (altEmail) {
        newAttrs.alt_email = altEmail
      } else {
        delete newAttrs.alt_email
      }
      
      await authentikClient.updateUser(aUser.pk, { attributes: newAttrs })
    }
    
    // Also update LDAP for mailserver
    await ldapClient.connect()
    const dn = `uid=${username},ou=people,${ldapClient.baseDN}`
    
    if (altEmail) {
      // Check if extensibleObject is present
      const { searchEntries } = await ldapClient.client.search(dn, {
        attributes: ['objectClass'],
      })
      
      const hasExtensibleObject = searchEntries[0]?.objectClass?.includes('extensibleObject')
      
      await ldapClient.client.modify(dn, [
        new Change({
          operation: hasExtensibleObject ? 'replace' : 'add',
          modification: new Attribute({ type: 'altEmail', values: [altEmail] }),
        }),
      ])
    } else {
      // Remove altEmail if not provided (clear it)
      try {
        await ldapClient.client.modify(dn, [
          new Change({
            operation: 'delete',
            modification: new Attribute({ type: 'altEmail' }),
          }),
        ])
      } catch (e) {
        // Ignore if attribute doesn't exist
      }
    }
    
    // Update user profile
    const { ensureUserProfile, updateUserProfile } = await import('../services/userProfileService.js')
    await ensureUserProfile(username, altEmail)
    await updateUserProfile(username, { alt_email: altEmail })
    
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Alt-email set for ${username}: ${altEmail || '(cleared)'}`,
      context: { username, altEmail }
    })
    
    res.json({ success: true, username, altEmail })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error setting alt-email:', error)
    res.status(500).json({ error: 'Failed to set alt-email', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Create user in Authentik + LDAP
usersRouter.post('/', requireModule('users', 'write'), async (req, res) => {
  try {
    const { username, name, email, groups } = req.body
    if (!username) throw new AppError('VALIDATION_ERROR', 'Username is required')

    const authentikUser = await authentikClient.createUser({
      username,
      name: name || username,
      email: email || `${username}@spectres.co.za`,
    })

    try {
      await ldapClient.updateUser(username, {
        cn: name || username,
        sn: name || username,
        mail: email || `${username}@spectres.co.za`,
      })
    } catch (ldapErr) {
      logger.warn('LDAP user creation failed (non-fatal):', ldapErr.message)
    }

    if (groups && Array.isArray(groups)) {
      for (const groupId of groups) {
        try {
          await authentikClient.addUserToGroup(groupId, username)
        } catch (groupErr) {
          logger.warn(`Failed to add user to group ${groupId}:`, groupErr.message)
        }
      }
    }

    await createAuditLog({
      action: 'user_created',
      actor: req.user?.username || 'api',
      entity_type: 'user',
      entity_id: username,
      changes: { username, name, email, groups },
      source: 'api',
    })

    res.json({ success: true, message: `User '${username}' created`, user: authentikUser })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error creating user:', error)
    res.status(500).json({ error: 'Failed to create user', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Edit user name, email, is_active
usersRouter.put('/:id', requireModule('users', 'write'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, is_active } = req.body

    const aUser = await authentikClient.getUser(id)
    const updates = {}
    if (name !== undefined) updates.name = name
    if (email !== undefined) updates.email = email
    if (is_active !== undefined) updates.is_active = is_active

    const authentikUser = await authentikClient.updateUser(id, updates)

    await createAuditLog({
      action: 'user_updated',
      actor: req.user?.username || 'api',
      entity_type: 'user',
      entity_id: aUser.username,
      changes: { before: { name: aUser.name, email: aUser.email, is_active: aUser.is_active }, after: updates },
      source: 'api',
    })

    res.json({ success: true, message: 'User updated', user: authentikUser })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error updating user:', error)
    res.status(500).json({ error: 'Failed to update user', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Delete user
usersRouter.delete('/:id', requireModule('users', 'write'), async (req, res) => {
  try {
    const { id } = req.params
    const aUser = await authentikClient.getUser(id)

    await authentikClient.deleteUser(id)

    try {
      await ldapClient.deleteUser(aUser.username)
    } catch (ldapErr) {
      logger.warn('LDAP user deletion failed (non-fatal):', ldapErr.message)
    }

    await createAuditLog({
      action: 'user_deleted',
      actor: req.user?.username || 'api',
      entity_type: 'user',
      entity_id: aUser.username,
      changes: { deleted: aUser.username },
      source: 'api',
    })

    res.json({ success: true, message: `User '${aUser.username}' deleted` })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error deleting user:', error)
    res.status(500).json({ error: 'Failed to delete user', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// List user's groups + available groups
usersRouter.get('/:username/groups', requireModule('users', 'read'), async (req, res) => {
  try {
    const { username } = req.params
    const aUser = await authentikClient.getUserByUsername(username)
    if (!aUser) throw new AppError('NOT_FOUND', 'User not found')

    const allGroups = await authentikClient.getGroups()

    const userGroupPks = (aUser.groups || []).map(g => typeof g === 'object' ? g.pk : g)
    const userGroups = allGroups.filter(g => userGroupPks.includes(g.pk) || userGroupPks.includes(g.name))
    const availableGroups = allGroups.filter(g => !userGroupPks.includes(g.pk) && !userGroupPks.includes(g.name))

    res.json({
      username,
      userGroups: userGroups.map(g => ({ pk: g.pk, name: g.name })),
      availableGroups: availableGroups.map(g => ({ pk: g.pk, name: g.name })),
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error fetching user groups:', error)
    res.status(500).json({ error: 'Failed to fetch user groups', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Add user to group
usersRouter.post('/:username/groups', requireModule('users', 'write'), async (req, res) => {
  try {
    const { username } = req.params
    const { group_pk } = req.body

    if (!group_pk) throw new AppError('VALIDATION_ERROR', 'group_pk is required')

    await authentikClient.addUserToGroup(group_pk, username)

    await createAuditLog({
      action: 'user_group_added',
      actor: req.user?.username || 'api',
      entity_type: 'user',
      entity_id: username,
      changes: { group_pk },
      source: 'api',
    })

    res.json({ success: true, message: 'User added to group' })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error adding user to group:', error)
    res.status(500).json({ error: 'Failed to add user to group', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Remove user from group
usersRouter.delete('/:username/groups/:groupId', requireModule('users', 'write'), async (req, res) => {
  try {
    const { username, groupId } = req.params

    await authentikClient.removeUserFromGroup(groupId, username)

    await createAuditLog({
      action: 'user_group_removed',
      actor: req.user?.username || 'api',
      entity_type: 'user',
      entity_id: username,
      changes: { group_pk: groupId },
      source: 'api',
    })

    res.json({ success: true, message: 'User removed from group' })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error removing user from group:', error)
    res.status(500).json({ error: 'Failed to remove user from group', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// ── Bulk Import / Export ──────────────────────────────────────────────────

// Export users as CSV
usersRouter.get('/export/csv', requireModule('users', 'read'), async (req, res) => {
  try {
    const authentikUsers = await authentikClient.getUsers()
    const ldapUsers = await ldapClient.getUsers()
    const ldapMap = new Map(ldapUsers.map(u => [u.uid, u]))

    const rows = authentikUsers
      .filter(u => !isServiceAccount(u))
      .map(u => {
        const lUser = ldapMap.get(u.username)
        return {
          username: u.username,
          name: u.name || '',
          email: u.email || '',
          status: u.is_active ? 'active' : 'inactive',
          groups: (u.groups || []).map(g => typeof g === 'object' ? g.name : g).join(';'),
          ldapSynced: lUser ? 'yes' : 'no',
        }
      })

    // CSV header
    const headers = ['username', 'name', 'email', 'status', 'groups', 'ldap_synced']
    const csvLines = [
      headers.join(','),
      ...rows.map(r =>
        headers.map(h => {
          const val = r[h === 'ldap_synced' ? 'ldapSynced' : h]
          // Escape quotes and wrap in quotes if contains comma or quote
          const str = String(val || '').replace(/"/g, '""')
          return str.includes(',') || str.includes('"') ? `"${str}"` : str
        }).join(',')
      ),
    ]

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"')
    res.send(csvLines.join('\n'))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error exporting users to CSV:', error)
    res.status(500).json({ error: 'Failed to export users', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Import users from CSV
usersRouter.post('/import/csv', requireModule('users', 'write'), async (req, res) => {
  try {
    const { rows } = req.body

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No rows provided')
    }

    const results = []
    const allGroups = await authentikClient.getGroups()

    for (const row of rows) {
      const { username, name, email, groups, password } = row

      if (!username) {
        results.push({ username: username || 'N/A', success: false, error: 'Username is required' })
        continue
      }

      try {
        // Check if user exists
        const existing = await authentikClient.getUserByUsername(username)
        if (existing) {
          results.push({ username, success: false, error: 'User already exists' })
          continue
        }

        // Create in Authentik
        const aUser = await authentikClient.createUser({
          username,
          name: name || username,
          email: email || `${username}@spectres.co.za`,
        })

        // Create in LDAP
        let ldapCreated = false
        try {
          await ldapClient.updateUser(username, {
            cn: name || username,
            sn: name || username,
            mail: email || `${username}@spectres.co.za`,
          })
          if (password) {
            await ldapClient.setUserPassword(username, password)
          }
          ldapCreated = true
        } catch (ldapErr) {
          logger.warn('LDAP user creation failed during import:', ldapErr.message)
        }

        // Add to groups
        const groupList = groups ? String(groups).split(/[;,]/).map(g => g.trim()).filter(Boolean) : []
        const addedGroups = []
        for (const groupName of groupList) {
          const targetGroup = allGroups.find(g => g.name === groupName)
          if (targetGroup) {
            try {
              await authentikClient.addUserToGroup(targetGroup.pk, username)
              addedGroups.push(groupName)
            } catch (gErr) {
              logger.warn(`Failed to add ${username} to group ${groupName}:`, gErr.message)
            }
          }
        }

        // Create local auth_users record
        const userResult = await pool.query(
          'SELECT id FROM auth_users WHERE username = $1',
          [username]
        )
        if (userResult.rows.length === 0) {
          const bcrypt = await import('bcryptjs')
          const hashed = password ? await bcrypt.default.hash(password, 12) : '$2a$10$placeholderfordummyuseonly'
          await pool.query(
            'INSERT INTO auth_users (username, password_hash, email, role, active) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING',
            [username, hashed, email || aUser.email, 'viewer', true]
          )
        }

        results.push({
          username,
          success: true,
          authentikId: aUser.pk,
          ldapCreated,
          groupsAdded: addedGroups.length,
        })
      } catch (err) {
        logger.error(`Error importing user ${username}:`, err.message)
        results.push({ username, success: false, error: err.message })
      }
    }

    const successCount = results.filter(r => r.success).length

    await createAuditLog({
      action: 'users_bulk_imported',
      actor: req.user?.username || 'api',
      entity_type: 'user',
      entity_id: 'bulk',
      changes: { total: rows.length, success: successCount, failed: rows.length - successCount },
      source: 'api',
    })

    res.json({
      total: rows.length,
      successful: successCount,
      failed: rows.length - successCount,
      results,
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error importing users from CSV:', error)
    res.status(500).json({ error: 'Failed to import users', code: 'INTERNAL_ERROR', status: 500 })
  }
})
