import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPoolQuery = vi.fn()
const mockPoolConnect = vi.fn()

vi.mock('../src/lib/db.js', () => ({
  pool: {
    query: mockPoolQuery,
    connect: mockPoolConnect,
  },
}))

let isSetupComplete, hasAdminUser, createSuperAdminIfNeeded, getServiceConfig

beforeEach(async () => {
  vi.resetAllMocks()
  const mod = await import('../src/services/config.js')
  isSetupComplete = mod.isSetupComplete
  hasAdminUser = mod.hasAdminUser
  createSuperAdminIfNeeded = mod.createSuperAdminIfNeeded
  getServiceConfig = mod.getServiceConfig
})

describe('isSetupComplete', () => {
  it('returns true when setup_complete is true', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ value: 'true' }] })
    const result = await isSetupComplete()
    expect(result).toBe(true)
  })

  it('returns false when no setup_complete row', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    const result = await isSetupComplete()
    expect(result).toBe(false)
  })
})

describe('hasAdminUser', () => {
  it('returns true when admin user exists', async () => {
    mockPoolConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ count: '1' }] }),
      release: vi.fn(),
    })
    const result = await hasAdminUser()
    expect(result).toBe(true)
  })

  it('returns false when no admin user', async () => {
    mockPoolConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ count: '0' }] }),
      release: vi.fn(),
    })
    const result = await hasAdminUser()
    expect(result).toBe(false)
  })
})

describe('createSuperAdminIfNeeded with no SUPER_ADMIN_PASS', () => {
  it('throws when no SUPER_ADMIN_PASS set', async () => {
    const oldPass = process.env.SUPER_ADMIN_PASS
    delete process.env.SUPER_ADMIN_PASS
    mockPoolConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    })
    await expect(createSuperAdminIfNeeded()).rejects.toThrow('SUPER_ADMIN_PASS')
    process.env.SUPER_ADMIN_PASS = oldPass
  })
})

describe('getServiceConfig', () => {
  it('fetches config from DB and applies env fallbacks', async () => {
    const fakeRows = [
      { key: 'host', value: '"ldap.example.com"' },
    ]
    mockPoolQuery.mockResolvedValue({ rows: fakeRows })
    mockPoolConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: fakeRows }),
      release: vi.fn(),
    })
    const config = await getServiceConfig('ldap')
    expect(config).toHaveProperty('host')
  })
})
