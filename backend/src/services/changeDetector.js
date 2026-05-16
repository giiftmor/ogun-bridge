import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'
import { ldapClient } from './ldapClient.js'
import { authentikClient } from './authentikClient.js'

/**
 * Change Detector Service
 * Compares Authentik vs LDAP and detects:
 * - Orphaned users (in LDAP but not in Authentik)
 * - Field mismatches (email, name, etc.)
 */

// ─── Detect Orphaned Users ────────────────────────────────────────────────────

async function detectOrphanedUsers(authentikUsers, ldapUsers) {
  const authentikUsernames = new Set(authentikUsers.map(u => u.username))
  const orphans = []

  for (const ldapUser of ldapUsers) {
    if (!authentikUsernames.has(ldapUser.uid)) {
      orphans.push({
        entity_type: 'user',
        entity_id: ldapUser.uid,
        change_type: 'orphan',
        field_name: null,
        authentik_value: null,
        ldap_value: JSON.stringify(ldapUser),
        metadata: {
          ldap_dn: ldapUser.dn,
          ldap_email: ldapUser.mail,
          ldap_cn: ldapUser.cn,
        }
      })
    }
  }

  return orphans
}

// ─── Detect Inactive Users (no password) ─────────────────────────────────────

async function detectInactiveUsers(authentikUsers) {
  const inactiveUsers = []

  for (const user of authentikUsers) {
    if (!user.password_change_date) {
      inactiveUsers.push({
        entity_type: 'user',
        entity_id: user.username,
        change_type: 'inactive_user',
        field_name: 'password_change_date',
        authentik_value: null,
        ldap_value: null,
        metadata: {
          email: user.email,
          name: user.name,
          reason: 'No password set in Authentik',
        }
      })
    }
  }

  return inactiveUsers
}

// ─── Detect Field Mismatches ──────────────────────────────────────────────────

async function detectFieldMismatches(authentikUsers, ldapUsers) {
  const mismatches = []
  const ldapUserMap = new Map(ldapUsers.map(u => [u.uid, u]))

  for (const aUser of authentikUsers) {
    const lUser = ldapUserMap.get(aUser.username)
    if (!lUser) continue // Skip if not in LDAP yet

    // Check email mismatch
    if (aUser.email && lUser.mail && aUser.email !== lUser.mail) {
      mismatches.push({
        entity_type: 'user',
        entity_id: aUser.username,
        change_type: 'field_mismatch',
        field_name: 'email',
        authentik_value: aUser.email,
        ldap_value: lUser.mail,
        metadata: {
          ldap_dn: lUser.dn,
        }
      })
    }

    // Check name/cn mismatch
    const authentikName = aUser.name || aUser.username
    if (lUser.cn && authentikName !== lUser.cn) {
      mismatches.push({
        entity_type: 'user',
        entity_id: aUser.username,
        change_type: 'field_mismatch',
        field_name: 'name',
        authentik_value: authentikName,
        ldap_value: lUser.cn,
        metadata: {
          ldap_dn: lUser.dn,
        }
      })
    }

    // Check sn (surname) mismatch
    const authentikSn = aUser.name ? aUser.name.split(' ').pop() : aUser.username
    if (lUser.sn && authentikSn !== lUser.sn) {
      mismatches.push({
        entity_type: 'user',
        entity_id: aUser.username,
        change_type: 'field_mismatch',
        field_name: 'sn',
        authentik_value: authentikSn,
        ldap_value: lUser.sn,
        metadata: {
          ldap_dn: lUser.dn,
        }
      })
    }
  }

  return mismatches
}

// ─── Detect Orphaned Groups (in LDAP but not Authentik) ──────────────────────

async function detectOrphanedGroups(authentikGroups, ldapGroups) {
  const authentikGroupNames = new Set(authentikGroups.map(g => g.name))
  const orphans = []

  for (const ldapGroup of ldapGroups) {
    if (!authentikGroupNames.has(ldapGroup.cn)) {
      orphans.push({
        entity_type: 'group',
        entity_id: ldapGroup.cn,
        change_type: 'orphan',
        field_name: null,
        authentik_value: null,
        ldap_value: JSON.stringify(ldapGroup),
        metadata: {
          ldap_dn: ldapGroup.dn,
          ldap_description: ldapGroup.description,
          ldap_members: ldapGroup.member || [],
        }
      })
    }
  }

  return orphans
}

// ─── Detect Missing Groups (in Authentik but not LDAP) ────────────────────────

async function detectMissingGroups(authentikGroups, ldapGroups) {
  const ldapGroupNames = new Set(ldapGroups.map(g => g.cn))
  const missing = []

  for (const authGroup of authentikGroups) {
    if (!ldapGroupNames.has(authGroup.name)) {
      missing.push({
        entity_type: 'group',
        entity_id: authGroup.name,
        change_type: 'missing',
        field_name: null,
        authentik_value: JSON.stringify(authGroup),
        ldap_value: null,
        metadata: {
          authentik_pk: authGroup.pk,
          authentik_parents: authGroup.parents || [],
        }
      })
    }
  }

  return missing
}

// ─── Detect Group Member Mismatches ────────────────────────────────────────────

async function detectGroupMemberMismatches(authentikGroups, ldapGroups, fetchGroupMembers) {
  const mismatches = []
  const ldapGroupMap = new Map(ldapGroups.map(g => [g.cn, g]))

  for (const authGroup of authentikGroups) {
    const ldapGroup = ldapGroupMap.get(authGroup.name)
    if (!ldapGroup) continue // Skip if group doesn't exist in LDAP yet

    // Get members from both systems
    let authentikMembers = []
    let ldapMembers = []

    try {
      if (fetchGroupMembers) {
        const authMembers = await fetchGroupMembers(authGroup.pk)
        authentikMembers = authMembers.map(m => m.username)
      }
      ldapMembers = ldapGroup.member?.map(m => {
        // Extract uid from DN: uid=john,ou=people,dc=...
        const match = m.match(/^uid=([^,]+)/)
        return match ? match[1] : m
      }) || []
    } catch (err) {
      logger.warn(`Failed to get members for group ${authGroup.name}:`, err.message)
      continue
    }

    const authMemberSet = new Set(authentikMembers)
    const ldapMemberSet = new Set(ldapMembers)

    // Check for members only in Authentik
    for (const member of authentikMembers) {
      if (!ldapMemberSet.has(member)) {
        mismatches.push({
          entity_type: 'group',
          entity_id: authGroup.name,
          change_type: 'member_mismatch',
          field_name: 'member',
          authentik_value: member,
          ldap_value: null,
          metadata: {
            direction: 'authentik-only',
            all_authentik_members: authentikMembers,
            all_ldap_members: ldapMembers,
          }
        })
      }
    }

    // Check for members only in LDAP
    for (const member of ldapMembers) {
      if (!authMemberSet.has(member)) {
        mismatches.push({
          entity_type: 'group',
          entity_id: authGroup.name,
          change_type: 'member_mismatch',
          field_name: 'member',
          authentik_value: null,
          ldap_value: member,
          metadata: {
            direction: 'ldap-only',
            all_authentik_members: authentikMembers,
            all_ldap_members: ldapMembers,
          }
        })
      }
    }
  }

  return mismatches
}

// ─── Store Changes in Database ────────────────────────────────────────────────

async function storeChanges(changes) {
  if (changes.length === 0) {
    logger.info('No changes detected')
    return
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    for (const change of changes) {
      // Check if this exact change already exists and is pending
      const existingResult = await client.query(
        `SELECT id, status FROM changes 
         WHERE entity_type = $1 
         AND entity_id = $2 
         AND change_type = $3 
         AND field_name IS NOT DISTINCT FROM $4
         AND status = 'pending'
         ORDER BY detected_at DESC 
         LIMIT 1`,
        [change.entity_type, change.entity_id, change.change_type, change.field_name]
      )

      if (existingResult.rows.length > 0) {
        // Update existing pending change with latest values
        await client.query(
          `UPDATE changes 
           SET authentik_value = $1,
               ldap_value = $2,
               detected_at = CURRENT_TIMESTAMP,
               metadata = $3
           WHERE id = $4`,
          [
            change.authentik_value,
            change.ldap_value,
            JSON.stringify(change.metadata),
            existingResult.rows[0].id
          ]
        )
        logger.debug('Updated existing change', { 
          id: existingResult.rows[0].id,
          entity_id: change.entity_id,
          change_type: change.change_type 
        })
      } else {
        // Insert new change
        await client.query(
          `INSERT INTO changes 
           (entity_type, entity_id, change_type, field_name, authentik_value, ldap_value, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            change.entity_type,
            change.entity_id,
            change.change_type,
            change.field_name,
            change.authentik_value,
            change.ldap_value,
            JSON.stringify(change.metadata)
          ]
        )
        logger.info('Detected new change', {
          entity_id: change.entity_id,
          change_type: change.change_type,
          field_name: change.field_name
        })
      }
    }

    await client.query('COMMIT')
    logger.info(`Stored ${changes.length} changes in database`)

  } catch (error) {
    await client.query('ROLLBACK')
    logger.error('Failed to store changes', { error: error.message })
    throw error
  } finally {
    client.release()
  }
}

// ─── Main Detection Function ──────────────────────────────────────────────────

export async function detectChanges(authentikUsers, ldapUsers) {
  try {
    logger.info('Starting change detection...')

    const [orphans, mismatches, inactiveUsers] = await Promise.all([
      detectOrphanedUsers(authentikUsers, ldapUsers),
      detectFieldMismatches(authentikUsers, ldapUsers),
      detectInactiveUsers(authentikUsers),
    ])

    const allChanges = [...orphans, ...mismatches, ...inactiveUsers]

    logger.info('Change detection complete', {
      orphans: orphans.length,
      mismatches: mismatches.length,
      inactive: inactiveUsers.length,
      total: allChanges.length
    })

    // Store in database
    await storeChanges(allChanges)

    return {
      orphans: orphans.length,
      mismatches: mismatches.length,
      inactive: inactiveUsers.length,
      total: allChanges.length
    }

  } catch (error) {
    logger.error('Change detection failed', { error: error.message })
    throw error
  }
}

// ─── Fetch Authentik Group Members ─────────────────────────────────────────────

async function fetchAuthentikGroupMembers(groupPk) {
  try {
    const group = await authentikClient.getGroup(groupPk)
    return group.users_obj || []
  } catch (error) {
    logger.error(`Failed to fetch members for group ${groupPk}:`, error.message)
    return []
  }
}

// ─── Main Group Detection Function ──────────────────────────────────────────────

export async function detectGroupChanges(authentikGroups, ldapGroups) {
  try {
    logger.info('Starting group change detection...')

    const [orphans, missing, memberMismatches] = await Promise.all([
      detectOrphanedGroups(authentikGroups, ldapGroups),
      detectMissingGroups(authentikGroups, ldapGroups),
      detectGroupMemberMismatches(authentikGroups, ldapGroups, fetchAuthentikGroupMembers),
    ])

    const allChanges = [...orphans, ...missing, ...memberMismatches]

    logger.info('Group change detection complete', {
      orphaned: orphans.length,
      missing: missing.length,
      member_mismatches: memberMismatches.length,
      total: allChanges.length
    })

    // Store in database
    await storeChanges(allChanges)

    return {
      orphaned: orphans.length,
      missing: missing.length,
      memberMismatches: memberMismatches.length,
      total: allChanges.length,
      orphans,
      missing,
      memberMismatches
    }

  } catch (error) {
    logger.error('Group change detection failed', { error: error.message })
    throw error
  }
}

// ─── Get Pending Changes ──────────────────────────────────────────────────────

export async function getPendingChanges() {
  const client = await pool.connect()

  try {
    const result = await client.query(
      `SELECT * FROM changes 
       WHERE status = 'pending' 
       ORDER BY detected_at DESC`
    )

    return result.rows.map(row => ({
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    }))
  } catch (error) {
    logger.error('Failed to get pending changes', { error: error.message })
    throw error
  } finally {
    client.release()
  }
}

// ─── Get All Changes (with filters) ───────────────────────────────────────────

export async function getChanges(filters = {}) {
  const client = await pool.connect()

  try {
    let query = 'SELECT * FROM changes WHERE 1=1'
    const params = []
    let paramCount = 1

    if (filters.status) {
      query += ` AND status = $${paramCount}`
      params.push(filters.status)
      paramCount++
    }

    if (filters.entity_type) {
      query += ` AND entity_type = $${paramCount}`
      params.push(filters.entity_type)
      paramCount++
    }

    if (filters.change_type) {
      query += ` AND change_type = $${paramCount}`
      params.push(filters.change_type)
      paramCount++
    }

    if (filters.search) {
      query += ` AND entity_id ILIKE $${paramCount}`
      params.push(`%${filters.search}%`)
      paramCount++
    }

    query += ' ORDER BY detected_at DESC'

    if (filters.limit) {
      query += ` LIMIT $${paramCount}`
      params.push(filters.limit)
    }

    const result = await client.query(query, params)

    return result.rows.map(row => ({
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    }))
  } catch (error) {
    logger.error('Failed to get changes', { error: error.message })
    throw error
  } finally {
    client.release()
  }
}

// ─── Get Change by ID ─────────────────────────────────────────────────────────

export async function getChangeById(changeId) {
  const client = await pool.connect()

  try {
    const result = await client.query(
      'SELECT * FROM changes WHERE id = $1',
      [changeId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    }
  } catch (error) {
    logger.error('Failed to get change by ID', { error: error.message })
    throw error
  } finally {
    client.release()
  }
}

// ─── Update Change Status ─────────────────────────────────────────────────────

export async function updateChangeStatus(changeId, status, approvedBy = null) {
  const client = await pool.connect()

  try {
    const result = await client.query(
      `UPDATE changes 
       SET status = $1, 
           approved_by = $2, 
           approved_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [status, approvedBy, changeId]
    )

    if (result.rows.length === 0) {
      throw new Error(`Change ${changeId} not found`)
    }

    logger.info('Change status updated', {
      id: changeId,
      status,
      approved_by: approvedBy
    })

    return result.rows[0]
  } catch (error) {
    logger.error('Failed to update change status', { error: error.message })
    throw error
  } finally {
    client.release()
  }
}

// ─── Apply Change (Revert LDAP to match Authentik) ─────────────────────────────────

export async function applyChange(changeId) {
  const client = await pool.connect()
  
  try {
    const result = await client.query('SELECT * FROM changes WHERE id = $1', [changeId])
    
    if (result.rows.length === 0) {
      throw new Error(`Change ${changeId} not found`)
    }
    
    const change = result.rows[0]
    const { change_type, entity_id, field_name, authentik_value } = change
    
    logger.info('Applying change', { changeId, change_type, entity_id, field_name })
    
    switch (change_type) {
      case 'field_mismatch': {
        if (!field_name || !authentik_value) {
          throw new Error('Missing field_name or authentik_value for field_mismatch')
        }
        
        const ldapFieldMap = {
          email: 'mail',
          name: 'cn',
          sn: 'sn',
        }
        
        const ldapField = ldapFieldMap[field_name] || field_name
        
        await ldapClient.updateUser(entity_id, {
          [ldapField]: authentik_value,
        })
        
        logger.info(`Applied field mismatch fix for ${entity_id}.${field_name} = ${authentik_value}`)
        break
      }
      
      case 'orphan': {
        await ldapClient.deleteUser(entity_id)
        logger.info(`Deleted orphan LDAP user: ${entity_id}`)
        break
      }
      
      case 'inactive_user': {
        logger.info(`Inactive user ${entity_id} - no action needed (already not synced)`)
        break
      }
      
      default:
        logger.warn(`Unknown change type: ${change_type}`)
    }
    
    await client.query(
      'UPDATE changes SET status = $1, applied_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['applied', changeId]
    )
    
    return { success: true, message: 'Change applied successfully' }
    
  } catch (error) {
    logger.error('Failed to apply change', { changeId, error: error.message })
    throw error
  } finally {
    client.release()
  }
}