import express from 'express'
import { pool } from '../lib/db.js'
import { validateSession, createSession, deleteSession } from '../middleware/auth.js'
import { resolveRole } from '../services/authorizer.js'
import { logger } from '../utils/logger.js'

export const authRouter = express.Router()

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown'
}

function getSessionData(req) {
  const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.cookies?.auth_token
  if (!token) return null

  try {
    const parts = Buffer.from(token, 'base64').toString('utf8').split(':')
    if (parts.length !== 2) return null
    return { token, username: parts[0] }
  } catch {
    return null
  }
}

authRouter.get('/login', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex')
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto.createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
  res.cookie('oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600000 })
  res.cookie('oauth_verifier', codeVerifier, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600000 })
  const redirectUrl = `${process.env.AUTHENTIK_URL}/application/o/authorize/?client_id=${process.env.AUTHENTIK_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.AUTHENTIK_REDIRECT_URI)}&response_type=code&scope=openid email profile ogun&state=${state}&code_challenge_method=S256&code_challenge=${codeChallenge}`
  res.redirect(redirectUrl)
})

authRouter.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query
    const savedState = req.cookies.oauth_state
    const savedVerifier = req.cookies.oauth_verifier

    if (!code) {
      return res.redirect('/login?error=no_code')
    }

    if (state !== savedState) {
      return res.redirect('/login?error=state_mismatch')
    }

    res.clearCookie('oauth_state')
    res.clearCookie('oauth_verifier')

    logger.info('OIDC callback: exchanging code')
    const tokenRes = await fetch(`${process.env.AUTHENTIK_URL}/application/o/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.AUTHENTIK_REDIRECT_URI,
        client_id: process.env.AUTHENTIK_CLIENT_ID,
        client_secret: process.env.AUTHENTIK_CLIENT_SECRET,
        code_verifier: savedVerifier || '',
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      logger.error('Token exchange failed', { status: tokenRes.status, body: errText })
      return res.redirect('/login?error=token_exchange_failed')
    }

    const tokens = await tokenRes.json()
    logger.info('OIDC callback: fetching userinfo')
    const userinfoRes = await fetch(`${process.env.AUTHENTIK_URL}/application/o/userinfo/`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userinfoRes.ok) {
      logger.error('Userinfo failed', { status: userinfoRes.status })
      return res.redirect('/login?error=userinfo_failed')
    }

    const userinfo = await userinfoRes.json()
    const sub = userinfo.sub
    const email = userinfo.email || `${sub}@spectres.co.za`
    const name = userinfo.name || sub
    const groups = userinfo.groups || []
    const ogunClaim = userinfo.ogun

    logger.info('OIDC userinfo raw', {
      sub,
      email,
      name,
      allKeys: Object.keys(userinfo),
      groups,
      rawGroups: JSON.stringify(userinfo.groups),
      rawOgun: JSON.stringify(userinfo.ogun),
      ogunClaim,
    })

    if (!ogunClaim || !ogunClaim.hasAccess) {
      logger.warn('OIDC callback: denied — no ogun-bridge access', { sub, ogunClaim })
      return res.redirect('/login?error=access_denied')
    }

    logger.info('OIDC callback: looking up user', { sub, email })
    const existingUser = await pool.query(
      'SELECT id, username, email, role, active FROM auth_users WHERE oidc_id = $1 OR email = $2 OR username = $1',
      [sub, email]
    )

    let userId
    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id
      logger.info('OIDC callback: existing user found', { userId, username: existingUser.rows[0].username, oidc_id: existingUser.rows[0].oidc_id })
      await pool.query(
        `UPDATE auth_users SET oidc_id = COALESCE(oidc_id, $1), email = COALESCE(NULLIF(email, ''), $2), last_login = NOW() WHERE id = $3`,
        [sub, email, userId]
      )
    } else {
      logger.info('OIDC callback: no existing user, creating new')
      const newUser = await pool.query(
        `INSERT INTO auth_users (username, password_hash, email, role, active, oidc_id, last_login) VALUES ($1, $2, $3, $4, true, $5, NOW()) RETURNING id`,
        [sub, '*', email, 'member', sub]
      )
      userId = newUser.rows[0].id
      logger.info('OIDC callback: new user created', { userId })
    }

    logger.info('OIDC callback: user ready', { userId, ogunRole: ogunClaim?.role, ogunHasAccess: ogunClaim?.hasAccess })
    const resolved = await resolveRole(sub, email, ogunClaim.groups, 'ogun', ogunClaim.role)
    logger.info('OIDC callback: role resolved', { authorized: resolved.authorized, role: resolved.roleDefinition?.name })

    const sessionData = { groups, sub }
    if (resolved.authorized) {
      sessionData.roleDefinition = resolved.roleDefinition
      sessionData.permissions = resolved.permissions
      sessionData.matchedGroup = resolved.matchedGroup
    }

    const sessionToken = await createSession(userId, getClientIp(req), req.headers['user-agent'], sessionData)
    res.cookie('auth_token', sessionToken, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' })

    res.redirect('/dashboard')
  } catch (error) {
    logger.error('OIDC callback error', { error: error.message, stack: error.stack })
    res.redirect('/login?error=callback_failed')
  }
})

authRouter.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.cookies?.auth_token
  if (token) {
    deleteSession(token).catch(err => logger.error('Logout error', { error: err.message }))
  }
  res.clearCookie('auth_token')
  res.json({ success: true })
})

authRouter.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') ||
                  req.cookies?.auth_token
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const sessionData = await validateSession(token)
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    return res.json({
      id: sessionData.user_id,
      username: sessionData.username,
      email: sessionData.email,
      role: sessionData.role,
      roleDefinition: sessionData.data?.roleDefinition || null,
      permissions: sessionData.data?.permissions || {},
      groups: sessionData.data?.groups || [],
      matchedGroup: sessionData.data?.matchedGroup || null,
    })
  } catch (error) {
    logger.error('Get current user error', { error: error.message })
    res.status(500).json({ error: 'Failed to get user info' })
  }
})
