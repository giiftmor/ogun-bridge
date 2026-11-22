// LDAP Password Hash Migration Script
// Fixes all existing LDAP passwords that were stored with broken SSHA hashes
// (bytes > 0x7F in salt were expanded to multi-byte UTF-8, making verification fail)
// Run:  docker cp backend/scripts/migrate-ldap-hashes.js ogun-bridge-backend:/app/scripts/ && docker exec ogun-bridge-backend node /app/scripts/migrate-ldap-hashes.js

import crypto from 'crypto'
import { pool } from '../src/lib/db.js'
import { ldapClient } from '../src/services/ldapClient.js'
import { authentikClient } from '../src/services/authentikClient.js'
import { ensureUserProfile, updateUserProfile } from '../src/services/userProfileService.js'
import { createAuditLog } from '../src/services/auditService.js'

function generatePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let pw = ''
  for (let i = 0; i < 24; i++) {
    pw += chars[crypto.randomInt(chars.length)]
  }
  return pw
}

async function migrate() {
  console.log('=== LDAP Password Hash Migration ===')
  console.log('Step 1: Querying users with password_synced_to_ldap = true...')

  const result = await pool.query(`
    SELECT username, password_synced_to_authentik, alt_email
    FROM user_profiles
    WHERE password_synced_to_ldap = true
    ORDER BY username
  `)

  console.log(`Found ${result.rows.length} users to migrate\n`)

  let success = 0
  let failed = 0
  const results = []

  for (let i = 0; i < result.rows.length; i++) {
    const user = result.rows[i]
    console.log(`[${i + 1}/${result.rows.length}] Processing ${user.username}...`)

    try {
      const ldapEntry = await ldapClient.getUser(user.username)
      if (!ldapEntry) {
        console.log(`  ⚠ No LDAP entry found for ${user.username}, skipping`)
        continue
      }

      const newPassword = generatePassword()

      console.log(`  Setting password in LDAP...`)
      const ldapOk = await ldapClient.setUserPassword(user.username, newPassword)
      if (!ldapOk) {
        throw new Error('LDAP setUserPassword returned false')
      }

      console.log(`  Verifying password in LDAP...`)
      const ldapVerified = await ldapClient.verifyPassword(user.username, newPassword)
      if (!ldapVerified) {
        throw new Error('LDAP verifyPassword failed after migration')
      }

      let authentikResult = 'skipped'
      if (user.password_synced_to_authentik) {
        console.log(`  Setting password in Authentik...`)
        try {
          const akUser = await authentikClient.getUserByUsername(user.username)
          if (akUser) {
            await authentikClient.setPassword(akUser.pk, newPassword)
            authentikResult = 'success'
          }
        } catch (akError) {
          authentikResult = `failed: ${akError.message}`
          console.log(`  ⚠ Authentik set failed: ${akError.message}`)
        }
      }

      await ensureUserProfile(user.username, user.alt_email || null)
      await updateUserProfile(user.username, {
        password_method: 'migrated',
        password_created_at: new Date(),
        password_synced_to_ldap: true,
        password_synced_to_authentik: authentikResult === 'success',
      })

      await createAuditLog({
        action: 'password_hash_migrated',
        actor: 'system',
        entity_type: 'user',
        entity_id: user.username,
        changes: { ldap: 'success', authentik: authentikResult, reason: 'fixed SSHA hash encoding' },
        source: 'migration',
        success: true,
      })

      results.push({ username: user.username, status: 'success', password: newPassword })
      success++
      console.log(`  ✅ ${user.username} migrated successfully`)
      console.log(`     New password: ${newPassword}`)
    } catch (error) {
      results.push({ username: user.username, status: 'failed', error: error.message })
      failed++
      console.log(`  ❌ ${user.username} failed: ${error.message}`)
    }
  }

  console.log(`\n=== Migration Complete ===`)
  console.log(`Success: ${success}`)
  console.log(`Failed: ${failed}`)
  console.log(`Total: ${result.rows.length}`)

  if (results.length > 0) {
    console.log(`\n--- Results Summary ---`)
    for (const r of results) {
      console.log(`${r.status === 'success' ? '✅' : '❌'} ${r.username}: ${r.status}${r.password ? ' (pw: ' + r.password + ')' : ''}${r.error ? ' - ' + r.error : ''}`)
    }
  }

  process.exit(failed > 0 ? 1 : 0)
}

migrate()
