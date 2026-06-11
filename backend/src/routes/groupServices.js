import express from 'express'
import { pool } from '../lib/db.js'
import { authentikClient } from '../services/authentikClient.js'
import { logger } from '../utils/logger.js'
import { AppError } from '../utils/AppError.js'
import { authenticate } from '../middleware/auth.js'

export const groupServicesRouter = express.Router()

groupServicesRouter.use(authenticate)

groupServicesRouter.get('/services', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gs.service_name, gs.service_url, gs.service_type,
              gs.description, gs.icon, gs.is_public,
              array_agg(gs.group_name) as groups,
              COUNT(*) OVER() as total_count
       FROM group_services gs
       WHERE gs.is_active = true
       GROUP BY gs.service_name, gs.service_url, gs.service_type,
                gs.description, gs.icon, gs.is_public
       ORDER BY gs.service_name`
    )
    res.json(result.rows)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error fetching services list:', error)
    res.status(500).json({ error: 'Failed to fetch services list', code: 'INTERNAL_ERROR', status: 500 })
  }
})

groupServicesRouter.post('/add-user/:username', async (req, res) => {
  try {
    const { username } = req.params
    const { group_name } = req.body

    if (!group_name) {
      throw new AppError('VALIDATION_ERROR', 'group_name is required')
    }

    const aUser = await authentikClient.getUserByUsername(username)
    if (!aUser) {
      throw new AppError('NOT_FOUND', 'User not found in Authentik')
    }

    const groups = await authentikClient.getGroups()
    const targetGroup = groups.find(g => g.name === group_name)
    if (!targetGroup) {
      throw new AppError('NOT_FOUND', 'Group not found in Authentik')
    }

    const currentUsers = targetGroup.users || []
    if (currentUsers.includes(aUser.pk)) {
      return res.json({ success: true, message: 'User is already a member of this group', alreadyMember: true })
    }

    await authentikClient.addUserToGroup(targetGroup.pk, aUser.username)

    logger.info(`User ${username} added to group ${group_name}`)
    res.json({ success: true, message: `User added to group ${group_name}` })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error adding user to group:', error)
    res.status(500).json({ error: 'Failed to add user to group', code: 'INTERNAL_ERROR', status: 500 })
  }
})

groupServicesRouter.post('/services/:serviceName/assign-group', async (req, res) => {
  try {
    const { serviceName } = req.params
    const { group_id } = req.body

    if (!group_id) {
      throw new AppError('VALIDATION_ERROR', 'group_id is required')
    }

    const aGroup = await authentikClient.getGroup(group_id)

    const existing = await pool.query(
      `SELECT * FROM group_services WHERE service_name = $1 LIMIT 1`,
      [serviceName]
    )

    if (existing.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Service not found')
    }

    const tmpl = existing.rows[0]

    await pool.query(
      `INSERT INTO group_services (group_name, service_name, service_url, service_type, description, icon, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (group_name, service_name) DO UPDATE SET
         service_url = $3, service_type = $4, description = $5,
         icon = COALESCE($6, group_services.icon),
         is_public = COALESCE($7, group_services.is_public),
         updated_at = CURRENT_TIMESTAMP`,
      [aGroup.name, serviceName, tmpl.service_url, tmpl.service_type, tmpl.description, tmpl.icon || 'default', tmpl.is_public ?? false]
    )

    await authentikClient.updateGroupAttributes(group_id, {
      services: {
        ...aGroup.attributes?.services,
        [serviceName]: { url: tmpl.service_url, type: tmpl.service_type, description: tmpl.description, icon: tmpl.icon, is_public: tmpl.is_public }
      }
    })

    res.json({ success: true, message: `Service assigned to ${aGroup.name}` })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error assigning service to group:', error)
    res.status(500).json({ error: 'Failed to assign service to group', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Update service metadata globally — updates ALL group_services rows + Authentik group attributes
groupServicesRouter.put('/services/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params
    const { service_url, service_type, description, icon, is_public } = req.body

    const client = await pool.connect()

    const result = await client.query(
      `UPDATE group_services
       SET service_url = COALESCE($1, service_url),
           service_type = COALESCE($2, service_type),
           description = COALESCE($3, description),
           icon = COALESCE($4, icon),
           is_public = COALESCE($5, is_public),
           updated_at = CURRENT_TIMESTAMP
       WHERE service_name = $6
       RETURNING *`,
      [service_url, service_type, description, icon, is_public, serviceName]
    )

    client.release()

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Service not found')
    }

    // Also update Authentik group attributes for all groups with this service
    try {
      const groupsWithService = await pool.query(
        'SELECT DISTINCT group_name FROM group_services WHERE service_name = $1',
        [serviceName]
      )
      for (const row of groupsWithService.rows) {
        const groups = await authentikClient.getGroups({ search: row.group_name })
        for (const g of groups) {
          if (g.name === row.group_name) {
            const attrs = g.attributes || {}
            if (attrs.services?.[serviceName]) {
              attrs.services[serviceName] = {
                ...attrs.services[serviceName],
                url: service_url || attrs.services[serviceName].url,
                type: service_type || attrs.services[serviceName].type,
                description: description || attrs.services[serviceName].description,
                icon: icon || attrs.services[serviceName].icon,
              }
              await authentikClient.updateGroupAttributes(g.pk, { services: attrs.services })
            }
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to update Authentik attributes for service:', err.message)
    }

    res.json({ success: true, message: 'Service updated globally', updated: result.rows.length })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error updating service:', error)
    res.status(500).json({ error: 'Failed to update service', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// Delete service globally — removes ALL group_services rows + cleans up Authentik attributes
groupServicesRouter.delete('/services/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params

    // Get affected groups before deletion
    const affectedGroups = await pool.query(
      'SELECT DISTINCT group_name FROM group_services WHERE service_name = $1',
      [serviceName]
    )

    const client = await pool.connect()

    const result = await client.query(
      'DELETE FROM group_services WHERE service_name = $1 RETURNING id',
      [serviceName]
    )

    client.release()

    // Clean up Authentik attributes
    for (const row of affectedGroups.rows) {
      try {
        const groups = await authentikClient.getGroups({ search: row.group_name })
        for (const g of groups) {
          if (g.name === row.group_name) {
            const attrs = g.attributes || {}
            if (attrs.services?.[serviceName]) {
              delete attrs.services[serviceName]
              await authentikClient.updateGroupAttributes(g.pk, { services: attrs.services })
            }
          }
        }
      } catch (err) {
        logger.warn(`Failed to clean up Authentik attributes for ${row.group_name}:`, err.message)
      }
    }

    res.json({ success: true, message: 'Service deleted globally', deleted: result.rows.length })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error deleting service:', error)
    res.status(500).json({ error: 'Failed to delete service', code: 'INTERNAL_ERROR', status: 500 })
  }
})

groupServicesRouter.delete('/services/:serviceName/unassign-group/:groupName', async (req, res) => {
  try {
    const { serviceName, groupName } = req.params

    const result = await pool.query(
      'DELETE FROM group_services WHERE service_name = $1 AND group_name = $2 RETURNING id',
      [serviceName, groupName]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Assignment not found')
    }

    res.json({ success: true, message: 'Service unassigned from group' })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error unassigning service from group:', error)
    res.status(500).json({ error: 'Failed to unassign service from group', code: 'INTERNAL_ERROR', status: 500 })
  }
})

groupServicesRouter.get('/:id/services', async (req, res) => {
  try {
    const { id } = req.params

    const aGroup = await authentikClient.getGroup(id)

    const client = await pool.connect()
    const result = await client.query(
      'SELECT * FROM group_services WHERE group_name = $1 ORDER BY service_name',
      [aGroup.name]
    )
    client.release()

    res.json(result.rows)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error fetching group services:', error)
    res.status(500).json({ error: 'Failed to fetch group services', code: 'INTERNAL_ERROR', status: 500 })
  }
})

groupServicesRouter.post('/:id/services', async (req, res) => {
  try {
    const { id } = req.params
    const { service_name, service_url, service_type, description, icon, is_public } = req.body

    if (!service_name) {
      throw new AppError('VALIDATION_ERROR', 'service_name is required')
    }

    const aGroup = await authentikClient.getGroup(id)

    const client = await pool.connect()

    await client.query(
      `INSERT INTO group_services (group_name, service_name, service_url, service_type, description, icon, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (group_name, service_name) DO UPDATE SET
         service_url = $3,
         service_type = $4,
         description = $5,
         icon = COALESCE($6, group_services.icon),
         is_public = COALESCE($7, group_services.is_public),
         updated_at = CURRENT_TIMESTAMP`,
      [aGroup.name, service_name, service_url, service_type, description, icon || 'default', is_public ?? false]
    )

    client.release()

    await authentikClient.updateGroupAttributes(id, {
      services: {
        ...aGroup.attributes?.services,
        [service_name]: { url: service_url, type: service_type, description, icon, is_public }
      }
    })

    res.json({ success: true, service_name })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error adding group service:', error)
    res.status(500).json({ error: 'Failed to add group service', code: 'INTERNAL_ERROR', status: 500 })
  }
})

groupServicesRouter.delete('/:id/services/:serviceId', async (req, res) => {
  try {
    const { id, serviceId } = req.params

    const aGroup = await authentikClient.getGroup(id)

    const client = await pool.connect()

    const result = await client.query(
      'DELETE FROM group_services WHERE id = $1 AND group_name = $2 RETURNING service_name',
      [serviceId, aGroup.name]
    )

    client.release()

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Service not found')
    }

    const serviceName = result.rows[0].service_name

    const updatedServices = { ...aGroup.attributes?.services }
    delete updatedServices[serviceName]

    await authentikClient.updateGroupAttributes(id, { services: updatedServices })

    res.json({ success: true })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Error removing group service:', error)
    res.status(500).json({ error: 'Failed to remove group service', code: 'INTERNAL_ERROR', status: 500 })
  }
})

// ── Service Health Check ────────────────────────────────────────────────

function isInternalUrl(url) {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname
    // Block localhost, private IPs, and common internal hostnames
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
      return true
    }
    return false
  } catch {
    return true // Invalid URLs are treated as internal (blocked)
  }
}

groupServicesRouter.post('/health/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params

    // Look up service URL from DB
    const result = await pool.query(
      'SELECT DISTINCT service_url, service_name FROM group_services WHERE service_name = $1 AND is_active = true LIMIT 1',
      [serviceName]
    )

    if (result.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Service not found')
    }

    const serviceUrl = result.rows[0].service_url
    if (!serviceUrl) {
      return res.json({ serviceName, status: 'unknown', url: null, responseTime: null, error: 'No URL configured' })
    }

    // SSRF protection
    if (isInternalUrl(serviceUrl)) {
      throw new AppError('VALIDATION_ERROR', 'Internal URLs cannot be health checked')
    }

    const start = Date.now()
    let status = 'offline'
    let error = null
    let responseTime = null

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(serviceUrl, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      })

      clearTimeout(timeout)
      responseTime = Date.now() - start

      // 2xx and 3xx are considered online
      if (response.status < 400) {
        status = 'online'
      } else if (response.status >= 500) {
        status = 'error'
        error = `HTTP ${response.status}`
      } else {
        status = 'online' // 4xx means the server is up, just unauthorized
      }
    } catch (fetchErr) {
      responseTime = Date.now() - start
      if (fetchErr.name === 'AbortError') {
        error = 'Timeout after 10s'
      } else {
        error = fetchErr.message
      }
    }

    res.json({
      serviceName,
      status,
      url: serviceUrl,
      responseTime,
      error,
      checkedAt: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, code: err.code, status: err.status })
    }
    logger.error('Service health check error', { error: err.message, serviceName: req.params.serviceName })
    res.status(500).json({ error: 'Health check failed', code: 'INTERNAL_ERROR', status: 500 })
  }
})
