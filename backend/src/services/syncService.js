import { Client, Attribute, Change } from 'ldapts'
import crypto from 'crypto'
import { logger } from '../utils/logger.js'
import { MailserverIntegration } from './mailserver.js'
import { detectChanges } from './changeDetector.js'
import { addLogToCache } from './logCache.js'

function hashPasswordSSHA512(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.createHash('sha512')
  hash.update(password)
  hash.update(salt)
  const digest = hash.digest()
  const combined = Buffer.concat([digest, salt])
  return `{SSHA512}${combined.toString('base64')}`
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

async function createLDAPUser(client, user, config, io, existingUsers = []) {
  const dn = `uid=${user.username},${config.ldap.userBaseDN}`

  // Get next uidNumber
  const maxUid = existingUsers.reduce((max, u) => {
    const uid = parseInt(u.uidNumber?.[0] || '0', 10)
    return uid > max ? uid : max
  }, 1000)
  const nextUid = maxUid + 1

  const nameParts = (user.name || user.username).split(' ')
  const entry = {
    objectClass: ['inetOrgPerson', 'organizationalPerson', 'person', 'top', 'posixAccount'],
    uid: user.username,
    cn: user.name || user.username,
    sn: nameParts.length > 1 ? nameParts[nameParts.length - 1] : user.username,
    givenName: nameParts[0] || user.username,
    mail: user.email || `${user.username}@${config.mailserver.domain}`,
    userPassword: hashPasswordSSHA512(`${user.username}:${Date.now()}`),
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

    for (const group of groups) {
      const dn = `cn=${group.name},${config.ldap.groupBaseDN}`
      const groupDetails = await fetchGroupDetails(config, group.pk)
      const memberUsernames = groupDetails.users_obj || []

      const members = memberUsernames.length > 0
        ? memberUsernames.map(u => `uid=${u.username},${config.ldap.userBaseDN}`)
        : [`uid=placeholder,${config.ldap.userBaseDN}`]

      const entry = {
        objectClass: ['groupOfNames', 'top'],
        cn: group.name,
        member: members,
      }

      try {
        await client.add(dn, entry)
        broadcastLog(io, 'info',  'Created LDAP group', { group: group.name })
      } catch (err) {
        if (err.message.includes('Already Exists') || err.code === 68) {
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
    console.error('Group sync error:', error)
    broadcastLog(io, 'error',  'Group sync failed', { error: error.message })
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

    // Sync groups
    if (config.sync.syncGroups) {
      await syncGroups(client, config)
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
