import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'
import fetch from 'node-fetch'

export class AlertService {
  constructor() {
    this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL
    this.emailEnabled = process.env.SMTP_HOST && process.env.SMTP_ALERT_EMAIL
    this.alertEmail = process.env.SYNC_ALERT_EMAIL || 'admin@spectres.co.za'
  }

  async createAlert(alertType, message, options = {}) {
    const { severity = 'warning', entityType, entityId, details } = options

    try {
      const result = await pool.query(
        `INSERT INTO sync_alerts (alert_type, severity, entity_type, entity_id, message, details)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [alertType, severity, entityType, entityId, message, JSON.stringify(details || {})]
      )
      const alertId = result.rows[0].id

      await this.notify(alertType, severity, message, details)

      return alertId
    } catch (error) {
      logger.error('Failed to create alert:', error.message)
      return null
    }
  }

  async notify(alertType, severity, message, details) {
    const alerts = []

    if (this.discordWebhookUrl && severity === 'critical') {
      alerts.push(this.sendDiscordAlert(alertType, message, details))
    }

    if (this.emailEnabled && severity === 'critical') {
      alerts.push(this.sendEmailAlert(alertType, message, details))
    }

    if (severity === 'warning' || severity === 'info') {
      logger.warn(`[ALERT] ${alertType}: ${message}`, details || {})
    }

    await Promise.all(alerts).catch(err => {
      logger.error('Failed to send alert notification:', err.message)
    })
  }

  async sendDiscordAlert(alertType, message, details) {
    const color = alertType === 'sync_failure' ? 16711680 : 16744448
    
    const embed = {
      title: `⚠️ [${alertType.toUpperCase()}] Ogun Bridge Sync Alert`,
      description: message,
      color: color,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Ogun Bridge Sync Service'
      },
      fields: []
    }

    if (details) {
      for (const [key, value] of Object.entries(details)) {
        embed.fields.push({
          name: key,
          value: typeof value === 'object' ? `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`` : String(value),
          inline: false
        })
      }
    }

    try {
      const response = await fetch(this.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
      })
      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`)
      }
      logger.info('Discord alert sent successfully')
    } catch (error) {
      logger.error('Failed to send Discord alert:', error.message)
    }
  }

  async sendEmailAlert(alertType, message, details) {
    logger.info(`[EMAIL ALERT] Would send email to ${this.alertEmail}: ${message}`)
  }

  async getUnacknowledgedAlerts(limit = 50) {
    try {
      const result = await pool.query(
        `SELECT * FROM sync_alerts 
         WHERE acknowledged = false 
         ORDER BY created_at DESC 
         LIMIT $1`,
        [limit]
      )
      return result.rows
    } catch (error) {
      logger.error('Failed to get unacknowledged alerts:', error.message)
      return []
    }
  }

  async acknowledgeAlert(alertId, username) {
    try {
      await pool.query(
        `UPDATE sync_alerts 
         SET acknowledged = true, acknowledged_by = $1, acknowledged_at = NOW() 
         WHERE id = $2`,
        [username, alertId]
      )
      return true
    } catch (error) {
      logger.error('Failed to acknowledge alert:', error.message)
      return false
    }
  }

  async clearOldAlerts(daysOld = 7) {
    try {
      const result = await pool.query(
        `DELETE FROM sync_alerts 
         WHERE acknowledged = true 
         AND created_at < NOW() - $1::integer * INTERVAL '1 day'`,
      [daysOld]
      )
      if (result.rowCount > 0) {
        logger.info(`Cleared ${result.rowCount} old alerts`)
      }
      return result.rowCount
    } catch (error) {
      logger.error('Failed to clear old alerts:', error.message)
      return 0
    }
  }
}

export const alertService = new AlertService()
