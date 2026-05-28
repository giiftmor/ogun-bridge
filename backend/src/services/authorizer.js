import { pool } from '../lib/db.js'
import { logger } from '../utils/logger.js'

const BASE_ROLE_PRIORITY = {
  super_admin: 120, admin: 100, devops: 80, developer: 60,
  editor: 40, member: 30, viewer: 20, user: 10,
}

export async function resolveRoleForApp(appId, oidcSub, claimName, accessToken) {
  const cached = await pool.query(
    'SELECT base_role, business_role_id FROM app_users WHERE app_id = $1 AND oidc_sub = $2',
    [appId, oidcSub]
  )

  let baseRole = 'viewer'
  let businessRoleId = null

  if (cached.rows.length > 0) {
    baseRole = cached.rows[0].base_role
    businessRoleId = cached.rows[0].business_role_id
    await pool.query(
      'UPDATE app_users SET last_auth = NOW() WHERE app_id = $1 AND oidc_sub = $2',
      [appId, oidcSub]
    )
  } else {
    const roleClaim = await fetchRoleClaimFromAuthentik(accessToken, claimName)
    if (roleClaim && BASE_ROLE_PRIORITY[roleClaim] !== undefined) {
      baseRole = roleClaim
    }

    const brMatch = await pool.query(
      'SELECT id FROM business_roles WHERE name = $1 LIMIT 1',
      [baseRole]
    )
    if (brMatch.rows.length > 0) {
      businessRoleId = brMatch.rows[0].id
    }

    await pool.query(`
      INSERT INTO app_users (app_id, oidc_sub, base_role, business_role_id, last_auth)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (app_id, oidc_sub) DO UPDATE
        SET base_role = EXCLUDED.base_role,
            business_role_id = EXCLUDED.business_role_id,
            last_auth = NOW()
    `, [appId, oidcSub, baseRole, businessRoleId])
  }

  let businessRole = null
  if (businessRoleId) {
    const br = await pool.query(
      'SELECT id, name, display_name, base_role, modules FROM business_roles WHERE id = $1',
      [businessRoleId]
    )
    if (br.rows.length > 0) {
      const row = br.rows[0]
      businessRole = {
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        baseRole: row.base_role,
        modules: row.modules,
      }
    }
  }

  return { baseRole, businessRole }
}

async function fetchRoleClaimFromAuthentik(accessToken, claimName) {
  try {
    const authUrl = process.env.AUTHENTIK_URL || 'https://auth.spectres.co.za'
    const res = await fetch(`${authUrl}/application/o/userinfo/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const claims = await res.json()
    return claims[claimName] || null
  } catch (error) {
    logger.error('Failed to fetch role claim from Authentik', { error: error.message })
    return null
  }
}
