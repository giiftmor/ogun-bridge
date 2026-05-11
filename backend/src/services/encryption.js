import crypto from 'crypto'
import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'

const ALGORITHM = 'aes-256-gcm'
const ENC_KEY_BUFFER = (() => {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY must be set in environment')
  }
  return Buffer.from(process.env.ENCRYPTION_KEY, 'utf8')
})()

export async function getEncryptionKey() {
  return ENC_KEY_BUFFER
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

export async function saveKeyToDB() {
  logger.info('Encryption key loaded from environment only (DB storage disabled)')
  return true
}
