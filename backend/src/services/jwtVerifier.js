import { createRemoteJWKSet, jwtVerify } from 'jose'
import { logger } from '../utils/logger.js'

let remoteJWKSet = null
let cachedIssuer = null

function getJWKSet(forceRefresh = false) {
  const issuer = process.env.AUTHENTIK_OIDC_ISSUER
  if (!issuer) throw new Error('AUTHENTIK_OIDC_ISSUER not configured')

  if (remoteJWKSet && cachedIssuer === issuer && !forceRefresh) return remoteJWKSet

  const jwksUrl = new URL(`${issuer.replace(/\/+$/, '')}/jwks`)
  remoteJWKSet = createRemoteJWKSet(jwksUrl)
  cachedIssuer = issuer
  return remoteJWKSet
}

const KEY_ERROR_PATTERNS = [
  'key not found',
  'jwks',
  'jwks_uri',
  'no matching key',
  'key fetch failed',
  'unable to get key',
]

function isKeyError(error) {
  const msg = error.message?.toLowerCase() || ''
  return KEY_ERROR_PATTERNS.some(pattern => msg.includes(pattern))
}

export async function verifyIdToken(idToken, options = {}) {
  if (!idToken) {
    return { valid: false, error: 'No ID token provided' }
  }

  const issuer = process.env.AUTHENTIK_OIDC_ISSUER
  const clientId = process.env.AUTHENTIK_CLIENT_ID

  if (!issuer || !clientId) {
    return { valid: false, error: 'OIDC issuer or client ID not configured' }
  }

  const clockTolerance = options.clockTolerance ?? parseInt(process.env.JWT_CLOCK_TOLERANCE_SECONDS || '30', 10)

  const doVerify = async () => {
    const JWKS = getJWKSet()
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: issuer.replace(/\/+$/, ''),
      audience: clientId,
      clockTolerance,
    })
    return payload
  }

  let payload
  try {
    payload = await doVerify()
  } catch (error) {
    if (isKeyError(error)) {
      logger.info('JWKS key error, refreshing cache and retrying', { error: error.message })
      try {
        payload = await retryWithFreshJWKS(idToken, issuer, clientId, clockTolerance)
      } catch (retryError) {
        logger.warn('ID token verification failed after JWKS refresh', { error: retryError.message })
        return { valid: false, error: retryError.message }
      }
    } else {
      logger.warn('ID token verification failed', { error: error.message })
      return { valid: false, error: error.message }
    }
  }

  if (options.nonce && payload.nonce && payload.nonce !== options.nonce) {
    return { valid: false, error: 'Nonce mismatch' }
  }

  if (payload.azp && payload.azp !== clientId) {
    return { valid: false, error: 'azp mismatch: token was issued for a different client' }
  }

  return { valid: true, payload }
}

async function retryWithFreshJWKS(token, issuer, clientId, clockTolerance) {
  const JWKS = getJWKSet(true)

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: issuer.replace(/\/+$/, ''),
    audience: clientId,
    clockTolerance,
  })
  return payload
}
