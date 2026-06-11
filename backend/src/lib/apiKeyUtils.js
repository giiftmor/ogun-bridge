import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const SALT_ROUNDS = 12

export function generateApiKey() {
  return crypto.randomBytes(24).toString('hex')
}

export async function hashApiKey(apiKey) {
  return bcrypt.hash(apiKey, SALT_ROUNDS)
}

export async function compareApiKey(apiKey, hashedKey) {
  if (!hashedKey) return false
  if (!hashedKey.startsWith('$2')) return false
  return bcrypt.compare(apiKey, hashedKey)
}

export function isHashed(apiKey) {
  return typeof apiKey === 'string' && apiKey.startsWith('$2')
}
