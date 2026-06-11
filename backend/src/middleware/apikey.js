import { pool } from "../lib/db.js"
import { logger } from "../utils/logger.js"
import bcrypt from "bcryptjs"

export function requireRegistrationSecret(req, res, next) {
  const secret = req.headers.authorization?.replace("Bearer ", "")
  const expected = process.env.RBAC_REGISTRATION_SECRET

  if (!expected) {
    return res.status(501).json({ error: "Registration not configured. Set RBAC_REGISTRATION_SECRET env var." })
  }

  if (!secret || secret !== expected) {
    return res.status(401).json({ error: "Invalid registration secret" })
  }

  next()
}

export async function requireAppApiKey(req, res, next) {
  const apiKey = req.headers["x-api-key"]
  if (!apiKey) {
    return res.status(401).json({ error: "Missing X-Api-Key header" })
  }

  try {
    const apps = await pool.query(
      "SELECT id, name, slug, claim_name, role_mapping, is_active, api_key FROM apps WHERE is_active = true",
    )

    let matchedApp = null
    for (const app of apps.rows) {
      if (app.api_key.startsWith('$2')) {
        if (await bcrypt.compare(apiKey, app.api_key)) {
          matchedApp = app
          break
        }
      } else {
        if (apiKey === app.api_key) {
          matchedApp = app
          break
        }
      }
    }

    if (!matchedApp) {
      logger.warn("[SECURITY] Invalid API key attempt", { ip: req.ip, userAgent: req.headers["user-agent"] })
      return res.status(401).json({ error: "Invalid API key" })
    }

    req.app = matchedApp
    next()
  } catch (error) {
    logger.error("API key validation error", { error: error.message })
    return res.status(500).json({ error: "Internal server error" })
  }
}
