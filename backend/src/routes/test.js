import express from 'express'
import { ldapClient } from '../services/ldapClient.js'
import { authentikClient } from '../services/authentikClient.js'
import { logger } from '../utils/logger.js'
import { authenticate, requireRole } from '../middleware/auth.js'

export const testRouter = express.Router()

testRouter.use(authenticate)
testRouter.use(requireRole('admin'))

testRouter.get('/ldap-password/:username', async (req, res) => {
  try {
    const { username } = req.params
    
    const password = await ldapClient.getUserPassword(username)
    
    res.json({
      username,
      plaintextPassword: password,
      message: password ? 'Got password' : 'Could not retrieve password'
    })
  } catch (error) {
    logger.error('Error getting LDAP password:', error)
    res.status(500).json({ error: error.message })
  }
})

testRouter.post('/set-password/:username', async (req, res) => {
  try {
    const { username } = req.params
    const { password } = req.body
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' })
    }
    
    logger.info(`[PASSWORD-SYNC] Setting password for user: ${username}`)
    
    // 1. Set password in LDAP
    const ldapResult = await ldapClient.setUserPassword(username, password)
    
    if (!ldapResult) {
      return res.status(500).json({ error: 'Failed to set password in LDAP' })
    }
    
    logger.info(`[PASSWORD-SYNC] Password set in LDAP for: ${username}`)
    
    // 2. Get Authentik user
    const akUser = await authentikClient.getUserByUsername(username)
    
    let authentikResult = 'skipped'
    
    if (!akUser) {
      logger.warn(`[PASSWORD-SYNC] User ${username} not found in Authentik`)
    } else {
      try {
        await authentikClient.setPassword(akUser.pk, password)
        authentikResult = 'success'
        logger.info(`[PASSWORD-SYNC] Password set in Authentik for: ${username}`)
      } catch (akError) {
        authentikResult = `failed: ${akError.message}`
        logger.error(`[PASSWORD-SYNC] Authentik error:`, akError.message)
      }
    }
    
    res.json({
      success: authentikResult === 'success',
      username,
      ldap: 'success',
      authentik: authentikResult,
      message: 'Password set in LDAP' + (authentikResult === 'success' ? ' and Authentik' : '')
    })
  } catch (error) {
    logger.error('[PASSWORD-SYNC] Error:', error)
    res.status(500).json({ error: error.message })
  }
})
