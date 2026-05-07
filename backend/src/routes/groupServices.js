import express from 'express'
import { pool } from '../lib/db.js'
import { authentikClient } from '../services/authentikClient.js'
import { logger } from '../utils/logger.js'
import { authenticate } from '../middleware/auth.js'

export const groupServicesRouter = express.Router()

groupServicesRouter.use(authenticate)

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
    logger.error('Error fetching group services:', error)
    res.status(500).json({ error: error.message })
  }
})

groupServicesRouter.post('/:id/services', async (req, res) => {
  try {
    const { id } = req.params
    const { service_name, service_url, service_type, description, icon, is_public } = req.body

    if (!service_name) {
      return res.status(400).json({ error: 'service_name is required' })
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
    logger.error('Error adding group service:', error)
    res.status(500).json({ error: error.message })
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
      return res.status(404).json({ error: 'Service not found' })
    }

    const serviceName = result.rows[0].service_name

    const updatedServices = { ...aGroup.attributes?.services }
    delete updatedServices[serviceName]

    await authentikClient.updateGroupAttributes(id, { services: updatedServices })

    res.json({ success: true })
  } catch (error) {
    logger.error('Error removing group service:', error)
    res.status(500).json({ error: error.message })
  }
})
