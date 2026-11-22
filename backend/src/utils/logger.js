import winston from 'winston'
import path from 'path'
import { fileURLToPath } from 'url'
import { inspect } from 'util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function formatTZDate() {
  const tz = process.env.TZ || 'UTC'
  const now = new Date()
  const iso = now.toISOString()
  const tzTime = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const offsetMinutes = (tzTime.getTime() - now.getTime()) / 60000
  const sign = offsetMinutes <= 0 ? '+' : '-'
  const absOffset = Math.abs(offsetMinutes)
  const h = String(Math.floor(absOffset / 60)).padStart(2, '0')
  const m = String(Math.round(absOffset % 60)).padStart(2, '0')
  return iso.replace('Z', `${sign}${h}:${m}`)
}

function formatConsoleMeta(info) {
  const splat = info[Symbol.for('splat')]
  if (!splat || splat.length === 0) return ''
  const meta = splat.length === 1 ? splat[0] : splat
  return ' ' + inspect(meta, { colors: false, depth: 2, breakLength: 200 })
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console output - TZ-aware ISO format
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: formatTZDate }),
        winston.format.printf((info) => {
          const { level, message, timestamp } = info
          return `${timestamp} [${level}]: ${message}${formatConsoleMeta(info)}`
        })
      ),
    }),
    // Error log file - UTC ISO
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Combined log file - UTC ISO
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
})
