import pg from 'pg'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { fileURLToPath } from 'url'
import { logger } from '../utils/logger.js'

// dotenv is loaded in index.js before any async code — no need to call again here
const { Pool } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_CONFIG_PATH = path.resolve(__dirname, '../../data/db-config.json')

// Helper to get DB config at runtime (after dotenv loads)
function getDbConfig() {
  // Start with env vars
  const rawPassword = process.env.DB_PASSWORD || ''
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'alsm_ui',
    user: process.env.DB_USER || 'postgres',
    password: rawPassword.replace(/^["']|["']$/g, ''),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }

  // Override with file-based config (saved via setup wizard when DB is down)
  try {
    const fileConfig = loadDbConfigFromFile()
    if (fileConfig) {
      config.host = fileConfig.host || config.host
      config.port = fileConfig.port !== undefined ? fileConfig.port : config.port
      config.database = fileConfig.database || config.database
      config.user = fileConfig.user || config.user
      config.password = fileConfig.password !== undefined ? fileConfig.password : config.password
    }
  } catch {
    // File doesn't exist or is invalid — use env defaults
  }

  return config
}

function getDbConfigPath() {
  const dir = path.dirname(DB_CONFIG_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return DB_CONFIG_PATH
}

function loadDbConfigFromFile() {
  try {
    if (fs.existsSync(DB_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(DB_CONFIG_PATH, 'utf-8'))
    }
  } catch (e) {
    logger.warn('Failed to read DB config file:', e.message)
  }
  return null
}

function saveDbConfigToFile(config) {
  try {
    const filePath = getDbConfigPath()
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2))
    logger.info('DB config saved to file:', filePath)
  } catch (e) {
    logger.warn('Could not save DB config to file (non-fatal):', e.message)
  }
}

// Create pool normally - env vars will be available when first query runs
// because dotenv.config() is called at the top of index.js before any async code
const dbConfig = getDbConfig()
export let pool = new Pool(dbConfig)

// Pool metrics
export const poolMetrics = {
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0,
}

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message })
})

pool.on('connect', () => {
  poolMetrics.totalCount = pool.totalCount
  poolMetrics.idleCount = pool.idleCount
  poolMetrics.waitingCount = pool.waitingCount
})

pool.on('acquire', () => {
  poolMetrics.totalCount = pool.totalCount
  poolMetrics.idleCount = pool.idleCount
  poolMetrics.waitingCount = pool.waitingCount
})

pool.on('remove', () => {
  poolMetrics.totalCount = pool.totalCount
  poolMetrics.idleCount = pool.idleCount
  poolMetrics.waitingCount = pool.waitingCount
})

/**
 * Check if the database pool can establish a connection
 */
export async function isDbConnected() {
  try {
    const client = await pool.connect()
    await client.query('SELECT 1')
    client.release()
    return true
  } catch {
    return false
  }
}

/**
 * Reconfigure the database pool with new settings
 * Saves config to file so it persists across restarts
 */
export async function reconfigurePool(newConfig) {
  // Close existing pool
  try {
    await pool.end()
  } catch (e) {
    logger.warn('Error closing existing pool:', e.message)
  }

  // Save to file for persistence (used before env vars on next startup)
  saveDbConfigToFile(newConfig)

  // Create new pool
  const config = {
    host: newConfig.host || 'localhost',
    port: parseInt(newConfig.port) || 5432,
    database: newConfig.database || 'ogun_bridge',
    user: newConfig.user || 'postgres',
    password: newConfig.password || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }

  pool = new Pool(config)

  // Re-attach error handler
  pool.on('error', (err) => {
    logger.error('Unexpected database pool error', { error: err.message })
  })

  logger.info('Database pool reconfigured')
  return true
}

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
  source VARCHAR(50) DEFAULT 'api',
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'api';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS error_message TEXT;

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
  email_invite_sent BOOLEAN DEFAULT false,
  email_invite_sent_at TIMESTAMP,
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
-- Auth Users Table (admin/super_admin accounts)
-- ============================================
CREATE TABLE IF NOT EXISTS auth_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  email VARCHAR(255),
  role VARCHAR(50) DEFAULT 'viewer',
  active BOOLEAN DEFAULT true,
  oidc_id VARCHAR(255),
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(username);
CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users(role);
CREATE INDEX IF NOT EXISTS idx_auth_users_oidc ON auth_users(oidc_id);

-- ── Auth sessions (OIDC session tokens) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

-- ── Apps registry (service-to-service auth) ──────────────────────────────
CREATE TABLE IF NOT EXISTS apps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    api_key VARCHAR(255) UNIQUE NOT NULL,
    claim_name VARCHAR(100) NOT NULL,
    role_mapping JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_apps_slug ON apps(slug);
CREATE INDEX IF NOT EXISTS idx_apps_api_key ON apps(api_key);

-- ── Business roles (migrated from Spectres-Pantheon) ────────────────────
CREATE TABLE IF NOT EXISTS business_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    base_role VARCHAR(50) DEFAULT 'member',
    modules JSONB NOT NULL DEFAULT '{}',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Per-app user cache (delegated storage) ─────────────────────────────
CREATE TABLE IF NOT EXISTS app_users (
    id SERIAL PRIMARY KEY,
    app_id INTEGER REFERENCES apps(id) ON DELETE CASCADE,
    oidc_sub VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    base_role VARCHAR(50) DEFAULT 'viewer',
    business_role_id INTEGER REFERENCES business_roles(id),
    last_auth TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(app_id, oidc_sub)
);

CREATE INDEX IF NOT EXISTS idx_app_users_app_sub ON app_users(app_id, oidc_sub);

-- ── RBAC: Base roles (predefined, system-level) ─────────────────────────
CREATE TABLE IF NOT EXISTS base_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    priority INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── RBAC: Role definitions (per-app custom roles) ───────────────────────
CREATE TABLE IF NOT EXISTS role_definitions (
    id SERIAL PRIMARY KEY,
    app_slug VARCHAR(100) REFERENCES apps(slug) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    base_role VARCHAR(50) DEFAULT 'viewer',
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255),
    UNIQUE(app_slug, name)
);

CREATE INDEX IF NOT EXISTS idx_role_definitions_app ON role_definitions(app_slug);

-- ── RBAC: Role permissions (module-level CRUD per role) ─────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    role_definition_id INTEGER REFERENCES role_definitions(id) ON DELETE CASCADE,
    module_name VARCHAR(100) NOT NULL,
    actions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_definition_id, module_name)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_definition_id);

-- ── RBAC: Group → Role mappings (Authentik groups to Ogun Bridge roles) ─
CREATE TABLE IF NOT EXISTS group_role_mappings (
    id SERIAL PRIMARY KEY,
    app_slug VARCHAR(100) REFERENCES apps(slug) ON DELETE CASCADE,
    authentik_group VARCHAR(255) NOT NULL,
    role_definition_id INTEGER REFERENCES role_definitions(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255),
    UNIQUE(app_slug, authentik_group)
);

CREATE INDEX IF NOT EXISTS idx_group_role_mappings_app ON group_role_mappings(app_slug);
CREATE INDEX IF NOT EXISTS idx_group_role_mappings_group ON group_role_mappings(authentik_group);

-- ── RBAC: App module schemas (cached, hybrid push + admin override) ─────
CREATE TABLE IF NOT EXISTS app_schemas (
    id SERIAL PRIMARY KEY,
    app_slug VARCHAR(100) UNIQUE REFERENCES apps(slug) ON DELETE CASCADE,
    modules JSONB NOT NULL DEFAULT '[]',
    source VARCHAR(50) DEFAULT 'app_push',
    last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── RBAC: Add new columns to existing tables ────────────────────────────
ALTER TABLE apps ADD COLUMN IF NOT EXISTS authentik_slug VARCHAR(100);
ALTER TABLE apps ADD COLUMN IF NOT EXISTS access_group VARCHAR(255);
ALTER TABLE apps ADD COLUMN IF NOT EXISTS schema_endpoint VARCHAR(255);
ALTER TABLE apps ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role_definition_id INTEGER REFERENCES role_definitions(id);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS permissions_cache JSONB;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_sync TIMESTAMP;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_override BOOLEAN DEFAULT false;

-- Legacy admin_users table (kept for backward compatibility)
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

ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS used_at TIMESTAMP;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email_invite_sent BOOLEAN DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email_invite_sent_at TIMESTAMP;

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service, key)
  );

ALTER TABLE service_configs ADD COLUMN IF NOT EXISTS last_override_at TIMESTAMP;
ALTER TABLE service_configs ADD COLUMN IF NOT EXISTS override_by VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_service_configs_service ON service_configs(service);
CREATE INDEX IF NOT EXISTS idx_service_configs_lookup ON service_configs(service, key);

-- ============================================
-- Field Mappings Table (Authentik ↔ LDAP)
-- ============================================
-- ============================================
-- Group Sync Config Table
-- ============================================
CREATE TABLE IF NOT EXISTS group_sync_config (
  group_name VARCHAR(255) PRIMARY KEY,
  sync_direction VARCHAR(50) DEFAULT 'bidirectional',
  ldap_ou VARCHAR(255),
  parent_group VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  group_pk INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Group Services Table
-- ============================================
CREATE TABLE IF NOT EXISTS group_services (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(255) NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  service_url TEXT,
  service_type VARCHAR(50),
  description TEXT,
  icon VARCHAR(50) DEFAULT 'default',
  is_public BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_name, service_name)
);

CREATE INDEX IF NOT EXISTS idx_group_services_group ON group_services(group_name);
CREATE INDEX IF NOT EXISTS idx_group_services_service ON group_services(service_name);

-- ============================================
-- Sync State Table
-- ============================================
CREATE TABLE IF NOT EXISTS sync_state (
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  sync_direction VARCHAR(50) DEFAULT 'bidirectional',
  metadata JSONB,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_state_entity ON sync_state(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_synced ON sync_state(last_synced_at DESC);

-- ============================================
-- Field Mappings Table (Authentik ↔ LDAP)
-- ============================================
CREATE TABLE IF NOT EXISTS field_mappings (
  id SERIAL PRIMARY KEY,
  authentik_field VARCHAR(100) NOT NULL UNIQUE,
  ldap_attribute VARCHAR(100) NOT NULL,
  is_required BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  transformation TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default mappings
INSERT INTO field_mappings (authentik_field, ldap_attribute, is_required, is_locked, transformation, description, sort_order)
VALUES
  ('username', 'uid', true, true, NULL, 'Login username', 0),
  ('email', 'mail', true, false, NULL, 'Primary email address', 1),
  ('name', 'cn', true, false, NULL, 'Common name / display name', 2),
  ('name || username', 'sn', true, false, 'name username', 'Surname — falls back to username if name is empty', 3),
  ('phone', 'telephoneNumber', false, false, NULL, 'Phone number', 4),
  ('groups', 'memberOf', false, false, NULL, 'Group membership DN list', 5)
ON CONFLICT (authentik_field) DO NOTHING;
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

    // Seed role_permissions for ogun (only if not already seeded)
    const existingOgunPerms = await pool.query(`
      SELECT COUNT(*) FROM role_permissions rp
      JOIN role_definitions rd ON rd.id = rp.role_definition_id
      WHERE rd.app_slug = 'ogun'
    `)
    if (parseInt(existingOgunPerms.rows[0].count) === 0) {
      const ogunRoles = await pool.query(
        "SELECT id, name FROM role_definitions WHERE app_slug = 'ogun'"
      )
      const roleMap = {}
      for (const r of ogunRoles.rows) roleMap[r.name] = r.id

      if (roleMap.admin) {
        await pool.query(`
          INSERT INTO role_permissions (role_definition_id, module_name, actions) VALUES
          ($1, 'dashboard', '["read","write"]'),
          ($1, 'password', '["read","write","manage"]'),
          ($1, 'users', '["read","write","manage"]'),
          ($1, 'groups', '["read","write"]'),
          ($1, 'rbac', '["read","write"]'),
          ($1, 'audit', '["read"]'),
          ($1, 'logs', '["read"]'),
          ($1, 'settings', '["read","write"]')
          ON CONFLICT (role_definition_id, module_name) DO NOTHING
        `, [roleMap.admin])
      }
      if (roleMap.password_manager) {
        await pool.query(`
          INSERT INTO role_permissions (role_definition_id, module_name, actions) VALUES
          ($1, 'dashboard', '["read"]'),
          ($1, 'password', '["read","write","manage"]'),
          ($1, 'users', '["read"]'),
          ($1, 'audit', '["read"]'),
          ($1, 'logs', '["read"]')
          ON CONFLICT (role_definition_id, module_name) DO NOTHING
        `, [roleMap.password_manager])
      }
      if (roleMap.viewer) {
        await pool.query(`
          INSERT INTO role_permissions (role_definition_id, module_name, actions) VALUES
          ($1, 'dashboard', '["read"]'),
          ($1, 'audit', '["read"]'),
          ($1, 'logs', '["read"]')
          ON CONFLICT (role_definition_id, module_name) DO NOTHING
        `, [roleMap.viewer])
      }
      logger.info('Seeded role_permissions for ogun')
    }

    // Seed app_schemas for all apps (only if not already seeded)
    const existingSchemas = await pool.query('SELECT COUNT(*) FROM app_schemas')
    if (parseInt(existingSchemas.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO app_schemas (app_slug, modules, source, last_synced, updated_at)
        VALUES
        ('ogun', $1, 'seed', NOW(), NOW()),
        ('spectres', $2, 'seed', NOW(), NOW()),
        ('thoth', $3, 'seed', NOW(), NOW())
        ON CONFLICT (app_slug) DO NOTHING
      `, [
        JSON.stringify([
          { name: 'dashboard', actions: ['read', 'write'], description: 'Main dashboard overview' },
          { name: 'password', actions: ['read', 'write', 'manage'], description: 'Password management' },
          { name: 'users', actions: ['read', 'write', 'manage'], description: 'User management' },
          { name: 'groups', actions: ['read', 'write'], description: 'Group management' },
          { name: 'rbac', actions: ['read', 'write'], description: 'RBAC and app management' },
          { name: 'audit', actions: ['read'], description: 'Audit log viewer' },
          { name: 'logs', actions: ['read'], description: 'System logs viewer' },
          { name: 'settings', actions: ['read', 'write'], description: 'Application settings' },
        ]),
        JSON.stringify([
          { name: 'dashboard', actions: ['read', 'write'], description: 'Pantheon dashboard' },
          { name: 'projects', actions: ['read', 'write', 'manage'], description: 'Project management' },
          { name: 'tasks', actions: ['read', 'write'], description: 'Task management' },
          { name: 'tickets', actions: ['read', 'write', 'manage'], description: 'Ticket system' },
          { name: 'clients', actions: ['read', 'write'], description: 'Client management' },
          { name: 'time', actions: ['read', 'write'], description: 'Time tracking' },
          { name: 'finances', actions: ['read', 'write'], description: 'Financial records' },
        ]),
        JSON.stringify([
          { name: 'dashboard', actions: ['read'], description: 'ESU gateway dashboard and statistics' },
          { name: 'emails', actions: ['read', 'write', 'delete'], description: 'Email management (send, view, delete, relay)' },
          { name: 'settings', actions: ['read', 'write'], description: 'Application settings, templates, API keys, password management' },
          { name: 'config', actions: ['read', 'write'], description: 'Server configuration (mailserver, OIDC, YAML config)' },
          { name: 'webhooks', actions: ['read', 'create', 'edit', 'delete'], description: 'Webhook management' },
          { name: 'audits', actions: ['read', 'write', 'delete'], description: 'Audit logs and retry operations' },
          { name: 'logs', actions: ['read'], description: 'System logs viewer' },
        ]),
      ])
      logger.info('Seeded app_schemas for all apps')
    }

    // Seed base roles (only if not already seeded)
    const existingBaseRoles = await pool.query('SELECT COUNT(*) FROM base_roles')
    if (parseInt(existingBaseRoles.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO base_roles (name, display_name, priority, is_system, description) VALUES
        ('super_admin', 'Super Admin', 120, true, 'Unrestricted access to all apps and settings'),
        ('admin', 'Admin', 100, true, 'Administrative access with app-level restrictions'),
        ('viewer', 'Viewer', 20, true, 'Read-only access to assigned modules')
        ON CONFLICT (name) DO NOTHING
      `)
      logger.info('Seeded base roles')
    }

    // Seed default apps (only if not already seeded)
    const existingApps = await pool.query('SELECT COUNT(*) FROM apps')
    if (parseInt(existingApps.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO apps (name, slug, display_name, api_key, claim_name, authentik_slug, access_group, schema_endpoint, is_active) VALUES
        ('Groove Payroll', 'groove', 'Groove Payroll', $1, 'groove_role', 'groove-payroll', 'groove-payroll', 'http://groove:5005/api/rbac/schema', true),
        ('Spectres Pantheon', 'spectres', 'Spectres Pantheon', $2, 'spectre_role', 'spectres-pantheon', 'spectres-pantheon', 'http://spectres:8764/api/rbac/schema', true),
        ('Thoth ESU Gateway', 'thoth', 'Thoth ESU Gateway', $3, 'thoth_role', 'thoth-esu-gateway', 'thoth-esu-gateway', 'http://api:3010/api/rbac/schema', true),
        ('Ogun Bridge', 'ogun', 'Ogun Bridge', $4, 'ogun_role', 'ogun-bridge', 'ogun-bridge', null, true)
        ON CONFLICT (slug) DO NOTHING
      `, [
        crypto.randomBytes(24).toString('hex'),
        crypto.randomBytes(24).toString('hex'),
        crypto.randomBytes(24).toString('hex'),
        crypto.randomBytes(24).toString('hex'),
      ])
      logger.info('Seeded default apps with API keys')
    }

    // Seed default business roles
    const existingRoles = await pool.query('SELECT COUNT(*) FROM business_roles')
    if (parseInt(existingRoles.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO business_roles (name, display_name, description, base_role, modules, is_system) VALUES
        ('developer', 'Developer', 'Software development and technical tasks', 'member',
         '{"dashboard":true,"projects":{"view":true,"create":true,"edit":true},"tasks":{"view":true,"create":true,"edit":true},"timeTracking":true,"documents":{"view":true,"upload":true},"calendar":true,"tickets":{"view":true,"create":true,"comment":true},"clients":{"view":true},"finances":false,"reports":false,"settings":false}',
         true),
        ('designer', 'Designer', 'UI/UX design and creative work', 'member',
         '{"dashboard":true,"projects":{"view":true,"create":true},"tasks":{"view":true,"create":true},"documents":{"view":true,"upload":true},"clients":{"view":true},"finances":false,"reports":false,"settings":false}',
         true),
        ('support_agent', 'Support Agent', 'Customer support and ticket handling', 'member',
         '{"dashboard":true,"tasks":{"view":true,"create":true,"comment":true},"tickets":{"view":true,"create":true,"comment":true},"clients":{"view":true},"reports":true,"settings":false}',
         true),
        ('account_manager', 'Account Manager', 'Client account and financial management', 'member',
         '{"dashboard":true,"projects":{"view":true},"clients":{"view":true},"finances":{"view":true,"create":true},"reports":true,"settings":false}',
         true)
        ON CONFLICT (name) DO NOTHING
      `)
      logger.info('Seeded default business roles')
    }

    // Add rbac module to existing Ogun admin role_permissions if missing
    const ogunRbacExists = await pool.query(`
      SELECT 1 FROM role_permissions rp
      JOIN role_definitions rd ON rd.id = rp.role_definition_id
      WHERE rd.app_slug = 'ogun' AND rd.name = 'admin' AND rp.module_name = 'rbac'
    `)
    if (ogunRbacExists.rows.length === 0) {
      await pool.query(`
        INSERT INTO role_permissions (role_definition_id, module_name, actions)
        SELECT id, 'rbac', '["read","write"]'
        FROM role_definitions
        WHERE app_slug = 'ogun' AND name = 'admin'
        ON CONFLICT (role_definition_id, module_name) DO NOTHING
      `)
      logger.info('Added rbac module to existing Ogun admin role')
    }

    // Add rbac module to existing Ogun app_schema if missing
    const existingOgunSchema = await pool.query(
      "SELECT modules FROM app_schemas WHERE app_slug = 'ogun'"
    )
    if (existingOgunSchema.rows.length > 0) {
      const modules = existingOgunSchema.rows[0].modules
      if (Array.isArray(modules) && !modules.some(m => m.name === 'rbac')) {
        modules.push({ name: 'rbac', actions: ['read', 'write'], description: 'RBAC and app management' })
        await pool.query(
          "UPDATE app_schemas SET modules = $1, updated_at = NOW() WHERE app_slug = 'ogun'",
          [JSON.stringify(modules)]
        )
        logger.info('Added rbac module to existing Ogun app_schema')
      }
    }

    // Migrate plaintext API keys to bcrypt hashes
    const unhashed = await pool.query("SELECT id, api_key FROM apps WHERE api_key NOT LIKE '$2%'")
    if (unhashed.rows.length > 0) {
      for (const row of unhashed.rows) {
        const hashed = await bcrypt.hash(row.api_key, 12)
        await pool.query('UPDATE apps SET api_key = $1 WHERE id = $2', [hashed, row.id])
      }
      logger.info(`Hashed ${unhashed.rows.length} plaintext API keys`)
    }
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
    
    // Test basic connection first
    const connected = await testConnection()
    if (!connected) {
      logger.error('Database connection failed — will retry with setup wizard')
      return false
    }
    
    // Check if database exists, create if not
    const dbExists = await checkDatabaseExists()
    if (!dbExists) {
      logger.info(`Database '${config.database}' does not exist, creating...`)
      await createDatabase()
    }
    
    // Initialize tables
    await initializeTables()
    
    logger.info('Database initialization complete')
    return true
    
  } catch (error) {
    logger.error('Database initialization failed', { 
      error: error.message,
    })
    return false
  }
}

// Graceful shutdown
export async function closeDatabase() {
  await pool.end()
  logger.info('Database connections closed')
}
