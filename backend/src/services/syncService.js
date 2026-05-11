import { Client, Attribute, Change } from 'ldapts'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'
import { MailserverIntegration } from './mailserver.js'
import { detectChanges } from './changeDetector.js'
import { addLogToCache } from './logCache.js'
import { createSnapshot } from './versionService.js'
import { authentikClient } from './authentikClient.js'
import { alertService } from './alertService.js'

// Password hashing using bcrypt (production) or fallback for temp passwords
async function hashPasswordBcrypt(password) {
  return bcrypt.hash(password, 10)
}

// LDAP sanitization - remove special characters to prevent injection
// Characters: * ( ) \ NUL , = + < > ; " # and leading/trailing whitespace
function sanitizeLDAPString(str) {
  if (!str) return ''
  return String(str)
    .trim()
    .replace(/[()*\\NUL,\=+<>"#;]/g, '')
    .replace(/\s+/g, ' ')
}

// Sanitize group name for LDAP DN usage
function sanitizeGroupDN(groupName) {
  if (!groupName) return ''
  return String(groupName)
    .trim()
    .replace(/[()*\\NUL,\=+<>"#;]/g, '')
    .replace(/^\*|^cn=/i, '') // Remove leading * or cn= (can break DN)
    .replace(/\s+/g, ' ')
}

// Helper to check if user is a service account
const isServiceAccount = (user) => {
  const username = user.username?.toLowerCase() || ''
  if (user.is_service_account) return true
  if (username.startsWith('ak-')) return true
  if (username.includes('-outpost-')) return true
  if (username.includes('_outpost_')) return true
  if (username === 'ldap_api') return true
  return false
}

// Sync state - shared across the app
const syncState = {
  status: 'idle',
  lastSyncTime: null,
  lastSyncDuration: null,
  currentCycle: null,
  errors: [],
  history: [],
  interval: null,
  ldapClient: null,
  isConnected: false,
}

// Get config from environment variables
function getConfig() {
  return {
    authentik: {
      url: process.env.AUTHENTIK_URL || 'http://localhost:9000',
      apiToken: process.env.AUTHENTIK_TOKEN,
    },
    ldap: {
      host: process.env.LDAP_HOST || 'localhost',
      port: process.env.LDAP_PORT || '389',
      bindDN: process.env.LDAP_BIND_DN || 'cn=Directory Manager,dc=spectres,dc=co,dc=za',
      bindPassword: process.env.LDAP_BIND_PASSWORD,
      baseDN: process.env.LDAP_BASE_DN || 'dc=spectres,dc=co,dc=za',
      userBaseDN: process.env.LDAP_USER_BASE_DN || 'ou=people,dc=spectres,dc=co,dc=za',
      groupBaseDN: process.env.LDAP_GROUP_BASE_DN || 'ou=groups,dc=spectres,dc=co,dc=za',
      attributeMapping: {
        phone: 'telephoneNumber',
        title: 'title',
        department: 'ou',
        employee_number: 'employeeNumber',
        alt_email: 'altEmail',
      },
    },
    mailserver: {
      enabled: process.env.MAILSERVER_ENABLED === 'true',
      containerName: process.env.MAILSERVER_CONTAINER || 'mailserver',
      domain: process.env.MAILSERVER_DOMAIN || 'spectres.co.za',
      quotaManagement: false,
      defaultQuotaMB: 5000,
    },
    sync: {
      intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '5'),
      syncGroups: process.env.SYNC_GROUPS !== 'false',
      dryRun: process.env.SYNC_DRY_RUN === 'true',
      createUsers: process.env.SYNC_CREATE_USERS !== 'false',
      updateUsers: process.env.SYNC_UPDATE_USERS !== 'false',
      deleteUsers: process.env.SYNC_DELETE_USERS === 'true',
    },
  }
}

// ─── Helper to broadcast logs to UI ───────────────────────────────────────────
function broadcastLog(io, level, message, context = {}) {
  logger[level](message, context)
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  }
  
  // Write to cache file
  addLogToCache(logEntry)
  
  // Broadcast to WebSocket
  if (io) {
    io.to('logs').emit('log', logEntry)
  }
}


// ─── LDAP Connection ──────────────────────────────────────────────────────────

async function connectLDAP(config, io) {
  const client = new Client({
    url: `ldap://${config.ldap.host}:${config.ldap.port}`,
    timeout: 5000,
    connectTimeout: 10000,
  })

  await client.bind(config.ldap.bindDN, config.ldap.bindPassword)

  broadcastLog(io, 'info', 'Connected to 389 Directory Server')
  syncState.ldapClient = client
  syncState.isConnected = true

  return client
}

// ─── Authentik API ────────────────────────────────────────────────────────────

async function fetchAuthentikUsers(config, io) {
  const url = `${config.authentik.url}/api/v3/core/users/?page_size=1000`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${config.authentik.apiToken}` }
  })

  if (!response.ok) throw new Error(`Authentik API error: ${response.statusText}`)

  const data = await response.json()
  broadcastLog(io, 'info',  `Fetched ${data.results.length} users from Authentik`)
  return data.results
}

async function fetchAuthentikGroups(config, io) {
  const url = `${config.authentik.url}/api/v3/core/groups/?page_size=1000`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${config.authentik.apiToken}` }
  })

  if (!response.ok) throw new Error(`Authentik API error: ${response.statusText}`)

  const data = await response.json()
  broadcastLog(io, 'info',  `Fetched ${data.results.length} groups from Authentik`)
  return data.results
}

async function fetchGroupDetails(config, groupPk) {
  const url = `${config.authentik.url}/api/v3/core/groups/${groupPk}/`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${config.authentik.apiToken}` }
  })

  if (!response.ok) throw new Error(`Authentik API error: ${response.statusText}`)
  return response.json()
}

// ─── LDAP User Operations ─────────────────────────────────────────────────────

async function searchLDAPUsers(client, config, io) {
  const { searchEntries } = await client.search(config.ldap.userBaseDN, {
    scope: 'sub',
    filter: '(objectClass=inetOrgPerson)',
    attributes: ['uid', 'mail', 'cn', 'sn', 'givenName', 'uidNumber', 'gidNumber', 'altEmail'],
  })

  broadcastLog(io, 'info',  `Found ${searchEntries.length} existing LDAP users`)
  return searchEntries
}

async function searchLDAPGroups(client, config) {
  const { searchEntries } = await client.search(config.ldap.groupBaseDN, {
    scope: 'sub',
    filter: '(objectClass=groupOfNames)',
    attributes: ['cn', 'description', 'member'],
  })
  return searchEntries
}

async function createLDAPUser(client, user, config, io, existingUsers = []) {
  const dn = `uid=${user.username},${config.ldap.userBaseDN}`

  // Get next uidNumber
  const maxUid = existingUsers.reduce((max, u) => {
    const uid = parseInt(u.uidNumber?.[0] || '0', 10)
    return uid > max ? uid : max
  }, 1000)
  const nextUid = maxUid + 1
  const tempPassword = await hashPasswordBcrypt(`${user.username}:${Date.now()}`)

  const nameParts = (user.name || user.username).split(' ')
  const entry = {
    objectClass: ['inetOrgPerson', 'organizationalPerson', 'person', 'top', 'posixAccount'],
    uid: user.username,
    cn: user.name || user.username,
    sn: nameParts.length > 1 ? nameParts[nameParts.length - 1] : user.username,
    givenName: nameParts[0] || user.username,
    mail: user.email || `${user.username}@${config.mailserver.domain}`,
    userPassword: tempPassword,
    uidNumber: nextUid.toString(),
    gidNumber: nextUid.toString(),
    homeDirectory: `/var/mail/${user.username}`,
  }

  // Add custom attributes from Authentik
  if (user.attributes) {
    Object.keys(user.attributes).forEach(key => {
      if (config.ldap.attributeMapping[key] && user.attributes[key]) {
        entry[config.ldap.attributeMapping[key]] = user.attributes[key]
      }
    })
  }

  if (config.sync.dryRun) {
    broadcastLog(io, 'info',  '[DRY RUN] Would create LDAP user', { username: user.username, dn })
    return
  }

  await client.add(dn, entry)
  broadcastLog(io, 'info',  'Created LDAP user', { username: user.username, dn })
}

async function updateLDAPUser(client, user, existingUser, config, io) {
  const dn = `uid=${user.username},${config.ldap.userBaseDN}`
  
  // Create snapshot before update for rollback capability
  try {
    await createSnapshot('user', user.username, existingUser, 'sync', 'Auto-snapshot before sync update')
  } catch (err) {
    logger.warn(`Failed to create snapshot for ${user.username}:`, err.message)
  }

  const changes = []

  if (user.email && user.email !== existingUser.mail) {
    changes.push(new Attribute({ type: 'mail', values: [user.email] }))
  }

  if (user.name && user.name !== existingUser.cn) {
    changes.push(new Attribute({ type: 'cn', values: [user.name] }))
  }

  // Sync altEmail from Authentik custom attributes to LDAP
  const currentAltEmail = existingUser.altEmail?.[0] || null
  const newAltEmail = user.attributes?.alt_email || null
  if (newAltEmail && newAltEmail !== currentAltEmail) {
    changes.push(new Attribute({ type: 'altEmail', values: [newAltEmail] }))
  }

  // Add uidNumber if missing (even if no other changes)
  if (!existingUser.uidNumber || !existingUser.uidNumber[0]) {
    const maxUid = 1000
    const nextUid = maxUid + Math.floor(Math.random() * 9000)
    changes.push(new Attribute({ type: 'objectClass', values: ['posixAccount'] }))
    changes.push(new Attribute({ type: 'uidNumber', values: [nextUid.toString()] }))
    changes.push(new Attribute({ type: 'gidNumber', values: [nextUid.toString()] }))
    changes.push(new Attribute({ type: 'homeDirectory', values: [`/var/mail/${user.username}`] }))
  }

  if (changes.length === 0) return

  if (config.sync.dryRun) {
    broadcastLog(io, 'info',  '[DRY RUN] Would update LDAP user', { username: user.username, changes: changes.length })
    return
  }

  await client.modify(dn, changes.map(attr => 
    new Change({
      operation: 'replace',
      modification: attr,
    })
  ))

  broadcastLog(io, 'info',  'Updated LDAP user', { username: user.username, changes: changes.length })
}

async function deleteLDAPUser(client, username, config, io) {
  const dn = `uid=${username},${config.ldap.userBaseDN}`

  // Create snapshot before delete for rollback capability
  try {
    const { searchEntries } = await client.search(dn, { attributes: ['uid', 'cn', 'sn', 'mail', 'altEmail', 'uidNumber', 'gidNumber'] })
    if (searchEntries[0]) {
      await createSnapshot('user', username, searchEntries[0], 'sync', 'Auto-snapshot before sync delete')
    }
  } catch (err) {
    logger.warn(`Failed to create snapshot for deleted user ${username}:`, err.message)
  }

  if (config.sync.dryRun) {
    broadcastLog(io, 'info',  '[DRY RUN] Would delete LDAP user', { username, dn })
    return
  }

  await client.del(dn)
  broadcastLog(io, 'info',  'Deleted LDAP user', { username, dn })
}

// ─── Group Sync ───────────────────────────────────────────────────────────────

async function getCurrentGroupMembers(client, groupDN) {
  try {
    const result = await client.search(groupDN, {
      scope: 'base',
      attributes: ['member'],
    })
    const entry = result.searchEntries[0]
    return entry?.member || []
  } catch (err) {
    return []
  }
}

async function syncGroups(client, config, io) {
  try {
    const groups = await fetchAuthentikGroups(config)
    const syncConfigs = await getGroupSyncConfigs() // Get configs from DB
    
    for (const group of groups) {
      const safeGroupName = sanitizeGroupDN(group.name)
      if (!safeGroupName) {
        broadcastLog(io, 'warn', 'Skipped group with invalid name', { originalName: group.name })
        continue
      }

      // Read ldap_ou from DB config (group_sync_config table)
      const groupConfig = syncConfigs.get(group.name)
      const targetOU = groupConfig?.ldap_ou || config.ldap.groupBaseDN
      const dn = `cn=${safeGroupName},${targetOU}`

      // Fetch group details for members (NOT for OU)
      const groupDetails = await fetchGroupDetails(config, group.pk)
      const memberUsernames = groupDetails.users_obj || []

      const members = memberUsernames.length > 0
        ? memberUsernames.map(u => `uid=${u.username},${config.ldap.userBaseDN}`)
        : [`uid=placeholder,${config.ldap.userBaseDN}`]

      const entry = {
        objectClass: ['groupOfNames', 'top'],
        cn: safeGroupName,
        member: members,
      }

      try {
        await client.add(dn, entry)
        broadcastLog(io, 'info',  'Created LDAP group', { group: group.name, dn })
      } catch (err) {
        if (err.message.includes('Already Exists') || err.code === 68) {
          // Create snapshot before group update for rollback capability
          try {
            const currentMembers = await getCurrentGroupMembers(client, dn)
            await createSnapshot('group', group.name, { members: currentMembers }, 'sync', 'Auto-snapshot before group sync')
          } catch (snapErr) {
            logger.warn(`Failed to create snapshot for group ${group.name}:`, snapErr.message)
          }
          
          const currentMembers = await getCurrentGroupMembers(client, dn)
          
          for (const newMember of members) {
            if (!currentMembers.includes(newMember)) {
              await client.modify(dn, [
                new Change({
                  operation: 'add',
                  modification: new Attribute({ type: 'member', values: [newMember] }),
                }),
              ])
            }
          }
          
          for (const oldMember of currentMembers) {
            if (!members.includes(oldMember)) {
              try {
                await client.modify(dn, [
                  new Change({
                    operation: 'delete',
                    modification: new Attribute({ type: 'member', values: [oldMember] }),
                  }),
                ])
              } catch (err) {
                if (!err.message.includes('does not exist')) {
                  throw err
                }
              }
            }
          }
          
          broadcastLog(io, 'info',  'Updated LDAP group', { group: group.name })
        } else {
          throw err
        }
      }
    }
  } catch (error) {
    logger.error('Group sync error:', { error: error.message })
    broadcastLog(io, 'error',  'Group sync failed', { error: error.message })
  }
}

// ─── Get Group Sync Configs ────────────────────────────────────────────────────

async function getGroupSyncConfigs() {
  try {
    const result = await pool.query('SELECT * FROM group_sync_config WHERE is_active = true')
    const configMap = new Map()
    for (const row of result.rows) {
      configMap.set(row.group_name, {
        group_pk: row.group_pk,
        sync_direction: row.sync_direction,
        parent_group: row.parent_group,
        ldap_ou: row.ldap_ou, // Read from DB instead of Authentik attributes
      })
    }
    return configMap
  } catch (error) {
    logger.error('Failed to get group sync configs:', error.message)
    return new Map()
  }
}

// ─── Update Sync State ───────────────────────────────────────────────────

async function updateSyncState(entityType, entityId, direction, metadata = {}) {
  try {
    await pool.query(
      `INSERT INTO sync_state (entity_type, entity_id, sync_direction, metadata, last_synced_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET
         sync_direction = $3,
         metadata = $4,
         last_synced_at = NOW(),
         updated_at = NOW(),
         sync_version = sync_state.sync_version + 1`,
      [entityType, entityId, direction, JSON.stringify(metadata)]
    )
  } catch (error) {
    logger.error('Failed to update sync state:', error.message)
  }
}

async function shouldSkipSync(entityType, entityId) {
  try {
    const result = await pool.query(
      `SELECT last_synced_at, sync_version FROM sync_state 
       WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId]
    )
    if (result.rows.length === 0) return false
    
    const lastSynced = new Date(result.rows[0].last_synced_at)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    return lastSynced > fiveMinutesAgo
  } catch (error) {
    return false
  }
}

// ─── Sync Groups from LDAP to Authentik ────────────────────────────────────────

async function syncGroupsFromLDAP(client, config, io) {
  const syncStats = { created: 0, membersAdded: 0, membersRemoved: 0, skipped: 0, errors: 0 }
  
  try {
    const authentikGroups = await fetchAuthentikGroups(config)
    const ldapGroups = await searchLDAPGroups(client, config)
    const syncConfigs = await getGroupSyncConfigs()

    const authentikGroupNames = new Set(authentikGroups.map(g => g.name))

    for (const ldapGroup of ldapGroups) {
      const syncConfig = syncConfigs.get(ldapGroup.cn)
      const direction = syncConfig?.sync_direction || 'authentik-to-ldap'

      // Skip if recently synced (incremental sync)
      if (await shouldSkipSync('group', ldapGroup.cn)) {
        syncStats.skipped++
        continue
      }

      // Extract OU from LDAP DN (e.g., cn=systems_admins,ou=system,ou=groups,... → ou=system,ou=groups,...)
      const dnParts = ldapGroup.dn.split(',')
      const ouPart = dnParts.slice(1).join(',')
      const defaultBase = config.ldap.groupBaseDN
      const targetOU = ouPart !== defaultBase ? ouPart : null

      // Always create groups in Authentik if they don't exist
      if (!authentikGroupNames.has(ldapGroup.cn)) {
        try {
          const newGroup = await authentikClient.createGroup({
            name: ldapGroup.cn,
            description: ldapGroup.description || '',
          })
          broadcastLog(io, 'info',  'Created Authentik group from LDAP', { group: ldapGroup.cn })
          authentikGroupNames.add(ldapGroup.cn)
          syncStats.created++

          await updateSyncState('group', ldapGroup.cn, 'created', { action: 'group_created' })

          // Save LDAP OU to DB for future sync (NOT Authentik attributes)
          if (targetOU) {
            try {
              await pool.query(
                'UPDATE group_sync_config SET ldap_ou = $1 WHERE group_name = $2',
                [targetOU, ldapGroup.cn]
              )
              broadcastLog(io, 'info',  'Saved LDAP OU to DB', {
                group: ldapGroup.cn,
                ou: targetOU
              })
            } catch (dbErr) {
              logger.warn(`Failed to save ldap_ou for ${ldapGroup.cn}:`, dbErr.message)
            }
          }
        } catch (err) {
          // 403 = permission denied - warn, don't error
          if (err.message.includes('403') || err.message.includes('permission')) {
            logger.warn(`Permission denied creating group ${ldapGroup.cn} (check Authentik token permissions)`)
            syncStats.skipped++
          } else if (!err.message.includes('already exists')) {
            logger.error(`Failed to create group ${ldapGroup.cn}:`, err.message)
            await alertService.createAlert('sync_failure', 
              `Failed to create group ${ldapGroup.cn}: ${err.message}`, 
              { severity: 'critical', entityType: 'group', entityId: ldapGroup.cn }
            )
            syncStats.errors++
          }
        }
      }

      // Sync members for ldap-to-authentik or bidirectional groups
      if (direction !== 'ldap-to-authentik' && direction !== 'bidirectional') {
        continue
      }

      const authGroup = authentikGroups.find(g => g.name === ldapGroup.cn)
      if (!authGroup) continue

      // Update ldap_ou in DB if not set or changed
      const groupConfig = syncConfigs.get(ldapGroup.cn)
      const currentOU = groupConfig?.ldap_ou
      if (targetOU && currentOU !== targetOU) {
        try {
          await pool.query(
            'UPDATE group_sync_config SET ldap_ou = $1 WHERE group_name = $2',
            [targetOU, ldapGroup.cn]
          )
          broadcastLog(io, 'info',  'Updated LDAP OU in DB', {
            group: ldapGroup.cn,
            ou: targetOU
          })
        } catch (dbErr) {
          logger.warn(`Failed to update ldap_ou for ${ldapGroup.cn}:`, dbErr.message)
        }
      }

      const ldapMembers = Array.isArray(ldapGroup.member) 
        ? ldapGroup.member.map(m => {
            const match = m.match(/^uid=([^,]+)/)
            return match ? match[1] : m
          })
        : []

      let authMembers = []
      try {
        const groupDetail = await authentikClient.getGroup(authGroup.pk)
        authMembers = groupDetail.users_obj?.map(u => u.username) || []
      } catch (err) {
        logger.error(`Failed to get Authentik group members for ${ldapGroup.cn}:`, err.message)
        await alertService.createAlert('sync_failure',
          `Failed to get members for ${ldapGroup.cn}: ${err.message}`,
          { severity: 'warning', entityType: 'group', entityId: ldapGroup.cn }
        )
        syncStats.errors++
        continue
      }

      const authMemberSet = new Set(authMembers)

      for (const ldapMember of ldapMembers) {
        if (!authMemberSet.has(ldapMember)) {
          try {
            await authentikClient.addUserToGroup(authGroup.pk, ldapMember)
            broadcastLog(io, 'info',  `Added ${ldapMember} to Authentik group ${ldapGroup.cn}`)
            syncStats.membersAdded++
          } catch (err) {
            logger.error(`Failed to add ${ldapMember} to group ${ldapGroup.cn}:`, err.message)
            syncStats.errors++
          }
        }
      }

      const ldapMemberSet = new Set(ldapMembers)
      for (const authMember of authMembers) {
        if (!ldapMemberSet.has(authMember)) {
          try {
            await authentikClient.removeUserFromGroup(authGroup.pk, authMember)
            broadcastLog(io, 'info',  `Removed ${authMember} from Authentik group ${ldapGroup.cn}`)
            syncStats.membersRemoved++
          } catch (err) {
            logger.error(`Failed to remove ${authMember} from group ${ldapGroup.cn}:`, err.message)
            syncStats.errors++
          }
        }
      }

      await updateSyncState('group', ldapGroup.cn, direction, { 
        membersAdded: syncStats.membersAdded, 
        membersRemoved: syncStats.membersRemoved 
      })
    }

    broadcastLog(io, 'info',  'LDAP → Authentik group sync completed', syncStats)

    if (syncStats.errors > 0) {
      await alertService.createAlert('sync_failure',
        `Group sync completed with ${syncStats.errors} errors`,
        { severity: 'warning', details: syncStats }
      )
    }
  } catch (error) {
    logger.error('LDAP to Authentik group sync error:', error)
    broadcastLog(io, 'error',  'LDAP → Authentik group sync failed', { error: error.message })
    
    await alertService.createAlert('sync_failure',
      `Group sync failed: ${error.message}`,
      { severity: 'critical', details: syncStats }
    )
  }
}

// ─── Main Sync Cycle ──────────────────────────────────────────────────────────

async function runSyncCycle(io, force = false) {
  if (syncState.status === 'running') {
    broadcastLog(io, 'warn','Sync already running, skipping cycle')
    return
  }

  const config = getConfig()
  const startTime = Date.now()
  const cycleId = `sync-${startTime}`

  syncState.status = 'running'
  syncState.currentCycle = cycleId

  if (io) io.to('sync-status').emit('sync-status', { status: 'running', cycleId })

  broadcastLog(io, 'info',  'Starting sync cycle...')

  try {
    // Reconnect if needed
    if (!syncState.isConnected || !syncState.ldapClient) {
    await connectLDAP(config, io)
    }

    const client = syncState.ldapClient
    const mailserver = new MailserverIntegration(config.mailserver)

    const [authentikUsers, ldapUsers] = await Promise.all([
      fetchAuthentikUsers(config),
      searchLDAPUsers(client, config),
    ])

    const ldapUserMap = new Map(ldapUsers.map(u => [u.uid, u]))
    const authentikUserMap = new Map(authentikUsers.map(u => [u.username, u]))

    let created = 0, updated = 0, deleted = 0, errors = 0

    // Create or update
    if (config.sync.createUsers || config.sync.updateUsers) {
      for (const authentikUser of authentikUsers) {
        try {
          // Skip service accounts
          if (isServiceAccount(authentikUser)) {
            broadcastLog(io, 'info', `Skipping service account: ${authentikUser.username}`)
            continue
          }

          // Skip users who have never logged in (inactive) - unless force sync
          if (!authentikUser.last_login && !force) {
            broadcastLog(io, 'info', `Skipping user who has never logged in: ${authentikUser.username}`)
            continue
          }

          const ldapUser = ldapUserMap.get(authentikUser.username)
          
          // Extract custom attributes from Authentik properties
          const userWithAttributes = {
            ...authentikUser,
            attributes: authentikUser.properties || {},
            email: authentikUser.email,
            name: authentikUser.name,
          }

          if (!ldapUser && config.sync.createUsers) {
            await createLDAPUser(client, userWithAttributes, config, io, ldapUsers)
            created++

            if (authentikUser.email && config.mailserver.enabled) {
              await mailserver.createMailbox(authentikUser.username, authentikUser.email)
            }
          } else if (ldapUser && config.sync.updateUsers) {
            await updateLDAPUser(client, userWithAttributes, ldapUser, config, io)
            updated++
          }
        } catch (err) {
          errors++
          syncState.errors.push({ user: authentikUser.username, error: err.message, time: new Date() })
          if (io) io.to('logs').emit('log', {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `Failed to sync user: ${authentikUser.username}`,
            context: { error: err.message, username: authentikUser.username },
          })
        }
      }
    }

    // Delete users not in Authentik or service accounts
    if (config.sync.deleteUsers) {
      for (const ldapUser of ldapUsers) {
        const isService = isServiceAccount({ username: ldapUser.uid })
        
        if (!authentikUserMap.has(ldapUser.uid) || isService) {
          try {
            if (isService) {
              broadcastLog(io, 'info', `Deleting service account from LDAP: ${ldapUser.uid}`)
            }
            await deleteLDAPUser(client, ldapUser.uid, config)
            deleted++
            if (config.mailserver.enabled) {
              await mailserver.deleteMailbox(ldapUser.uid)
            }
          } catch (err) {
            errors++
          }
        }
      }
    }

    // Sync groups: Authentik → LDAP
    if (config.sync.syncGroups) {
      await syncGroups(client, config)
    }

    // Sync groups: LDAP → Authentik (bidirectional/ldap-to-authentik)
    if (config.sync.syncGroups) {
      await syncGroupsFromLDAP(client, config, io)
    }

    // ─── Run Change Detection ─────────────────────────────────────────────────
    let changesDetected = 0
    try {
      const changeResults = await detectChanges(authentikUsers, ldapUsers)
      changesDetected = changeResults.total
      
      if (changeResults.total > 0) {
        broadcastLog(io, 'warn',  'Changes detected in LDAP', {
          orphans: changeResults.orphans,
          mismatches: changeResults.mismatches,
        })
        
        // Broadcast to UI
        if (io) io.to('changes').emit('changes-detected', changeResults)
      } else {
        broadcastLog(io, 'info',  'No new changes detected. LDAP is in sync with Authentik.')
      }
    } catch (detectError) {
      broadcastLog(io, 'error',  'Change detection failed', { error: detectError.message })
      // Don't fail the sync if change detection fails
    }

    const duration = Date.now() - startTime

    syncState.status = 'success'
    syncState.lastSyncTime = new Date()
    syncState.lastSyncDuration = duration
    syncState.currentCycle = null
    syncState.errors = syncState.errors.slice(-10)

    syncState.history.unshift({
      cycleId,
      timestamp: new Date(),
      duration,
      created,
      updated,
      deleted,
      errors,
      changesDetected,
      totalAuthentik: authentikUsers.length,
      totalLdap: ldapUsers.length,
    })
    syncState.history = syncState.history.slice(0, 50)

    broadcastLog(io, 'info',  'Sync cycle completed', { created, updated, deleted, errors, duration: `${duration}ms` })

    if (io) {
      io.to('sync-status').emit('sync-status', { status: 'success', cycleId, duration, created, updated, deleted, errors })
      io.to('logs').emit('log', {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Sync completed: ${created} created, ${updated} updated, ${deleted} deleted, ${errors} errors`,
        context: { created, updated, deleted, errors, duration },
      })
    }

  } catch (error) {
    const duration = Date.now() - startTime
    
    syncState.status = 'failed'
    syncState.lastSyncTime = new Date()
    syncState.lastSyncDuration = duration
    syncState.currentCycle = null
    syncState.isConnected = false  // Force reconnect next cycle
    syncState.ldapClient = null
    syncState.errors.push({ error: error.message, time: new Date() })
    
    broadcastLog(io, 'error',  'Sync cycle failed', { error: error.message, stack: error.stack })
    
    // Check if failure is due to ENV var / config issues
    const errorMsg = error.message.toLowerCase()
    const isConfigError = errorMsg.includes('ldap') || 
                         errorMsg.includes('authentik') || 
                         errorMsg.includes('connection') ||
                         errorMsg.includes('config')
    
    if (isConfigError) {
      broadcastLog(io, 'error', 'Sync failed due to configuration issue')
      broadcastLog(io, 'error', 'Re-activating /god-mode for reconfiguration...')
      
      // Dynamically import config to avoid circular dependency
      const { setServiceConfig, SERVICE_SYSTEM } = await import('./config.js')
      await setServiceConfig(SERVICE_SYSTEM, { setup_complete: 'false' })
      broadcastLog(io, 'info', 'Visit /god-mode to fix configuration')
    }
    
    if (io) {
      io.to('sync-status').emit('sync-status', { status: 'failed', error: error.message })
      io.to('logs').emit('log', {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Sync cycle failed: ${error.message}`,
        context: { error: error.message },
        stackTrace: error.stack,
      })
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getSyncState() {
  return {
    status: syncState.status,
    lastSyncTime: syncState.lastSyncTime,
    lastSyncDuration: syncState.lastSyncDuration,
    currentCycle: syncState.currentCycle,
    isConnected: syncState.isConnected,
    recentErrors: syncState.errors.slice(-5),
    history: syncState.history.slice(0, 10),
    config: {
      intervalMinutes: getConfig().sync.intervalMinutes,
      syncGroups: getConfig().sync.syncGroups,
      dryRun: getConfig().sync.dryRun,
      createUsers: getConfig().sync.createUsers,
      updateUsers: getConfig().sync.updateUsers,
      deleteUsers: getConfig().sync.deleteUsers,
    }
  }
}

export async function startSyncService(io) {
  const config = getConfig()
  broadcastLog(io, 'info',  'Starting integrated sync service...')

  try {
    await connectLDAP(config)
    await runSyncCycle(io)

    const intervalMs = config.sync.intervalMinutes * 60 * 1000
    syncState.interval = setInterval(() => runSyncCycle(io), intervalMs)

    broadcastLog(io, 'info',  `Sync service started. Running every ${config.sync.intervalMinutes} minutes`)
  } catch (error) {
    broadcastLog(io, 'error', 'Failed to start sync service', { error: error.message })
  }
}

export function stopSyncService(io) {
  if (syncState.interval) {
    clearInterval(syncState.interval)
    syncState.interval = null
  }
  if (syncState.ldapClient) {
    syncState.ldapClient.unbind()
    syncState.ldapClient = null
    syncState.isConnected = false
  }
  syncState.status = 'idle'
  broadcastLog(io, 'info',  'Sync service stopped')
}

export async function triggerManualSync(io, force = false) {
  const type = force ? 'FORCE' : 'Manual'
  broadcastLog(io, 'info',  `${type} sync triggered`)
  await runSyncCycle(io, force)
}

// ─── Dashboard Data ─────────────────────────────────────────────────────────

export async function getDashboardData() {
  try {
    // Get global sync direction
    const directionResult = await pool.query(
      "SELECT value FROM service_configs WHERE service = 'system' AND key = 'global_sync_direction'"
    )
    const globalDirection = directionResult.rows[0]?.value || 'ldap-to-authentik'

    // Count users
    let userStats = { total: 0, synced: 0, pending: 0, not_synced: 0 }
    try {
      const { authentikClient } = await import('./authentikClient.js')
      const { ldapClient } = await import('./ldapClient.js')
      const authentikUsers = await authentikClient.getUsers()
      const ldapUsers = await ldapClient.getUsers()
      const ldapMap = new Map(ldapUsers.map(u => [u.uid, u]))

      userStats.total = authentikUsers.length
      for (const aUser of authentikUsers) {
        const lUser = ldapMap.get(aUser.username)
        if (lUser) {
          const matches = lUser.mail === aUser.email && lUser.cn === (aUser.name || aUser.username)
          if (matches) userStats.synced++
          else userStats.pending++
        } else {
          userStats.not_synced++
        }
      }
    } catch (err) {
      logger.warn('Failed to compute user sync stats:', err.message)
    }

    // Count groups
    let groupStats = { total: 0, synced: 0, not_synced: 0, by_ou: {} }
    try {
      const ldapGroups = await (await import('./ldapClient.js')).ldapClient.getGroups()
      const authentikGroups = await (await import('./authentikClient.js')).authentikClient.getGroups()
      const authSet = new Set(authentikGroups.map(g => g.name))

      groupStats.total = ldapGroups.length
      for (const lGroup of ldapGroups) {
        const ou = (lGroup.dn || '').match(/ou=([^,]+)/i)?.[1] || 'ungrouped'
        if (!groupStats.by_ou[ou]) groupStats.by_ou[ou] = { total: 0, synced: 0 }
        groupStats.by_ou[ou].total++
        if (authSet.has(lGroup.cn)) {
          groupStats.synced++
          groupStats.by_ou[ou].synced++
        } else {
          groupStats.not_synced++
        }
      }
    } catch (err) {
      logger.warn('Failed to compute group sync stats:', err.message)
    }

    // Recent history (last 5 cycles)
    const recentHistory = syncState.history.slice(-5).map(h => ({
      timestamp: h.timestamp,
      duration: h.duration,
      created: h.created || 0,
      updated: h.updated || 0,
      errors: h.errors || 0,
      skipped: h.skipped || 0,
    }))

    return {
      status: syncState.status,
      lastSyncTime: syncState.lastSyncTime,
      lastSyncDuration: syncState.lastSyncDuration,
      globalDirection,
      stats: {
        users: userStats,
        groups: groupStats,
        errors: syncState.errors.length,
      },
      recentHistory,
    }
  } catch (error) {
    logger.error('Failed to get dashboard data:', error.message)
    throw error
  }
}

export async function getGlobalDirection() {
  try {
    const result = await pool.query(
      "SELECT value FROM service_configs WHERE service = 'system' AND key = 'global_sync_direction'"
    )
    return result.rows[0]?.value || 'ldap-to-authentik'
  } catch (error) {
    return 'ldap-to-authentik'
  }
}

export async function setGlobalDirection(direction) {
  const valid = ['authentik-to-ldap', 'ldap-to-authentik', 'bidirectional']
  if (!valid.includes(direction)) {
    throw new Error('Invalid sync direction: ' + direction)
  }

  try {
    await pool.query(
      `INSERT INTO service_configs (service, key, value, is_encrypted)
       VALUES ('system', 'global_sync_direction', $1, false)
       ON CONFLICT (service, key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [direction]
    )
    return { success: true, direction }
  } catch (error) {
    logger.error('Failed to set global sync direction:', error.message)
    throw error
  }
} 
