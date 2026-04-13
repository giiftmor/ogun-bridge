import express from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import pool from '../lib/db.js'
import { ldapClient } from '../services/ldapClient.js'
import { authentikClient } from '../services/authentikClient.js'
import { 
  createSession, 
  deleteSession, 
  validateSession,
  deleteUserSessions 
} from '../middleware/auth.js'
import cookieParser from 'cookie-parser'
import { logger } from '../utils/logger.js'
import { loggingService } from '../services/loggingService.js'
import { sqlNowSAST } from '../utils/timezone.js'
import { sendPasswordResetEmail } from '../services/emailService.js'
import { validatePassword, PASSWORD_POLICY } from './password.js'

export const authRouter = express.Router()

authRouter.use(cookieParser())

const ROLES = ['admin', 'reviewer', 'viewer']

async function hashPassword(password) {
  return bcrypt.hash(password, 10)
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown'
}

function getUserAgent(req) {
  return req.headers['user-agent'] || 'unknown'
}

authRouter.post('/register', async (req, res) => {
  try {
    const { username, password, email, role = 'viewer' } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' })
    }

    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    const passwordValidation = validatePassword(password)
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.errors.join(', ') })
    }

    const passwordHash = await hashPassword(password)

    const result = await pool.query(
      `INSERT INTO auth_users (username, password_hash, email, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, role, created_at`,
      [username, passwordHash, email || null, role]
    )

    logger.info('User registered', { username, role })

    res.status(201).json({
      message: 'User created successfully',
      user: result.rows[0]
    })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' })
    }
    logger.error('Registration error', { error: error.message })
    res.status(500).json({ error: 'Registration failed' })
  }
})

authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' })
    }

    const result = await pool.query(
      'SELECT id, username, password_hash, email, role, active FROM auth_users WHERE username = $1',
      [username]
    )

    const user = result.rows[0]

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Account is disabled' })
    }

    const validPassword = await verifyPassword(password, user.password_hash)

    if (!validPassword) {
      logger.warn('Failed login attempt', { username, ip: getClientIp(req) })
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = await createSession(user.id, getClientIp(req), getUserAgent(req))

    await pool.query(
      'UPDATE auth_users SET last_login = NOW() WHERE id = $1',
      [user.id]
    )

    logger.info('User logged in', { username, ip: getClientIp(req) })

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    })
  } catch (error) {
    logger.error('Login error', { error: error.message })
    res.status(500).json({ error: 'Login failed' })
  }
})

authRouter.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (token) {
      await deleteSession(token)
    }

    res.json({ message: 'Logged out successfully' })
  } catch (error) {
    logger.error('Logout error', { error: error.message })
    res.status(500).json({ error: 'Logout failed' })
  }
})

authRouter.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const session = await validateSession(token)

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    res.json({
      id: session.user_id,
      username: session.username,
      email: session.email,
      role: session.role
    })
  } catch (error) {
    logger.error('Get current user error', { error: error.message })
    res.status(500).json({ error: 'Failed to get user info' })
  }
})

authRouter.get('/users', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    const session = await validateSession(token)

    if (!session || session.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const result = await pool.query(
      `SELECT id, username, email, role, active, last_login, created_at
       FROM auth_users
       ORDER BY created_at DESC`
    )

    res.json(result.rows)
  } catch (error) {
    logger.error('List auth users error', { error: error.message })
    res.status(500).json({ error: 'Failed to list users' })
  }
})

authRouter.delete('/users/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    const session = await validateSession(token)

    if (!session || session.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const userId = parseInt(req.params.id)

    if (userId === session.user_id) {
      return res.status(400).json({ error: 'Cannot delete your own account' })
    }

    await deleteUserSessions(userId)
    await pool.query('DELETE FROM auth_users WHERE id = $1', [userId])

    logger.info('User deleted', { userId, by: session.username })

    res.json({ message: 'User deleted successfully' })
  } catch (error) {
    logger.error('Delete user error', { error: error.message })
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

authRouter.put('/users/:id/role', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    const session = await validateSession(token)

    if (!session || session.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const userId = parseInt(req.params.id)
    const { role } = req.body

    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    if (userId === session.user_id && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot change your own role' })
    }

    await pool.query(
      'UPDATE auth_users SET role = $1, updated_at = NOW() WHERE id = $2',
      [role, userId]
    )

    logger.info('User role changed', { userId, role, by: session.username })

    res.json({ message: 'Role updated successfully' })
  } catch (error) {
    logger.error('Update role error', { error: error.message })
    res.status(500).json({ error: 'Failed to update role' })
  }
})

authRouter.put('/users/:id/toggle', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    const session = await validateSession(token)

    if (!session || session.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const userId = parseInt(req.params.id)

    if (userId === session.user_id) {
      return res.status(400).json({ error: 'Cannot disable your own account' })
    }

    const result = await pool.query(
      'UPDATE auth_users SET active = NOT active, updated_at = NOW() WHERE id = $1 RETURNING active',
      [userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!result.rows[0].active) {
      await deleteUserSessions(userId)
    }

    logger.info('User toggled', { userId, active: result.rows[0].active, by: session.username })

    res.json({ message: 'User status toggled', active: result.rows[0].active })
  } catch (error) {
    logger.error('Toggle user error', { error: error.message })
    res.status(500).json({ error: 'Failed to toggle user status' })
  }
})

authRouter.post('/users/:id/reset-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    const session = await validateSession(token)

    if (!session || session.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const userId = parseInt(req.params.id)
    const { newPassword } = req.body

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const passwordHash = await hashPassword(newPassword)

    await pool.query(
      'UPDATE auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId]
    )

    await deleteUserSessions(userId)

    logger.info('Password reset', { userId, by: session.username })

    res.json({ message: 'Password reset successfully' })
  } catch (error) {
    logger.error('Reset password error', { error: error.message })
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

authRouter.post('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    const session = await validateSession(token)

    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const result = await pool.query(
      'SELECT password_hash FROM auth_users WHERE id = $1',
      [session.user_id]
    )

    const validPassword = await verifyPassword(currentPassword, result.rows[0].password_hash)

    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    const passwordHash = await hashPassword(newPassword)

    await pool.query(
      'UPDATE auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, session.user_id]
    )

    await deleteUserSessions(session.user_id)

    logger.info('Password changed', { userId: session.user_id })

    res.json({ message: 'Password changed successfully' })
  } catch (error) {
    logger.error('Change password error', { error: error.message })
    res.status(500).json({ error: 'Failed to change password' })
  }
})

// POST /api/auth/forgot-password - Request password reset
authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { username, email } = req.body

    if (!username && !email) {
      return res.status(400).json({ error: 'Username or email is required' })
    }

    // Find user by username or email
    let userResult
    if (username) {
      userResult = await pool.query(
        'SELECT id, username, email FROM auth_users WHERE username = $1 AND active = true',
        [username]
      )
    } else {
      userResult = await pool.query(
        'SELECT id, username, email FROM auth_users WHERE email = $1 AND active = true',
        [email]
      )
    }

    // Always return success to prevent username enumeration
    if (userResult.rows.length === 0) {
      logger.warn('Password reset requested for non-existent user', { username, email })
      return res.json({ message: 'If an account exists, a reset email will be sent' })
    }

    const user = userResult.rows[0]

    if (!user.email) {
      logger.warn('Password reset requested but user has no email', { userId: user.id })
      return res.json({ message: 'If an account exists with an email, a reset email will be sent' })
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex')

    // Delete any existing tokens for this user
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id])

    // Insert new token - use SAST timezone
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, ${sqlNowSAST()} + INTERVAL '1 hour')`,
      [user.id, resetToken]
    )

    // Send reset email
    const emailResult = await sendPasswordResetEmail(user.email, user.username, resetToken)

    if (!emailResult.success) {
      logger.error('Failed to send password reset email', { error: emailResult.error, userId: user.id })
    }

    logger.info('Password reset requested', { userId: user.id, username: user.username })

    res.json({ message: 'If an account exists with an email, a reset email will be sent' })
  } catch (error) {
    logger.error('Forgot password error', { error: error.message })
    res.status(500).json({ error: 'Failed to process request' })
  }
})

// POST /api/auth/resend-reset-token - Resend reset token (works for Authentik users)
authRouter.post('/resend-reset-token', async (req, res) => {
  try {
    const { username, email } = req.body

    if (!username && !email) {
      return res.status(400).json({ error: 'Username or email is required' })
    }

    let aUser = null
    let targetUsername = username

    // Find user by username or email in Authentik
    if (username) {
      aUser = await authentikClient.getUserByUsername(username)
    } else if (email) {
      // Search all users for email
      const allUsers = await authentikClient.getUsers()
      aUser = allUsers.find(u => u.email === email || u.attributes?.alt_email === email)
      targetUsername = aUser?.username
    }

    if (!aUser) {
      logger.warn('Resend reset: User not found', { username, email })
      return res.json({ message: 'If an account exists, a reset email will be sent' })
    }

    // Get email from Authentik
    const sendToEmail = aUser.attributes?.alt_email || aUser.email
    if (!sendToEmail) {
      return res.json({ message: 'If an account exists with an email, a reset email will be sent' })
    }

    // Generate new reset token
    const resetToken = crypto.randomBytes(32).toString('hex')

    // Check if user exists in local auth_users
    const userResult = await pool.query(
      'SELECT id, username FROM auth_users WHERE username = $1',
      [targetUsername]
    )

    let userId = null
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id
      
      // Delete any existing tokens
      await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId])
      
      // Insert new token - use SAST timezone
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, ${sqlNowSAST()} + INTERVAL '1 hour')`,
        [userId, resetToken]
      )
    }

    // Send reset email
    const result = await sendPasswordResetEmail(sendToEmail, targetUsername, resetToken)

    loggingService.info('PASSWORD', `Password reset token resent to ${targetUsername}`, { username: targetUsername, email: sendToEmail })

    await createAuditLog({
      action: 'password_reset_resent',
      actor: 'api',
      entity_type: 'user',
      entity_id: targetUsername,
      changes: { email: sendToEmail, emailSent: result.success },
      source: 'api',
      success: result.success,
    })

    logger.info('Password reset token resent', { username: targetUsername })

    res.json({ message: 'If an account exists with an email, a reset email will be sent' })
  } catch (error) {
    logger.error('Resend reset token error', { error: error.message })
    res.status(500).json({ error: 'Failed to process request' })
  }
})

// POST /api/auth/reset-password - Reset password with token
authRouter.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' })
    }

    const passwordValidation = validatePassword(newPassword)
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.errors.join(', ') })
    }

    // Find valid token
    const tokenResult = await pool.query(
      `SELECT id, user_id FROM password_reset_tokens 
       WHERE token = $1 AND used_at IS NULL AND expires_at > ${sqlNowSAST()}`,
      [token]
    )

    if (tokenResult.rows.length === 0) {
      logger.warn('Invalid or expired password reset token')
      return res.status(400).json({ error: 'Invalid or expired reset token' })
    }

    const resetRecord = tokenResult.rows[0]
    const userId = resetRecord.user_id

    // Hash new password
    const passwordHash = await hashPassword(newPassword)

    // Update user password in local database
    await pool.query(
      'UPDATE auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId]
    )

    // Get username for LDAP/Authentik sync
    const userResult = await pool.query(
      'SELECT username FROM auth_users WHERE id = $1',
      [userId]
    )
    const username = userResult.rows[0]?.username

    // Sync new password to LDAP and Authentik
    let ldapResult = 'skipped'
    let authentikResult = 'skipped'
    
    if (username) {
      // Sync to LDAP
      try {
        const ldapSet = await ldapClient.setUserPassword(username, newPassword)
        ldapResult = ldapSet ? 'success' : 'failed'
        logger.info('Password synced to LDAP after reset', { username, result: ldapResult })
      } catch (ldapError) {
        ldapResult = `failed: ${ldapError.message}`
        logger.error('Failed to sync password to LDAP after reset', { username, error: ldapError.message })
      }

      // Sync to Authentik
      try {
        const akUser = await authentikClient.getUserByUsername(username)
        if (akUser) {
          await authentikClient.setPassword(akUser.pk, newPassword)
          authentikResult = 'success'
          logger.info('Password synced to Authentik after reset', { username })
        }
      } catch (akError) {
        authentikResult = `failed: ${akError.message}`
        logger.error('Failed to sync password to Authentik after reset', { username, error: akError.message })
      }

      // Clear force_password flag in Authentik
      try {
        const akUser = await authentikClient.getUserByUsername(username)
        if (akUser) {
          await authentikClient.updateUser(akUser.pk, { force_password: false })
          logger.info('Cleared force_password flag in Authentik', { username })
        }
      } catch (akError) {
        logger.error('Failed to clear force_password flag', { username, error: akError.message })
      }
    }

    // Mark token as used
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = ${sqlNowSAST()} WHERE id = $1`,
      [resetRecord.id]
    )

    // Delete all other tokens for this user (security)
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND id != $2', [userId, resetRecord.id])

    logger.info('Password reset successful', { 
      userId, 
      username,
      ldap: ldapResult,
      authentik: authentikResult 
    })
    loggingService.info('PASSWORD', `Password reset successful for ${username}`, { username, ldap: ldapResult, authentik: authentikResult })

    res.json({ 
      message: 'Password reset successfully',
      synced: {
        ldap: ldapResult,
        authentik: authentikResult
      }
    })
  } catch (error) {
    logger.error('Reset password error', { error: error.message })
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

// GET /api/auth/verify-reset-token - Verify if token is valid
authRouter.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params

    const tokenResult = await pool.query(
      `SELECT prt.id, prt.expires_at, au.username 
       FROM password_reset_tokens prt
       JOIN auth_users au ON au.id = prt.user_id
       WHERE prt.token = $1 AND prt.used_at IS NULL AND prt.expires_at > ${sqlNowSAST()}`,
      [token]
    )

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ valid: false, error: 'Invalid or expired token' })
    }

    res.json({ 
      valid: true, 
      username: tokenResult.rows[0].username,
      expiresAt: tokenResult.rows[0].expires_at 
    })
  } catch (error) {
    logger.error('Verify reset token error', { error: error.message })
    res.status(500).json({ error: 'Failed to verify token' })
  }
})
