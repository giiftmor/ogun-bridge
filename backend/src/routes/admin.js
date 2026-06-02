import express from 'express'
import { pool } from '../lib/db.js'
import { requireSuperAdmin } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'

export const adminRouter = express.Router()

adminRouter.use(requireSuperAdmin)

// ── Apps CRUD ───────────────────────────────────────────────────────────

adminRouter.get('/apps', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, slug, claim_name, role_mapping, created_at FROM apps ORDER BY name')
    return res.json(result.rows)
  } catch (error) {
    logger.error('Admin list apps error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

adminRouter.post('/apps', async (req, res) => {
  try {
    const { name, slug, claimName, apiKey, roleMapping } = req.body
    if (!name || !slug || !claimName) {
      return res.status(400).json({ error: 'name, slug, and claimName are required' })
    }
    const result = await pool.query(
      `INSERT INTO apps (name, slug, claim_name, api_key, role_mapping)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, slug, claim_name, created_at`,
      [name, slug, claimName, apiKey || null, roleMapping ? JSON.stringify(roleMapping) : null]
    )
    return res.status(201).json(result.rows[0])
  } catch (error) {
    logger.error('Admin create app error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

adminRouter.put('/apps/:id', async (req, res) => {
  try {
    const { name, slug, claimName, apiKey, roleMapping } = req.body
    const result = await pool.query(
      `UPDATE apps SET name = COALESCE($1, name), slug = COALESCE($2, slug),
       claim_name = COALESCE($3, claim_name), api_key = COALESCE($4, api_key),
       role_mapping = COALESCE($5::jsonb, role_mapping), updated_at = NOW()
       WHERE id = $6 RETURNING id, name, slug, claim_name, created_at`,
      [name || null, slug || null, claimName || null, apiKey || null, roleMapping ? JSON.stringify(roleMapping) : null, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'App not found' })
    return res.json(result.rows[0])
  } catch (error) {
    logger.error('Admin update app error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

adminRouter.delete('/apps/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM apps WHERE id = $1 RETURNING id', [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'App not found' })
    return res.json({ deleted: true, id: result.rows[0].id })
  } catch (error) {
    logger.error('Admin delete app error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Business Roles CRUD ─────────────────────────────────────────────────

adminRouter.get('/business-roles', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, display_name, base_role, modules, created_at FROM business_roles ORDER BY name'
    )
    return res.json(result.rows.map(r => ({
      ...r,
      modules: typeof r.modules === 'string' ? JSON.parse(r.modules) : r.modules,
    })))
  } catch (error) {
    logger.error('Admin list business roles error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

adminRouter.post('/business-roles', async (req, res) => {
  try {
    const { name, displayName, baseRole, modules } = req.body
    if (!name || !displayName || !baseRole) {
      return res.status(400).json({ error: 'name, displayName, and baseRole are required' })
    }
    const result = await pool.query(
      `INSERT INTO business_roles (name, display_name, base_role, modules)
       VALUES ($1, $2, $3, $4) RETURNING id, name, display_name, base_role, modules, created_at`,
      [name, displayName, baseRole, modules ? JSON.stringify(modules) : null]
    )
    const row = result.rows[0]
    return res.status(201).json({
      ...row,
      modules: typeof row.modules === 'string' ? JSON.parse(row.modules) : row.modules,
    })
  } catch (error) {
    logger.error('Admin create business role error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

adminRouter.put('/business-roles/:id', async (req, res) => {
  try {
    const { name, displayName, baseRole, modules } = req.body
    const result = await pool.query(
      `UPDATE business_roles SET name = COALESCE($1, name),
       display_name = COALESCE($2, display_name),
       base_role = COALESCE($3, base_role),
       modules = COALESCE($4::jsonb, modules),
       updated_at = NOW()
       WHERE id = $5 RETURNING id, name, display_name, base_role, modules, created_at`,
      [name || null, displayName || null, baseRole || null, modules ? JSON.stringify(modules) : null, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Business role not found' })
    const row = result.rows[0]
    return res.json({
      ...row,
      modules: typeof row.modules === 'string' ? JSON.parse(row.modules) : row.modules,
    })
  } catch (error) {
    logger.error('Admin update business role error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

adminRouter.delete('/business-roles/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM business_roles WHERE id = $1 RETURNING id', [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Business role not found' })
    return res.json({ deleted: true, id: result.rows[0].id })
  } catch (error) {
    logger.error('Admin delete business role error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── App Users (read-only list) ──────────────────────────────────────────

adminRouter.get('/app-users', async (req, res) => {
  try {
    const { appId } = req.query
    let query = `
      SELECT au.id, au.app_id, a.name AS app_name, au.oidc_sub, au.base_role,
             au.business_role_id, br.name AS business_role_name, au.last_auth, au.created_at
      FROM app_users au
      JOIN apps a ON a.id = au.app_id
      LEFT JOIN business_roles br ON br.id = au.business_role_id
    `
    const params = []
    if (appId) {
      query += ' WHERE au.app_id = $1'
      params.push(appId)
    }
    query += ' ORDER BY au.last_auth DESC NULLS LAST'
    const result = await pool.query(query, params)
    return res.json(result.rows)
  } catch (error) {
    logger.error('Admin list app users error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})
