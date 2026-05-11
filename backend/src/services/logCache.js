import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../utils/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_CACHE_DIR = path.join(__dirname, '../../data')
const LOG_CACHE_FILE = path.join(LOG_CACHE_DIR, 'log-cache.json')

const MAX_CACHED_LOGS = 1000

function ensureLogCacheDir() {
  try {
    if (!fs.existsSync(LOG_CACHE_DIR)) {
      fs.mkdirSync(LOG_CACHE_DIR, { recursive: true })
    }
  } catch (error) {
    logger.error('[logCache] Failed to create directory:', { error: error.message })
  }
}

function readLogCache() {
  try {
    ensureLogCacheDir()
    if (fs.existsSync(LOG_CACHE_FILE)) {
      const data = fs.readFileSync(LOG_CACHE_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    logger.error('[logCache] Error reading log cache:', { error: error.message })
  }
  return []
}

function writeLogCache(logs) {
  try {
    ensureLogCacheDir()
    fs.writeFileSync(LOG_CACHE_FILE, JSON.stringify(logs, null, 2))
  } catch (error) {
    logger.error('[logCache] Error writing log cache:', { error: error.message })
  }
}

export function addLogToCache(logEntry) {
  try {
    const logs = readLogCache()
    
    logs.unshift(logEntry)
    
    if (logs.length > MAX_CACHED_LOGS) {
      logs.length = MAX_CACHED_LOGS
    }
    
    writeLogCache(logs)
  } catch (error) {
    logger.error('[logCache] Error adding log to cache:', { error: error.message })
  }
}

export function getCachedLogs(limit = 1000) {
  try {
    const logs = readLogCache()
    return logs.slice(0, limit)
  } catch (error) {
    logger.error('[logCache] Error getting cached logs:', { error: error.message })
    return []
  }
}

export function searchLogs(query, level = 'all') {
  try {
    const logs = readLogCache()
    
    return logs.filter(log => {
      const matchesLevel = level === 'all' || log.level === level
      
      if (!query) return matchesLevel
      
      const searchLower = query.toLowerCase()
      const messageMatch = log.message?.toLowerCase().includes(searchLower)
      const contextMatch = log.context && 
        JSON.stringify(log.context).toLowerCase().includes(searchLower)
      
      return matchesLevel && (messageMatch || contextMatch)
    })
  } catch (error) {
    logger.error('[logCache] Error searching logs:', { error: error.message })
    return []
  }
}

export function clearLogCache() {
  writeLogCache([])
}
