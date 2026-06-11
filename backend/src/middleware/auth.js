import crypto from 'crypto'
import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'
import { getUserOgunRole } from '../services/authorizer.js'
import { createAuditLog } from '../services/auditService.js'

const TOKEN_LENGTH = 64

export function generateToken() {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex')
}

function isTrue(val) {
  return val === 'true' || val === '1' || val === true
}

export async function createSession(userId, ipAddress, userAgent, extraData = null) {
  const maxSessions = parseInt(process.env.MAX_CONCURRENT_SESSIONS || '0', 10)

  if (maxSessions > 0) {
    const countResult = await pool.query(
      'SELECT COUNT(*) as cnt FROM auth_sessions WHERE user_id = $1 AND expires_at > NOW()',
      [userId]
    )
    const count = parseInt(countResult.rows[0]?.cnt || '0', 10)

    if (count >= maxSessions) {
      const evictCount = count - maxSessions + 1
      await pool.query(
        `DELETE FROM auth_sessions WHERE id IN (
          SELECT id FROM auth_sessions WHERE user_id = $1 AND expires_at > NOW()
          ORDER BY created_at ASC LIMIT $2
        )`,
        [userId, evictCount]
      )
      logger.info('Evicted old sessions', { userId, evictCount, maxSessions })
    }
  }

  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await pool.query(
    `INSERT INTO auth_sessions (user_id, token, ip_address, user_agent, expires_at, data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, token, ipAddress, userAgent, expiresAt, extraData ? JSON.stringify(extraData) : null]
  )

  return token
}

export async function validateSession(token, options = {}) {
  if (!token) return null

  try {
    const result = await pool.query(
      `SELECT s.id, s.user_id, s.expires_at, s.data, u.username, u.email, u.role, u.active,
              s.ip_address, s.user_agent, s.created_at
       FROM auth_sessions s
       JOIN auth_users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW() AND u.active = true`,
      [token]
    )

    const session = result.rows[0] || null
    if (!session) return null

    if (isTrue(process.env.SESSION_IP_BINDING) && options.ipAddress) {
      if (session.ip_address && session.ip_address !== options.ipAddress) {
        logger.warn('Session IP mismatch', { token: token.substring(0, 8), stored: session.ip_address, request: options.ipAddress })
        return null
      }
    }

    if (isTrue(process.env.SESSION_UA_BINDING) && options.userAgent) {
      if (session.user_agent && session.user_agent !== options.userAgent) {
        logger.warn('Session UA mismatch', { token: token.substring(0, 8), request: options.userAgent })
        return null
      }
    }

    const slidingMinutes = parseInt(process.env.SESSION_SLIDING_EXPIRY || '0', 10)
    if (slidingMinutes > 0) {
      const newExpiry = new Date(Date.now() + slidingMinutes * 60 * 1000)
      const maxLifetimeHours = parseInt(process.env.SESSION_MAX_LIFETIME || '168', 10)
      const created = session.created_at || new Date()
      const maxExpiry = new Date(created.getTime() + maxLifetimeHours * 60 * 60 * 1000)
      const capped = newExpiry > maxExpiry ? maxExpiry : newExpiry

      await pool.query(
        'UPDATE auth_sessions SET expires_at = $1 WHERE id = $2 AND expires_at < $1',
        [capped, session.id]
      )
    }

    return session
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

  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                    req.headers['x-real-ip'] ||
                    req.ip ||
                    req.connection?.remoteAddress ||
                    'unknown'
  const userAgent = req.headers['user-agent'] || ''

  validateSession(token, { ipAddress, userAgent }).then(session => {
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
      createAuditLog({
        action: 'auth_role_denied',
        actor: req.user.username || 'unknown',
        entity_type: 'auth',
        entity_id: req.path,
        changes: { required: allowedRoles, actual: userRole },
        source: 'middleware',
        success: false,
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
    logger.warn('Super admin access denied', {
      user: req.user.username,
      role,
      path: req.path,
    })
    createAuditLog({
      action: 'auth_superadmin_denied',
      actor: req.user.username || 'unknown',
      entity_type: 'auth',
      entity_id: req.path,
      changes: { required: 'super_admin', actual: role },
      source: 'middleware',
      success: false,
    })
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
      createAuditLog({
        action: 'auth_module_denied',
        actor: req.user.username || 'unknown',
        entity_type: 'auth_module',
        entity_id: module,
        changes: { required: module, action, actualRole: role },
        source: 'middleware',
        success: false,
      })
      return res.status(403).json({ error: `No access to module: ${module}`, code: 'ACCESS_DENIED', status: 403 })
    }

    if (action && !modulePerms.includes(action)) {
      createAuditLog({
        action: 'auth_action_denied',
        actor: req.user.username || 'unknown',
        entity_type: 'auth_module',
        entity_id: module,
        changes: { required: action, actualRole: role, permissions: modulePerms },
        source: 'middleware',
        success: false,
      })
      return res.status(403).json({ error: `No ${action} permission on ${module}`, code: 'ACCESS_DENIED', status: 403 })
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

  const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                    req.headers['x-real-ip'] ||
                    req.ip ||
                    req.connection?.remoteAddress ||
                    'unknown'
  const userAgent = req.headers['user-agent'] || ''

  validateSession(token, { ipAddress, userAgent }).then(session => {
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
      return res.status(500).json({ error: 'Authorization check failed' })
    }
  })
}
