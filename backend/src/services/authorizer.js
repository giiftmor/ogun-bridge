import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'

const BASE_ROLE_PRIORITY = { super_admin: 120, admin: 100, viewer: 20 }

export async function resolveRole(sub, email, groups, appSlug) {
  const app = await pool.query('SELECT id, slug, access_group FROM apps WHERE slug = $1 AND is_active = true', [appSlug])
  if (app.rows.length === 0) return { error: 'App not found or inactive' }
  const appId = app.rows[0].id

  const existing = await pool.query(
    'SELECT role_definition_id, permissions_cache FROM app_users WHERE app_id = $1 AND oidc_sub = $2 AND is_active = true',
    [appId, sub]
  )
  if (existing.rows.length > 0 && existing.rows[0].permissions_cache) {
    const rd = existing.rows[0].role_definition_id
      ? (await pool.query('SELECT id, name, display_name FROM role_definitions WHERE id = $1', [existing.rows[0].role_definition_id])).rows[0]
      : null
    await pool.query('UPDATE app_users SET last_auth = NOW(), last_sync = NOW() WHERE app_id = $1 AND oidc_sub = $2', [appId, sub])
    return {
      roleDefinition: rd ? { id: rd.id, name: rd.name, displayName: rd.display_name } : { name: 'viewer', displayName: 'Viewer' },
      permissions: existing.rows[0].permissions_cache,
      source: 'cache',
    }
  }

  const resolved = await resolveFromGroups(groups, appSlug)
  if (resolved.error) return resolved

  const perms = resolved.roleDefinitionId
    ? await getRolePermissions(resolved.roleDefinitionId)
    : {}

  await pool.query(`
    INSERT INTO app_users (app_id, oidc_sub, email, role_definition_id, permissions_cache, last_auth, last_sync, is_active)
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), true)
    ON CONFLICT (app_id, oidc_sub) DO UPDATE
      SET role_definition_id = EXCLUDED.role_definition_id,
          permissions_cache = EXCLUDED.permissions_cache,
          email = EXCLUDED.email,
          last_auth = NOW(),
          last_sync = NOW(),
          is_active = true
  `, [appId, sub, email, resolved.roleDefinitionId, JSON.stringify(perms)])

  return {
    roleDefinition: resolved.roleDefinition || { name: 'viewer', displayName: 'Viewer' },
    permissions: perms,
    matchedGroup: resolved.matchedGroup,
    source: resolved.source,
  }
}

async function resolveFromGroups(groups, appSlug) {
  if (!groups || groups.length === 0) {
    return await getDefaultRole(appSlug)
  }

  const mappings = await pool.query(`
    SELECT grm.id, grm.authentik_group, grm.priority, grm.role_definition_id,
           rd.id AS rd_id, rd.name AS rd_name, rd.display_name AS rd_display_name
    FROM group_role_mappings grm
    JOIN role_definitions rd ON rd.id = grm.role_definition_id
    WHERE grm.app_slug = $1 AND grm.is_active = true AND rd.is_active = true
    ORDER BY grm.priority DESC
  `, [appSlug])

  const userGroupsLower = groups.map(g => g.toLowerCase())
  for (const m of mappings.rows) {
    if (userGroupsLower.includes(m.authentik_group.toLowerCase())) {
      return {
        roleDefinitionId: m.rd_id,
        roleDefinition: { id: m.rd_id, name: m.rd_name, displayName: m.rd_display_name },
        matchedGroup: m.authentik_group,
        source: 'group_mapping',
      }
    }
  }

  return await getDefaultRole(appSlug)
}

async function getDefaultRole(appSlug) {
  const defaultRd = await pool.query(
    'SELECT id, name, display_name FROM role_definitions WHERE app_slug = $1 AND is_default = true AND is_active = true LIMIT 1',
    [appSlug]
  )
  if (defaultRd.rows.length > 0) {
    return {
      roleDefinitionId: defaultRd.rows[0].id,
      roleDefinition: { id: defaultRd.rows[0].id, name: defaultRd.rows[0].name, displayName: defaultRd.rows[0].display_name },
      source: 'default_role',
    }
  }
  return { roleDefinitionId: null, roleDefinition: null, source: 'viewer_fallback' }
}

async function getRolePermissions(roleDefinitionId) {
  const rows = await pool.query(
    'SELECT module_name, actions FROM role_permissions WHERE role_definition_id = $1',
    [roleDefinitionId]
  )
  const perms = {}
  for (const r of rows.rows) {
    perms[r.module_name] = r.actions
  }
  return perms
}

export async function checkPermission(sub, groups, appSlug, requiredModule, requiredAction) {
  const resolved = await resolveRole(sub, null, groups, appSlug)
  if (resolved.error) return { authorized: false, error: resolved.error }

  if (resolved.roleDefinition?.name === 'super_admin') {
    return { authorized: true, permissions: resolved.permissions, roleDefinition: resolved.roleDefinition }
  }

  const modulePerms = resolved.permissions[requiredModule]
  if (!modulePerms) return { authorized: false, permissions: resolved.permissions, roleDefinition: resolved.roleDefinition }

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
  const app = await pool.query('SELECT id, authentik_slug, access_group FROM apps WHERE slug = $1 AND is_active = true', [appSlug])
  if (app.rows.length === 0) throw new Error('App not found')
  const { id: appId, authentik_slug, access_group } = app.rows[0]

  const authUrl = process.env.AUTHENTIK_URL || 'https://auth.spectres.co.za'
  const token = process.env.AUTHENTIK_API_TOKEN
  if (!token) throw new Error('AUTHENTIK_API_TOKEN not configured')

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
  for (const user of members.results || members) {
    const sub = user?.pk?.toString() || user?.uuid
    if (!sub) continue
    const perms = defaultRoleId ? await getRolePermissions(defaultRoleId) : {}
    await pool.query(`
      INSERT INTO app_users (app_id, oidc_sub, email, role_definition_id, permissions_cache, last_sync, is_active)
      VALUES ($1, $2, $3, $4, $5, NOW(), true)
      ON CONFLICT (app_id, oidc_sub) DO UPDATE
        SET last_sync = NOW(), is_active = true
    `, [appId, sub, user.email || '', defaultRoleId, JSON.stringify(perms)])
    synced++
  }

  await pool.query(`
    UPDATE app_users SET is_active = false
    WHERE app_id = $1 AND is_active = true AND last_sync < NOW() - INTERVAL '1 hour'
    AND oidc_sub NOT IN (SELECT $2::text WHERE false)
  `, [appId])
  await pool.query(`
    WITH active_subs AS (
      SELECT UNNEST($1::text[]) AS sub
    )
    UPDATE app_users SET is_active = false
    WHERE app_id = $2 AND is_active = true
    AND oidc_sub NOT IN (SELECT sub FROM active_subs)
  `, [members.results.map(u => u?.pk?.toString() || u?.uuid).filter(Boolean), appId])

  return { synced, total: members.results?.length || 0 }
}
