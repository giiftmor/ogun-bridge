import express from 'express'
import { pool } from '../lib/db.js'
import { requireAppApiKey } from '../middleware/apikey.js'
import { resolveRoleForApp } from '../services/authorizer.js'
import { logger } from '../utils/logger.js'

export const authorizeRouter = express.Router()

// ── Service-to-service endpoint (called by apps after OIDC login) ──────
authorizeRouter.post('/', requireAppApiKey, async (req, res) => {
  try {
    const { appSlug, user, accessToken, requiredRole } = req.body

    if (!user?.sub || !user?.email) {
      return res.status(400).json({ error: 'user.sub and user.email are required' })
    }

    let app = req.app // set by requireAppApiKey middleware

    // Override app if slug doesn't match (allow slug in body too)
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

    const resolved = await resolveRoleForApp(
      app.id,
      user.sub,
      app.claim_name,
      accessToken || null
    )

    let authorized = true
    if (requiredRole) {
      const userRoles = resolved.baseRole.toLowerCase().split(',').map(r => r.trim())
      const required = requiredRole.toLowerCase().split(',').map(r => r.trim())
      authorized = required.some(r => userRoles.includes(r))
    }

    // Get or create app_users id
    const userRecord = await pool.query(
      'SELECT id FROM app_users WHERE app_id = $1 AND oidc_sub = $2',
      [app.id, user.sub]
    )
    const userId = userRecord.rows[0]?.id || null

    return res.json({
      authorized,
      userId,
      role: resolved.baseRole,
      businessRole: resolved.businessRole,
    })
  } catch (error) {
    logger.error('Authorize error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Existing GET /authorize (session-based, for Ogun-Bridge's own use) ──
authorizeRouter.get('/', async (req, res) => {
  try {
    const user = req.session?.user

    if (!user) {
      return res.status(401).json({
        authenticated: false,
        error: 'Not authenticated',
      })
    }

    const requiredRole = req.query.required_role
    let authorized = true
    if (requiredRole) {
      const userRoles = (user.role || '').toLowerCase().split(',').map(r => r.trim())
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
        role: user.role,
        groups: user.groups || [],
      },
      ...(requiredRole ? { required_role: requiredRole } : {}),
    })
  } catch (error) {
    logger.error('Authorization check error', { error: error.message })
    return res.status(500).json({ authenticated: false, error: 'Internal server error' })
  }
})
