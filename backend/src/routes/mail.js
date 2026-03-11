import express from 'express'
import { logger } from '../utils/logger.js'
import { addLogToCache } from '../services/logCache.js'
import { createAuditLog } from '../services/auditService.js'
import { authenticate } from '../middleware/auth.js'

export const mailRouter = express.Router()

mailRouter.use(authenticate)

let mailConfig = {
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  password: process.env.SMTP_PASSWORD || '',
  fromName: process.env.SMTP_FROM_NAME || 'ALSM',
  fromAddress: process.env.SMTP_FROM_ADDRESS || 'alsm@example.com',
}

mailRouter.get('/config', (req, res) => {
  res.json({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    user: mailConfig.user,
    fromName: mailConfig.fromName,
    fromAddress: mailConfig.fromAddress,
  })
})

mailRouter.post('/config', (req, res) => {
  try {
    const { host, port, secure, user, password, fromName, fromAddress } = req.body
    
    if (host) mailConfig.host = host
    if (port) mailConfig.port = parseInt(port)
    if (secure !== undefined) mailConfig.secure = secure
    if (user) mailConfig.user = user
    if (password) mailConfig.password = password
    if (fromName) mailConfig.fromName = fromName
    if (fromAddress) mailConfig.fromAddress = fromAddress
    
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `[MAIL] Configuration updated`,
    })
    
    res.json({ success: true })
  } catch (error) {
    logger.error('Error saving mail config:', error)
    res.status(500).json({ error: error.message })
  }
})

mailRouter.post('/test', async (req, res) => {
  try {
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `[MAIL] Sending test email from ${mailConfig.fromAddress}`,
    })
    
    res.json({ 
      success: true, 
      message: 'Test email functionality ready (SMTP integration pending)' 
    })
  } catch (error) {
    logger.error('Error sending test email:', error)
    res.status(500).json({ error: error.message })
  }
})
