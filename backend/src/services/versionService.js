import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'

export async function createSnapshot(entityType, entityId, snapshotData, createdBy, description) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const versionResult = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version 
       FROM versions 
       WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId]
    )
    const nextVersion = versionResult.rows[0].next_version

    await client.query(
      `INSERT INTO versions (entity_type, entity_id, version_number, snapshot_data, created_by, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entityType, entityId, nextVersion, JSON.stringify(snapshotData), createdBy, description]
    )

    await client.query('COMMIT')
    logger.info(`Created snapshot v${nextVersion} for ${entityType}:${entityId}`)
    return { version: nextVersion, id: entityId }
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error('Failed to create snapshot:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function getVersionHistory(entityType, entityId, limit = 20) {
  const result = await pool.query(
    `SELECT id, entity_type, entity_id, version_number, snapshot_data, created_at, created_by, description
     FROM versions 
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY version_number DESC
     LIMIT $3`,
    [entityType, entityId, limit]
  )
  return result.rows
}

export async function getVersion(entityType, entityId, versionNumber) {
  const result = await pool.query(
    `SELECT id, entity_type, entity_id, version_number, snapshot_data, created_at, created_by, description
     FROM versions 
     WHERE entity_type = $1 AND entity_id = $2 AND version_number = $3`,
    [entityType, entityId, versionNumber]
  )
  return result.rows[0] || null
}

export async function getLatestVersion(entityType, entityId) {
  const result = await pool.query(
    `SELECT id, entity_type, entity_id, version_number, snapshot_data, created_at, created_by, description
     FROM versions 
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY version_number DESC
     LIMIT 1`,
    [entityType, entityId]
  )
  return result.rows[0] || null
}

export async function deleteOldVersions(entityType, entityId, keepCount = 50) {
  const result = await pool.query(
    `DELETE FROM versions 
     WHERE entity_type = $1 AND entity_id = $2 
     AND id NOT IN (
       SELECT id FROM versions 
       WHERE entity_type = $1 AND entity_id = $2 
       ORDER BY version_number DESC 
       LIMIT $3
     )`,
    [entityType, entityId, keepCount]
  )
  return result.rowCount
}

export async function getAllEntitiesWithVersions() {
  const result = await pool.query(
    `SELECT entity_type, entity_id, MAX(version_number) as latest_version, 
            MAX(created_at) as last_snapshot
     FROM versions 
     GROUP BY entity_type, entity_id
     ORDER BY last_snapshot DESC`
  )
  return result.rows
}

export async function getVersionCount(entityType, entityId) {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM versions WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, entityId]
  )
  return parseInt(result.rows[0].count)
}
