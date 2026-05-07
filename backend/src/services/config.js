import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'

// Service names
export const SERVICE_LDAP = 'ldap'
export const SERVICE_AUTHENTIK = 'authentik'
export const SERVICE_SMTP = 'smtp'
export const SERVICE_SYSTEM = 'system'

// Env var fallbacks for each service config key
const ENV_FALLBACKS = {
  [SERVICE_LDAP]: {
    host: 'LDAP_HOST',
    port: 'LDAP_PORT',
    bindDN: 'LDAP_BIND_DN',
    bindPassword: 'LDAP_BIND_PASSWORD',
    baseDN: 'LDAP_BASE_DN',
    userBaseDN: 'LDAP_USER_BASE_DN',
    groupBaseDN: 'LDAP_GROUP_BASE_DN',
  },
  [SERVICE_AUTHENTIK]: {
    baseUrl: 'AUTHENTIK_URL',
    apiToken: 'AUTHENTIK_TOKEN',
  },
  [SERVICE_SMTP]: {
    host: 'SMTP_HOST',
    port: 'SMTP_PORT',
    secure: 'SMTP_SECURE',
    username: 'SMTP_USER',
    password: 'SMTP_PASSWORD',
    fromName: 'SMTP_FROM_NAME',
    fromAddress: 'SMTP_FROM_ADDRESS',
  },
}

/**
 * Get all config values for a service
 * Falls back to env vars if not found in DB
 */
export async function getServiceConfig(service) {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT key, value FROM service_configs WHERE service = $1',
      [service]
    )
    
    const config = {}
    for (const row of result.rows) {
      // Try to parse JSON values, fall back to string
      try {
        config[row.key] = JSON.parse(row.value)
      } catch {
        config[row.key] = row.value
      }
    }
    
    // Apply env var fallbacks for missing keys
    const fallbacks = ENV_FALLBACKS[service] || {}
    for (const [key, envVar] of Object.entries(fallbacks)) {
      if (config[key] === undefined || config[key] === '') {
        const envVal = process.env[envVar]
        if (envVal !== undefined) {
          // Handle special cases
          if (key === 'port') {
            config[key] = parseInt(envVal)
          } else if (envVal === 'true' || envVal === 'false') {
            config[key] = envVal === 'true'
          } else {
            config[key] = envVal
          }
        }
      }
    }
    
    return config
  } catch (error) {
    logger.error('Failed to get service config', { service, error: error.message })
    throw error
  } finally {
    client.release()
  }
}

/**
 * Get a single config value
 */
export async function getConfigValue(service, key) {
  const config = await getServiceConfig(service)
  return config[key]
}

/**
 * Set config values for a service (partial update)
 * Encrypts sensitive fields before saving
 * Optionally saves working config to .env with override date
 */
export async function setServiceConfig(service, configObj, saveToEnv = false) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16) // YYYY-MM-DD HH:mm
    
    for (const [key, value] of Object.entries(configObj)) {
      // Skip undefined values
      if (value === undefined) continue
      
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
      const isSecret = key.toLowerCase().includes('password') || key.toLowerCase().includes('token')
      
      // Get current value to detect changes
      const current = await client.query(
        'SELECT value FROM service_configs WHERE service = $1 AND key = $2',
        [service, key]
      )
      
      // Encrypt secrets before saving to DB
      let valueToSave = stringValue
      let isEncrypted = false
      
      if (isSecret) {
        try {
          const { encrypt } = await import('./encryption.js')
          const encrypted = await encrypt(stringValue)
          valueToSave = JSON.stringify(encrypted)
          isEncrypted = true
          logger.info(`Encrypted ${service}.${key} before saving to DB`)
        } catch (e) {
          logger.warn(`Encryption failed for ${service}.${key}, saving plain:`, e.message)
        }
      }
      
      const oldValue = current.rows[0]?.value
      const newValue = stringValue
      
      if (oldValue !== newValue) {
        logger.info(`Config change detected: ${service}.${key}`)
        logger.info(`  Old: ${oldValue ? '***' : '(empty)'}`)
        logger.info(`  New: ${newValue ? '***' : '(empty)'}`)
          
        // If critical service config changes, restart sync
        if (['ldap', 'authentik', 'smtp'].includes(service)) {
          logger.info('Critical config changed, scheduling sync restart...')
          const io = global.__io
          if (io) {
            setTimeout(async () => {
              try {
                const { isSyncRunning, stopSyncService, startSyncService } = await import('./syncService.js')
                if (isSyncRunning()) {
                  await stopSyncService()
                  await new Promise(r => setTimeout(r, 2000))
                  await startSyncService(io)
                  logger.info('Sync service restarted with new config')
                }
              } catch (e) {
                logger.error('Failed to restart sync:', e.message)
              }
            }, 1000)
          }
        }
      }
      
      await client.query(`
        INSERT INTO service_configs (service, key, value, is_encrypted, last_override_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (service, key) 
        DO UPDATE SET value = EXCLUDED.value, 
                        is_encrypted = EXCLUDED.is_encrypted,
                        updated_at = NOW(),
                        last_override_at = NOW()
      `, [service, key, valueToSave, isEncrypted])
    }
    
    await client.query('COMMIT')
    logger.info(`Service config updated`, { service, keys: Object.keys(configObj) })
    
    // Override .env file if requested (save working config)
    if (saveToEnv) {
      await saveConfigToEnvFile(service, configObj, now)
    }
    
    return true
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error('Failed to set service config', { 
      error: error.message,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      sqlState: error.sqlState,
      // Log the actual query and params
      query: `INSERT INTO service_configs (service, key, value, is_encrypted, last_override_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (service, key) DO UPDATE SET value = EXCLUDED.value, is_encrypted = EXCLUDED.is_encrypted, updated_at = NOW(), last_override_at = NOW()`,
      params: [service, key, valueToSave, isEncrypted]
    })
    throw error
  } finally {
    client.release()
  }
}

/**
 * Save working config to .env file with override date
 * Format: KEY=value # Overridden on YYYY-MM-DD HH:mm
 */
async function saveConfigToEnvFile(service, configObj, overrideDate) {
  const envPath = '../.env' // Relative to backend/src/
  const fs = await import('fs/promises')
  const path = (await import('path')).default
  
  const fullPath = path.resolve(process.cwd(), envPath)
  
  try {
    let envContent = await fs.readFile(fullPath, 'utf8')
    const mappings = ENV_FALLBACKS[service] || {}
    
    for (const [key, envVar] of Object.entries(mappings)) {
      if (configObj[key]) {
        const regex = new RegExp(`^${envVar}=.*$`, 'm')
        const newLine = `${envVar}=${configObj[key]} # Overridden on ${overrideDate}`
        
        if (envContent.match(regex)) {
          envContent = envContent.replace(regex, newLine)
        } else {
          envContent += `\n${newLine}`
        }
      }
    }
    
    await fs.writeFile(fullPath, envContent)
    logger.info(`Saved working ${service} config to .env (with override date)`)
  } catch (error) {
    logger.error('Failed to save config to .env:', error.message)
  }
}

/**
 * Verify ENV vars by testing connections
 * Returns object with health status for all 4 services
 */
export async function verifyEnvVars() {
  const errors = []
  const status = { db: false, ldap: false, authentik: false, smtp: false }
  
  // Check DATABASE (re-verify since initializeDatabase already ran)
  try {
    const client = await pool.connect()
    await client.query('SELECT 1')
    client.release()
    status.db = true
    logger.info('✅ Database connection verified')
  } catch (e) {
    errors.push(`Database: ${e.message}`)
  }

  // Check LDAP
  const ldapConfig = await getServiceConfig(SERVICE_LDAP)
  if (!ldapConfig.host || !ldapConfig.bindDN) {
    errors.push('LDAP: Missing host or bindDN')
  } else {
    try {
      const { LDAPClient } = await import('./ldapClient.js')
      const client = new LDAPClient()
      await client.connect()
      await client.disconnect()
      status.ldap = true
      logger.info('✅ LDAP connection verified')
    } catch (e) {
      errors.push(`LDAP: ${e.message}`)
    }
  }

  // Check Authentik
  const authConfig = await getServiceConfig(SERVICE_AUTHENTIK)
  if (!authConfig.baseUrl || !authConfig.apiToken) {
    errors.push('Authentik: Missing URL or token')
  } else {
    try {
      const { AuthentikClient } = await import('./authentikClient.js')
      const ak = new AuthentikClient()
      await ak.getUsers({ limit: 1 })
      status.authentik = true
      logger.info('✅ Authentik connection verified')
    } catch (e) {
      errors.push(`Authentik: ${e.message}`)
    }
  }

  // Check SMTP (optional - don't fail god-mode if SMTP is down)
  const smtpConfig = await getServiceConfig(SERVICE_SMTP)
  if (!smtpConfig.host || !smtpConfig.username) {
    logger.warn('SMTP: Missing host or username (optional)')
    status.smtp = false
  } else {
    try {
      const nodemailer = await import('nodemailer')
      const transport = nodemailer.default.createTransport({
        host: smtpConfig.host,
        port: parseInt(smtpConfig.port) || 2525,
        secure: false, // Use STARTTLS
        auth: {
          user: smtpConfig.username,
          pass: smtpConfig.password,
        },
        // Ignore self-signed certificates
        tls: {
          rejectUnauthorized: false
        },
        // Add timeout to prevent hanging
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
      })
      
      // Wrap verify in a timeout
      const verifyWithTimeout = (transport, timeoutMs = 5000) => {
        return Promise.race([
          transport.verify(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('SMTP verification timeout')), timeoutMs)
          )
        ])
      }
      
      await verifyWithTimeout(transport, 7000)
      status.smtp = true
      logger.info('✅ SMTP connection verified')
    } catch (e) {
      logger.warn(`SMTP: ${e.message} (optional - continuing)`)
      status.smtp = false
    }
  }

  // Log extensive details
  if (errors.length > 0) {
    logger.error('ENV var verification FAILED:')
    errors.forEach(e => logger.error(`  - ${e}`))
    return { allHealthy: false, ...status, errors }
  }

  logger.info('✅ All ENV vars verified successfully')
  return { allHealthy: true, ...status }
}

/**
 * Check if system setup is complete
 */
export async function isSetupComplete() {
  try {
    const result = await pool.query(
      'SELECT value FROM service_configs WHERE service = $1 AND key = $2',
      [SERVICE_SYSTEM, 'setup_complete']
    )
    return result.rows.length > 0 && result.rows[0].value === 'true'
  } catch (error) {
    // Table might not exist yet during initial startup
    return false
  }
}

/**
 * Mark system setup as complete
 */
export async function markSetupComplete() {
  const client = await pool.connect()
  try {
    // Try direct update first, then insert (without last_override_at - might not exist in DB)
    const result = await client.query(
      "UPDATE service_configs SET value = 'true', updated_at = NOW() WHERE service = 'system' AND key = 'setup_complete'"
    )
    if (result.rowCount === 0) {
      await client.query(
        "INSERT INTO service_configs (service, key, value, is_encrypted) VALUES ('system', 'setup_complete', 'true', false)"
      )
    }
    return true
  } catch (error) {
    logger.error('Failed to mark setup complete', { error: error.message, code: error.code, detail: error.detail })
    throw error
  } finally {
    client.release()
  }
}

/**
 * Check if any admin user exists
 */
export async function hasAdminUser() {
  const client = await pool.connect()
  try {
    const result = await client.query(
      "SELECT COUNT(*) as count FROM auth_users WHERE is_admin = true OR is_super_admin = true"
    )
    return parseInt(result.rows[0].count) > 0
  } catch (error) {
    logger.error('Failed to check admin user', { error: error.message })
    return false
  } finally {
    client.release()
  }
}

/**
 * Create super admin if none exists (called from /api/setup/create-super-admin)
 */
export async function createSuperAdminIfNeeded() {
  const client = await pool.connect()
  try {
    // Check if super admin already exists
    const existing = await client.query(
      "SELECT id FROM auth_users WHERE username = $1 OR is_super_admin = true LIMIT 1",
      [process.env.SUPER_ADMIN_USER || 'superadmin']
    )
    if (existing.rows.length > 0) {
      return { created: false, reason: 'super_admin_exists' }
    }

    // Create super admin
    const bcrypt = await import('bcryptjs')
    const password = process.env.SUPER_ADMIN_PASS || 'Kali@1403'
    const hashedPassword = await bcrypt.default.hash(password, 10)

    await client.query(
      `INSERT INTO auth_users (username, password_hash, email, first_name, last_name, is_admin, is_super_admin, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, true, NOW(), NOW())`,
      [
        process.env.SUPER_ADMIN_USER || 'superadmin',
        hashedPassword,
        process.env.SUPER_ADMIN_EMAIL || 'superadmin@spectres.co.za',
        'Super',
        'Admin'
      ]
    )

    logger.info('Super admin created', { username: process.env.SUPER_ADMIN_USER || 'superadmin' })
    return { created: true, username: process.env.SUPER_ADMIN_USER || 'superadmin' }
  } catch (error) {
    logger.error('Failed to create super admin', { error: error.message })
    throw error
  } finally {
    client.release()
  }
}

/**
 * Get full setup status (for /api/setup/status)
 */
export async function getSetupStatus() {
  const client = await pool.connect()
  try {
    const setupComplete = await isSetupComplete()
    const adminExists = await hasAdminUser()
    
    // Get service configs
    const ldapConfig = await getServiceConfig('ldap')
    const authentikConfig = await getServiceConfig('authentik')
    const smtpConfig = await getServiceConfig('smtp')
    
    return {
      setup_complete: setupComplete,
      admin_exists: adminExists,
      services: {
        ldap: { configured: !!ldapConfig },
        authentik: { configured: !!authentikConfig },
        smtp: { configured: !!smtpConfig }
      }
    }
  } catch (error) {
    logger.error('Failed to get setup status', { error: error.message })
    throw error
  } finally {
    client.release()
  }
}
