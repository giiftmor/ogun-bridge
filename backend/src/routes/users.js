import express from 'express'
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'
import { Change, Attribute } from 'ldapts'
import { logger } from '../utils/logger.js'
import { getAuditLogs, getLastAuditLogByAction } from '../services/auditService.js'
import { addLogToCache } from '../services/logCache.js'
import { authenticate } from '../middleware/auth.js'

export const usersRouter = express.Router()

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

usersRouter.get('/', async (req, res) => {
  try {
    const { search, status } = req.query
    
    let authentikUsers = await authentikClient.getUsers({ search })
    
    // Filter out service accounts
    authentikUsers = authentikUsers.filter(u => !isServiceAccount(u))
    
    const ldapUsers = await ldapClient.getUsers()
    
    // Create map of LDAP users by uid
    const ldapMap = new Map(ldapUsers.map(u => [u.uid, u]))
    
    // Combine and add sync status
    const users = authentikUsers.map(aUser => {
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
      
      return {
        id: aUser.pk,
        username: aUser.username,
        email: aUser.email,
        name: aUser.name,
        isActive: aUser.is_active,
        syncStatus,
        error,
        hasPassword,
        lastSynced: lUser ? new Date().toISOString() : null,
      }
    })
    
    // Filter by status if requested
    const filtered = (status && status !== 'all')
      ? users.filter(u => u.syncStatus === status)
      : users
    // Filter by status if requested (but skip if status is 'all')
    // const filtered = (status && status !== 'all')
    //   ? users.filter(u => u.syncStatus === status)
    //   : users


    res.json(filtered)
  } catch (error) {
    logger.error('Error fetching users:', error)
    res.status(500).json({ error: error.message })
  }
})

usersRouter.get('/:id/compare', async (req, res) => {
  try {
    const aUser = await authentikClient.getUser(req.params.id)
    const lUser = await ldapClient.getUser(aUser.username)
    
    const differences = {}
    
    if (lUser) {
      // Compare fields
      if (aUser.email !== lUser.mail) {
        differences.mail = {
          authentik: aUser.email,
          ldap: lUser.mail,
        }
      }
      
      if ((aUser.name || aUser.username) !== lUser.cn) {
        differences.cn = {
          authentik: aUser.name || aUser.username,
          ldap: lUser.cn,
        }
      }
    }
    
    res.json({
      authentik: {
        username: aUser.username,
        email: aUser.email,
        name: aUser.name,
        is_active: aUser.is_active,
      },
      ldap: lUser ? {
        uid: lUser.uid,
        mail: lUser.mail,
        cn: lUser.cn,
        sn: lUser.sn,
      } : null,
      differences,
    })
  } catch (error) {
    logger.error('Error comparing user:', error)
    res.status(500).json({ error: error.message })
  }
})

usersRouter.post('/:id/test-mapping', async (req, res) => {
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
    logger.error('Error testing mapping:', error)
    res.status(500).json({ error: error.message })
  }
})

usersRouter.get('/:username/detail', async (req, res) => {
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
      syncStatus: {
        inAuthentik: !!aUser,
        inLDAP: !!lUser,
        synced: !!(aUser && lUser),
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
    logger.error('Error getting user detail:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get users without passwords
usersRouter.get('/no-password', async (req, res) => {
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
    logger.error('Error getting users without passwords:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get user profile with services access
usersRouter.get('/:username/profile', async (req, res) => {
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
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Get user's groups for service access
    const groups = await authentikClient.getGroups()
    const userPk = aUser?.pk || lUser?.uid?.[0]
    const userGroups = groups.filter(g => 
      g.users && userPk && g.users.includes(userPk)
    )
    
    // Define available services
    const services = [
      {
        id: 'mail',
        name: 'Email',
        description: 'Access your email inbox',
        url: 'https://webmail.spectres.co.za',
        accessMethod: 'IMAP/SMTP or Webmail',
        credentials: 'Use your username and password',
        requiredGroup: null, // All users have email
        icon: 'mail',
      },
      {
        id: 'vpn',
        name: 'VPN',
        description: 'Secure remote access',
        url: null,
        accessMethod: 'WireGuard config from admin',
        credentials: 'WireGuard key from administrator',
        requiredGroup: 'vpn',
        icon: 'shield',
      },
      {
        id: 'media',
        name: 'Media Server',
        description: 'Jellyfin media streaming',
        url: 'https://jellyfin.spectres.co.za',
        accessMethod: 'OAuth login',
        credentials: 'Use your ALSM credentials',
        requiredGroup: 'jellyfin',
        icon: 'play',
      },
      {
        id: 'cloud',
        name: 'Cloud Storage',
        description: 'Nextcloud file storage',
        url: 'https://nextcloud.spectres.co.za',
        accessMethod: 'OAuth login',
        credentials: 'Use your ALSM credentials',
        requiredGroup: 'nextcloud',
        icon: 'cloud',
      },
      {
        id: 'authentik',
        name: 'Authentik',
        description: 'Identity provider - manage your account',
        url: 'https://auth.spectres.co.za',
        accessMethod: 'OAuth login',
        credentials: 'Use your ALSM credentials',
        requiredGroup: null, // All users
        icon: 'key',
      },
    ]
    
    // Determine which services the user has access to
    const userGroupNames = userGroups.map(g => g.name.toLowerCase())
    const accessibleServices = services.map(service => ({
      ...service,
      hasAccess: service.requiredGroup === null || userGroupNames.includes(service.requiredGroup),
      groups: userGroups.filter(g => g.name.toLowerCase() === service.requiredGroup).map(g => g.name),
    }))
    
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
    
    // Determine user role based on groups
    const isAdmin = userGroups.some(g => g.name.toLowerCase() === 'systems_admins')
    
    // Get altEmail - prefer Authentik, then LDAP
    const altEmail = aUser?.attributes?.alt_email || 
      (lUser?.altEmail ? (Array.isArray(lUser.altEmail) ? lUser.altEmail[0] : lUser.altEmail) : null)
    
    res.json({
      username,
      name: aUser?.name || lUser?.cn?.[0] || username,
      email: aUser?.email || lUser?.mail?.[0],
      altEmail: altEmail,
      groups: userGroups.map(g => g.name),
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
    logger.error('Error getting user profile:', error)
    res.status(500).json({ error: error.message })
  }
})

// Set alt-email for user
usersRouter.put('/:username/alt-email', async (req, res) => {
  try {
    const { username } = req.params
    const { altEmail } = req.body
    
    // Validate email format
    if (altEmail && !altEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' })
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
    logger.error('Error setting alt-email:', error)
    res.status(500).json({ error: error.message })
  }
})
