import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'

export async function requireAppApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key']
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-Api-Key header' })
  }

  try {
    const result = await pool.query(
      'SELECT id, name, slug, claim_name, role_mapping FROM apps WHERE api_key = $1',
      [apiKey]
    )
    if (result.rows.length === 0) {
      logger.warn('[SECURITY] Invalid API key attempt', { ip: req.ip, userAgent: req.headers['user-agent'] })
      return res.status(401).json({ error: 'Invalid API key' })
    }

    req.app = result.rows[0]
    next()
  } catch (error) {
    logger.error('API key validation error', { error: error.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function requireSuperAdmin(req, res, next) {
  const user = req.session?.user
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' })
  }
  next()
}
