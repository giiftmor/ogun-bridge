import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'
import { authentikClient } from '../services/authentikClient.js'

export const schemaRouter = express.Router()

schemaRouter.use(authenticate)

schemaRouter.get('/mappings', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM field_mappings ORDER BY sort_order'
    )
    res.json(result.rows)
  } catch (error) {
    logger.error('Failed to get field mappings:', error)
    res.status(500).json({ error: 'Failed to get field mappings' })
  }
})

schemaRouter.put('/mappings', async (req, res) => {
  try {
    const mappings = req.body
    if (!Array.isArray(mappings)) {
      return res.status(400).json({ error: 'Body must be an array of mappings' })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      for (const mapping of mappings) {
        if (!mapping.authentik_field || !mapping.ldap_attribute) {
          await client.query('ROLLBACK')
          return res.status(400).json({
            error: 'Each mapping must have authentik_field and ldap_attribute',
          })
        }

        await client.query(
          `INSERT INTO field_mappings (authentik_field, ldap_attribute, is_required, is_locked, transformation, description, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (authentik_field)
           DO UPDATE SET
             ldap_attribute = EXCLUDED.ldap_attribute,
             transformation = EXCLUDED.transformation,
             description = EXCLUDED.description,
             sort_order = EXCLUDED.sort_order,
             updated_at = CURRENT_TIMESTAMP`,
          [
            mapping.authentik_field,
            mapping.ldap_attribute,
            mapping.is_required || false,
            mapping.is_locked || false,
            mapping.transformation || null,
            mapping.description || null,
            mapping.sort_order || 0,
          ]
        )
      }

      await client.query('COMMIT')
      const result = await pool.query('SELECT * FROM field_mappings ORDER BY sort_order')
      res.json({ success: true, mappings: result.rows })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    logger.error('Failed to update field mappings:', error)
    res.status(500).json({ error: 'Failed to update field mappings' })
  }
})

schemaRouter.post('/test', async (req, res) => {
  try {
    const { userId, mappings } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    let aUser
    try {
      const isNumeric = /^\d+$/.test(userId)
      aUser = isNumeric
        ? await authentikClient.getUser(userId)
        : await authentikClient.getUserByUsername(userId)
    } catch (e) {
      return res.status(404).json({ error: 'User not found in Authentik: ' + e.message })
    }

    const ldapResult = {}
    const validations = []

    const fieldList = Array.isArray(mappings) && mappings.length > 0
      ? mappings
      : (await pool.query('SELECT * FROM field_mappings ORDER BY sort_order')).rows

    for (const mapping of fieldList) {
      let value = aUser[mapping.authentik_field]
        ?? aUser.attributes?.[mapping.authentik_field]
        ?? null

      if (value === null && mapping.transformation) {
        const fields = mapping.transformation.match(/[\w.]+/g) || []
        const parts = fields.map(f => aUser[f] ?? aUser.attributes?.[f] ?? '')
        value = parts.join(' ').trim() || null
      }

      ldapResult[mapping.ldap_attribute] = value

      if (mapping.is_required && (value === null || value === '')) {
        validations.push({
          field: mapping.authentik_field,
          ldapAttribute: mapping.ldap_attribute,
          status: 'fail',
          message: `Required field "${mapping.authentik_field}" has no value`,
        })
      } else {
        validations.push({
          field: mapping.authentik_field,
          ldapAttribute: mapping.ldap_attribute,
          status: 'pass',
          value,
        })
      }
    }

    res.json({
      success: true,
      source: {
        username: aUser.username,
        name: aUser.name,
        email: aUser.email,
        attributes: aUser.attributes || {},
      },
      generated: ldapResult,
      validations,
    })
  } catch (error) {
    logger.error('Failed to test mapping:', error)
    res.status(500).json({ error: 'Failed to test mapping: ' + error.message })
  }
})

schemaRouter.post('/validate', async (req, res) => {
  try {
    const { mapping } = req.body
    if (!mapping || !mapping.authentik_field || !mapping.ldap_attribute) {
      return res.status(400).json({
        error: 'Mapping must have authentik_field and ldap_attribute',
      })
    }

    const existing = await pool.query(
      'SELECT id FROM field_mappings WHERE ldap_attribute = $1 AND authentik_field != $2',
      [mapping.ldap_attribute, mapping.authentik_field]
    )

    res.json({
      valid: existing.rows.length === 0,
      conflict: existing.rows[0] || null,
      message: existing.rows.length > 0
        ? `LDAP attribute "${mapping.ldap_attribute}" already mapped to another field`
        : null,
    })
  } catch (error) {
    logger.error('Failed to validate mapping:', error)
    res.status(500).json({ error: 'Failed to validate mapping' })
  }
})
