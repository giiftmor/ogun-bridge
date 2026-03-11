import express from 'express'
import bcrypt from 'bcryptjs'
import pool from '../lib/db.js'
import { 
  createSession, 
  deleteSession, 
  validateSession,
  deleteUserSessions 
} from '../middleware/auth.js'
import cookieParser from 'cookie-parser'
import { logger } from '../utils/logger.js'

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
