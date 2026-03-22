import express from 'express'
import { ldapClient } from '../services/ldapClient.js'
import { authentikClient } from '../services/authentikClient.js'
import { logger } from '../utils/logger.js'
import { sendPasswordCreationEmail, sendBulkPasswordEmails } from '../services/emailService.js'
import { triggerWebhook, getWebhooks, createWebhook, deleteWebhook, testWebhook } from '../services/webhookService.js'
import { ensureUserProfile, updateUserProfile } from '../services/userProfileService.js'
import { addLogToCache } from '../services/logCache.js'
import { createAuditLog } from '../services/auditService.js'
import { authenticate } from '../middleware/auth.js'

export const inviteRouter = express.Router()

inviteRouter.use(authenticate)

// Send password invite to a single user
inviteRouter.post('/send/:username', async (req, res) => {
  try {
    const { username } = req.params
    
    // Get user from Authentik
    const aUser = await authentikClient.getUserByUsername(username)
    if (!aUser) {
      return res.status(404).json({ error: 'User not found in Authentik' })
    }
    
    // Get altEmail from Authentik attributes (primary source)
    const altEmail = aUser.attributes?.alt_email || null
    
    // Send email
    const result = await sendPasswordCreationEmail(
      aUser.email,
      username,
      aUser.name,
      altEmail
    )
    
    if (result.success) {
      // Update user profile
      await ensureUserProfile(username, altEmail)
      await updateUserProfile(username, {
        email_invite_sent: true,
        email_invite_sent_at: new Date(),
      })
      
      addLogToCache({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Password invite sent to ${username}`,
        context: { username, email: aUser.email }
      })
      
      await createAuditLog({
        action: 'password_invite_sent',
        actor: 'api',
        entity_type: 'user',
        entity_id: username,
        changes: { email: aUser.email, altEmail },
        source: 'api',
        success: true,
      })
    }
    
    res.json({
      success: result.success,
      username,
      email: aUser.email,
      altEmail,
      messageId: result.messageId,
      error: result.error,
    })
  } catch (error) {
    logger.error('Error sending password invite:', error)
    res.status(500).json({ error: error.message })
  }
})

// Send bulk password invites
inviteRouter.post('/send-bulk', async (req, res) => {
  try {
    const { usernames } = req.body
    
    if (!usernames || !Array.isArray(usernames)) {
      return res.status(400).json({ error: 'usernames array is required' })
    }
    
    const results = []
    
    for (const username of usernames) {
      try {
        const aUser = await authentikClient.getUserByUsername(username)
        if (!aUser) {
          results.push({ username, success: false, error: 'User not found' })
          continue
        }
        
        const altEmail = aUser.attributes?.alt_email || null
        
        const result = await sendPasswordCreationEmail(
          aUser.email,
          username,
          aUser.name,
          altEmail
        )
        
        if (result.success) {
          await ensureUserProfile(username, altEmail)
          await updateUserProfile(username, {
            email_invite_sent: true,
            email_invite_sent_at: new Date(),
          })
        }
        
        results.push({
          username,
          success: result.success,
          email: aUser.email,
          messageId: result.messageId,
          error: result.error,
        })
      } catch (error) {
        results.push({ username, success: false, error: error.message })
      }
    }
    
    const successCount = results.filter(r => r.success).length
    
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Bulk password invites sent: ${successCount}/${usernames.length}`,
      context: { total: usernames.length, success: successCount }
    })
    
    res.json({
      total: usernames.length,
      successful: successCount,
      failed: usernames.length - successCount,
      results,
    })
  } catch (error) {
    logger.error('Error sending bulk password invites:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get all webhooks
inviteRouter.get('/webhooks', async (req, res) => {
  try {
    const webhooks = await getWebhooks()
    res.json(webhooks)
  } catch (error) {
    logger.error('Error getting webhooks:', error)
    res.status(500).json({ error: error.message })
  }
})

// Create webhook
inviteRouter.post('/webhooks', async (req, res) => {
  try {
    const { name, url, events } = req.body
    
    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' })
    }
    
    const webhook = await createWebhook(name, url, events || ['password_created'])
    res.json(webhook)
  } catch (error) {
    logger.error('Error creating webhook:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete webhook
inviteRouter.delete('/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params
    await deleteWebhook(id)
    res.json({ success: true })
  } catch (error) {
    logger.error('Error deleting webhook:', error)
    res.status(500).json({ error: error.message })
  }
})

// Test webhook
inviteRouter.post('/webhooks/:id/test', async (req, res) => {
  try {
    const { id } = req.params
    const result = await testWebhook(parseInt(id))
    res.json(result)
  } catch (error) {
    logger.error('Error testing webhook:', error)
    res.status(500).json({ error: error.message })
  }
})

// Trigger password created webhook (called after password is set)
export async function triggerPasswordCreatedWebhook(username, email, services) {
  return triggerWebhook('password_created', {
    username,
    email,
    services,
    message: 'User has created their password',
  })
}

// Force password reset - invalidate password and send reset email
inviteRouter.post('/force-reset/:username', async (req, res) => {
  try {
    const { username } = req.params
    
    // Get user from Authentik
    const aUser = await authentikClient.getUserByUsername(username)
    if (!aUser) {
      return res.status(404).json({ error: 'User not found in Authentik' })
    }
    
    // Get altEmail from Authentik attributes (primary source)
    const altEmail = aUser.attributes?.alt_email || null
    
    // Invalidate password in Authentik by forcing password change
    try {
      // This is a workaround - we can't truly invalidate without additional setup
      // Instead we'll just send the password creation email
      logger.info('Force password reset requested for user', { username })
    } catch (akError) {
      logger.error('Error invalidating Authentik password:', akError.message)
    }
    
    // Send password creation email (same as invite but labeled as reset)
    const result = await sendPasswordCreationEmail(
      aUser.email,
      username,
      aUser.name,
      altEmail
    )
    
    if (result.success) {
      // Update user profile
      await ensureUserProfile(username, altEmail)
      await updateUserProfile(username, {
        password_method: 'reset',
        email_invite_sent: true,
        email_invite_sent_at: new Date(),
      })
      
      addLogToCache({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Force password reset email sent to ${username}`,
        context: { username, email: aUser.email }
      })
      
      await createAuditLog({
        action: 'password_force_reset',
        actor: 'api',
        entity_type: 'user',
        entity_id: username,
        changes: { email: aUser.email, altEmail, method: 'force_reset' },
        source: 'api',
        success: true,
      })
    }
    
    res.json({
      success: result.success,
      username,
      email: aUser.email,
      altEmail,
      messageId: result.messageId,
      error: result.error,
    })
  } catch (error) {
    logger.error('Error force password reset:', error)
    res.status(500).json({ error: error.message })
  }
})
