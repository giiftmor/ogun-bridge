import pool from '../lib/db.js'
import { logger } from '../utils/logger.js'

export async function getUserProfile(username) {
  const result = await pool.query(
    'SELECT * FROM user_profiles WHERE username = $1',
    [username]
  )
  return result.rows[0] || null
}

export async function createUserProfile(username, altEmail = null) {
  const result = await pool.query(
    `INSERT INTO user_profiles (username, alt_email)
     VALUES ($1, $2)
     ON CONFLICT (username) DO NOTHING
     RETURNING *`,
    [username, altEmail]
  )
  return result.rows[0]
}

export async function updateUserProfile(username, updates) {
  const fields = []
  const values = []
  let paramIndex = 1

  if (updates.alt_email !== undefined) {
    fields.push(`alt_email = $${paramIndex++}`)
    values.push(updates.alt_email)
  }
  if (updates.password_method !== undefined) {
    fields.push(`password_method = $${paramIndex++}`)
    values.push(updates.password_method)
  }
  if (updates.password_created_at !== undefined) {
    fields.push(`password_created_at = $${paramIndex++}`)
    values.push(updates.password_created_at)
  }
  if (updates.password_synced_to_ldap !== undefined) {
    fields.push(`password_synced_to_ldap = $${paramIndex++}`)
    values.push(updates.password_synced_to_ldap)
  }
  if (updates.password_synced_to_authentik !== undefined) {
    fields.push(`password_synced_to_authentik = $${paramIndex++}`)
    values.push(updates.password_synced_to_authentik)
  }
  if (updates.email_invite_sent !== undefined) {
    fields.push(`email_invite_sent = $${paramIndex++}`)
    values.push(updates.email_invite_sent)
  }
  if (updates.email_invite_sent_at !== undefined) {
    fields.push(`email_invite_sent_at = $${paramIndex++}`)
    values.push(updates.email_invite_sent_at)
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`)

  values.push(username)

  const query = `
    UPDATE user_profiles 
    SET ${fields.join(', ')}
    WHERE username = $${paramIndex}
    RETURNING *
  `

  const result = await pool.query(query, values)
  return result.rows[0]
}

export async function getUsersWithoutPasswords() {
  const result = await pool.query(`
    SELECT up.*, au.email as authentik_email, au.name as authentik_name
    FROM user_profiles up
    LEFT JOIN (
      SELECT username, email, name 
      FROM users 
      WHERE sync_status = 'synced'
    ) au ON up.username = au.username
    WHERE up.password_method IS NULL 
       OR up.password_created_at IS NULL
    ORDER BY up.username
  `)
  return result.rows
}

export async function getAllUserProfiles() {
  const result = await pool.query(`
    SELECT up.*, au.email as authentik_email, au.name as authentik_name, au.sync_status
    FROM user_profiles up
    LEFT JOIN users au ON up.username = au.username
    ORDER BY up.username
  `)
  return result.rows
}

export async function ensureUserProfile(username, altEmail = null) {
  const existing = await getUserProfile(username)
  if (existing) {
    if (altEmail && !existing.alt_email) {
      return updateUserProfile(username, { alt_email: altEmail })
    }
    return existing
  }
  return createUserProfile(username, altEmail)
}
