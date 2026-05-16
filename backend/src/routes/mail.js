import express from 'express'
import nodemailer from 'nodemailer'
import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'
import { addLogToCache } from '../services/logCache.js'
import { createAuditLog } from '../services/auditService.js'
import { setServiceConfig } from '../services/config.js'
import { authenticate } from '../middleware/auth.js'

export const mailRouter = express.Router()

mailRouter.use(authenticate)

async function loadMailConfig() {
  await getMailConfig()
  logger.info('Mail settings loaded')
}

async function getMailConfig() {
  // Primary source: service_configs table
  try {
    const result = await pool.query(
      "SELECT key, value FROM service_configs WHERE service = 'smtp'"
    )
    if (result.rows.length > 0) {
      const cfg = {}
      for (const row of result.rows) {
        cfg[row.key] = row.value
      }
      return {
        host: cfg.host || '',
        port: parseInt(cfg.port || '587'),
        secure: cfg.secure === 'true',
        requireTLS: cfg.requireTLS !== 'false',
        user: cfg.username || '',
        password: cfg.password || '',
        fromName: cfg.fromName || '',
        fromAddress: cfg.fromAddress || '',
      }
    }
  } catch (error) {
    logger.error('Error loading mail config from service_configs:', error.message)
  }

  // Fallback: mail_settings table (legacy)
  try {
    const result = await pool.query('SELECT * FROM mail_settings WHERE id = 1')
    if (result.rows.length > 0) {
      const row = result.rows[0]
      return {
        host: row.host,
        port: row.port,
        secure: row.secure || false,
        requireTLS: row.require_tls !== false,
        user: row.username || '',
        password: row.password || '',
        fromName: row.from_name,
        fromAddress: row.from_address,
      }
    }
  } catch (error) {
    logger.error('Error loading mail config from mail_settings:', error.message)
  }
  
  return {
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromName: process.env.SMTP_FROM_NAME || 'Ogun Bridge',
    fromAddress: process.env.SMTP_FROM_ADDRESS || 'alsm@example.com',
  }
}

async function getTransporter() {
  const config = await getMailConfig()
  
  if (!config.host || config.host === 'smtp.example.com') {
    logger.warn('SMTP not configured or using default placeholder')
    return null
  }

  const isSecure = config.port === 465 || config.secure
  const shouldRequireTLS = config.requireTLS && !isSecure
  
  logger.info(`[DEBUG] Creating transporter: host=${config.host} port=${config.port} secure=${isSecure} requireTLS=${shouldRequireTLS}`)
  
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: isSecure,
    requireTLS: shouldRequireTLS,
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 30000,
    greetingTimeout: 15000,
    auth: config.user ? {
      user: config.user,
      pass: config.password,
    } : undefined,
  })
}

// Load config on startup
loadMailConfig()

mailRouter.get('/config', async (req, res) => {
  const config = await getMailConfig()
  res.json({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    user: config.user,
    fromName: config.fromName,
    fromAddress: config.fromAddress,
  })
})

mailRouter.post('/config', async (req, res) => {
  try {
    const { host, port, secure, requireTLS, user, password, fromName, fromAddress } = req.body
    
    await pool.query(
      `UPDATE mail_settings SET 
        host = COALESCE($1, host),
        port = COALESCE($2, port),
        secure = COALESCE($3, secure),
        require_tls = COALESCE($4, require_tls),
        username = $5,
        password = COALESCE($6, password),
        from_name = COALESCE($7, from_name),
        from_address = COALESCE($8, from_address),
        updated_at = NOW()
       WHERE id = 1`,
      [host, port, secure, requireTLS, user || null, password || null, fromName || null, fromAddress || null]
    )
    
    // Sync to service_configs table to eliminate dual-truth
    try {
      await setServiceConfig('smtp', {
        host: host || undefined,
        port: port || undefined,
        secure: secure !== undefined ? String(secure) : undefined,
        requireTLS: requireTLS !== undefined ? String(requireTLS) : undefined,
        username: user || undefined,
        password: password || undefined,
        fromName: fromName || undefined,
        fromAddress: fromAddress || undefined,
      })
    } catch (syncErr) {
      logger.warn('Failed to sync mail config to service_configs:', syncErr.message)
    }

    // Reload config
    await loadMailConfig()
    
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `[MAIL] Configuration updated`,
    })
    
    createAuditLog({
      action: 'mail_config_updated',
      actor: req.user?.username || 'system',
      entity_type: 'config',
      entity_id: 'mail',
      changes: { host, port, secure, requireTLS, user, fromName, fromAddress },
      source: 'ui',
      ip_address: req.ip,
    })
    
    res.json({ success: true })
  } catch (error) {
    logger.error('Error saving mail config:', error)
    res.status(500).json({ error: error.message })
  }
})

mailRouter.post('/test', async (req, res) => {
  try {
    const transporter = await getTransporter()
    const config = await getMailConfig()
    
    logger.info(`[DEBUG] Test email config: host=${config.host} port=${config.port} secure=${config.port === 465 || config.secure} requireTLS=${config.requireTLS} user=${config.user} hasPassword=${!!config.password}`)
    
    if (!transporter || config.host === 'smtp.example.com') {
      return res.json({ 
        success: false, 
        message: 'SMTP not configured. Please configure mail settings first.' 
      })
    }

    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `[MAIL] Sending test email from ${config.fromAddress}`,
    })

    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromAddress}>`,
      to: config.user ? config.user : undefined,
      subject: 'Ogun Bridge Test Email',
      text: 'This is a test email from ALSM. If you received this, your mail settings are working!',
      html: `
        <h2>ALSM Test Email</h2>
        <p>This is a test email from ALSM.</p>
        <p>If you received this, your mail settings are working!</p>
      `,
    })

    logger.info('Test email sent', { messageId: info.messageId })
    
    res.json({ 
      success: true, 
      message: `Test email sent successfully (${info.messageId})` 
    })
  } catch (error) {
    logger.error('Error sending test email:', error)
    res.status(500).json({ 
      success: false, 
      message: `Failed to send test email: ${error.message}` 
    })
  }
})

export { getMailConfig, getTransporter, loadMailConfig }
