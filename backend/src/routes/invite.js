import express from 'express'
import crypto from 'crypto'
import pool from '../lib/db.js'
import { ldapClient } from '../services/ldapClient.js'
import { authentikClient } from '../services/authentikClient.js'
import { logger } from '../utils/logger.js'
import { sendPasswordCreationEmail, sendPasswordResetEmail, sendBulkPasswordEmails } from '../services/emailService.js'
import { triggerWebhook, getWebhooks, createWebhook, deleteWebhook, testWebhook } from '../services/webhookService.js'
import { ensureUserProfile, updateUserProfile } from '../services/userProfileService.js'
import { loggingService } from '../services/loggingService.js'
import { createAuditLog } from '../services/auditService.js'
import { authenticate } from '../middleware/auth.js'
import { validatePassword } from './password.js'
import { sqlNowSAST } from '../utils/timezone.js'

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
      
      loggingService.info('PASSWORD', `Password invite sent to ${username}`, { username, email: aUser.email })
      
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

// Force password reset - generate token and send reset email
inviteRouter.post('/force-reset/:username', async (req, res) => {
  try {
    const { username } = req.params
    
    // Get user from Authentik
    const aUser = await authentikClient.getUserByUsername(username)
    if (!aUser) {
      return res.status(404).json({ error: 'User not found in Authentik' })
    }
    
    // Get email from Authentik - prefer altEmail, fallback to primary
    const altEmail = aUser.attributes?.alt_email || null
    const primaryEmail = aUser.email
    const sendToEmail = altEmail || primaryEmail
    
    if (!sendToEmail) {
      return res.status(400).json({ error: 'User has no email address' })
    }
    
    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    
    // Ensure user exists in local auth_users (create if not exists)
    let userResult = await pool.query(
      'SELECT id, username FROM auth_users WHERE username = $1',
      [username]
    )
    
    let userId = null
    if (userResult.rows.length === 0) {
      // Create local auth_users record with a placeholder password (user must reset)
      const placeholderHash = '$2a$10$placeholderfordummyuseonly' // Never valid
      await pool.query(
        'INSERT INTO auth_users (username, password_hash, email, role, active) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING',
        [username, placeholderHash, sendToEmail, 'viewer', true]
      )
      // Fetch the newly created user
      userResult = await pool.query(
        'SELECT id, username FROM auth_users WHERE username = $1',
        [username]
      )
      logger.info('Created local auth_users record for force reset', { username })
    }
    
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id
      
      // Delete any existing tokens for this user
      await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId])
      
      // Insert new token
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, ${sqlNowSAST()} + INTERVAL '1 hour')`,
        [userId, resetToken]
      )
    }
    
    // Send password reset email (with token, proper template)
    const result = await sendPasswordResetEmail(
      sendToEmail,
      username,
      resetToken
    )
    
    loggingService.info('PASSWORD', `Force password reset email sent to ${username}`, { username, email: sendToEmail, hasLocalAccount: !!userId })
    
    await createAuditLog({
      action: 'password_force_reset',
      actor: 'api',
      entity_type: 'user',
      entity_id: username,
      changes: { email: sendToEmail, method: 'force_reset', tokenSent: result.success },
      source: 'api',
      success: result.success,
    })
    
    res.json({
      success: result.success,
      username,
      email: sendToEmail,
      messageId: result.messageId,
      error: result.error,
      message: `Password reset email sent to ${sendToEmail}`
    })
  } catch (error) {
    logger.error('Error force password reset:', error)
    res.status(500).json({ error: error.message })
  }
})
