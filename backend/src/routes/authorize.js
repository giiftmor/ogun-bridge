import express from 'express'
import { requireAppApiKey } from '../middleware/apikey.js'
import { resolveRole } from '../services/authorizer.js'
import { logger } from '../utils/logger.js'

export const authorizeRouter = express.Router()

// ── Service-to-service endpoint (called by apps after OIDC login) ──────
authorizeRouter.post('/', requireAppApiKey, async (req, res) => {
  try {
    const { appSlug, user, groups } = req.body

    if (!user?.sub || !user?.email || !appSlug) {
      return res.status(400).json({ error: 'appSlug, user.sub, and user.email are required' })
    }

    const resolved = await resolveRole(user.sub, user.email, groups || [], appSlug)

    if (resolved.error) {
      return res.status(404).json(resolved)
    }

    return res.json({
      authorized: true,
      roleDefinition: resolved.roleDefinition,
      permissions: resolved.permissions,
      matchedGroup: resolved.matchedGroup,
      source: resolved.source,
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
