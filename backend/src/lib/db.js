import pg from 'pg'
import { logger } from '../utils/logger.js'
import dotenv from 'dotenv'

// Load env vars BEFORE creating pool (ESM modules are hoisted)
dotenv.config()

const { Pool } = pg

// Helper to get DB config at runtime (after dotenv loads)
function getDbConfig() {
  const rawPassword = process.env.DB_PASSWORD || ''
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'alsm_ui',
    user: process.env.DB_USER || 'postgres',
    password: rawPassword.replace(/^["']|["']$/g, ''),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }
}

// Create pool normally - env vars will be available when first query runs
// because dotenv.config() is called at the top of index.js before any async code
const dbConfig = getDbConfig()
export const pool = new Pool(dbConfig)

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message })
})

// Database schema
const schema = `
-- ============================================
-- Changes Table
-- ============================================
CREATE TABLE IF NOT EXISTS changes (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  change_type VARCHAR(50) NOT NULL,
  field_name VARCHAR(100),
  authentik_value TEXT,
  ldap_value TEXT,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  applied_at TIMESTAMP,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_changes_status ON changes(status);
CREATE INDEX IF NOT EXISTS idx_changes_entity ON changes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_changes_detected ON changes(detected_at DESC);

-- ============================================
-- Versions Table
-- ============================================
CREATE TABLE IF NOT EXISTS versions (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  version_number INTEGER NOT NULL,
  snapshot_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_versions_entity ON versions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_versions_created ON versions(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_unique ON versions(entity_type, entity_id, version_number);

-- ============================================
-- Audit Log Table
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action VARCHAR(100) NOT NULL,
  actor VARCHAR(255),
  entity_type VARCHAR(50),
  entity_id VARCHAR(255),
  changes JSONB,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- ============================================
-- User Profiles Table
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  alt_email VARCHAR(255),
  authentik_uuid UUID,
  ldap_dn TEXT,
  role VARCHAR(50) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  login_count INTEGER DEFAULT 0,
  password_hash VARCHAR(255),
  password_method VARCHAR(50),
  password_created_at TIMESTAMP,
  password_synced_to_ldap BOOLEAN DEFAULT false,
  password_synced_to_authentik BOOLEAN DEFAULT false,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_uuid ON user_profiles(authentik_uuid);
CREATE INDEX IF NOT EXISTS idx_user_profiles_password_status ON user_profiles(password_method, password_synced_to_ldap);

-- ============================================
-- Admin Users Table
-- ============================================
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  role VARCHAR(50) DEFAULT 'admin',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);

-- ============================================
-- Active Sessions Table
-- ============================================
CREATE TABLE IF NOT EXISTS active_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON active_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_username ON active_sessions(username);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON active_sessions(expires_at);

-- ============================================
-- Password Reset Tokens Table
-- ============================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- ============================================
-- Service Configs Table
-- ============================================
  CREATE TABLE IF NOT EXISTS service_configs (
    id SERIAL PRIMARY KEY,
    service VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    last_override_at TIMESTAMP,
    override_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service, key)
  );

CREATE INDEX IF NOT EXISTS idx_service_configs_service ON service_configs(service);
CREATE INDEX IF NOT EXISTS idx_service_configs_lookup ON service_configs(service, key);
`

// Helper to check if database exists
async function checkDatabaseExists() {
  const config = getDbConfig()
  const checkConfig = {
    ...config,
    database: 'postgres',
  }
  
  const client = new pg.Client(checkConfig)
  
  try {
    await client.connect()
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [config.database]
    )
    return result.rows.length > 0
  } catch (error) {
    logger.error('Failed to check database existence', { error: error.message })
    throw error
  } finally {
    await client.end()
  }
}

// Create database if it doesn't exist
async function createDatabase() {
  const config = getDbConfig()
  const checkConfig = {
    ...config,
    database: 'postgres',
  }
  
  const client = new pg.Client(checkConfig)
  
  try {
    await client.connect()
    await client.query(`CREATE DATABASE "${config.database}"`)
    logger.info(`Database '${config.database}' created successfully`)
  } catch (error) {
    if (error.code === '42P04') {
      logger.info(`Database '${config.database}' already exists`)
    } else {
      logger.error('Failed to create database', { error: error.message })
      throw error
    }
  } finally {
    await client.end()
  }
}

// Initialize all tables and indexes
async function initializeTables() {
  const client = await pool.connect()
  
  try {
    await client.query(schema)
    logger.info('Database tables initialized')
  } catch (error) {
    logger.error('Failed to initialize tables', { error: error.message })
    throw error
  } finally {
    client.release()
  }
}

// Test database connection
async function testConnection() {
  try {
    const client = await pool.connect()
    await client.query('SELECT NOW()')
    client.release()
    logger.info('Database connection successful')
    return true
  } catch (error) {
    logger.error('Database connection failed', { error: error.message })
    return false
  }
}

// Main initialization function
export async function initializeDatabase() {
  logger.info('Starting database initialization...')
  
  try {
    const config = getDbConfig()
    
    // Check if database exists, create if not
    const dbExists = await checkDatabaseExists()
    if (!dbExists) {
      logger.info(`Database '${config.database}' does not exist, creating...`)
      await createDatabase()
    }
    
    // Test connection
    const connected = await testConnection()
    if (!connected) {
      throw new Error('Could not connect to database')
    }
    
    // Initialize tables
    await initializeTables()
    
    logger.info('Database initialization complete')
    return true
    
  } catch (error) {
    logger.error('Database initialization failed', { 
      error: error.message,
      stack: error.stack 
    })
    throw error
  }
}

// Graceful shutdown
export async function closeDatabase() {
  await pool.end()
  logger.info('Database connections closed')
}
