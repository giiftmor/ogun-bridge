/**
 * Liveness response shared by both startup modes.
 * Limited mode must be non-200 so Docker stops reporting a dead app as healthy.
 */
export function getLivenessResponse(mode, timestamp = new Date().toISOString()) {
  const body = {
    status: mode === 'limited' ? 'limited' : 'healthy',
    service: 'ogun-bridge-backend',
    timestamp,
  }

  return {
    httpStatus: mode === 'limited' ? 503 : 200,
    body,
  }
}
