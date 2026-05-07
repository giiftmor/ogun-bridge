import express from 'express'
import bcrypt from 'bcryptjs'
import { logger } from '../utils/logger.js'
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

// GET /api/setup/status - Get setup status (public)
setupRouter.get('/status', async (req, res) => {
  try {
    const status = await getSetupStatus()
    res.json(status)
  } catch (error) {
    logger.error('Failed to get setup status', { error: error.message })
    res.status(500).json({ error: 'Failed to get setup status' })
  }
})

// POST /api/setup/admin - Create initial admin (only if no admin exists)
setupRouter.post('/admin', requireSetupNotComplete, async (req, res) => {
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
setupRouter.get('/config/:service', requireSetupNotComplete, async (req, res) => {
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
setupRouter.post('/config/:service', requireSetupNotComplete, async (req, res) => {
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
        // DB is already connected if we're running
        try {
          const pool = (await import('../lib/db.js')).default
          const client = await pool.connect()
          await client.query('SELECT 1')
          client.release()
          result = { success: true, message: 'Database connection successful' }
        } catch (dbError) {
          result = { success: false, message: dbError.message }
        }
        break
        
      default:
        return res.status(400).json({ error: 'Invalid service name' })
    }
    
    res.json(result)
  } catch (error) {
    logger.error('Service test failed', { service: req.params.service, error: error.message })
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/setup/complete - Mark setup as complete
setupRouter.post('/complete', requireSetupNotComplete, async (req, res) => {
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
setupRouter.post('/auto-admin', async (req, res) => {
  // This is called internally by the server on startup
  // Allow it only if no admin exists
  const hasAdmin = await hasAdminUser()
  if (hasAdmin) {
    return res.json({ created: false, reason: 'admin_exists' })
  }

  const result = await createSuperAdminIfNeeded()
  res.json(result)
})
