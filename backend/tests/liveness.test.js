import { describe, it, expect } from 'vitest'
import { getLivenessResponse } from '../src/services/liveness.js'

describe('getLivenessResponse', () => {
  it('reports full mode as healthy with HTTP 200', () => {
    const { httpStatus, body } = getLivenessResponse('full', '2026-11-22T00:00:00.000Z')

    expect(httpStatus).toBe(200)
    expect(body.status).toBe('healthy')
    expect(body.timestamp).toBe('2026-11-22T00:00:00.000Z')
  })

  it('reports limited mode as unhealthy with HTTP 503', () => {
    const { httpStatus, body } = getLivenessResponse('limited', '2026-11-22T00:00:00.000Z')

    expect(httpStatus).toBe(503)
    expect(body.status).toBe('limited')
    expect(body.timestamp).toBe('2026-11-22T00:00:00.000Z')
  })
})
