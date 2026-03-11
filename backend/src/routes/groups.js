import express from 'express'
import { authentikClient } from '../services/authentikClient.js'
import { ldapClient } from '../services/ldapClient.js'
import { logger } from '../utils/logger.js'
import { authenticate } from '../middleware/auth.js'

export const groupsRouter = express.Router()

groupsRouter.use(authenticate)

groupsRouter.get('/', async (req, res) => {
  try {
    const { search, status } = req.query
    
    const authentikGroups = await authentikClient.getGroups({ search })
    const ldapGroups = await ldapClient.getGroups()
    
    const ldapMap = new Map(ldapGroups.map(g => [g.cn, g]))
    
    const groups = authentikGroups.map(aGroup => {
      const lGroup = ldapMap.get(aGroup.name)
      
      let syncStatus = 'not_synced'
      let error = null
      
      if (lGroup) {
        syncStatus = 'synced'
      }
      
      return {
        id: aGroup.pk,
        name: aGroup.name,
        description: aGroup.description || '',
        syncStatus,
        error,
        lastSynced: lGroup ? new Date().toISOString() : null,
      }
    })
    
    const filtered = (status && status !== 'all')
      ? groups.filter(g => g.syncStatus === status)
      : groups

    res.json(filtered)
  } catch (error) {
    logger.error('Error fetching groups:', error)
    res.status(500).json({ error: error.message })
  }
})

groupsRouter.get('/:id/compare', async (req, res) => {
  try {
    const aGroup = await authentikClient.getGroup(req.params.id)
    const lGroup = await ldapClient.getGroup(aGroup.name)
    
    const differences = {}
    
    if (lGroup) {
      if (aGroup.description !== lGroup.description) {
        differences.description = {
          authentik: aGroup.description,
          ldap: lGroup.description,
        }
      }
    }
    
    res.json({
      authentik: {
        name: aGroup.name,
        description: aGroup.description,
        users_count: aGroup.users_count,
      },
      ldap: lGroup ? {
        cn: lGroup.cn,
        description: lGroup.description,
        member: lGroup.member,
      } : null,
      differences,
    })
  } catch (error) {
    logger.error('Error comparing group:', error)
    res.status(500).json({ error: error.message })
  }
})
