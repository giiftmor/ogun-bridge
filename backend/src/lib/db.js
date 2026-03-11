import pg from 'pg'
import { logger } from '../utils/logger.js'


const { Pool } = pg

// Database configuration from environment
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'alsm_ui',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD?.replace(/^["']|["']$/g, ''),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
}

// Create connection pool
export const pool = new Pool(dbConfig)

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message })
})

// Database schema
const schema = `
-- ============================================
-- Changes Table
-- Tracks detected changes awaiting approval
-- ============================================
CREATE TABLE IF NOT EXISTS changes (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,           -- 'user' or 'group'
  entity_id VARCHAR(255) NOT NULL,            -- username or group name
  change_type VARCHAR(50) NOT NULL,           -- 'conflict', 'orphan', 'mismatch', 'field_change'
  field_name VARCHAR(100),                    -- which field changed (e.g., 'email', 'cn')
  authentik_value TEXT,                       -- value in Authentik
  ldap_value TEXT,                            -- value in LDAP
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',       -- 'pending', 'approved', 'rejected', 'applied'
  approved_by VARCHAR(255),                   -- who approved/rejected
  approved_at TIMESTAMP,
  applied_at TIMESTAMP,                       -- when the change was actually applied
  error_message TEXT,                         -- if application failed
  metadata JSONB                              -- additional context
);

CREATE INDEX IF NOT EXISTS idx_changes_status ON changes(status);
CREATE INDEX IF NOT EXISTS idx_changes_entity ON changes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_changes_detected ON changes(detected_at DESC);

-- ============================================
-- Versions Table
-- Snapshots for rollback capability
-- ============================================
CREATE TABLE IF NOT EXISTS versions (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,           -- 'user' or 'group'
  entity_id VARCHAR(255) NOT NULL,            -- username or group name
  version_number INTEGER NOT NULL,
  snapshot_data JSONB NOT NULL,               -- full entity data
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),                    -- who triggered the snapshot
  description TEXT                            -- why this version was created
);

CREATE INDEX IF NOT EXISTS idx_versions_entity ON versions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_versions_created ON versions(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_unique ON versions(entity_type, entity_id, version_number);

-- ============================================
-- Audit Log Table
-- Complete change history
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action VARCHAR(100) NOT NULL,               -- 'user_created', 'user_updated', 'group_deleted', etc.
  actor VARCHAR(255),                         -- who did it (user or 'system')
  entity_type VARCHAR(50),                    -- 'user', 'group', 'config'
  entity_id VARCHAR(255),                     -- affected entity
  changes JSONB,                              -- what changed (before/after)
  source VARCHAR(50),                         -- 'sync', 'manual', 'api', 'ui'
  ip_address VARCHAR(45),                     -- IPv4 or IPv6
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);

-- ============================================
-- Sync History Table
-- Track sync cycles for reporting
-- ============================================
CREATE TABLE IF NOT EXISTS sync_history (
  id SERIAL PRIMARY KEY,
  cycle_id VARCHAR(100) UNIQUE NOT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  status VARCHAR(50),                         -- 'success', 'failed', 'partial'
  users_created INTEGER DEFAULT 0,
  users_updated INTEGER DEFAULT 0,
  users_deleted INTEGER DEFAULT 0,
  groups_synced INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  error_details JSONB,
  total_authentik_users INTEGER,
  total_ldap_users INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sync_history_started ON sync_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_history_status ON sync_history(status);

-- ============================================
-- User Profiles Table
-- Track user password status and alt-email
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  alt_email VARCHAR(255),
  password_method VARCHAR(50),                -- 'manual', 'email_invite', 'reset'
  password_created_at TIMESTAMP,
  password_synced_to_ldap BOOLEAN DEFAULT false,
  password_synced_to_authentik BOOLEAN DEFAULT false,
  email_invite_sent BOOLEAN DEFAULT false,
  email_invite_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_password_status ON user_profiles(password_method, password_synced_to_ldap);

-- ============================================
-- Webhooks Table
-- Store webhook configurations for events
-- ============================================
CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(500) NOT NULL,
  events VARCHAR[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks(events);

-- ============================================
-- Auth Users Table
-- Users who can log into ALSM UI
-- ============================================
CREATE TABLE IF NOT EXISTS auth_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  role VARCHAR(50) DEFAULT 'viewer',           -- 'admin', 'reviewer', 'viewer'
  active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(username);
CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users(role);

-- ============================================
-- Auth Sessions Table
-- Active login sessions
-- ============================================
CREATE TABLE IF NOT EXISTS auth_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES auth_users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
`

// Helper to check if database exists
async function checkDatabaseExists() {
  const checkConfig = {
    ...dbConfig,
    database: 'postgres', // Connect to default postgres db to check
  }
  
  const client = new pg.Client(checkConfig)
  
  try {
    await client.connect()
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbConfig.database]
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
  const checkConfig = {
    ...dbConfig,
    database: 'postgres',
  }
  
  const client = new pg.Client(checkConfig)
  
  try {
    await client.connect()
    await client.query(`CREATE DATABASE ${dbConfig.database}`)
    logger.info(`Database '${dbConfig.database}' created successfully`)
  } catch (error) {
    if (error.code === '42P04') {
      logger.info(`Database '${dbConfig.database}' already exists`)
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
    logger.info('Initializing database schema...')
    
    // Execute schema creation
    await client.query(schema)
    
    logger.info('Database schema initialized successfully')
    
    // Log table counts
    const tables = ['changes', 'versions', 'audit_log', 'sync_history']
    for (const table of tables) {
      const result = await client.query(`SELECT COUNT(*) FROM ${table}`)
      logger.info(`Table '${table}' exists with ${result.rows[0].count} rows`)
    }
    
  } catch (error) {
    logger.error('Failed to initialize database schema', { error: error.message })
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
    // Check if database exists, create if not
    const dbExists = await checkDatabaseExists()
    if (!dbExists) {
      logger.info(`Database '${dbConfig.database}' does not exist, creating...`)
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

// Export pool for use in other modules
export default pool