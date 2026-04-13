// CRITICAL: Load env vars before anything else
import dotenv from 'dotenv'

dotenv.config()

import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'

import { healthRouter } from './routes/health.js'
import { dashboardRouter } from './routes/dashboard.js'
import { usersRouter } from './routes/users.js'
import { groupsRouter } from './routes/groups.js'
import { schemaRouter } from './routes/schema.js'
import { changesRouter } from './routes/changes.js'
import { syncRouter } from './routes/sync.js'
import { logsRouter } from './routes/logs.js'
import { passwordRouter } from './routes/password.js'
import { auditRouter } from './routes/audit.js'
import { testRouter } from './routes/test.js'
import { mailRouter } from './routes/mail.js'
import { mailAdminRouter } from './routes/mailAdmin.js'
import { inviteRouter } from './routes/invite.js'
import { authRouter } from './routes/auth.js'
import { versionRouter } from './routes/versions.js'
import { operationsRouter } from './routes/operations.js'
import { setupWebSocket } from './services/websocket.js'
import { cleanupExpiredSessions, authenticate, optionalAuth } from './middleware/auth.js'
import { addLogToCache } from './services/logCache.js'
import { startSyncService, stopSyncService } from './services/syncService.js'
import { logger } from './utils/logger.js'

import { initializeDatabase, closeDatabase } from './lib/db.js'  // ← Import db after config



const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3331',
    methods: ['GET', 'POST'],
  },
})

initializeDatabase()

// Make io accessible in routes via req.app.get('io')
app.set('io', io)

// Middleware
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3331',
}))
app.use(express.json())

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`)
  next()
})

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'alsm-ui-backend',
    timestamp: new Date().toISOString(),
  })
})

// API Routes
app.use('/api/health', healthRouter) // Health check moved to dashboardRouter for better organization
app.use('/api/dashboard', dashboardRouter)
app.use('/api/users', usersRouter)
app.use('/api/groups', groupsRouter)
app.use('/api/schema', schemaRouter)
app.use('/api/changes', changesRouter)
app.use('/api/sync', syncRouter)
app.use('/api/logs', logsRouter)
app.use('/api/password', passwordRouter)
app.use('/api/audit', auditRouter)
app.use('/api/test', testRouter)
app.use('/api/mail', mailRouter)
app.use('/api/mail/admin', mailAdminRouter)
app.use('/api/invite', inviteRouter)
app.use('/api/auth', authRouter)
app.use('/api/versions', versionRouter)
app.use('/api/operations', operationsRouter)


// WebSocket setup
setupWebSocket(io)

// Session cleanup - run every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000)

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  })
})

// Start server
const PORT = process.env.PORT || 3333
httpServer.listen(PORT, '0.0.0.0', async () => {
  logger.info(`Server running on port ${PORT}`)
  logger.info(`WebSocket server ready`)
  
  try {
    addLogToCache({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `ALSM UI Backend started on port ${PORT}`,
      context: { service: 'startup' }
    })
  } catch (error) {
    console.error('[startup] Failed to write startup log:', error.message)
  }

  // Start sync service after server is up
  await startSyncService(io)
})

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down gracefully...')
  stopSyncService()
  httpServer.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
