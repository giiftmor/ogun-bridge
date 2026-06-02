import express from 'express'
import { pool } from '../lib/db.js'
import { requireAppApiKey } from '../middleware/apikey.js'
import { requireSuperAdmin } from '../middleware/auth.js'
import { resolveRole, checkPermission, getAuthentikGroups, syncUsersForApp } from '../services/authorizer.js'
import { logger } from '../utils/logger.js'
import { createAuditLog } from '../services/auditService.js'

export const rbacRouter = express.Router()

// ── App schemas ──────────────────────────────────────────────────────────

rbacRouter.get('/schema/:appSlug', async (req, res) => {
  try {
    const { appSlug } = req.params
    const schema = await pool.query('SELECT modules, source, last_synced FROM app_schemas WHERE app_slug = $1', [appSlug])
    if (schema.rows.length === 0) return res.json({ modules: [], source: null })
    return res.json(schema.rows[0])
  } catch (error) {
    logger.error('Get schema error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.post('/schema/:appSlug', requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug } = req.params
    const { modules, source } = req.body
    if (!Array.isArray(modules)) return res.status(400).json({ error: 'modules must be an array' })

    await pool.query(`
      INSERT INTO app_schemas (app_slug, modules, source, last_synced, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (app_slug) DO UPDATE
        SET modules = EXCLUDED.modules,
            source = CASE WHEN app_schemas.source = 'admin_override' THEN app_schemas.source ELSE EXCLUDED.source END,
            last_synced = NOW(),
            updated_at = NOW()
    `, [appSlug, JSON.stringify(modules), source || 'app_push'])

    await createAuditLog({
      action: 'rbac_schema_updated',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_schema',
      entity_id: appSlug,
      changes: { moduleCount: modules.length, source: source || 'app_push' },
      source: 'api',
      success: true,
    })

    logger.info('Schema registered', { appSlug, moduleCount: modules.length })
    return res.json({ success: true })
  } catch (error) {
    logger.error('Register schema error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Role definitions ─────────────────────────────────────────────────────

rbacRouter.get('/roles/:appSlug', requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug } = req.params
    const roles = await pool.query(`
      SELECT rd.id, rd.name, rd.display_name, rd.description, rd.base_role,
             rd.is_default, rd.is_active, rd.created_at, rd.updated_at,
             (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_definition_id = rd.id) AS module_count
      FROM role_definitions rd
      WHERE rd.app_slug = $1
      ORDER BY rd.is_default DESC, rd.name ASC
    `, [appSlug])
    return res.json(roles.rows)
  } catch (error) {
    logger.error('List roles error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.post('/roles/:appSlug', requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug } = req.params
    const { name, display_name, description, base_role, is_default } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })

    const result = await pool.query(`
      INSERT INTO role_definitions (app_slug, name, display_name, description, base_role, is_default, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, display_name, is_default, is_active
    `, [appSlug, name, display_name || name, description || null, base_role || 'viewer', is_default || false, req.user?.username || 'system'])

    if (is_default) {
      await pool.query('UPDATE role_definitions SET is_default = false WHERE app_slug = $1 AND id != $2', [appSlug, result.rows[0].id])
    }

    await createAuditLog({
      action: 'rbac_role_created',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_role',
      entity_id: String(result.rows[0].id),
      changes: { appSlug, name, display_name, base_role, is_default },
      source: 'api',
      success: true,
    })

    logger.info('Role created', { appSlug, role: name })
    return res.status(201).json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Role already exists for this app' })
    logger.error('Create role error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.put('/roles/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { name, display_name, description, base_role, is_default, is_active } = req.body

    const result = await pool.query(`
      UPDATE role_definitions
      SET name = COALESCE($1, name),
          display_name = COALESCE($2, display_name),
          description = COALESCE($3, description),
          base_role = COALESCE($4, base_role),
          is_default = COALESCE($5, is_default),
          is_active = COALESCE($6, is_active),
          updated_at = NOW(),
          updated_by = $7
      WHERE id = $8
      RETURNING id, name, display_name, is_default, is_active
    `, [name || null, display_name || null, description !== undefined ? description : null, base_role || null, is_default !== undefined ? is_default : null, is_active !== undefined ? is_active : null, req.user?.username || 'system', id])

    if (result.rows.length === 0) return res.status(404).json({ error: 'Role not found' })

    if (is_default) {
      const role = result.rows[0]
      await pool.query('UPDATE role_definitions SET is_default = false WHERE app_slug = (SELECT app_slug FROM role_definitions WHERE id = $1) AND id != $1', [id])
    }

    await createAuditLog({
      action: 'rbac_role_updated',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_role',
      entity_id: String(id),
      changes: { name, display_name, description, base_role, is_default, is_active },
      source: 'api',
      success: true,
    })

    return res.json(result.rows[0])
  } catch (error) {
    logger.error('Update role error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.delete('/roles/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const role = await pool.query('SELECT is_default, is_active FROM role_definitions WHERE id = $1', [id])
    if (role.rows.length === 0) return res.status(404).json({ error: 'Role not found' })
    if (role.rows[0].is_default) return res.status(400).json({ error: 'Cannot delete default role' })

    await pool.query('UPDATE role_definitions SET is_active = false WHERE id = $1', [id])
    
    await createAuditLog({
      action: 'rbac_role_deactivated',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_role',
      entity_id: String(id),
      changes: { is_active: false },
      source: 'api',
      success: true,
    })

    logger.info('Role deactivated', { roleId: id })
    return res.json({ success: true })
  } catch (error) {
    logger.error('Delete role error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Role permissions ────────────────────────────────────────────────────

rbacRouter.get('/roles/:id/permissions', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const perms = await pool.query(
      'SELECT id, module_name, actions FROM role_permissions WHERE role_definition_id = $1 ORDER BY module_name',
      [id]
    )
    return res.json(perms.rows)
  } catch (error) {
    logger.error('Get permissions error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.put('/roles/:id/permissions', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { permissions } = req.body
    if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions must be an array' })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM role_permissions WHERE role_definition_id = $1', [id])
      for (const perm of permissions) {
        if (!perm.module_name || !Array.isArray(perm.actions)) continue
        await client.query(
          'INSERT INTO role_permissions (role_definition_id, module_name, actions) VALUES ($1, $2, $3)',
          [id, perm.module_name, JSON.stringify(perm.actions)]
        )
      }
      await client.query('UPDATE role_definitions SET updated_at = NOW() WHERE id = $1', [id])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    await createAuditLog({
      action: 'rbac_permissions_updated',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_role',
      entity_id: String(id),
      changes: { permissionCount: permissions.length, permissions },
      source: 'api',
      success: true,
    })

    logger.info('Permissions updated', { roleDefinitionId: id, permissionCount: permissions.length })
    return res.json({ success: true })
  } catch (error) {
    logger.error('Update permissions error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Group → Role mappings ────────────────────────────────────────────────

rbacRouter.get('/mappings/:appSlug', requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug } = req.params
    const mappings = await pool.query(`
      SELECT grm.id, grm.authentik_group, grm.priority, grm.is_active,
             grm.role_definition_id, rd.name AS role_name, rd.display_name AS role_display_name
      FROM group_role_mappings grm
      LEFT JOIN role_definitions rd ON rd.id = grm.role_definition_id
      WHERE grm.app_slug = $1
      ORDER BY grm.priority DESC, grm.authentik_group ASC
    `, [appSlug])
    return res.json(mappings.rows)
  } catch (error) {
    logger.error('List mappings error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.post('/mappings/:appSlug', requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug } = req.params
    const { authentik_group, role_definition_id, priority, is_active } = req.body
    if (!authentik_group || !role_definition_id) return res.status(400).json({ error: 'authentik_group and role_definition_id are required' })

    const result = await pool.query(`
      INSERT INTO group_role_mappings (app_slug, authentik_group, role_definition_id, priority, is_active, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, authentik_group, priority, is_active
    `, [appSlug, authentik_group, role_definition_id, priority || 0, is_active !== false, req.user?.username || 'system'])

    await createAuditLog({
      action: 'rbac_mapping_created',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_mapping',
      entity_id: String(result.rows[0].id),
      changes: { appSlug, authentik_group, role_definition_id, priority, is_active },
      source: 'api',
      success: true,
    })

    logger.info('Mapping created', { appSlug, group: authentik_group })
    return res.status(201).json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Mapping already exists for this group' })
    logger.error('Create mapping error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.put('/mappings/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { authentik_group, role_definition_id, priority, is_active } = req.body

    const result = await pool.query(`
      UPDATE group_role_mappings
      SET authentik_group = COALESCE($1, authentik_group),
          role_definition_id = COALESCE($2, role_definition_id),
          priority = COALESCE($3, priority),
          is_active = COALESCE($4, is_active),
          updated_at = NOW(),
          updated_by = $5
      WHERE id = $6
      RETURNING id, authentik_group, priority, is_active
    `, [authentik_group || null, role_definition_id || null, priority !== undefined ? priority : null, is_active !== undefined ? is_active : null, req.user?.username || 'system', id])

    if (result.rows.length === 0) return res.status(404).json({ error: 'Mapping not found' })

    await createAuditLog({
      action: 'rbac_mapping_updated',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_mapping',
      entity_id: String(id),
      changes: { authentik_group, role_definition_id, priority, is_active },
      source: 'api',
      success: true,
    })

    return res.json(result.rows[0])
  } catch (error) {
    logger.error('Update mapping error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.delete('/mappings/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await pool.query('DELETE FROM group_role_mappings WHERE id = $1', [id])

    await createAuditLog({
      action: 'rbac_mapping_deleted',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_mapping',
      entity_id: String(id),
      changes: { deleted: true },
      source: 'api',
      success: true,
    })

    return res.json({ success: true })
  } catch (error) {
    logger.error('Delete mapping error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Permission resolution (core endpoint) ────────────────────────────────

rbacRouter.post('/resolve', requireAppApiKey, async (req, res) => {
  try {
    const { sub, email, groups, appSlug } = req.body
    if (!sub || !appSlug) return res.status(400).json({ error: 'sub and appSlug are required' })

    const result = await resolveRole(sub, email || '', groups || [], appSlug)
    if (result.error) return res.status(404).json(result)
    return res.json(result)
  } catch (error) {
    logger.error('Resolve error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.get('/check', requireAppApiKey, async (req, res) => {
  try {
    const { appSlug, sub, groups, module: requiredModule, action: requiredAction } = req.query
    if (!appSlug || !sub || !requiredModule) return res.status(400).json({ error: 'appSlug, sub, and module are required' })

    const result = await checkPermission(sub, (groups || '').split(',').filter(Boolean), appSlug, requiredModule, requiredAction || null)
    return res.json(result)
  } catch (error) {
    logger.error('Check permission error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── App users ────────────────────────────────────────────────────────────

rbacRouter.get('/users/:appSlug', requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug } = req.params
    const users = await pool.query(`
      SELECT au.id, au.oidc_sub, au.email, au.last_auth, au.last_sync, au.is_active,
             rd.name AS role_name, rd.display_name AS role_display_name
      FROM app_users au
      JOIN apps a ON a.id = au.app_id
      LEFT JOIN role_definitions rd ON rd.id = au.role_definition_id
      WHERE a.slug = $1
      ORDER BY au.last_auth DESC NULLS LAST
    `, [appSlug])
    return res.json(users.rows)
  } catch (error) {
    logger.error('List app users error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.put('/users/:appSlug/:sub/role', requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug, sub } = req.params
    const { role_definition_id } = req.body

    const app = await pool.query('SELECT id FROM apps WHERE slug = $1', [appSlug])
    if (app.rows.length === 0) return res.status(404).json({ error: 'App not found' })

    const perms = role_definition_id
      ? (await pool.query('SELECT module_name, actions FROM role_permissions WHERE role_definition_id = $1', [role_definition_id])).rows
      : []

    const permissionsCache = {}
    for (const p of perms) permissionsCache[p.module_name] = p.actions

    await pool.query(`
      UPDATE app_users
      SET role_definition_id = $1, permissions_cache = $2, last_sync = NOW()
      WHERE app_id = $3 AND oidc_sub = $4
    `, [role_definition_id || null, JSON.stringify(permissionsCache), app.rows[0].id, sub])

    await createAuditLog({
      action: 'rbac_user_role_overridden',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_user',
      entity_id: sub,
      changes: { appSlug, role_definition_id, permissionsCache },
      source: 'api',
      success: true,
    })

    logger.info('User role override', { appSlug, sub, roleDefinitionId: role_definition_id })
    return res.json({ success: true })
  } catch (error) {
    logger.error('Override user role error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.post('/sync/:appSlug', requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug } = req.params
    const result = await syncUsersForApp(appSlug)

    await createAuditLog({
      action: 'rbac_users_synced',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_app',
      entity_id: appSlug,
      changes: { syncedCount: result.synced || 0 },
      source: 'api',
      success: true,
    })

    return res.json(result)
  } catch (error) {
    logger.error('Sync users error', { error: error.message })
    return res.status(500).json({ error: error.message })
  }
})

// ── Apps management ──────────────────────────────────────────────────────

rbacRouter.get('/apps', requireSuperAdmin, async (req, res) => {
  try {
    const apps = await pool.query(`
      SELECT a.id, a.name, a.slug, a.display_name, a.authentik_slug, a.access_group,
             a.schema_endpoint, a.is_active, a.created_at,
             (SELECT COUNT(*) FROM app_users u WHERE u.app_id = a.id) AS user_count,
             (SELECT COUNT(*) FROM role_definitions rd WHERE rd.app_slug = a.slug AND rd.is_active = true) AS role_count,
             (SELECT COUNT(*) FROM group_role_mappings grm WHERE grm.app_slug = a.slug AND grm.is_active = true) AS mapping_count
      FROM apps a
      ORDER BY a.name ASC
    `)
    return res.json(apps.rows)
  } catch (error) {
    logger.error('List apps error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})



rbacRouter.post('/apps', requireSuperAdmin, async (req, res) => {
  try {
    const { name, slug, display_name, claim_name, authentik_slug, access_group, schema_endpoint } = req.body
    if (!name || !slug || !claim_name) return res.status(400).json({ error: 'name, slug, and claim_name are required' })

    const crypto = require('crypto')
    const api_key = crypto.randomBytes(24).toString('hex')

    const result = await pool.query(`
      INSERT INTO apps (name, slug, display_name, api_key, claim_name, authentik_slug, access_group, schema_endpoint, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      RETURNING id, name, slug, display_name, authentik_slug, access_group, schema_endpoint, is_active, api_key
    `, [name, slug, display_name || name, api_key, claim_name, authentik_slug || null, access_group || null, schema_endpoint || null])

    await createAuditLog({
      action: 'rbac_app_created',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_app',
      entity_id: slug,
      changes: { name, slug, display_name, claim_name, authentik_slug, access_group },
      source: 'api',
      success: true,
    })

    logger.info('App created', { slug, name })
    return res.status(201).json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An app with this slug already exists' })
    logger.error('Create app error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

rbacRouter.put('/apps/:slug', requireSuperAdmin, async (req, res) => {
  try {
    const { slug } = req.params
    const { authentik_slug, access_group, schema_endpoint, is_active, display_name } = req.body

    const result = await pool.query(`
      UPDATE apps
      SET authentik_slug = COALESCE($1, authentik_slug),
          access_group = COALESCE($2, access_group),
          schema_endpoint = COALESCE($3, schema_endpoint),
          is_active = COALESCE($4, is_active),
          display_name = COALESCE($5, display_name),
          updated_at = NOW()
      WHERE slug = $6
      RETURNING id, name, slug, authentik_slug, access_group, is_active
    `, [authentik_slug || null, access_group || null, schema_endpoint || null, is_active !== undefined ? is_active : null, display_name || null, slug])

    if (result.rows.length === 0) return res.status(404).json({ error: 'App not found' })

    await createAuditLog({
      action: 'rbac_app_updated',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_app',
      entity_id: slug,
      changes: { authentik_slug, access_group, schema_endpoint, is_active, display_name },
      source: 'api',
      success: true,
    })

    return res.json(result.rows[0])
  } catch (error) {
    logger.error('Update app error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Authentik proxy ──────────────────────────────────────────────────────

rbacRouter.get('/authentik-groups', requireSuperAdmin, async (req, res) => {
  try {
    const groups = await getAuthentikGroups()
    return res.json(groups)
  } catch (error) {
    logger.error('Fetch Authentik groups error', { error: error.message })
    return res.status(502).json({ error: error.message })
  }
})

// ── Base roles (read-only) ──────────────────────────────────────────────

rbacRouter.get('/base-roles', requireSuperAdmin, async (req, res) => {
  try {
    const roles = await pool.query('SELECT id, name, display_name, priority, description FROM base_roles ORDER BY priority DESC')
    return res.json(roles.rows)
  } catch (error) {
    logger.error('List base roles error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})
