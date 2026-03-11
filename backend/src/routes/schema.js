import express from 'express'
import { authenticate } from '../middleware/auth.js'

export const schemaRouter = express.Router()

schemaRouter.use(authenticate)

schemaRouter.get('/mappings', async (req, res) => {
  // Return current mappings
  res.json({
    mappings: [
      { authentikField: 'username', ldapAttribute: 'uid', required: true },
      { authentikField: 'email', ldapAttribute: 'mail', required: true },
      { authentikField: 'name', ldapAttribute: 'cn', required: true },
      { authentikField: 'name || username', ldapAttribute: 'sn', required: true },
    ]
  })
})

schemaRouter.put('/mappings', async (req, res) => {
  // TODO: Update mappings
  res.json({ success: true })
})

schemaRouter.post('/test', async (req, res) => {
  // TODO: Test mapping
  res.json({ success: true })
})
