import express from 'express'
import { logger } from '../utils/logger.js'
import { MailserverIntegration } from '../services/mailserver.js'
import { ldapClient } from '../services/ldapClient.js'
import { authenticate, requireRole } from '../middleware/auth.js'

export const mailAdminRouter = express.Router()

mailAdminRouter.use(authenticate)

const getMailserverConfig = () => ({
  enabled: process.env.MAILSERVER_ENABLED !== 'false',
  containerName: process.env.MAILSERVER_CONTAINER || 'mailserver',
  domain: process.env.MAIL_DOMAIN || 'spectres.co.za',
  quotaManagement: process.env.MAILSERVER_QUOTA === 'true',
  ldapMode: process.env.MAILSERVER_LDAP_MODE !== 'false',
})

mailAdminRouter.get('/status', async (req, res) => {
  try {
    const config = getMailserverConfig()
    const mailserver = new MailserverIntegration(config)
    const mailboxes = await mailserver.listMailboxes()
    
    res.json({
      enabled: config.enabled,
      domain: config.domain,
      container: config.containerName,
      ldapMode: config.ldapMode,
      mailboxCount: mailboxes.length,
      mailboxes: mailboxes.map(m => {
        const parts = m.split(/\s+/)
        return {
          email: parts[0],
          quota: parts[1] || 'unknown',
        }
      }),
    })
  } catch (error) {
    logger.error('Error getting mail status:', error)
    res.status(500).json({ error: error.message })
  }
})

mailAdminRouter.post('/mailbox', requireRole('admin'), async (req, res) => {
  try {
    const { username, email } = req.body
    
    if (!username || !email) {
      return res.status(400).json({ error: 'Username and email are required' })
    }
    
    const config = getMailserverConfig()
    const mailserver = new MailserverIntegration(config)
    
    await mailserver.createMailbox(username, email)
    
    logger.info(`Mailbox created via API: ${email}`)
    
    res.json({ success: true, email })
  } catch (error) {
    logger.error('Error creating mailbox:', error)
    res.status(500).json({ error: error.message })
  }
})

mailAdminRouter.delete('/mailbox/:email', requireRole('admin'), async (req, res) => {
  try {
    const { email } = req.params
    const config = getMailserverConfig()
    const mailserver = new MailserverIntegration(config)
    
    await mailserver.deleteMailbox(email.split('@')[0])
    
    logger.info(`Mailbox deleted via API: ${email}`)
    
    res.json({ success: true })
  } catch (error) {
    logger.error('Error deleting mailbox:', error)
    res.status(500).json({ error: error.message })
  }
})

mailAdminRouter.post('/quota', requireRole('admin'), async (req, res) => {
  try {
    const { email, quotaInMB } = req.body
    
    if (!email || !quotaInMB) {
      return res.status(400).json({ error: 'Email and quota are required' })
    }
    
    const config = getMailserverConfig()
    const mailserver = new MailserverIntegration(config)
    
    await mailserver.updateQuota(email, quotaInMB)
    
    res.json({ success: true })
  } catch (error) {
    logger.error('Error updating quota:', error)
    res.status(500).json({ error: error.message })
  }
})

mailAdminRouter.get('/config', (req, res) => {
  const config = getMailserverConfig()
  res.json({
    enabled: config.enabled,
    domain: config.domain,
    container: config.containerName,
  })
})

mailAdminRouter.post('/config', requireRole('admin'), (req, res) => {
  const { enabled, domain } = req.body
  
  if (enabled !== undefined) {
    process.env.MAILSERVER_ENABLED = enabled.toString()
  }
  if (domain) {
    process.env.MAIL_DOMAIN = domain
  }
  
  res.json({ success: true })
})
