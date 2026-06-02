import express from 'express'
import crypto from 'crypto'
import { pool } from '../lib/db.js'
import { ldapClient } from '../services/ldapClient.js'
import { authentikClient } from '../services/authentikClient.js'
import { logger } from '../utils/logger.js'
import { sendPasswordCreationEmail, sendPasswordResetEmail, sendBulkPasswordEmails } from '../services/emailService.js'
import { triggerWebhook, getWebhooks, createWebhook, deleteWebhook, testWebhook } from '../services/webhookService.js'
import { ensureUserProfile, updateUserProfile } from '../services/userProfileService.js'
import { loggingService } from '../services/loggingService.js'
import { createAuditLog } from '../services/auditService.js'
import { authenticate, requireLDAPGroup } from '../middleware/auth.js'
import { validatePassword } from './password.js'

export const inviteRouter = express.Router()

inviteRouter.use(authenticate)

// Helper to get user's services from Authentik groups
async function getUserServicesFromAuthentik(username) {
  try {
    // Get user's groups from Authentik
    const aUser = await authentikClient.getUserByUsername(username)
    if (!aUser) {
      logger.info('User not found in Authentik', { username })
      return []
    }
    
    const allGroups = await authentikClient.getGroups()
    const userGroups = allGroups.filter(g => 
      g.users && aUser.pk && g.users.includes(aUser.pk)
    ).map(g => g.name)
    
    if (userGroups.length === 0) {
      logger.info('No groups found for user in Authentik', { username })
      return []
    }
    
    // Get services for those groups (only active, publicly accessible ones)
    const servicesResult = await pool.query(
      `SELECT service_name, service_url, service_type, description, icon
       FROM group_services
       WHERE group_name = ANY($1) AND is_active = true AND is_public = true
       ORDER BY service_name`,
      [userGroups]
    )
    
    return servicesResult.rows.map(row => ({
      id: row.service_name.toLowerCase().replace(/\s+/g, '-'),
      name: row.service_name,
      url: row.service_url,
      type: row.service_type,
      description: row.description,
      icon: row.icon || 'default',
      accessMethod: getAccessMethod(row.service_type),
    }))
  } catch (error) {
    logger.error('Error fetching user services from Authentik:', { error: error.message, username })
    return []
  }
}

function getAccessMethod(serviceType) {
  const methods = {
    web: 'Login with your Ogun Bridge credentials',
    vpn: 'WireGuard config from administrator',
    api: 'API credentials from administrator',
    database: 'Database credentials from administrator',
  }
  return methods[serviceType] || 'Contact administrator for access'
}

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
    
    // Generate reset token first
    const resetToken = crypto.randomBytes(32).toString('hex')
    let userId = null
    
    // Ensure user exists in local auth_users
    let userResult = await pool.query(
      'SELECT id FROM auth_users WHERE username = $1',
      [username]
    )
    
    if (userResult.rows.length === 0) {
      const placeholderHash = '$2a$10$placeholderfordummyuseonly'
      await pool.query(
        'INSERT INTO auth_users (username, password_hash, email, role, active) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING',
        [username, placeholderHash, aUser.email || altEmail, 'viewer', true]
      )
      userResult = await pool.query(
        'SELECT id FROM auth_users WHERE username = $1',
        [username]
      )
    }
    
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id
      
      // Delete any existing tokens
      await pool.query('DELETE FROM password_reset_tokens WHERE username = $1', [username])
      
      // Insert new token with 7 day expiry
      await pool.query(
        `INSERT INTO password_reset_tokens (username, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
        [username, resetToken]
      )
    }
    
    // Get user's services from Authentik groups
    const services = await getUserServicesFromAuthentik(username)
    
    // Send email WITH TOKEN and services - use altEmail if available, otherwise use primary
    const sendTo = altEmail || aUser.email
    const result = await sendPasswordCreationEmail(
      sendTo,
      username,
      aUser.name,
      resetToken,
      altEmail,
      services
    )
    
    if (result.success) {

      // Update user profile
      await ensureUserProfile(username, altEmail)
      await updateUserProfile(username, {
        email_invite_sent: true,
        email_invite_sent_at: new Date(),
      })
      
      const createPasswordUrl = `${process.env.APP_URL || 'https://ogun.spectres.co.za'}/create-password/${resetToken}`
      // Don't log the full URL - token is sensitive
      loggingService.info('PASSWORD', `Password invite sent to ${username}`, { username, email: sendTo })
      
      await createAuditLog({
        action: 'password_invite_sent',
        actor: 'api',
        entity_type: 'user',
        entity_id: username,
        changes: { email: sendTo, altEmail },
        source: 'api',
        success: true,
      })
    }
    
    res.json({
      success: result.success,
      username,
      email: sendTo,
      altEmail,
      services: services, // Include services in response for confirmation
      messageId: result.messageId,
      error: result.error,
    })
  } catch (error) {
    logger.error('Error sending password invite:', error)
    res.status(500).json({ error: error.message })
  }
})

// Send bulk password invites
// Requires LDAP system_admins group membership
inviteRouter.post('/send-bulk', requireLDAPGroup(), async (req, res) => {
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
        
        // Get user's services from Authentik groups
        const services = await getUserServicesFromAuthentik(username)
        
        const result = await sendPasswordCreationEmail(
          aUser.email,
          username,
          aUser.name,
          altEmail,
          services
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
      await pool.query('DELETE FROM password_reset_tokens WHERE username = $1', [username])
      
      // Insert new token
      await pool.query(
        `INSERT INTO password_reset_tokens (username, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
        [username, resetToken]
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
