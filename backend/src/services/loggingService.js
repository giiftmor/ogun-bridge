import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../utils/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_DATA_DIR = path.join(__dirname, '../../data')

const LOG_CATEGORIES = {
  AUTH: 'auth',
  PASSWORD: 'password',
  USER: 'user',
  SYNC: 'sync',
  MAIL: 'mail',
  SYSTEM: 'system',
  SECURITY: 'security',
}

const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
}

const MAX_LOG_ENTRIES = 5000

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DATA_DIR)) {
      fs.mkdirSync(LOG_DATA_DIR, { recursive: true })
    }
  } catch (error) {
    logger.error('[LoggingService] Failed to create log directory:', error.message)
  }
}

function getLogFilePath(category) {
  return path.join(LOG_DATA_DIR, `ops-${category}.json`)
}

function readLogs(category, limit = 100) {
  try {
    ensureLogDir()
    const filePath = getLogFilePath(category)
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(data).slice(0, limit)
    }
  } catch (error) {
    logger.error(`[LoggingService] Error reading ${category} logs:`, error.message)
  }
  return []
}

function writeLogs(category, logs) {
  try {
    ensureLogDir()
    const filePath = getLogFilePath(category)
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2))
  } catch (error) {
    logger.error(`[LoggingService] Error writing ${category} logs:`, error.message)
  }
}

export class LoggingService {
  constructor() {
    this.categories = LOG_CATEGORIES
    this.levels = LOG_LEVELS
  }

  log(category, level, message, metadata = {}) {
    const timestamp = new Date().toISOString()
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      level,
      category: category.toUpperCase(),
      message,
      metadata,
    }

    try {
      const logs = []
      const filePath = getLogFilePath(category)
      if (fs.existsSync(filePath)) {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        logs.push(...existing)
      }

      logs.unshift(entry)

      if (logs.length > MAX_LOG_ENTRIES) {
        logs.length = MAX_LOG_ENTRIES
      }

      fs.writeFileSync(filePath, JSON.stringify(logs, null, 2))

      const logMsg = `[${category.toUpperCase()}] ${message}`
      if (level === LOG_LEVELS.ERROR) {
        logger.error(logMsg, metadata)
      } else if (level === LOG_LEVELS.WARN) {
        logger.warn(logMsg, metadata)
      } else {
        logger.info(logMsg, metadata)
      }
    } catch (error) {
      console.error('[LoggingService] Failed to write log:', error.message)
    }

    return entry
  }

  debug(category, message, metadata) {
    return this.log(category, LOG_LEVELS.DEBUG, message, metadata)
  }

  info(category, message, metadata) {
    return this.log(category, LOG_LEVELS.INFO, message, metadata)
  }

  warn(category, message, metadata) {
    return this.log(category, LOG_LEVELS.WARN, message, metadata)
  }

  error(category, message, metadata) {
    return this.log(category, LOG_LEVELS.ERROR, message, metadata)
  }

  logUserAction(actor, action, target, details = {}) {
    return this.log(LOG_CATEGORIES.USER, LOG_LEVELS.INFO, `User action: ${action}`, {
      actor,
      action,
      target,
      ...details,
    })
  }

  logPasswordOperation(operation, username, details = {}) {
    return this.log(LOG_CATEGORIES.PASSWORD, LOG_LEVELS.INFO, `Password operation: ${operation}`, {
      username,
      operation,
      ...details,
    })
  }

  logAuthEvent(event, username, details = {}) {
    return this.log(LOG_CATEGORIES.AUTH, LOG_LEVELS.INFO, `Auth event: ${event}`, {
      username,
      event,
      ...details,
    })
  }

  logSecurityEvent(eventType, details = {}) {
    return this.log(LOG_CATEGORIES.SECURITY, LOG_LEVELS.WARN, `Security: ${eventType}`, {
      eventType,
      ...details,
    })
  }

  logSyncEvent(operation, details = {}) {
    return this.log(LOG_CATEGORIES.SYNC, LOG_LEVELS.INFO, `Sync: ${operation}`, {
      operation,
      ...details,
    })
  }

  logMailEvent(operation, details = {}) {
    return this.log(LOG_CATEGORIES.MAIL, LOG_LEVELS.INFO, `Mail: ${operation}`, {
      operation,
      ...details,
    })
  }

  logSystemEvent(event, details = {}) {
    return this.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `System: ${event}`, {
      event,
      ...details,
    })
  }

  getLogs(category, limit = 100) {
    return readLogs(category, limit)
  }

  getAllLogs(limit = 100) {
    const allLogs = []
    for (const category of Object.values(LOG_CATEGORIES)) {
      const logs = readLogs(category, limit)
      allLogs.push(...logs)
    }
    return allLogs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit)
  }

  searchLogs(query, category = 'all', level = 'all') {
    const categories = category === 'all' ? Object.values(LOG_CATEGORIES) : [category]
    const results = []

    for (const cat of categories) {
      const logs = readLogs(cat, MAX_LOG_ENTRIES)
      for (const log of logs) {
        if (level !== 'all' && log.level !== level) continue

        const searchStr = `${log.message} ${JSON.stringify(log.metadata)}`.toLowerCase()
        if (searchStr.includes(query.toLowerCase())) {
          results.push(log)
        }
      }
    }

    return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }

  getStats() {
    const stats = {
      categories: {},
      levels: { debug: 0, info: 0, warn: 0, error: 0 },
      total: 0,
    }

    for (const [name, category] of Object.entries(LOG_CATEGORIES)) {
      const logs = readLogs(category, MAX_LOG_ENTRIES)
      stats.categories[name] = logs.length
      stats.total += logs.length

      for (const log of logs) {
        if (stats.levels[log.level] !== undefined) {
          stats.levels[log.level]++
        }
      }
    }

    return stats
  }

  clearCategory(category) {
    writeLogs(category, [])
    return true
  }

  clearAll() {
    for (const category of Object.values(LOG_CATEGORIES)) {
      writeLogs(category, [])
    }
    return true
  }
}

export const loggingService = new LoggingService()
export { LOG_CATEGORIES, LOG_LEVELS }