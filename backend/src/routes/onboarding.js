import express from 'express'
import { pool } from '../lib/db.js'
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'
import { logger } from '../utils/logger.js'
import { authenticate } from '../middleware/auth.js'
import { createAuditLog } from '../services/auditService.js'
import { sendPasswordCreationEmail } from '../services/emailService.js'
import crypto from 'crypto'

export const onboardingRouter = express.Router()

onboardingRouter.use(authenticate)

onboardingRouter.post('/', async (req, res) => {
  try {
    const { username, name, email, groupPks, sendInvite } = req.body

    if (!username) return res.status(400).json({ error: 'Username is required' })

    // Step 1: Create user in Authentik
    const authentikUser = await authentikClient.createUser({
      username,
      name: name || username,
      email: email || `${username}@spectres.co.za`,
    })

    let ldapCreated = false
    try {
      await ldapClient.updateUser(username, {
        cn: name || username,
        sn: name || username,
        mail: email || `${username}@spectres.co.za`,
      })
      ldapCreated = true
    } catch (ldapErr) {
      logger.warn('LDAP user creation failed:', ldapErr.message)
    }

    // Step 2: Add user to selected groups
    const addedGroups = []
    if (groupPks && Array.isArray(groupPks)) {
      for (const groupPk of groupPks) {
        try {
          await authentikClient.addUserToGroup(groupPk, username)
          addedGroups.push(groupPk)
        } catch (groupErr) {
          logger.warn(`Failed to add user to group ${groupPk}:`, groupErr.message)
        }
      }
    }

    // Step 3: Send invite if requested
    let inviteResult = null
    if (sendInvite) {
      try {
        const aUser = authentikUser
        const altEmail = aUser.attributes?.alt_email || null
        const resetToken = crypto.randomBytes(32).toString('hex')

        let userResult = await pool.query(
          'SELECT id FROM auth_users WHERE username = $1',
          [username]
        )

        if (userResult.rows.length === 0) {
          const placeholderHash = '$2a$10$placeholderfordummyuseonly'
          await pool.query(
            'INSERT INTO auth_users (username, password_hash, email, role, active) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING',
            [username, placeholderHash, email || aUser.email, 'viewer', true]
          )
          userResult = await pool.query(
            'SELECT id FROM auth_users WHERE username = $1',
            [username]
          )
        }

        if (userResult.rows.length > 0) {
          await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userResult.rows[0].id])
          await pool.query(
            `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
            [userResult.rows[0].id, resetToken]
          )
        }

        const services = await getUserServicesFromGroups(addedGroups)
        const sendTo = altEmail || email || aUser.email
        inviteResult = await sendPasswordCreationEmail(sendTo, username, aUser.name, resetToken, altEmail, services)
      } catch (inviteErr) {
        logger.error('Invite failed during onboarding:', inviteErr.message)
        inviteResult = { success: false, error: inviteErr.message }
      }
    }

    await createAuditLog({
      action: 'user_onboarded',
      actor: req.user?.username || 'api',
      entity_type: 'user',
      entity_id: username,
      changes: { username, name, email, groups: addedGroups, sendInvite, inviteSent: inviteResult?.success },
      source: 'api',
    })

    res.json({
      success: true,
      message: `User '${username}' onboarded successfully`,
      user: authentikUser,
      ldapCreated,
      groupsAdded: addedGroups.length,
      inviteSent: inviteResult?.success || false,
      inviteError: inviteResult?.error || null,
    })
  } catch (error) {
    logger.error('Onboarding error:', error)
    res.status(500).json({ error: error.message })
  }
})

async function getUserServicesFromGroups(groupPks) {
  try {
    if (!groupPks || groupPks.length === 0) return []

    const allGroups = await authentikClient.getGroups()
    const groupNames = allGroups
      .filter(g => groupPks.includes(g.pk))
      .map(g => g.name)

    if (groupNames.length === 0) return []

    const result = await pool.query(
      `SELECT service_name, service_url, service_type, description, icon
       FROM group_services
       WHERE group_name = ANY($1) AND is_active = true AND is_public = true
       ORDER BY service_name`,
      [groupNames]
    )

    return result.rows.map(row => ({
      id: row.service_name.toLowerCase().replace(/\s+/g, '-'),
      name: row.service_name,
      url: row.service_url,
      type: row.service_type,
      description: row.description,
      icon: row.icon || 'default',
    }))
  } catch (err) {
    logger.warn('Failed to fetch services for onboarding:', err.message)
    return []
  }
}
