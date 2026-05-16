import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'

export async function createAuditLog(entry) {
  const client = await pool.connect()
  
  try {
    const result = await client.query(
      `INSERT INTO audit_log (action, actor, entity_type, entity_id, changes, source, ip_address, success, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        entry.action,
        entry.actor || 'system',
        entry.entity_type,
        entry.entity_id,
        JSON.stringify(entry.changes || {}),
        entry.source || 'api',
        entry.ip_address || null,
        entry.success !== false,
        entry.error_message || null,
      ]
    )
    
    return result.rows[0]
  } catch (error) {
    logger.error('Failed to create audit log:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function getAuditLogs(filters = {}) {
  const client = await pool.connect()
  
  try {
    let query = 'SELECT * FROM audit_log WHERE 1=1'
    const params = []
    let paramCount = 1

    if (filters.action) {
      query += ` AND action = $${paramCount}`
      params.push(filters.action)
      paramCount++
    }

    if (filters.entity_type) {
      query += ` AND entity_type = $${paramCount}`
      params.push(filters.entity_type)
      paramCount++
    }

    if (filters.actor) {
      query += ` AND actor = $${paramCount}`
      params.push(filters.actor)
      paramCount++
    }

    if (filters.start_date) {
      query += ` AND timestamp >= $${paramCount}`
      params.push(filters.start_date)
      paramCount++
    }

    if (filters.end_date) {
      query += ` AND timestamp <= $${paramCount}`
      params.push(filters.end_date)
      paramCount++
    }

    if (filters.search) {
      query += ` AND (entity_id ILIKE $${paramCount} OR actor ILIKE $${paramCount + 1})`
      params.push(`%${filters.search}%`, `%${filters.search}%`)
      paramCount += 2
    }

    query += ' ORDER BY timestamp DESC'

    if (filters.limit) {
      query += ` LIMIT $${paramCount}`
      params.push(filters.limit)
    }

    const result = await client.query(query, params)

    return result.rows.map(row => ({
      ...row,
      changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes,
    }))
  } catch (error) {
    logger.error('Failed to get audit logs:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function getAuditStats() {
  const client = await pool.connect()
  
  try {
    const total = await client.query('SELECT COUNT(*) as count FROM audit_log')
    const byAction = await client.query(
      `SELECT action, COUNT(*) as count FROM audit_log GROUP BY action ORDER BY count DESC`
    )
    const byEntity = await client.query(
      `SELECT entity_type, COUNT(*) as count FROM audit_log GROUP BY entity_type ORDER BY count DESC`
    )
    const recent = await client.query(
      `SELECT action, timestamp FROM audit_log ORDER BY timestamp DESC LIMIT 5`
    )

    return {
      total: parseInt(total.rows[0].count),
      byAction: byAction.rows,
      byEntity: byEntity.rows,
      recent: recent.rows,
    }
  } catch (error) {
    logger.error('Failed to get audit stats:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function getLastAuditLogByAction(entityId, action) {
  const client = await pool.connect()
  
  try {
    const result = await client.query(
      `SELECT * FROM audit_log 
       WHERE entity_id = $1 AND action = $2 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [entityId, action]
    )
    
    return result.rows[0] || null
  } catch (error) {
    logger.error('Failed to get last audit log:', error)
    throw error
  } finally {
    client.release()
  }
}

const PASSWORD_ACTIONS = [
  'password_invite_sent',
  'password_force_reset',
  'password_changed',
  'password_reset'
]

export async function getLastPasswordAction(entityId) {
  const client = await pool.connect()
  
  try {
    const placeholders = PASSWORD_ACTIONS.map((_, i) => `$${i + 2}`).join(', ')
    const result = await client.query(
      `SELECT * FROM audit_log 
       WHERE entity_id = $1 AND action IN (${placeholders})
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [entityId, ...PASSWORD_ACTIONS]
    )
    
    return result.rows[0] || null
  } catch (error) {
    logger.error('Failed to get last password action:', error)
    throw error
  } finally {
    client.release()
  }
}
