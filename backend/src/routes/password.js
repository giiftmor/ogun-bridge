import express from 'express'
import { ldapClient } from '../services/ldapClient.js'
import { authentikClient } from '../services/authentikClient.js'
import { logger } from '../utils/logger.js'
import { loggingService } from '../services/loggingService.js'
import { addLogToCache } from '../services/logCache.js'
import { createAuditLog, getAuditLogs } from '../services/auditService.js'
import { ensureUserProfile, updateUserProfile, getUserProfile } from '../services/userProfileService.js'
import { authenticate, requireRole } from '../middleware/auth.js'

export const passwordRouter = express.Router()

passwordRouter.use(authenticate)

export const PASSWORD_POLICY = {
  minLength: 10,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  noSpaces: true,
}

export function validatePassword(password) {
  const errors = []
  
  if (!password || password.length < PASSWORD_POLICY.minLength) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters`)
  }
  
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  
  if (PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }
  
  if (PASSWORD_POLICY.requireSpecial && !/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*)')
  }
  
  if (PASSWORD_POLICY.noSpaces && /\s/.test(password)) {
    errors.push('Password must not contain spaces')
  }
  
  return {
    valid: errors.length === 0,
    errors,
    policy: PASSWORD_POLICY,
  }
}

// Validate password against policy
passwordRouter.post('/validate', (req, res) => {
  const { password } = req.body
  
  if (!password) {
    return res.status(400).json({ valid: false, errors: ['Password is required'] })
  }
  
  const validation = validatePassword(password)
  res.json(validation)
})

// Get password policy
passwordRouter.get('/policy', (req, res) => {
  res.json(PASSWORD_POLICY)
})

// Get password history for a user
passwordRouter.get('/history/:username', async (req, res) => {
  try {
    const { username } = req.params
    
    const history = await getAuditLogs({
      action: 'password_synced',
      entity_id: username,
      limit: 10,
    })
    
    res.json(history)
  } catch (error) {
    logger.error('Error getting password history:', error)
    res.status(500).json({ error: error.message })
  }
})

// Main sync endpoint - set password in LDAP + Authentik
passwordRouter.post('/sync/:username', async (req, res) => {
  try {
    const { username } = req.params
    const { password, expirationDays } = req.body
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' })
    }

    const validation = validatePassword(password)
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(', ') })
    }
    
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `[PASSWORD-SYNC] Setting password for user: ${username}`,
      context: { username }
    })
    
    // 1. Set password in LDAP
    const ldapResult = await ldapClient.setUserPassword(username, password)
    
    if (!ldapResult) {
      await createAuditLog({
        action: 'password_sync_failed',
        actor: 'api',
        entity_type: 'user',
        entity_id: username,
        changes: { target: 'ldap', success: false },
        source: 'api',
        success: false,
        error_message: 'Failed to set password in LDAP',
      })
      return res.status(500).json({ error: 'Failed to set password in LDAP' })
    }
    
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `[PASSWORD-SYNC] Password set in LDAP for: ${username}`,
      context: { username, target: 'ldap' }
    })
    
    // 2. Set password expiration if provided
    if (expirationDays !== undefined) {
      const expirationDate = expirationDays === null 
        ? null 
        : new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString()
      await ldapClient.setPasswordExpiration(username, expirationDate)
    }
    
    // 3. Get Authentik user
    const akUser = await authentikClient.getUserByUsername(username)
    
    let authentikResult = 'skipped'
    
    if (!akUser) {
      addLogToCache({
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: `[PASSWORD-SYNC] User ${username} not found in Authentik`,
        context: { username }
      })
    } else {
      try {
        await authentikClient.setPassword(akUser.pk, password)
        authentikResult = 'success'
        addLogToCache({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `[PASSWORD-SYNC] Password set in Authentik for: ${username}`,
          context: { username, target: 'authentik' }
        })
      } catch (akError) {
        authentikResult = `failed: ${akError.message}`
        addLogToCache({
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `[PASSWORD-SYNC] Authentik error: ${akError.message}`,
          context: { username, error: akError.message }
        })
      }
    }
    
    // Create audit log entry
    await createAuditLog({
      action: 'password_synced',
      actor: 'api',
      entity_type: 'user',
      entity_id: username,
      changes: { ldap: 'success', authentik: authentikResult, expirationDays },
      source: 'api',
      success: authentikResult === 'success',
    })

    // Update user profile to track password creation
    const existingProfile = await getUserProfile(username)
    await ensureUserProfile(username, existingProfile?.alt_email || null)
    await updateUserProfile(username, {
      password_method: existingProfile?.password_method || 'manual',
      password_created_at: new Date(),
      password_synced_to_ldap: true,
      password_synced_to_authentik: authentikResult === 'success',
    })

    res.json({
      success: authentikResult === 'success',
      username,
      ldap: 'success',
      authentik: authentikResult,
    })
  } catch (error) {
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `[PASSWORD-SYNC] Error: ${error.message}`,
      context: { error: error.message }
    })
    res.status(500).json({ error: error.message })
  }
})

// Self-service password change - user changes their own password
passwordRouter.post('/change', async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body
    
    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Username, current password, and new password are required' 
      })
    }
    
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `[PASSWORD-CHANGE] Self-service password change for: ${username}`,
      context: { username }
    })
    
    // Verify current password
    const isValid = await ldapClient.verifyPassword(username, currentPassword)
    
    if (!isValid) {
      await createAuditLog({
        action: 'password_change_failed',
        actor: username,
        entity_type: 'user',
        entity_id: username,
        changes: { reason: 'invalid_current_password' },
        source: 'self_service',
        success: false,
        error_message: 'Current password is incorrect',
      })
      return res.status(401).json({ error: 'Current password is incorrect' })
    }
    
    // Validate new password using shared validation
    const validation = validatePassword(newPassword)
    if (!validation.valid) {
      return res.status(400).json({ valid: false, errors: validation.errors })
    }
    
    // Set new password in LDAP
    const ldapResult = await ldapClient.setUserPassword(username, newPassword)
    
    if (!ldapResult) {
      await createAuditLog({
        action: 'password_change_failed',
        actor: username,
        entity_type: 'user',
        entity_id: username,
        changes: { target: 'ldap', success: false },
        source: 'self_service',
        success: false,
        error_message: 'Failed to set password in LDAP',
      })
      return res.status(500).json({ error: 'Failed to set new password in LDAP' })
    }
    
    // Update in Authentik
    const akUser = await authentikClient.getUserByUsername(username)
    let authentikResult = 'skipped'
    
    if (akUser) {
      try {
        await authentikClient.setPassword(akUser.pk, newPassword)
        authentikResult = 'success'
      } catch (akError) {
        authentikResult = `failed: ${akError.message}`
      }
    }
    
    await createAuditLog({
      action: 'password_changed',
      actor: username,
      entity_type: 'user',
      entity_id: username,
      changes: { ldap: 'success', authentik: authentikResult },
      source: 'self_service',
      success: true,
    })
    
    loggingService.info('PASSWORD', `Password changed for ${username}`, { username })
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `[PASSWORD-CHANGE] Self-service password change completed for: ${username}`,
      context: { username }
    })
    
    res.json({
      success: true,
      username,
      message: 'Password changed successfully',
    })
  } catch (error) {
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `[PASSWORD-CHANGE] Error: ${error.message}`,
      context: { error: error.message }
    })
    res.status(500).json({ error: error.message })
  }
})

// Get password expiration for a user
passwordRouter.get('/expiration/:username', async (req, res) => {
  try {
    const { username } = req.params
    
    const expiration = await ldapClient.getPasswordExpiration(username)
    
    res.json({
      username,
      expiration,
      expires: expiration ? new Date(expiration) > new Date() : null,
    })
  } catch (error) {
    logger.error('Error getting password expiration:', error)
    res.status(500).json({ error: error.message })
  }
})

// Set password expiration (admin only)
passwordRouter.post('/expiration/:username', async (req, res) => {
  try {
    const { username } = req.params
    const { expirationDays } = req.body
    
    let expirationDate = null
    if (expirationDays !== null && expirationDays !== undefined) {
      expirationDate = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString()
    }
    
    const result = await ldapClient.setPasswordExpiration(username, expirationDate)
    
    if (!result) {
      return res.status(500).json({ error: 'Failed to set password expiration' })
    }
    
    await createAuditLog({
      action: 'password_expiration_set',
      actor: 'api',
      entity_type: 'user',
      entity_id: username,
      changes: { expirationDays },
      source: 'api',
      success: true,
    })
    
    res.json({
      success: true,
      username,
      expiration: expirationDate,
    })
  } catch (error) {
    logger.error('Error setting password expiration:', error)
    res.status(500).json({ error: error.message })
  }
})
