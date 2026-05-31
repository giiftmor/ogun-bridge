import express from 'express'
import { pool } from '../lib/db.js'
import { requireAppApiKey } from '../middleware/apikey.js'
import { resolveRole } from '../services/authorizer.js'
import { logger } from '../utils/logger.js'

import { authenticate } from '../middleware/auth.js'

export const authorizeRouter = express.Router()

authorizeRouter.post('/', requireAppApiKey, async (req, res) => {
  try {
    const { appSlug, user, groups } = req.body

    if (!user?.sub || !appSlug) {
      return res.status(400).json({ error: 'user.sub and appSlug are required' })
    }

    let app = req.app

    if (appSlug && appSlug !== app.slug) {
      const appMatch = await pool.query('SELECT * FROM apps WHERE slug = $1', [appSlug])
      if (appMatch.rows.length === 0) {
        return res.status(404).json({ error: 'App not found' })
      }
      if (appMatch.rows[0].api_key !== req.headers['x-api-key']) {
        return res.status(403).json({ error: 'API key does not match requested app' })
      }
      app = appMatch.rows[0]
    }

    const resolved = await resolveRole(user.sub, user.email || '', groups || [], appSlug)

    if (resolved.error) {
      return res.status(400).json(resolved)
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
    logger.error('Authorize error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

authorizeRouter.get('/', authenticate, async (req, res) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({
        authenticated: false,
        error: 'Not authenticated',
      })
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
    logger.error('Authorization check error', { error: error.message })
    return res.status(500).json({ authenticated: false, error: 'Internal server error' })
  }
})