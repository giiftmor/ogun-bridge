import express from 'express'
import { pool } from '../lib/db.js'
import { requireAppApiKey } from '../middleware/apikey.js'
import { resolveRole } from '../services/authorizer.js'
import { logger } from '../utils/logger.js'
import bcrypt from 'bcryptjs'
import { authentikClient } from '../services/authentikClient.js'

import { authenticate } from '../middleware/auth.js'
import { AppError } from '../utils/AppError.js'

export const authorizeRouter = express.Router()

authorizeRouter.post('/', requireAppApiKey, async (req, res) => {
  try {
    const { appSlug, user, groups } = req.body

    if (!user?.sub || !appSlug) {
      throw new AppError('VALIDATION_ERROR', 'user.sub and appSlug are required')
    }

    let app = req.app

    if (appSlug && appSlug !== app.slug) {
      const appMatch = await pool.query('SELECT * FROM apps WHERE slug = $1', [appSlug])
      if (appMatch.rows.length === 0) {
        throw new AppError('NOT_FOUND', 'App not found')
      }
      const requestKey = req.headers['x-api-key']
      const storedKey = appMatch.rows[0].api_key
      let keyValid = false
      if (storedKey.startsWith('$2')) {
        keyValid = await bcrypt.compare(requestKey, storedKey)
      } else {
        keyValid = (requestKey === storedKey)
      }
      if (!keyValid) {
        throw new AppError('ACCESS_DENIED', 'API key does not match requested app')
      }
      app = appMatch.rows[0]
    }

    let verifiedGroups = groups || []
    try {
      const akGroups = await authentikClient.getUserGroups(user.sub)
      const akGroupNames = akGroups.map(g => g.name).filter(Boolean)
      if (akGroupNames.length > 0) {
        const claimed = new Set(groups || [])
        const spurious = (groups || []).filter(g => !akGroupNames.includes(g))
        if (spurious.length > 0) {
          logger.warn('Authorize: unverified groups discarded', { sub: user.sub, appSlug, spurious })
        }
        verifiedGroups = akGroupNames.filter(g => claimed.has(g))
        if (verifiedGroups.length === 0 && (groups || []).length > 0) {
          verifiedGroups = akGroupNames
        }
      }
    } catch (akErr) {
      logger.warn('Authorize: group verification unavailable, using self-reported groups', {
        sub: user.sub,
        error: akErr.message,
      })
    }

    const resolved = await resolveRole(user.sub, user.email || '', verifiedGroups, appSlug)

    if (resolved.error) {
      throw new AppError('VALIDATION_ERROR', resolved.error)
    }

    const userRecord = await pool.query(
      'SELECT id FROM app_users WHERE app_id = $1 AND oidc_sub = $2',
      [app.id, user.sub]
    )
    const userId = userRecord.rows[0]?.id || null

    return res.json({
      authorized: resolved.authorized,
      userId,
      roleDefinition: resolved.roleDefinition,
      permissions: resolved.permissions || {},
      matchedGroup: resolved.matchedGroup || null,
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Authorize error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

authorizeRouter.get('/', authenticate, async (req, res) => {
  try {
    const user = req.user

    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Not authenticated')
    }

    const requiredRole = req.query.required_role
    let authorized = true
    if (requiredRole) {
      const userRole = user.roleDefinition?.name || user.role || ''
      const userRoles = userRole.toLowerCase().split(',').map(r => r.trim()).filter(Boolean)
      const required = requiredRole.toLowerCase().split(',').map(r => r.trim())
      authorized = required.some(r => userRoles.includes(r))
    }

    return res.json({
      authenticated: true,
      authorized,
      user: {
        id: user.id,
        username: user.username || user.name,
        email: user.email,
        role: user.roleDefinition?.name || user.role,
        roleDefinition: user.roleDefinition || null,
        permissions: user.permissions || {},
        groups: user.groups || [],
      },
      ...(requiredRole ? { required_role: requiredRole } : {}),
    })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Authorization check error', { error: error.message })
    return res.status(500).json({ authenticated: false, error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})