import express from "express"
import { pool } from "../lib/db.js"
import { requireAppApiKey } from "../middleware/apikey.js"
import { requireSuperAdmin, requireModule } from "../middleware/auth.js"
import { resolveRole, checkPermission, getAuthentikGroups, syncUsersForApp } from "../services/authorizer.js"
import { notifyRoleChange, notifyAppSync } from "../services/roleWebhook.js"
import { logger } from "../utils/logger.js"
import { createAuditLog } from "../services/auditService.js"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { AppError } from '../utils/AppError.js'

export const rbacRouter = express.Router()

async function isOgunApp(appSlug) {
  return appSlug === 'ogun'
}

async function logOgunBlocked(req) {
  await createAuditLog({
    action: 'rbac_ogun_write_blocked',
    actor: req.user?.username || 'system',
    entity_type: 'rbac_ogun',
    entity_id: 'ogun',
    changes: { blocked: true, path: req.path, method: req.method },
    source: 'api',
    success: false,
  })
}

async function getAppSlugFromRoleDef(roleDefId) {
  const result = await pool.query('SELECT app_slug FROM role_definitions WHERE id = $1', [roleDefId])
  return result.rows[0]?.app_slug || null
}

async function getAppSlugFromMapping(mappingId) {
  const result = await pool.query(`
    SELECT rd.app_slug FROM group_role_mappings grm
    JOIN role_definitions rd ON rd.id = grm.role_definition_id
    WHERE grm.id = $1
  `, [mappingId])
  return result.rows[0]?.app_slug || null
}

// -- App self-registration -- NO SESSION AUTH required (bearer registration secret) ---------------

export async function registerApp(req, res) {
  try {
    const { name, slug, display_name, claim_name, authentik_slug, access_group, schema_endpoint } = req.body
    if (!name || !slug || !claim_name) {
      throw new AppError('VALIDATION_ERROR', 'name, slug, and claim_name are required')
    }

    const rawKey = crypto.randomBytes(24).toString("hex")
    const api_key = await bcrypt.hash(rawKey, 12)

    const result = await pool.query(
      `INSERT INTO APPS (name, slug, display_name, api_key, claim_name, authentik_slug, access_group, schema_endpoint, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      RETURNING id, name, slug, display_name, authentik_slug, access_group, schema_endpoint, is_active
    `, [name, slug, display_name || name, api_key, claim_name, authentik_slug || null, access_group || null, schema_endpoint || null])

    await createAuditLog({
      action: "rbac_app_registered",
      actor: "system",
      entity_type: "rbac_app",
      entity_id: slug,
      changes: { name, slug, display_name, claim_name, authentik_slug, access_group, source: "self_register" },
      source: "api",
      success: true,
    })

    logger.info("App self-registered", { slug, name })
    return res.status(201).json({ ...result.rows[0], api_key: rawKey })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    if (error.code === "23505") {
      return res.status(409).json({ error: "An app with this slug already exists", code: 'CONFLICT', status: 409 })
    }
    logger.error("App registration error", { error: error.message })
    return res.status(500).json({ error: "Internal server error", code: 'INTERNAL_ERROR', status: 500 })
  }
}


export async function pushAppSchema(req, res) {
  try {
    const { appSlug } = req.params
    if (req.app && req.app.slug !== appSlug) {
      throw new AppError('ACCESS_DENIED', 'API key does not match this app')
    }
    const { modules } = req.body
    if (!Array.isArray(modules)) {
      throw new AppError('VALIDATION_ERROR', 'modules must be an array')
    }
    await pool.query(
      `INSERT INTO app_schemas (app_slug, modules, source, last_synced, updated_at)
      VALUES ($1, $2, 'app_push', NOW(), NOW())
      ON CONFLICT (app_slug) DO UPDATE
        SET modules = EXCLUDED.modules,
            source = CASE WHEN app_schemas.source = 'admin_override' THEN app_schemas.source ELSE 'app_push' END,
            last_synced = NOW(),
            updated_at = NOW()
    `, [appSlug, JSON.stringify(modules)])
    await createAuditLog({
      action: 'rbac_schema_pushed',
      actor: 'app:' + appSlug,
      entity_type: 'rbac_schema',
      entity_id: appSlug,
      changes: { moduleCount: modules.length, source: 'app_push' },
      source: 'api',
      success: true,
    })
    logger.info('Schema pushed by app', { appSlug, moduleCount: modules.length })
    return res.json({ success: true })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Push schema error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
}

// -- App schemas -----------------------------------------------------------------

rbacRouter.get("/schema/:appSlug", requireModule('rbac', 'read'), async (req, res) => {
  try {
    const { appSlug } = req.params
    const schema = await pool.query('SELECT modules, source, last_synced FROM app_schemas WHERE app_slug = $1', [appSlug])
    if (schema.rows.length === 0) return res.json({ modules: [], source: null })
    return res.json(schema.rows[0])
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error("Get schema error", { error: error.message })
    return res.status(500).json({ error: "Internal server error", code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.post("/schema/:appSlug", requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug } = req.params
    const { modules, source } = req.body
    if (!Array.isArray(modules)) throw new AppError('VALIDATION_ERROR', 'modules must be an array')

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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Register schema error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// -- Role definitions -------------------------------------------------------------

rbacRouter.get("/roles/:appSlug", requireModule('rbac', 'read'), async (req, res) => {
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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error("List roles error", { error: error.message })
    return res.status(500).json({ error: "Internal server error", code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.post("/roles/:appSlug", requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug } = req.params
    if (await isOgunApp(appSlug)) {
      await logOgunBlocked(req)
      throw new AppError('ACCESS_DENIED', 'Ogun Bridge RBAC is managed by Authentik')
    }
    const { name, display_name, description, base_role, is_default } = req.body
    if (!name) throw new AppError('VALIDATION_ERROR', 'name is required')

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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    if (error.code === '23505') return res.status(409).json({ error: 'Role already exists for this app', code: 'CONFLICT', status: 409 })
    logger.error('Create role error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.put("/roles/:id", requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const appSlug = await getAppSlugFromRoleDef(id)
    if (await isOgunApp(appSlug)) {
      await logOgunBlocked(req)
      throw new AppError('ACCESS_DENIED', 'Ogun Bridge RBAC is managed by Authentik')
    }
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

    if (result.rows.length === 0) throw new AppError('NOT_FOUND', 'Role not found')

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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Update role error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.delete("/roles/:id", requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const appSlug = await getAppSlugFromRoleDef(id)
    if (await isOgunApp(appSlug)) {
      await logOgunBlocked(req)
      throw new AppError('ACCESS_DENIED', 'Ogun Bridge RBAC is managed by Authentik')
    }
    const role = await pool.query('SELECT is_default, is_active FROM role_definitions WHERE id = $1', [id])
    if (role.rows.length === 0) throw new AppError('NOT_FOUND', 'Role not found')
    if (role.rows[0].is_default) throw new AppError('VALIDATION_ERROR', 'Cannot delete default role')

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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Delete role error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// -- Role permissions ---------------------------------------------------------

rbacRouter.get("/roles/:id/permissions", requireModule('rbac', 'read'), async (req, res) => {
  try {
    const { id } = req.params
    const perms = await pool.query(
      'SELECT id, module_name, actions FROM role_permissions WHERE role_definition_id = $1 ORDER BY module_name',
      [id],
    )
    return res.json(perms.rows)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Get permissions error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.put("/roles/:id/permissions", requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const appSlug = await getAppSlugFromRoleDef(id)
    if (await isOgunApp(appSlug)) {
      await logOgunBlocked(req)
      throw new AppError('ACCESS_DENIED', 'Ogun Bridge RBAC is managed by Authentik')
    }
    const { permissions } = req.body
    if (!Array.isArray(permissions)) throw new AppError('VALIDATION_ERROR', 'permissions must be an array')

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM role_permissions WHERE role_definition_id = $1', [id])
      const permissionsCache = {}
      for (const perm of permissions) {
        if (!perm.module_name || !Array.isArray(perm.actions)) continue
        await client.query(
          'INSERT INTO role_permissions (role_definition_id, module_name, actions) VALUES ($1, $2, $3)',
          [id, perm.module_name, JSON.stringify(perm.actions)],
        )
        permissionsCache[perm.module_name] = perm.actions
      }
      await client.query(
        'UPDATE app_users SET permissions_cache = $1, updated_at = NOW() WHERE role_definition_id = $2',
        [JSON.stringify(permissionsCache), id]
      )
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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Update permissions error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// -- Group → Role mappings --------------------------------------------------

rbacRouter.get("/mappings/:appSlug", requireModule('rbac', 'read'), async (req, res) => {
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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error("List mappings error", { error: error.message })
    return res.status(500).json({ error: "Internal server error", code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.post("/mappings/:appSlug", requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug } = req.params
    if (await isOgunApp(appSlug)) {
      await logOgunBlocked(req)
      throw new AppError('ACCESS_DENIED', 'Ogun Bridge RBAC is managed by Authentik')
    }
    const { authentik_group, role_definition_id, priority, is_active } = req.body
    if (!authentik_group || !role_definition_id) throw new AppError('VALIDATION_ERROR', 'authentik_group and role_definition_id are required')

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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    if (error.code === '23505') return res.status(409).json({ error: 'Mapping already exists for this group', code: 'CONFLICT', status: 409 })
    logger.error('Create mapping error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.post("/mappings/:appSlug/bulk", requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug } = req.params
    if (await isOgunApp(appSlug)) {
      await logOgunBlocked(req)
      throw new AppError('ACCESS_DENIED', 'Ogun Bridge RBAC is managed by Authentik')
    }
    const { groups, role_definition_id, priority, is_active } = req.body
    if (!Array.isArray(groups) || groups.length === 0 || !role_definition_id) {
      throw new AppError('VALIDATION_ERROR', 'groups (non-empty array) and role_definition_id are required')
    }

    const results = []
    const errors = []
    for (const group of groups) {
      try {
        const result = await pool.query(`
          INSERT INTO group_role_mappings (app_slug, authentik_group, role_definition_id, priority, is_active, updated_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, authentik_group, priority, is_active
        `, [appSlug, group, role_definition_id, priority || 0, is_active !== false, req.user?.username || 'system'])
        results.push(result.rows[0])
      } catch (error) {
        if (error.code === '23505') {
          errors.push({ group, error: 'Mapping already exists for this group' })
        } else {
          errors.push({ group, error: error.message })
        }
      }
    }

    await createAuditLog({
      action: 'rbac_mappings_bulk_created',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_mappings_bulk',
      entity_id: appSlug,
      changes: { groupCount: groups.length, created: results.length, failed: errors.length, role_definition_id },
      source: 'api',
      success: true,
    })

    logger.info('Bulk mappings created', { appSlug, created: results.length, failed: errors.length })
    return res.status(201).json({ created: results, errors, total: groups.length, successCount: results.length, errorCount: errors.length })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Bulk create mappings error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.put("/mappings/:id", requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const appSlug = await getAppSlugFromMapping(id)
    if (await isOgunApp(appSlug)) {
      await logOgunBlocked(req)
      throw new AppError('ACCESS_DENIED', 'Ogun Bridge RBAC is managed by Authentik')
    }
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

    if (result.rows.length === 0) throw new AppError('NOT_FOUND', 'Mapping not found')

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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Update mapping error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.delete("/mappings/:id", requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const appSlug = await getAppSlugFromMapping(id)
    if (await isOgunApp(appSlug)) {
      await logOgunBlocked(req)
      throw new AppError('ACCESS_DENIED', 'Ogun Bridge RBAC is managed by Authentik')
    }
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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Delete mapping error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// -- Permission resolution (core endpoint) --------------------------------

rbacRouter.post("/resolve", requireAppApiKey, async (req, res) => {
  try {
    const { sub, email, groups, appSlug } = req.body
    if (!sub || !appSlug) throw new AppError('VALIDATION_ERROR', 'sub and appSlug are required')

    const result = await resolveRole(sub, email || '', groups || [], appSlug)
    if (result.error) throw new AppError('NOT_FOUND', result.error)
    return res.json(result)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Resolve error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.get("/check", requireAppApiKey, async (req, res) => {
  try {
    const { appSlug, sub, groups, module: requiredModule, action: requiredAction } = req.query
    if (!appSlug || !sub || !requiredModule) throw new AppError('VALIDATION_ERROR', 'appSlug, sub, and module are required')

    const result = await checkPermission(sub, (groups || '').split(',').filter(Boolean), appSlug, requiredModule, requiredAction || null)
    return res.json(result)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Check permission error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// -- App users ---------------------------------------------------------------

rbacRouter.get("/users/:appSlug", requireModule('rbac', 'read'), async (req, res) => {
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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error("List app users error", { error: error.message })
    return res.status(500).json({ error: "Internal server error", code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.put("/users/:appSlug/:sub/role", requireSuperAdmin, async (req, res) => {
  try {
    const { appSlug, sub } = req.params
    if (await isOgunApp(appSlug)) {
      await logOgunBlocked(req)
      throw new AppError('ACCESS_DENIED', 'Ogun Bridge RBAC is managed by Authentik')
    }
    const { role_definition_id } = req.body

    const app = await pool.query('SELECT id FROM apps WHERE slug = $1', [appSlug])
    if (app.rows.length === 0) throw new AppError('NOT_FOUND', 'App not found')

    const perms = role_definition_id
      ? (await pool.query('SELECT module_name, actions FROM role_permissions WHERE role_definition_id = $1', [role_definition_id])).rows
      : []

    const permissionsCache = {}
    for (const p of perms) permissionsCache[p.module_name] = p.actions

    const before = await pool.query(
      'SELECT role_definition_id FROM app_users WHERE app_id = $1 AND oidc_sub = $2',
      [app.rows[0].id, sub]
    )
    const oldRoleId = before.rows[0]?.role_definition_id || null

    const isOverride = role_definition_id ? true : false
    await pool.query(`
      UPDATE app_users
      SET role_definition_id = $1, permissions_cache = $2, last_sync = NOW(), is_override = $5
      WHERE app_id = $3 AND oidc_sub = $4
    `, [role_definition_id || null, JSON.stringify(permissionsCache), app.rows[0].id, sub, isOverride])

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
    notifyRoleChange(appSlug, sub, null, oldRoleId, role_definition_id, null)
    return res.json({ success: true })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Override user role error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.post("/sync/:appSlug", requireSuperAdmin, async (req, res) => {
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

    notifyAppSync(appSlug, result)
    return res.json(result)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Sync users error', { error: error.message })
    return res.status(500).json({ error: 'Failed to sync users', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// -- Apps management ---------------------------------------------------------

rbacRouter.get("/apps", requireModule('rbac', 'read'), async (req, res) => {
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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error("List apps error", { error: error.message })
    return res.status(500).json({ error: "Internal server error", code: 'INTERNAL_ERROR', status: 500 })
  }
})



rbacRouter.post("/apps", requireSuperAdmin, async (req, res) => {
  try {
    const { name, slug, display_name, claim_name, authentik_slug, access_group, schema_endpoint, clone_from } = req.body
    if (!name || !slug || !claim_name) throw new AppError('VALIDATION_ERROR', 'name, slug, and claim_name are required')

    if (clone_from) {
      const source = await pool.query('SELECT slug FROM apps WHERE slug = $1', [clone_from])
      if (source.rows.length === 0) throw new AppError('NOT_FOUND', 'Source app not found')
    }

    const rawKey = crypto.randomBytes(24).toString('hex')
    const api_key = await bcrypt.hash(rawKey, 12)

    const result = await pool.query(`
      INSERT INTO apps (name, slug, display_name, api_key, claim_name, authentik_slug, access_group, schema_endpoint, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      RETURNING id, name, slug, display_name, authentik_slug, access_group, schema_endpoint, is_active
    `, [name, slug, display_name || name, api_key, claim_name, authentik_slug || null, access_group || null, schema_endpoint || null])

    const newApp = result.rows[0]

    if (clone_from) {
      const client = await pool.connect()
      let clonedRoleCount = 0
      try {
        await client.query('BEGIN')

        const sourceRoles = await client.query(
          'SELECT id, name, display_name, description, base_role, is_default, is_active FROM role_definitions WHERE app_slug = $1',
          [clone_from]
        )

        const roleIdMap = {}
        for (const role of sourceRoles.rows) {
          const newRole = await client.query(`
            INSERT INTO role_definitions (app_slug, name, display_name, description, base_role, is_default, is_active, updated_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
          `, [slug, role.name, role.display_name, role.description, role.base_role, role.is_default, role.is_active, req.user?.username || 'system'])
          roleIdMap[role.id] = newRole.rows[0].id
        }
        clonedRoleCount = sourceRoles.rows.length

        for (const [oldId, newId] of Object.entries(roleIdMap)) {
          const perms = await client.query(
            'SELECT module_name, actions FROM role_permissions WHERE role_definition_id = $1',
            [oldId]
          )
          for (const perm of perms.rows) {
            await client.query(
              'INSERT INTO role_permissions (role_definition_id, module_name, actions) VALUES ($1, $2, $3)',
              [newId, perm.module_name, perm.actions]
            )
          }
        }

        const sourceMappings = await client.query(
          'SELECT authentik_group, role_definition_id, priority, is_active FROM group_role_mappings WHERE app_slug = $1',
          [clone_from]
        )
        for (const mapping of sourceMappings.rows) {
          const newRoleId = roleIdMap[mapping.role_definition_id]
          if (newRoleId) {
            await client.query(
              'INSERT INTO group_role_mappings (app_slug, authentik_group, role_definition_id, priority, is_active, updated_by) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (app_slug, authentik_group) DO NOTHING',
              [slug, mapping.authentik_group, newRoleId, mapping.priority, mapping.is_active, req.user?.username || 'system']
            )
          }
        }

        const sourceSchema = await client.query(
          'SELECT modules, source FROM app_schemas WHERE app_slug = $1',
          [clone_from]
        )
        if (sourceSchema.rows.length > 0) {
          await client.query(`
            INSERT INTO app_schemas (app_slug, modules, source, last_synced, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
            ON CONFLICT (app_slug) DO NOTHING
          `, [slug, sourceSchema.rows[0].modules, sourceSchema.rows[0].source])
        }

        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }

      await createAuditLog({
        action: 'rbac_app_cloned',
        actor: req.user?.username || 'system',
        entity_type: 'rbac_app',
        entity_id: slug,
        changes: { cloned_from: clone_from, roleCount: clonedRoleCount },
        source: 'api',
        success: true,
      })
    }

    await createAuditLog({
      action: 'rbac_app_created',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_app',
      entity_id: slug,
      changes: { name, slug, display_name, claim_name, authentik_slug, access_group, cloned_from: clone_from || null },
      source: 'api',
      success: true,
    })

    logger.info('App created', { slug, name, clonedFrom: clone_from || null })
    return res.status(201).json({ ...newApp, api_key: rawKey })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    if (error.code === '23505') return res.status(409).json({ error: 'An app with this slug already exists', code: 'CONFLICT', status: 409 })
    logger.error('Create app error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

rbacRouter.put("/apps/:slug", requireSuperAdmin, async (req, res) => {
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

    if (result.rows.length === 0) throw new AppError('NOT_FOUND', 'App not found')

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
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Update app error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// -- API key rotation -------------------------------------------------------

rbacRouter.post("/apps/:slug/rotate-key", requireSuperAdmin, async (req, res) => {
  try {
    const { slug } = req.params
    const app = await pool.query('SELECT id FROM apps WHERE slug = $1', [slug])
    if (app.rows.length === 0) throw new AppError('NOT_FOUND', 'App not found')

    const rawKey = crypto.randomBytes(24).toString('hex')
    const api_key = await bcrypt.hash(rawKey, 12)

    await pool.query('UPDATE apps SET api_key = $1, updated_at = NOW() WHERE slug = $2', [api_key, slug])

    await createAuditLog({
      action: 'rbac_api_key_rotated',
      actor: req.user?.username || 'system',
      entity_type: 'rbac_app',
      entity_id: slug,
      changes: { key_rotated: true },
      source: 'api',
      success: true,
    })

    logger.info('API key rotated', { slug, by: req.user?.username })
    return res.json({ success: true, api_key: rawKey })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Rotate API key error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// -- Authentik proxy -------------------------------------------------------

rbacRouter.get("/authentik-groups", requireModule('rbac', 'read'), async (req, res) => {
  try {
    const groups = await getAuthentikGroups()
    return res.json(groups)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error("Fetch Authentik groups error", { error: error.message })
    return res.status(502).json({ error: 'Failed to fetch Authentik groups', code: 'DEPENDENCY_FAILURE', status: 502 })
  }
})

// -- Base roles (read-only) ------------------------------------------------

rbacRouter.get("/base-roles", requireModule('rbac', 'read'), async (req, res) => {
  try {
    const roles = await pool.query('SELECT id, name, display_name, priority, description FROM base_roles ORDER BY priority DESC')
    return res.json(roles.rows)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('List base roles error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 })
  }
})
