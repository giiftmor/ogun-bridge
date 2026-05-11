import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPoolQuery = vi.fn()
vi.mock('../src/lib/db.js', () => ({
  pool: { query: mockPoolQuery },
}))

let healthRouter

beforeEach(async () => {
  vi.resetAllMocks()
  const mod = await import('../src/routes/health.js')
  healthRouter = mod.healthRouter
})

describe('healthRouter', () => {
  it('is a valid Express router', () => {
    expect(healthRouter).toBeDefined()
    expect(typeof healthRouter).toBe('function')
    expect(healthRouter.stack).toBeDefined()
    expect(Array.isArray(healthRouter.stack)).toBe(true)
  })

  it('has at least one route defined', () => {
    expect(healthRouter.stack.length).toBeGreaterThan(0)
  })
})
