import crypto from 'crypto'
import express from 'express'
import rateLimit from 'express-rate-limit'
import { pool } from '../lib/db.js'
import { validateSession, createSession, deleteSession, requireSuperAdmin } from '../middleware/auth.js'
import { resolveRole } from '../services/authorizer.js'
import { getServiceConfig } from '../services/config.js'
import { logger } from '../utils/logger.js'
import { ldapClient } from '../services/ldapClient.js'
import { authentikClient } from '../services/authentikClient.js'
import { validatePassword } from './password.js'
import { sendPasswordResetEmail } from '../services/emailService.js'
import { createAuditLog } from '../services/auditService.js'

const adminLoginLogger = { 
  info: (msg, meta) => logger.info(`[admin-login] ${msg}`, meta),
  warn: (msg, meta) => logger.warn(`[admin-login] ${msg}`, meta),
  error: (msg, meta) => logger.error(`[admin-login] ${msg}`, meta),
}

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

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

    if (!code) {
      if (req.query.error) {
        return res.redirect('/login?error=access_denied')
      }
      res.clearCookie('oauth_state')
      res.clearCookie('oauth_verifier')
      return res.redirect('/login?logged_out=true')
    }

    const savedState = req.cookies.oauth_state
    const savedVerifier = req.cookies.oauth_verifier

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

    const sessionData = { groups, sub, idToken: tokens.id_token }
    if (resolved.authorized) {
      sessionData.roleDefinition = resolved.roleDefinition
      sessionData.permissions = resolved.permissions
      sessionData.matchedGroup = resolved.matchedGroup
    }

    const sessionToken = await createSession(userId, getClientIp(req), req.headers['user-agent'], sessionData)
    res.cookie('auth_token', sessionToken, { httpOnly: true, secure: true, path: '/', maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' })

    res.redirect('/')
  } catch (error) {
    logger.error('OIDC callback error', { error: error.message, stack: error.stack })
    res.redirect('/login?error=callback_failed')
  }
})

authRouter.get('/public/providers', async (req, res) => {
  try {
    const config = await getServiceConfig('authentik').catch(() => null)
    const hasEnvVars = !!(process.env.AUTHENTIK_URL && process.env.AUTHENTIK_CLIENT_ID)
    const hasDbConfig = !!(config && config.oidcIssuer && config.clientId)
    const oidcConfigured = hasEnvVars || hasDbConfig

    res.json({
      providers: [
        { type: 'oidc', enabled: oidcConfigured, configured: oidcConfigured },
        { type: 'admin-login', enabled: true, configured: true },
      ],
    })
  } catch (error) {
    logger.error('Failed to get providers', { error: error.message })
    res.status(500).json({ error: 'Failed to get providers' })
  }
})

authRouter.post('/admin-login', adminLoginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const enabled = process.env.SUPER_ADMIN_LOGIN_ENABLED !== 'false'
    if (!enabled) {
      adminLoginLogger.warn('[SECURITY] Admin login disabled by config', { email })
      return res.status(404).json({ error: 'Not found' })
    }

    const adminUser = process.env.SUPER_ADMIN_USER || ''
    const adminPass = process.env.SUPER_ADMIN_PASS || ''

    if (!adminUser || !adminPass) {
      adminLoginLogger.warn('[SECURITY] Admin login not configured (missing env vars)')
      return res.status(404).json({ error: 'Not found' })
    }

    const ip = getClientIp(req)
    const ua = req.headers['user-agent'] || 'unknown'

    if (email !== adminUser || password !== adminPass) {
      adminLoginLogger.warn('[SECURITY] Failed admin login attempt', { email, ip, ua })
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    adminLoginLogger.info('[SECURITY] Admin login successful', { email, ip, ua })

    // Upsert admin user
    const userResult = await pool.query(
      'SELECT id FROM auth_users WHERE email = $1 OR username = $1',
      [email]
    )

    let userId
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id
      await pool.query(
        'UPDATE auth_users SET last_login = NOW() WHERE id = $1',
        [userId]
      )
    } else {
      const newUser = await pool.query(
        `INSERT INTO auth_users (username, password_hash, email, role, active, last_login)
         VALUES ($1, $2, $3, 'super_admin', true, NOW()) RETURNING id`,
        [email, '*', email]
      )
      userId = newUser.rows[0].id
    }

    const sessionData = {
      roleDefinition: {
        id: 0,
        name: 'super_admin',
        displayName: 'Super Admin',
        baseRole: 'super_admin',
      },
      permissions: {},
      groups: [],
      matchedGroup: null,
    }

    const sessionToken = await createSession(userId, ip, ua, sessionData)
    res.cookie('auth_token', sessionToken, {
      httpOnly: true,
      secure: true,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    })

    res.json({ success: true, redirect: '/' })
  } catch (error) {
    adminLoginLogger.error('Admin login error', { error: error.message })
    res.status(500).json({ error: 'Login failed' })
  }
})

authRouter.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') ||
                  req.cookies?.auth_token

    let loginType = 'admin'
    let session = null
    if (token) {
      session = await validateSession(token)
      if (session?.data?.sub) loginType = 'sso'
      await deleteSession(token)
    }
    res.clearCookie('auth_token')

    if (loginType === 'sso') {
      const issuer = (process.env.AUTHENTIK_OIDC_ISSUER || '').replace(/\/+$/, '')
      const redirectUri = encodeURIComponent(
        process.env.AUTHENTIK_REDIRECT_URI || 'https://ogun.spectres.co.za/auth/callback'
      )
      const clientId = encodeURIComponent(process.env.AUTHENTIK_CLIENT_ID || '')
      
      // id_token_hint omitted: the token's iss (http://) mismatches the HTTPS end-session
      // endpoint, causing Authentik to reject the request. client_id is sufficient.
      const logoutUrl = `${issuer}/end-session/?client_id=${clientId}&post_logout_redirect_uri=${redirectUri}`
      
      return res.json({ success: true, loginType, logoutUrl })
    }

    res.json({ success: true, loginType, logoutUrl: null })
  } catch (error) {
    logger.error('Logout error', { error: error.message })
    res.status(500).json({ error: 'Logout failed' })
  }
})

// ── Password expiration notification trigger (admin only) ──────────────────

authRouter.post('/trigger-expiration-notifications', requireSuperAdmin, async (req, res) => {
  try {
    const { triggerPasswordNotificationCheck } = await import('../services/passwordNotificationService.js')
    const result = await triggerPasswordNotificationCheck()
    return res.json({ success: true, ...result })
  } catch (error) {
    logger.error('Trigger expiration notifications error', { error: error.message })
    res.status(500).json({ error: 'Failed to trigger notifications' })
  }
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

// ── Password Reset Token Verification ───────────────────────────────────

authRouter.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params
    const result = await pool.query(
      `SELECT expires_at, used, username
       FROM password_reset_tokens
       WHERE token = $1`,
      [token]
    )

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid token' })
    }

    const row = result.rows[0]
    if (row.used) {
      return res.status(400).json({ error: 'Token already used' })
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Token expired' })
    }

    res.json({ valid: true, username: row.username })
  } catch (error) {
    logger.error('Verify reset token error', { error: error.message })
    res.status(500).json({ error: 'Failed to verify token' })
  }
})

// ── Reset Password (via token) ──────────────────────────────────────────

authRouter.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' })
    }

    const validation = validatePassword(newPassword)
    if (!validation.valid) {
      return res.status(400).json({ error: 'Password does not meet requirements', details: validation.errors })
    }

    const tokenResult = await pool.query(
      `SELECT id, username, expires_at, used
       FROM password_reset_tokens
       WHERE token = $1`,
      [token]
    )

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid token' })
    }

    const row = tokenResult.rows[0]
    if (row.used) {
      return res.status(400).json({ error: 'Token already used' })
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Token expired' })
    }

    const username = row.username

    // Update LDAP password
    const ldapOk = await ldapClient.setUserPassword(username, newPassword)
    if (!ldapOk) {
      return res.status(500).json({ error: 'Failed to update LDAP password' })
    }

    // Update Authentik password
    try {
      const aUser = await authentikClient.getUserByUsername(username)
      if (aUser) {
        await authentikClient.setPassword(aUser.pk, newPassword)
      }
    } catch (authErr) {
      logger.warn('Authentik password update failed during reset:', authErr.message)
    }

    // Mark token as used
    await pool.query(
      'UPDATE password_reset_tokens SET used = true, used_at = NOW() WHERE id = $1',
      [row.id]
    )

    // Update local auth_users password hash
    const bcrypt = await import('bcryptjs')
    const hashed = await bcrypt.default.hash(newPassword, 12)
    await pool.query(
      'UPDATE auth_users SET password_hash = $1 WHERE username = $2',
      [hashed, username]
    )

    await createAuditLog({
      action: 'password_reset',
      actor: username,
      entity_type: 'user',
      entity_id: username,
      changes: { method: 'token_reset' },
      source: 'api',
      success: true,
    })

    res.json({ success: true, message: 'Password updated successfully' })
  } catch (error) {
    logger.error('Reset password error', { error: error.message })
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

// ── Forgot Password ─────────────────────────────────────────────────────

authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { username, email } = req.body

    let userResult
    if (username) {
      userResult = await pool.query('SELECT id, username, email FROM auth_users WHERE username = $1', [username])
    } else if (email) {
      userResult = await pool.query('SELECT id, username, email FROM auth_users WHERE email = $1', [email])
    } else {
      return res.status(400).json({ error: 'Username or email is required' })
    }

    // Always return success to prevent user enumeration
    if (userResult.rows.length === 0) {
      return res.json({ success: true, message: 'If the user exists, a reset email has been sent' })
    }

    const user = userResult.rows[0]
    const resetToken = crypto.randomBytes(32).toString('hex')

    await pool.query('DELETE FROM password_reset_tokens WHERE username = $1', [user.username])
    await pool.query(
      `INSERT INTO password_reset_tokens (username, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [user.username, resetToken]
    )

    const aUser = await authentikClient.getUserByUsername(user.username)
    const sendTo = aUser?.email || user.email
    if (sendTo) {
      await sendPasswordResetEmail(sendTo, user.username, resetToken)
    }

    res.json({ success: true, message: 'If the user exists, a reset email has been sent' })
  } catch (error) {
    logger.error('Forgot password error', { error: error.message })
    res.json({ success: true, message: 'If the user exists, a reset email has been sent' })
  }
})

// ── Change Password (authenticated) ─────────────────────────────────────

authRouter.post('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.auth_token
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const sessionData = await validateSession(token)
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' })
    }

    const validation = validatePassword(newPassword)
    if (!validation.valid) {
      return res.status(400).json({ error: 'Password does not meet requirements', details: validation.errors })
    }

    const username = sessionData.username

    // Verify current password against LDAP
    const valid = await ldapClient.verifyPassword(username, currentPassword)
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    // Update LDAP password
    const ldapOk = await ldapClient.setUserPassword(username, newPassword)
    if (!ldapOk) {
      return res.status(500).json({ error: 'Failed to update password' })
    }

    // Update Authentik password
    try {
      const aUser = await authentikClient.getUserByUsername(username)
      if (aUser) {
        await authentikClient.setPassword(aUser.pk, newPassword)
      }
    } catch (authErr) {
      logger.warn('Authentik password update failed during change:', authErr.message)
    }

    // Update local password hash
    const bcrypt = await import('bcryptjs')
    const hashed = await bcrypt.default.hash(newPassword, 12)
    await pool.query(
      'UPDATE auth_users SET password_hash = $1 WHERE username = $2',
      [hashed, username]
    )

    res.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    logger.error('Change password error', { error: error.message })
    res.status(500).json({ error: 'Failed to change password' })
  }
})

// ── Resend Reset Token ──────────────────────────────────────────────────

authRouter.post('/resend-reset-token', async (req, res) => {
  try {
    const { username, email } = req.body

    let userResult
    if (username) {
      userResult = await pool.query('SELECT id, username, email FROM auth_users WHERE username = $1', [username])
    } else if (email) {
      userResult = await pool.query('SELECT id, username, email FROM auth_users WHERE email = $1', [email])
    } else {
      return res.status(400).json({ error: 'Username or email is required' })
    }

    if (userResult.rows.length === 0) {
      return res.json({ success: true, message: 'If the user exists, a new reset email has been sent' })
    }

    const user = userResult.rows[0]
    const resetToken = crypto.randomBytes(32).toString('hex')

    await pool.query('DELETE FROM password_reset_tokens WHERE username = $1', [user.username])
    await pool.query(
      `INSERT INTO password_reset_tokens (username, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [user.username, resetToken]
    )

    const aUser = await authentikClient.getUserByUsername(user.username)
    const sendTo = aUser?.email || user.email
    if (sendTo) {
      await sendPasswordResetEmail(sendTo, user.username, resetToken)
    }

    res.json({ success: true, message: 'If the user exists, a new reset email has been sent' })
  } catch (error) {
    logger.error('Resend token error', { error: error.message })
    res.json({ success: true, message: 'If the user exists, a new reset email has been sent' })
  }
})
