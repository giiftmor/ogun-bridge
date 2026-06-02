import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'

export async function resolveRole(sub, email, groups, appSlug, preResolvedRole = null) {
  const appResult = await pool.query(
    'SELECT id, slug, name, access_group, authentik_slug, is_active FROM apps WHERE slug = $1',
    [appSlug]
  )
  if (appResult.rows.length === 0) {
    return { error: 'App not found', authorized: false }
  }

  const app = appResult.rows[0]
  if (!app.is_active) {
    return { error: 'App is not active', authorized: false }
  }

  let roleDefId = null
  let roleName = 'viewer'
  let roleDisplayName = 'Viewer'
  let roleBaseRole = 'viewer'
  let matchedGroup = null

  if (preResolvedRole && ['admin', 'password_manager', 'viewer'].includes(preResolvedRole)) {
    logger.info('Role pre-resolved by Authentik scope claim', { sub, appSlug, preResolvedRole })
    const roleResult = await pool.query(
      'SELECT id, name, display_name, base_role FROM role_definitions WHERE app_slug = $1 AND name = $2 AND is_active = true',
      [appSlug, preResolvedRole]
    )
    if (roleResult.rows.length > 0) {
      const r = roleResult.rows[0]
      roleDefId = r.id
      roleName = r.name
      roleDisplayName = r.display_name
      roleBaseRole = r.base_role
      matchedGroup = preResolvedRole
    }
  } else if (groups && groups.length > 0) {
    const userGroupsLower = groups.map(g => g.toLowerCase())

    if (app.access_group) {
      const hasAccess = userGroupsLower.includes(app.access_group.toLowerCase())
      if (!hasAccess) {
        logger.info('User not in app access group', { sub, appSlug, accessGroup: app.access_group, userGroups: groups })
        return { error: 'User not in access group for this app', authorized: false, reason: 'access_group' }
      }
    }

    const mappingsResult = await pool.query(`
      SELECT grm.id, grm.authentik_group, grm.priority, grm.role_definition_id,
             rd.id AS rd_id, rd.name AS rd_name, rd.display_name AS rd_display_name,
             rd.base_role AS rd_base_role
      FROM group_role_mappings grm
      JOIN role_definitions rd ON rd.id = grm.role_definition_id
      WHERE grm.app_slug = $1 AND grm.is_active = true AND rd.is_active = true
      ORDER BY grm.priority DESC
    `, [appSlug])

    let matchedMapping = null
    for (const m of mappingsResult.rows) {
      if (userGroupsLower.includes(m.authentik_group.toLowerCase())) {
        matchedMapping = m
        break
      }
    }

    if (matchedMapping) {
      const permissions = await getPermissionsForRole(matchedMapping.rd_id)
      await upsertAppUser(app.id, sub, email, matchedMapping.rd_id, permissions)
      logger.info('Role resolved via group mapping', {
        sub, appSlug, role: matchedMapping.rd_name, matchedGroup: matchedMapping.authentik_group
      })
      return {
        authorized: true,
        roleDefinition: {
          id: matchedMapping.rd_id,
          name: matchedMapping.rd_name,
          displayName: matchedMapping.rd_display_name,
          baseRole: matchedMapping.rd_base_role,
        },
        permissions,
        matchedGroup: matchedMapping.authentik_group,
        source: 'group_mapping',
      }
    }
  }

  if (!roleDefId) {
    const defaultRoleResult = await pool.query(
      'SELECT id, name, display_name, base_role FROM role_definitions WHERE app_slug = $1 AND is_active = true AND is_default = true',
      [appSlug]
    )
    if (defaultRoleResult.rows.length > 0) {
      const def = defaultRoleResult.rows[0]
      roleDefId = def.id
      roleName = def.name
      roleDisplayName = def.display_name
      roleBaseRole = def.base_role
    } else {
      const viewerBase = await pool.query("SELECT id, name, display_name FROM base_roles WHERE name = 'viewer'")
      if (viewerBase.rows.length > 0) {
        roleDefId = viewerBase.rows[0].id
        roleName = 'viewer'
        roleDisplayName = viewerBase.rows[0].display_name
      }
    }
  }

  const permissions = roleDefId ? await getPermissionsForRole(roleDefId) : {}

  await upsertAppUser(app.id, sub, email, roleDefId, permissions)

  logger.info('Role resolved via default fallback', { sub, appSlug, role: roleName })

  return {
    authorized: true,
    roleDefinition: {
      id: roleDefId,
      name: roleName,
      displayName: roleDisplayName,
      baseRole: roleBaseRole,
    },
    permissions,
    matchedGroup,
    source: 'default_role',
  }
}

async function getPermissionsForRole(roleDefinitionId) {
  if (!roleDefinitionId) return {}
  const perms = await pool.query(
    'SELECT module_name, actions FROM role_permissions WHERE role_definition_id = $1',
    [roleDefinitionId]
  )
  const result = {}
  for (const row of perms.rows) {
    result[row.module_name] = row.actions || []
  }
  return result
}

async function upsertAppUser(appId, oidcSub, email, roleDefinitionId, permissions) {
  try {
    await pool.query(`
      INSERT INTO app_users (app_id, oidc_sub, email, role_definition_id, permissions_cache, last_auth, is_active)
      VALUES ($1, $2, $3, $4, $5, NOW(), true)
      ON CONFLICT (app_id, oidc_sub) DO UPDATE
        SET role_definition_id = EXCLUDED.role_definition_id,
            permissions_cache = EXCLUDED.permissions_cache,
            last_auth = NOW(),
            is_active = true,
            updated_at = NOW()
    `, [appId, oidcSub, email || null, roleDefinitionId, JSON.stringify(permissions)])
  } catch (err) {
    logger.warn('Failed to upsert app user', { error: err.message, code: err.code })
  }
}

export async function checkPermission(sub, groups, appSlug, requiredModule, requiredAction, preResolvedRole = null) {
  const resolved = await resolveRole(sub, null, groups, appSlug, preResolvedRole)
  if (resolved.error) return { authorized: false, error: resolved.error }

  if (resolved.roleDefinition?.name === 'super_admin') {
    return { authorized: true, permissions: resolved.permissions, roleDefinition: resolved.roleDefinition }
  }

  if (!requiredModule) {
    return { authorized: true, permissions: resolved.permissions, roleDefinition: resolved.roleDefinition }
  }

  const modulePerms = resolved.permissions[requiredModule]
  if (!modulePerms || modulePerms.length === 0) {
    return { authorized: false, permissions: resolved.permissions, roleDefinition: resolved.roleDefinition }
  }

  if (requiredAction) {
    return {
      authorized: modulePerms.includes(requiredAction),
      permissions: resolved.permissions,
      roleDefinition: resolved.roleDefinition,
    }
  }

  return { authorized: true, permissions: resolved.permissions, roleDefinition: resolved.roleDefinition }
}

export async function getAuthentikGroups() {
  const authUrl = process.env.AUTHENTIK_URL || 'https://auth.spectres.co.za'
  const token = process.env.AUTHENTIK_API_TOKEN
  if (!token) throw new Error('AUTHENTIK_API_TOKEN not configured')

  const res = await fetch(`${authUrl}/api/v3/core/groups/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Authentik API error: ${res.status}`)
  const data = await res.json()
  return data.results.map(g => ({ pk: g.pk, name: g.name, users: g.users?.length || 0 }))
}

export async function syncUsersForApp(appSlug) {
  const app = await pool.query(
    'SELECT id, authentik_slug, access_group FROM apps WHERE slug = $1 AND is_active = true',
    [appSlug]
  )
  if (app.rows.length === 0) throw new Error('App not found')
  const { id: appId, authentik_slug, access_group } = app.rows[0]

  const authUrl = process.env.AUTHENTIK_URL || 'https://auth.spectres.co.za'
  const token = process.env.AUTHENTIK_API_TOKEN
  if (!token) throw new Error('AUTHENTIK_API_TOKEN not configured')

  if (!access_group) {
    return { synced: 0, total: 0, note: 'No access_group configured for this app' }
  }

  const res = await fetch(`${authUrl}/api/v3/core/groups/?name=${encodeURIComponent(access_group)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Authentik API error: ${res.status}`)
  const data = await res.json()
  const group = data.results[0]
  if (!group) throw new Error(`Group '${access_group}' not found in Authentik`)

  const membersRes = await fetch(`${authUrl}/api/v3/core/groups/${group.pk}/users/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!membersRes.ok) throw new Error(`Failed to fetch group members: ${membersRes.status}`)
  const members = await membersRes.json()

  const defaultRole = await pool.query(
    'SELECT id FROM role_definitions WHERE app_slug = $1 AND is_default = true AND is_active = true LIMIT 1',
    [appSlug]
  )
  const defaultRoleId = defaultRole.rows[0]?.id || null

  let synced = 0
  for (const user of members.results || []) {
    const sub = user?.pk?.toString() || user?.uuid
    if (!sub) continue
    await pool.query(`
      INSERT INTO app_users (app_id, oidc_sub, email, role_definition_id, last_sync, is_active)
      VALUES ($1, $2, $3, $4, NOW(), true)
      ON CONFLICT (app_id, oidc_sub) DO UPDATE
        SET last_sync = NOW(), is_active = true, updated_at = NOW()
    `, [appId, sub, user.email || '', defaultRoleId])
    synced++
  }

  return { synced, total: members.results?.length || 0 }
}