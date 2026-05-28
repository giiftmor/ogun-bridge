import express from 'express'
import { pool } from '../lib/db.js'
import { session } from '@spectres/auth'
import { auth } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'

export const authRouter = express.Router()

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown'
}

authRouter.get('/login', (req, res) => {
  auth.loginRedirect(req, res)
})

authRouter.get('/callback', async (req, res) => {
  try {
    await auth.callbackHandler(req, res, {
      onAuthorize: async ({ sub, email, accessToken, role }) => {
        try {
          const apiKey = process.env.OGUN_BRIDGE_API_KEY
          if (!apiKey) return
          const resp = await fetch(`${process.env.APP_URL || 'http://localhost:3333'}/api/authorize`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': apiKey,
            },
            body: JSON.stringify({
              user: { sub, email },
              accessToken,
            }),
          })
          if (resp.ok) {
            const data = await resp.json()
            const current = session.getSession(req)
            if (current) {
              const newSession = {
                ...current,
                ogunRole: data.role,
                businessRole: data.businessRole || null,
              }
              session.createSession(res, newSession)
            }
          }
        } catch (err) {
          logger.error('Self-authorization failed', { error: err.message })
        }
      },
    })
  } catch (error) {
    logger.error('OIDC callback error', { error: error.message })
    res.redirect('/login?error=auth_failed')
  }
})

authRouter.post('/logout', (req, res) => {
  auth.logout(req, res)
})

authRouter.get('/me', async (req, res) => {
  try {
    const userSession = session.getSession(req)

    if (!userSession) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const result = await pool.query(
      'SELECT id, username, email, role, active FROM auth_users WHERE username = $1',
      [userSession.username]
    )

    if (result.rows.length > 0) {
      const user = result.rows[0]
      return res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        groups: userSession.groups || [],
      })
    }

    const newUser = await pool.query(
      `INSERT INTO auth_users (username, email, role, active, oidc_id)
       VALUES ($1, $2, $3, true, $4)
       RETURNING id, username, email, role`,
      [userSession.username, userSession.email, userSession.role, userSession.id]
    )

    logger.info('New user auto-provisioned from OIDC', { username: userSession.username })

    res.json({
      id: newUser.rows[0].id,
      username: newUser.rows[0].username,
      email: newUser.rows[0].email,
      role: newUser.rows[0].role,
      groups: userSession.groups || [],
    })
  } catch (error) {
    logger.error('Get current user error', { error: error.message })
    res.status(500).json({ error: 'Failed to get user info' })
  }
})
