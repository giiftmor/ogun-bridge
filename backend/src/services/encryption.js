import crypto from 'crypto'
import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'

const ALGORITHM = 'aes-256-gcm'
const FALLBACK_KEY = process.env.ENCRYPTION_KEY || null

/**
 * Get encryption key from DB (primary) or .env (fallback)
 * DB stores it in service_configs table as 'encryption_key'
 */
export async function getEncryptionKey() {
  // Try .env first (if DB is down)
  if (FALLBACK_KEY) {
    logger.info('Using ENCRYPTION_KEY from .env')
    return Buffer.from(FALLBACK_KEY, 'utf8')
  }

  // Try DB (primary storage)
  try {
    const result = await pool.query(
      'SELECT value FROM service_configs WHERE service = $1 AND key = $2',
      ['system', 'encryption_key']
    )
    
    if (result.rows.length > 0) {
      logger.info('Using encryption key from DB')
      return Buffer.from(result.rows[0].value, 'utf8')
    }
  } catch (error) {
    logger.warn('DB unavailable for encryption key, trying .env...')
  }

  // Final fallback to .env
  if (FALLBACK_KEY) {
    return Buffer.from(FALLBACK_KEY, 'utf8')
  }

  throw new Error('No encryption key available (DB down + ENCRYPTION_KEY not set in .env)')
}

/**
 * Encrypt sensitive data
 * Returns object with iv, encryptedData, authTag
 */
export async function encrypt(text) {
  const key = await getEncryptionKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  return {
    iv: iv.toString('hex'),
    encryptedData: encrypted,
    authTag: authTag.toString('hex')
  }
}

/**
 * Decrypt data encrypted with encrypt()
 */
export async function decrypt(encryptedObj) {
  const key = await getEncryptionKey()
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(encryptedObj.iv, 'hex')
  )
    
  decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'))
    
  let decrypted = decipher.update(encryptedObj.encryptedData, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
    
  return decrypted
}

/**
 * Save encryption key to DB (called after DB is confirmed up)
 */
export async function saveKeyToDB() {
  if (!FALLBACK_KEY) {
    logger.warn('Cannot save encryption key: ENCRYPTION_KEY not set in .env')
    return false
  }

  try {
    await pool.query(`
      INSERT INTO service_configs (service, key, value, is_encrypted, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (service, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, ['system', 'encryption_key', FALLBACK_KEY, false])
    
    logger.info('Encryption key saved to DB (primed for future encryption)')
    return true
  } catch (error) {
    logger.error('Failed to save encryption key to DB:', error.message)
    return false
  }
}
