import crypto from 'crypto'
import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'
import { getUserOgunRole } from '../services/authorizer.js'

const TOKEN_LENGTH = 64

export function generateToken() {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex')
}

export async function createSession(userId, ipAddress, userAgent, extraData = null) {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  await pool.query(
    `INSERT INTO auth_sessions (user_id, token, ip_address, user_agent, expires_at, data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, token, ipAddress, userAgent, expiresAt, extraData ? JSON.stringify(extraData) : null]
  )

  return token
}

export async function validateSession(token) {
  if (!token) return null

  try {
    const result = await pool.query(
      `SELECT s.id, s.user_id, s.expires_at, s.data, u.username, u.email, u.role, u.active
       FROM auth_sessions s
       JOIN auth_users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW() AND u.active = true`,
      [token]
    )

    return result.rows[0] || null
  } catch (error) {
    logger.error('Session validation error', { error: error.message })
    return null
  }
}

export async function deleteSession(token) {
  try {
    await pool.query('DELETE FROM auth_sessions WHERE token = $1', [token])
  } catch (error) {
    logger.error('Session deletion error', { error: error.message })
  }
}

export async function deleteUserSessions(userId) {
  try {
    await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId])
  } catch (error) {
    logger.error('User sessions deletion error', { error: error.message })
  }
}

export function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.cookies?.auth_token

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  validateSession(token).then(session => {
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    req.user = {
      id: session.user_id,
      username: session.username,
      email: session.email,
      role: session.role,
      roleDefinition: session.data?.roleDefinition || null,
      permissions: session.data?.permissions || {},
      groups: session.data?.groups || [],
      matchedGroup: session.data?.matchedGroup || null,
    }

    next()
  }).catch(error => {
    logger.error('Auth middleware error', { error: error.message })
    res.status(500).json({ error: 'Authentication error' })
  })
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const userRole = req.user.roleDefinition?.name || req.user.role
    if (userRole === 'super_admin') return next()
    if (!allowedRoles.includes(userRole)) {
      logger.warn('Access denied', {
        user: req.user.username,
        role: userRole,
        required: allowedRoles,
        path: req.path
      })
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    next()
  }
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  const role = req.user.roleDefinition?.name || req.user.role
  if (role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' })
  }
  next()
}

export function requireModule(module, action = null) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const role = req.user.roleDefinition?.name || req.user.role
    if (role === 'super_admin') {
      return next()
    }

    const permissions = req.user.permissions || {}
    const modulePerms = permissions[module]
    if (!modulePerms || !Array.isArray(modulePerms) || modulePerms.length === 0) {
      return res.status(403).json({ error: `No access to module: ${module}` })
    }

    if (action && !modulePerms.includes(action)) {
      return res.status(403).json({ error: `No ${action} permission on ${module}` })
    }

    next()
  }
}

export function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.cookies?.auth_token

  if (!token) {
    return next()
  }

  validateSession(token).then(session => {
    if (session) {
      req.user = {
        id: session.user_id,
        username: session.username,
        email: session.email,
        role: session.role
      }
    }
    next()
  }).catch(() => {
    next()
  })
}

export async function cleanupExpiredSessions() {
  try {
    const result = await pool.query(
      'DELETE FROM auth_sessions WHERE expires_at < NOW()'
    )
    if (result.rowCount > 0) {
      logger.info(`Cleaned up ${result.rowCount} expired sessions`)
    }
  } catch (error) {
    logger.error('Session cleanup error', { error: error.message })
  }
}

// LDAP group membership check for RBAC
import { LDAPClient } from '../services/ldapClient.js'

function escapeLDAPDNValue(value) {
  if (!value) return ''
  return String(value).replace(/[,\\+"\\<>;#=\0]/g, (char) => {
    const codes = { ',': '\\2c', '+': '\\2b', '"': '\\22', '\\': '\\5c', '<': '\\3c', '>': '\\3e', ';': '\\3b', '#': '\\23', '=': '\\3d' }
    return codes[char]
  })
}

const ldapClient = new LDAPClient()
const SYSTEM_ADMINS_GROUP = process.env.LDAP_SYSTEM_ADMINS_GROUP || 'cn=system_admins,ou=groups,dc=spectres,dc=co,dc=za'

// Wrapper for async middleware to handle errors properly
function asyncMiddleware(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export function protectPasswordOperation(req, res, next) {
  const targetUsername = req.params.username || req.body.username
  if (!targetUsername) return next()

  if (!req.user) return res.status(401).json({ error: 'Authentication required' })

  const requesterRole = req.user.roleDefinition?.name || req.user.role
  if (requesterRole === 'super_admin' || requesterRole === 'admin') return next()

  if (requesterRole === 'password_manager') {
    getUserOgunRole(targetUsername).then(targetRole => {
      if (targetRole === 'admin' || targetRole === 'super_admin') {
        logger.warn('Password operation blocked: password_manager targeting admin', {
          requester: req.user.username,
          target: targetUsername,
          targetRole,
        })
        return res.status(403).json({ error: 'Cannot perform password operations on admin users' })
      }
      next()
    }).catch(() => next())
    return
  }

  next()
}

export function requireLDAPGroup(groupDN = SYSTEM_ADMINS_GROUP) {
  return asyncMiddleware(async (req, res, next) => {
    if (!req.user?.username) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    if (req.user.role === 'super_admin') return next()

    try {
      const username = req.user.username
      const userDN = `uid=${escapeLDAPDNValue(username)},ou=people,dc=spectres,dc=co,dc=za`

      // Connect to LDAP and check group membership
      await ldapClient.connect()

      const { searchEntries } = await ldapClient.client.search(groupDN, {
        scope: 'base',
        attributes: ['member'],
      })

      const members = searchEntries[0]?.member || []
      const memberArray = Array.isArray(members) ? members : [members]

      if (!memberArray.includes(userDN)) {
        logger.warn('LDAP group access denied', {
          user: username,
          group: groupDN,
          path: req.path
        })
        await ldapClient.disconnect()
        return res.status(403).json({ error: 'Insufficient LDAP group membership' })
      }

      await ldapClient.disconnect()
      next()
    } catch (error) {
      logger.error('LDAP group check error', { error: error.message, user: req.user.username })
      // Fail secure - deny access on error
      return res.status(500).json({ error: 'Authorization check failed' })
    }
  })
}
