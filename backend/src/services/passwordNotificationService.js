import { ldapClient } from './ldapClient.js'
import { authentikClient } from './authentikClient.js'
import { sendPasswordExpirationEmail } from './emailService.js'
import { logger } from '../utils/logger.js'
import { pool } from '../lib/db.js'

// Track which notifications have been sent to avoid duplicates
// Format: { username: { daysThreshold: timestamp } }
const notificationCache = new Map()

const NOTIFICATION_THRESHOLDS = [7, 3, 1] // Days before expiration

async function getAllUsersWithExpiringPasswords() {
  try {
    await ldapClient.connect()
    const baseDN = await ldapClient.getBaseDN()
    
    // Search for all users with shadowExpire attribute
    const { searchEntries } = await ldapClient.client.search('ou=people,' + baseDN, {
      scope: 'sub',
      filter: '(objectClass=inetOrgPerson)',
      attributes: ['uid', 'cn', 'mail', 'shadowExpire'],
    })

    const now = Math.floor(Date.now() / 1000) // Current time in seconds
    const users = []

    for (const entry of searchEntries) {
      const shadowExpire = entry.shadowExpire
      if (!shadowExpire) continue

      const expireTimestamp = parseInt(shadowExpire)
      const daysUntilExpiration = Math.floor((expireTimestamp - now) / (24 * 60 * 60))

      // Only include passwords that are expiring within our max threshold
      if (daysUntilExpiration <= Math.max(...NOTIFICATION_THRESHOLDS) && daysUntilExpiration >= 0) {
        users.push({
          username: entry.uid,
          name: entry.cn || entry.uid,
          email: entry.mail,
          daysUntilExpiration,
          expirationDate: new Date(expireTimestamp * 1000).toISOString(),
        })
      }
    }

    return users
  } catch (error) {
    logger.error('Error fetching users with expiring passwords:', error.message)
    return []
  }
}

function shouldSendNotification(username, daysRemaining) {
  const userNotifications = notificationCache.get(username)
  const now = Date.now()
  const oneDay = 24 * 60 * 60 * 1000

  if (!userNotifications) {
    return true
  }

  // Check if we've already sent notification for this threshold within last 24 hours
  const lastSent = userNotifications[daysRemaining]
  if (lastSent && (now - lastSent) < oneDay) {
    return false
  }

  return true
}

function recordNotification(username, daysRemaining) {
  if (!notificationCache.has(username)) {
    notificationCache.set(username, {})
  }
  notificationCache.get(username)[daysRemaining] = Date.now()
}

export async function checkAndSendExpirationNotifications() {
  try {
    logger.info('Starting password expiration notification check...')

    const users = await getAllUsersWithExpiringPasswords()
    
    if (users.length === 0) {
      logger.info('No users with expiring passwords found')
      return { checked: 0, notified: 0 }
    }

    let notifiedCount = 0
    const results = []

    for (const user of users) {
      // Find the appropriate threshold
      const threshold = NOTIFICATION_THRESHOLDS.find(t => user.daysUntilExpiration <= t && user.daysUntilExpiration >= t - 1)
      
      if (!threshold) continue

      // Check if we should send notification
      if (!shouldSendNotification(user.username, threshold)) {
        continue
      }

      // Get email from Authentik if not in LDAP
      let email = user.email
      if (!email) {
        try {
          const aUser = await authentikClient.getUserByUsername(user.username)
          email = aUser?.email || aUser?.attributes?.alt_email
        } catch {
          // Ignore Authentik lookup errors
        }
      }

      if (!email) {
        logger.warn('No email found for user, skipping notification', { username: user.username })
        results.push({ username: user.username, success: false, error: 'No email address' })
        continue
      }

      // Send notification
      const result = await sendPasswordExpirationEmail(
        email,
        user.username,
        user.daysUntilExpiration,
        user.expirationDate
      )

      if (result.success) {
        recordNotification(user.username, threshold)
        notifiedCount++
        logger.info('Password expiration notification sent', {
          username: user.username,
          email,
          daysRemaining: user.daysUntilExpiration
        })
      }

      results.push({
        username: user.username,
        success: result.success,
        daysRemaining: user.daysUntilExpiration,
        error: result.error
      })
    }

    logger.info('Password expiration notification check complete', {
      checked: users.length,
      notified: notifiedCount
    })

    return { checked: users.length, notified: notifiedCount, results }
  } catch (error) {
    logger.error('Error in password expiration notification check:', error.message)
    return { checked: 0, notified: 0, error: error.message }
  }
}

// Start the periodic notification service
let notificationInterval = null

export function startPasswordNotificationService(intervalHours = 24) {
  if (notificationInterval) {
    clearInterval(notificationInterval)
  }

  // Run immediately on start
  checkAndSendExpirationNotifications().catch(err => {
    logger.error('Initial password notification check failed:', err.message)
  })

  // Then run periodically
  const intervalMs = intervalHours * 60 * 60 * 1000
  notificationInterval = setInterval(() => {
    checkAndSendExpirationNotifications().catch(err => {
      logger.error('Periodic password notification check failed:', err.message)
    })
  }, intervalMs)

  logger.info('Password expiration notification service started', { intervalHours })
}

export function stopPasswordNotificationService() {
  if (notificationInterval) {
    clearInterval(notificationInterval)
    notificationInterval = null
    logger.info('Password expiration notification service stopped')
  }
}

// Manual trigger for testing or admin use
export async function triggerPasswordNotificationCheck() {
  return checkAndSendExpirationNotifications()
}
