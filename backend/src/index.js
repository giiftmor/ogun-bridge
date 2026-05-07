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
import { groupServicesRouter } from './routes/groupServices.js'
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
import { setupRouter } from './routes/setup.js'
import { setupWebSocket } from './services/websocket.js'
import { cleanupExpiredSessions } from './middleware/auth.js'
import { addLogToCache } from './services/logCache.js'
import { startSyncService, stopSyncService } from './services/syncService.js'
import { logger } from './utils/logger.js'
import { initializeDatabase } from './lib/db.js'
import { markSetupComplete } from './services/config.js'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3331',
    methods: ['GET', 'POST'],
  },
})

// Make io accessible globally for sync restarts
global.__io = io

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

// API Routes (FULL server only)
function setupFullRoutes() {
  // Health check (full mode)
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'ogun-bridge-backend',
      timestamp: new Date().toISOString(),
    })
  })
  app.use('/api/health', healthRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/groups', groupsRouter)
  app.use('/api/groups-manager', groupServicesRouter)
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
}

// Limited Routes (God-mode only - NO sync, NO auth)
function setupLimitedRoutes() {
  // Override /health to show limited status
  app.get('/health', (req, res) => {
    res.json({
      status: 'limited',
      service: 'ogun-bridge-backend',
      timestamp: new Date().toISOString(),
    })
  })
  // ONLY setup routes
  app.use('/api/setup', setupRouter)
}

// Start FULL server (frontend + API + Sync)
function startFullServer() {
  setupFullRoutes()
  const PORT = process.env.PORT || 3333
  httpServer.listen(PORT, '0.0.0.0', async () => {
    logger.info(`Server running on port ${PORT}`)
    logger.info('WebSocket server ready')
    
    try {
      await addLogToCache({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Ogun Bridge Backend started on port ${PORT}`,
        context: { service: 'startup' }
      })
    } catch (error) {
      console.error('[startup] Failed to write startup log:', error.message)
    }
    
    await startSyncService(io)
    logger.info('✅ Full server started - all services operational')
  })
}

// Start LIMITED server (frontend + /api/setup/* only)
function startLimitedServer() {
  setupLimitedRoutes()
  const PORT = process.env.PORT || 3333
  httpServer.listen(PORT, '0.0.0.0', async () => {
    logger.info(`Limited server running on port ${PORT}`)
    logger.info('God-mode accessible at /god-mode')
    
    try {
      await addLogToCache({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Ogun Bridge Backend started in LIMITED MODE`,
        context: { service: 'startup' }
      })
    } catch (error) {
      console.error('[startup] Failed to write startup log:', error.message)
    }
    
    logger.info('Sync service disabled until setup complete')
  })
}

// Main async startup function
async function startServer() {
  try {
    // 1. Initialize database FIRST
    const dbReady = await initializeDatabase()
    if (!dbReady) {
      logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      logger.error('🚨 DATABASE CONNECTION FAILED')
      logger.error('🚨 Fix: Set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD in .env')
      logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      return // Don't start anything
    }

    // 2. Import encryption module (needs DB or .env fallback)
    const { saveKeyToDB } = await import('./services/encryption.js')
    try {
      await saveKeyToDB()
    } catch (e) {
      logger.warn('Encryption key not saved to DB (DB may be down):', e.message)
    }

    // 3. Health check critical services (BEFORE HTTP server starts)
    // SMTP is optional - don't fail god-mode if SMTP is down
    const { verifyEnvVars } = await import('./services/config.js')
    const health = await verifyEnvVars()
    
    // Only DB, LDAP, Authentik are required for full mode
    const criticalHealthy = health.db && health.ldap && health.authentik
    
    if (!criticalHealthy) {
      logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      logger.error('🚨 GOD-MODE ACTIVE')
      logger.error('🚨 Reasons:')
      if (!health.db) logger.error('🚨   - Database connection failed')
      if (!health.ldap) logger.error('🚨   - LDAP connection failed')
      if (!health.authentik) logger.error('🚨   - Authentik connection failed')
      logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      logger.info('Visit /god-mode to fix configurations')
      if (!health.smtp) logger.info('ℹ️  SMTP is optional but currently unavailable')
      
      // Start LIMITED server (frontend + /api/setup/* only)
      startLimitedServer()
      return
    }

    // 4. All critical services healthy → auto-disable god-mode
    logger.info('✅ All critical services healthy! Auto-completing setup...')
    if (health.smtp) {
      logger.info('✅ SMTP also available!')
    } else {
      logger.warn('⚠️  SMTP not available (optional)')
    }
    
    const { markSetupComplete } = await import('./services/config.js')
    await markSetupComplete()
    logger.info('God-mode auto-disabled - setup complete!')

    // 5. Start FULL server (frontend + API + Sync)
    startFullServer()

  } catch (error) {
    logger.error('Failed to start server', { error: error.message })
    process.exit(1)
  }
}

// Start the server
startServer()
