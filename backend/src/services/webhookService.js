import { logger } from '../utils/logger.js'
import pool from '../lib/db.js'

export async function triggerWebhook(event, payload) {
  try {
    const result = await pool.query(
      "SELECT * FROM webhooks WHERE $1 = ANY(events)",
      [event]
    )
    
    const webhooks = result.rows
    
    if (webhooks.length === 0) {
      logger.debug('No webhooks configured for event', { event })
      return { triggered: 0, results: [] }
    }
    
    const results = []
    
    for (const webhook of webhooks) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event,
            timestamp: new Date().toISOString(),
            data: payload,
          }),
        })
        
        const responseText = await response.text()
        
        results.push({
          webhook_id: webhook.id,
          webhook_name: webhook.name,
          url: webhook.url,
          status: response.status,
          success: response.ok,
          response: responseText.substring(0, 200),
        })
        
        logger.info('Webhook triggered', { 
          event, 
          webhook: webhook.name, 
          status: response.status 
        })
      } catch (error) {
        results.push({
          webhook_id: webhook.id,
          webhook_name: webhook.name,
          url: webhook.url,
          success: false,
          error: error.message,
        })
        
        logger.error('Webhook trigger failed', { 
          event, 
          webhook: webhook.name, 
          error: error.message 
        })
      }
    }
    
    return { triggered: results.filter(r => r.success).length, results }
  } catch (error) {
    logger.error('Error fetching webhooks', { error: error.message })
    return { triggered: 0, results: [], error: error.message }
  }
}

export async function getWebhooks() {
  const result = await pool.query('SELECT * FROM webhooks ORDER BY created_at DESC')
  return result.rows
}

export async function createWebhook(name, url, events) {
  const result = await pool.query(
    'INSERT INTO webhooks (name, url, events) VALUES ($1, $2, $3) RETURNING *',
    [name, url, events]
  )
  return result.rows[0]
}

export async function deleteWebhook(id) {
  await pool.query('DELETE FROM webhooks WHERE id = $1', [id])
}

export async function testWebhook(id) {
  const result = await pool.query('SELECT * FROM webhooks WHERE id = $1', [id])
  const webhook = result.rows[0]
  
  if (!webhook) {
    return { success: false, error: 'Webhook not found' }
  }
  
  return triggerWebhook('test', {
    message: 'This is a test webhook from ALSM',
    webhook_id: id,
  })
}
