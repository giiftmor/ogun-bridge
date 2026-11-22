import { describe, it, expect } from 'vitest'
import { verifyCriticalServices } from '../src/services/startupHealth.js'

const healthy = { db: true, authentik: true, smtp: false }
const transientFailure = {
  db: true,
  authentik: false,
  smtp: false,
  errors: ['Authentik: Service Unavailable'],
}
const configFailure = {
  db: true,
  authentik: false,
  smtp: false,
  errors: ['Authentik: Missing URL or token'],
}

describe('verifyCriticalServices', () => {
  it('retries a transient Authentik failure before succeeding', async () => {
    const seen = []
    const verify = async () => {
      seen.push(1)
      return seen.length === 1 ? transientFailure : healthy
    }

    const result = await verifyCriticalServices(verify, { attempts: 3, delayMs: 1 })

    expect(result.authentik).toBe(true)
    expect(seen).toHaveLength(2)
  })

  it('does not retry when Authentik is genuinely misconfigured', async () => {
    const seen = []
    const verify = async () => {
      seen.push(1)
      return configFailure
    }

    const result = await verifyCriticalServices(verify, { attempts: 3, delayMs: 1 })

    expect(result.authentik).toBe(false)
    expect(seen).toHaveLength(1)
  })

  it('returns the last result when retries are exhausted', async () => {
    const seen = []
    const verify = async () => {
      seen.push(1)
      return transientFailure
    }

    const result = await verifyCriticalServices(verify, { attempts: 3, delayMs: 1 })

    expect(result.authentik).toBe(false)
    expect(seen).toHaveLength(3)
  })
})
