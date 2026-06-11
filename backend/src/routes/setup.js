import express from 'express'
import bcrypt from 'bcryptjs'
import { logger } from '../utils/logger.js'
import { AppError } from '../utils/AppError.js'
import {
  getSetupStatus,
  isSetupComplete,
  hasAdminUser,
  createSuperAdminIfNeeded,
  getServiceConfig,
  setServiceConfig,
  markSetupComplete,
  SERVICE_LDAP,
  SERVICE_AUTHENTIK,
  SERVICE_SMTP,
} from '../services/config.js'
import { isDbConnected, reconfigurePool } from '../lib/db.js'

// Import clients for testing
import { LDAPClient } from '../services/ldapClient.js'
import { AuthentikClient } from '../services/authentikClient.js'
import nodemailer from 'nodemailer'

export const setupRouter = express.Router()

// Middleware: block setup routes after setup is complete
// Allows re-access if sync is failing (re-allow setup)
async function requireSetupNotComplete(req, res, next) {
  const complete = await isSetupComplete()
  
  if (complete) {
    // Check if sync is failing (re-allow setup)
    try {
      const { getSyncState } = await import('../services/syncService.js')
      const syncState = getSyncState()
      
      if (syncState.status === 'failed' || syncState.isConnected === false) {
        const logger = (await import('../utils/logger.js')).logger
        logger.info('Allowing /god-mode access due to sync health issues')
        return next()
      }
    } catch (err) {
      // If we can't check sync state, deny access
    }
    
    return res.status(403).json({ error: 'Setup already complete' })
  }
  next()
}

// Middleware: return 503 if DB is not connected (applied to DB-dependent routes)
async function requireDbOnline(req, res, next) {
  const connected = await isDbConnected()
  if (!connected) {
    return res.status(503).json({
      error: 'Database not connected',
      message: 'Configure your database connection in the Database step first.',
    })
  }
  next()
}

// GET /api/setup/status - Get setup status (public)
setupRouter.get('/status', async (req, res) => {
  try {
    const dbConnected = await isDbConnected()
    const status = await getSetupStatus()
    res.json({ ...status, db_connected: dbConnected })
  } catch (error) {
    logger.error('Failed to get setup status', { error: error.message })
    res.status(500).json({ error: 'Failed to get setup status' })
  }
})

// GET /api/setup/god-mode - Get existing configs for testing before changing (works even after setup complete)
setupRouter.get('/god-mode', requireDbOnline, async (req, res) => {
  try {
    const dbConnected = await isDbConnected()
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database not connected' })
    }

    const [authentik, ldap, smtp] = await Promise.all([
      getServiceConfig('authentik').catch(() => null),
      getServiceConfig('ldap').catch(() => null),
      getServiceConfig('smtp').catch(() => null),
    ])

    function mask(obj) {
      if (!obj) return null
      const masked = { ...obj }
      for (const [key, value] of Object.entries(masked)) {
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
          masked[key] = value ? '••••••••' : ''
        }
      }
      return masked
    }

    res.json({
      god_mode: true,
      setup_complete: await isSetupComplete(),
      authentik: mask(authentik),
      ldap: mask(ldap),
      smtp: mask(smtp),
    })
  } catch (error) {
    logger.error('Failed to get god-mode config', { error: error.message })
    res.status(500).json({ error: 'Failed to load existing configuration' })
  }
})

// POST /api/setup/verify-admin - Verify super admin credentials (gate for setup wizard)
setupRouter.post('/verify-admin', requireDbOnline, async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' })
    }

    const { pool } = await import('../lib/db.js')
    const result = await pool.query(
      `SELECT id, username, password_hash, role, active
       FROM auth_users
       WHERE (role = 'admin' OR role = 'super_admin')
         AND username = $1
         AND active = true
       LIMIT 1`,
      [username]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid admin credentials' })
    }

    const user = result.rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)

    if (!valid) {
      return res.status(401).json({ error: 'Invalid admin credentials' })
    }

    logger.info('Admin credentials verified for setup wizard', { username, role: user.role })

    res.json({ verified: true, user: { id: user.id, username: user.username, role: user.role } })
  } catch (error) {
    logger.error('Failed to verify admin', { error: error.message })
    res.status(500).json({ error: 'Failed to verify admin credentials' })
  }
})

// POST /api/setup/config/database - Test and save database configuration
// This is the ONLY config endpoint that works without a connected DB
setupRouter.post('/config/database', async (req, res) => {
  try {
    const { host, port, database, user, password } = req.body

    if (!host || !user) {
      return res.status(400).json({ error: 'Host and user are required' })
    }

    // Test the connection with provided config
    const testResult = await testDatabaseConnection({ host, port, database, user, password })
    
    if (!testResult.success) {
      return res.json({ success: false, message: testResult.message })
    }

    // Save config and reconfigure pool
    await reconfigurePool({ host, port, database, user, password })

    // Auto-create super admin from .env if it doesn't exist yet
    try {
      await createSuperAdminIfNeeded()
    } catch (e) {
      logger.warn('Super admin auto-creation after DB config failed:', e.message)
    }

    logger.info('Database reconfigured via setup wizard', { host, database, user })
    res.json({ success: true, message: 'Database connection successful! Config saved.' })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Failed to configure database', { error: error.message })
    res.status(500).json({ error: 'Failed to configure database', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Helper: test a database connection with given config
async function testDatabaseConnection(config) {
  const { host, port, database, user, password } = config
  const pg = (await import('pg')).default
  const client = new pg.Client({
    host,
    port: parseInt(port) || 5432,
    database: database || 'postgres',
    user,
    password: password || '',
    connectionTimeoutMillis: 5000,
  })

  try {
    await client.connect()
    await client.query('SELECT 1')
    await client.end()
    return { success: true, message: 'Database connection successful' }
  } catch (error) {
    return { success: false, message: error.message }
  }
}

// POST /api/setup/admin - Create initial admin (only if no admin exists)
setupRouter.post('/admin', requireDbOnline, requireSetupNotComplete, async (req, res) => {
  try {
    const { username, password, email } = req.body
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' })
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }
    
    const hasAdmin = await hasAdminUser()
    if (hasAdmin) {
      return res.status(409).json({ error: 'Admin user already exists' })
    }
    
    const passwordHash = await bcrypt.hash(password, 10)
    
    const pool = (await import('../lib/db.js')).default
    const result = await pool.query(
      `INSERT INTO auth_users (username, password_hash, email, role, active)
       VALUES ($1, $2, $3, 'admin', true)
       RETURNING id, username, email, role, created_at`,
      [username, passwordHash, email || null]
    )
    
    logger.info('Initial admin user created via setup', { username })
    
    res.status(201).json({
      message: 'Admin user created successfully',
      user: result.rows[0],
    })
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' })
    }
    logger.error('Failed to create admin user', { error: error.message })
    res.status(500).json({ error: 'Failed to create admin user' })
  }
})

// GET /api/setup/config/:service - Get config for a service
setupRouter.get('/config/:service', requireDbOnline, requireSetupNotComplete, async (req, res) => {
  try {
    const { service } = req.params
    
    if (!['ldap', 'authentik', 'smtp'].includes(service)) {
      return res.status(400).json({ error: 'Invalid service name' })
    }
    
    const config = await getServiceConfig(service)
    
    // Mask secret values
    const masked = { ...config }
    for (const [key, value] of Object.entries(masked)) {
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('token')) {
        if (value) masked[key] = '••••••••'
      }
    }
    
    res.json(masked)
  } catch (error) {
    logger.error('Failed to get service config', { error: error.message })
    res.status(500).json({ error: 'Failed to get service config' })
  }
})

// POST /api/setup/config/:service - Save config for a service
setupRouter.post('/config/:service', requireDbOnline, requireSetupNotComplete, async (req, res) => {
  try {
    const { service } = req.params
    const config = req.body
    
    if (!['ldap', 'authentik', 'smtp'].includes(service)) {
      return res.status(400).json({ error: 'Invalid service name' })
    }
    
    await setServiceConfig(service, config)
    
    res.json({ message: `${service} configuration saved successfully` })
  } catch (error) {
    logger.error('Failed to save service config', { service, error: error.message })
    res.status(500).json({ error: 'Failed to save service config' })
  }
})

// POST /api/setup/test/:service - Test service connection
setupRouter.post('/test/:service', requireSetupNotComplete, async (req, res) => {
  try {
    const { service } = req.params
    const config = req.body // Use provided config for testing
    
    let result = { success: false, message: 'Unknown service' }
    
    switch (service) {
      case 'ldap': {
        const ldap = new LDAPClient()
        // Override with provided config
        ldap.host = config.host || ldap.host
        ldap.port = parseInt(config.port) || ldap.port
        ldap.bindDN = config.bindDN || ldap.bindDN
        ldap.bindPassword = config.bindPassword || ldap.bindPassword
        ldap.baseDN = config.baseDN || ldap.baseDN
        
        try {
          await ldap.connect()
          await ldap.disconnect()
          result = { success: true, message: 'LDAP connection successful' }
        } catch (ldapError) {
          result = { success: false, message: ldapError.message }
        }
        break
      }
      
      case 'authentik': {
        const ak = new AuthentikClient()
        ak.baseUrl = config.baseUrl || ak.baseUrl
        ak.apiToken = config.apiToken || ak.apiToken
        
        try {
          const users = await ak.getUsers({ search: 'test', is_active: true })
          result = { success: true, message: 'Authentik API connection successful', userCount: users.length }
        } catch (akError) {
          result = { success: false, message: akError.message }
        }
        break
      }
      
      case 'smtp': {
        const transport = nodemailer.createTransport({
          host: config.host,
          port: parseInt(config.port) || 587,
          secure: config.secure === true || config.port === 465,
          requireTLS: config.secure !== true && config.port !== 465,
          auth: {
            user: config.username,
            pass: config.password,
          },
          tls: {
            rejectUnauthorized: false,
          },
        })
        
        try {
          await transport.verify()
          result = { success: true, message: 'SMTP connection successful' }
        } catch (smtpError) {
          result = { success: false, message: smtpError.message }
        }
        break
      }
      
      case 'database':
        // Test database with provided config (or fall back to current env/file config)
        result = await testDatabaseConnection({
          host: config.host || process.env.DB_HOST || 'localhost',
          port: config.port || process.env.DB_PORT || '5432',
          database: config.database || process.env.DB_NAME || 'ogun_bridge',
          user: config.user || process.env.DB_USER || 'postgres',
          password: config.password !== undefined ? config.password : process.env.DB_PASSWORD || '',
        })
        break
        
      default:
        return res.status(400).json({ error: 'Invalid service name' })
    }
    
    res.json(result)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Service test failed', { service: req.params.service, error: error.message })
    res.status(500).json({ error: 'Service test failed', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// POST /api/setup/complete - Mark setup as complete
setupRouter.post('/complete', requireDbOnline, requireSetupNotComplete, async (req, res) => {
  try {
    // Verify admin exists
    const hasAdmin = await hasAdminUser()
    if (!hasAdmin) {
      return res.status(400).json({ error: 'Cannot complete setup: no admin user exists' })
    }
    
    await markSetupComplete()
    
    logger.info('System setup marked as complete')
    
    res.json({ message: 'Setup completed successfully' })
  } catch (error) {
    logger.error('Failed to complete setup', { error: error.message })
    res.status(500).json({ error: 'Failed to complete setup' })
  }
})

// POST /api/setup/auto-admin - Auto-create super-admin from env var (called on startup)
setupRouter.post('/auto-admin', requireDbOnline, async (req, res) => {
  // This is called internally by the server on startup
  // Allow it only if no admin exists
  const hasAdmin = await hasAdminUser()
  if (hasAdmin) {
    return res.json({ created: false, reason: 'admin_exists' })
  }

  const result = await createSuperAdminIfNeeded()
  res.json(result)
})
