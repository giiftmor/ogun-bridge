#!/usr/bin/env node
/**
 * Migration script: Populate ldap_ou column in group_sync_config table
 * Based on current LDAP OU structure and group name patterns
 * 
 * Usage: node scripts/migrate-group-ous.js
 */

import { pool } from '../backend/src/lib/db.js'

// OU mapping based on group name patterns
const OU_MAPPING = {
  // System groups (under ou=system)
  'systems_admins': 'ou=system,ou=groups,dc=spectres,dc=co,dc=za',
  'authentik-admins': 'ou=system,ou=groups,dc=spectres,dc=co,dc=za',
  'authentik-read-only': 'ou=system,ou=groups,dc=spectres,dc=co,dc=za',
  'password_manager': 'ou=system,ou=groups,dc=spectres,dc=co,dc=za',
  
  // Service groups (under ou=services)
  'jellyfin': 'ou=services,ou=groups,dc=spectres,dc=co,dc=za',
  'nextcloud': 'ou=services,ou=groups,dc=spectres,dc=co,dc=za',
  'plane': 'ou=services,ou=groups,dc=spectres,dc=co,dc=za',
  'penpot': 'ou=services,ou=groups,dc=spectres,dc=co,dc=za',
  'grafana': 'ou=services,ou=groups,dc=spectres,dc=co,dc=za',
  'spectres-pantheon': 'ou=services,ou=groups,dc=spectres,dc=co,dc=za',
  
  // Role groups (under ou=roles)
  'admin': 'ou=roles,ou=groups,dc=spectres,dc=co,dc=za',
  'member': 'ou=roles,ou=groups,dc=spectres,dc=co,dc=za',
  'developer': 'ou=roles,ou=groups,dc=spectres,dc=co,dc=za',
}

async function migrate() {
  console.log('Starting migration of group_sync_config ldap_ou column...')
  
  try {
    // Get all groups from group_sync_config
    const result = await pool.query('SELECT group_name FROM group_sync_config')
    console.log(`Found ${result.rows.length} groups in group_sync_config`)
    
    let updated = 0
    let skipped = 0
    let errors = 0
    
    for (const row of result.rows) {
      try {
        const groupName = row.group_name
        const targetOU = OU_MAPPING[groupName]
        
        if (!targetOU) {
          console.log(`No OU mapping found for ${groupName}, skipping...`)
          skipped++
          continue
        }
        
        // Update the ldap_ou column
        await pool.query(
          'UPDATE group_sync_config SET ldap_ou = $1 WHERE group_name = $2',
          [targetOU, groupName]
        )
        
        console.log(`Updated ${groupName} → ${targetOU}`)
        updated++
        
      } catch (err) {
        console.error(`Failed to update ${row.group_name}:`, err.message)
        errors++
      }
    }
    
    console.log(`\nMigration complete:`)
    console.log(`  Updated: ${updated}`)
    console.log(`  Skipped: ${skipped}`)
    console.log(`  Errors: ${errors}`)
    
  } catch (error) {
    console.error('Migration failed:', error.message)
    process.exit(1)
  }
}

migrate().then(() => {
  console.log('Done.')
  process.exit(0)
}).catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
