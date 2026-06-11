import express from 'express'
import { pool } from '../lib/db.js'
import { authentikClient } from '../services/authentikClient.js'
import { logger } from '../utils/logger.js'
import { authenticate } from '../middleware/auth.js'
import { AppError } from '../utils/AppError.js'

export const searchRouter = express.Router()

searchRouter.use(authenticate)

searchRouter.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (!q) return res.json({ users: [], groups: [], services: [] })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const [usersResult, groupsResult, servicesResult] = await Promise.allSettled([
      authentikClient.getUsers({ search: q, page_size: '8' }),
      authentikClient.getGroups({ search: q, page_size: '8' }),
      pool.query(
        `SELECT DISTINCT service_name, service_url, service_type, description, icon
         FROM group_services
         WHERE service_name ILIKE $1 OR description ILIKE $1
         LIMIT 8`,
        [`%${q}%`]
      ),
    ])

    clearTimeout(timeout)

    const users = usersResult.status === 'fulfilled'
      ? usersResult.value.map(u => ({
          id: u.pk,
          username: u.username,
          name: u.name,
          email: u.email,
          _type: 'user',
        }))
      : []

    const groups = groupsResult.status === 'fulfilled'
      ? groupsResult.value.map(g => ({
          id: g.pk,
          name: g.name,
          description: g.description,
          _type: 'group',
        }))
      : []

    const services = servicesResult.status === 'fulfilled'
      ? servicesResult.value.rows.map(s => ({
          service_name: s.service_name,
          service_url: s.service_url,
          service_type: s.service_type,
          description: s.description,
          _type: 'service',
        }))
      : []

    res.json({ users, groups, services })
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, status: error.status })
    }
    logger.error('Search error:', error)
    res.status(500).json({ error: 'Failed to perform search', code: 'INTERNAL_ERROR', status: 500 })
  }
})
