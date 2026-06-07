import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPoolQuery = vi.fn()
vi.mock('../src/lib/db.js', () => ({
  pool: { query: mockPoolQuery },
}))

const mockCreateAuditLog = vi.fn()
vi.mock('../src/services/auditService.js', () => ({
  createAuditLog: mockCreateAuditLog,
}))

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
vi.mock('../src/utils/logger.js', () => ({
  logger: mockLogger,
}))

const fakeFetch = vi.fn()
global.fetch = fakeFetch

// We import these after mocks are set up
let pushAppSchema, runSchemaDiscoveryCycle

beforeEach(async () => {
  vi.resetAllMocks()
  const mod = await import('../src/routes/rbac.js')
  pushAppSchema = mod.pushAppSchema
  const sds = await import('../src/services/schemaDiscoveryService.js')
  runSchemaDiscoveryCycle = sds.runSchemaDiscoveryCycle
})

function makeReq(overrides = {}) {
  return {
    body: {},
    params: {},
    ...overrides,
  }
}

function makeRes() {
  const json = vi.fn()
  const status = vi.fn(() => ({ json }))
  return { status, json, end: vi.fn() }
}

// ── pushAppSchema handler ─────────────────────────────────────────────

describe('pushAppSchema', () => {
  it('returns 400 when modules is not an array', async () => {
    const req = makeReq({
      params: { appSlug: 'test-app' },
      body: { modules: 'not-array' },
    })
    const res = makeRes()
    await pushAppSchema(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'modules must be an array' })
    )
  })

  it('returns 403 when API key slug does not match URL slug', async () => {
    const req = makeReq({
      params: { appSlug: 'other-app' },
      body: { modules: [{ name: 'dashboard', actions: ['read'] }] },
      app: { slug: 'test-app' },
    })
    const res = makeRes()
    await pushAppSchema(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'API key does not match this app' })
    )
  })

  it('pushes schema and returns success', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    const modules = [{ name: 'dashboard', actions: ['read', 'write'] }]
    const req = makeReq({
      params: { appSlug: 'my-app' },
      body: { modules },
      app: { slug: 'my-app' },
    })
    const res = makeRes()
    await pushAppSchema(req, res)
    expect(res.json).toHaveBeenCalledWith({ success: true })
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO app_schemas'),
      ['my-app', JSON.stringify(modules)]
    )
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rbac_schema_pushed',
        entity_id: 'my-app',
      })
    )
  })

  it('works without req.app (admin push)', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    const modules = [{ name: 'dashboard', actions: ['read'] }]
    const req = makeReq({
      params: { appSlug: 'my-app' },
      body: { modules },
    })
    const res = makeRes()
    await pushAppSchema(req, res)
    expect(res.json).toHaveBeenCalledWith({ success: true })
  })

  it('returns 500 on DB error', async () => {
    mockPoolQuery.mockRejectedValue(new Error('DB down'))
    const req = makeReq({
      params: { appSlug: 'my-app' },
      body: { modules: [{ name: 'dashboard', actions: ['read'] }] },
      app: { slug: 'my-app' },
    })
    const res = makeRes()
    await pushAppSchema(req, res)
    expect(res.status).toHaveBeenCalledWith(500)
  })
})

// ── runSchemaDiscoveryCycle ─────────────────────────────────────────

describe('runSchemaDiscoveryCycle', () => {
  it('does nothing when no apps have schema_endpoint', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    await runSchemaDiscoveryCycle(null)
    expect(fakeFetch).not.toHaveBeenCalled()
  })

  it('polls schema_endpoint for each app and updates app_schemas', async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [
        { slug: 'app-a', name: 'App A', schema_endpoint: 'https://app-a.dev/schema' },
        { slug: 'app-b', name: 'App B', schema_endpoint: 'https://app-b.dev/schema' },
      ],
    })

    fakeFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ modules: [{ name: 'dashboard', actions: ['read'] }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ modules: [{ name: 'reports', actions: ['read', 'write'] }] }),
      })

    await runSchemaDiscoveryCycle(null)

    expect(fakeFetch).toHaveBeenCalledTimes(2)
    expect(fakeFetch).toHaveBeenCalledWith('https://app-a.dev/schema', expect.any(Object))
    expect(fakeFetch).toHaveBeenCalledWith('https://app-b.dev/schema', expect.any(Object))
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO app_schemas'),
      ['app-a', JSON.stringify([{ name: 'dashboard', actions: ['read'] }])]
    )
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO app_schemas'),
      ['app-b', JSON.stringify([{ name: 'reports', actions: ['read', 'write'] }])]
    )
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rbac_schema_auto_discovered', entity_id: 'app-a' })
    )
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rbac_schema_auto_discovered', entity_id: 'app-b' })
    )
  })

  it('handles fetch errors gracefully per app', async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [
        { slug: 'app-a', name: 'App A', schema_endpoint: 'https://app-a.dev/schema' },
        { slug: 'app-b', name: 'App B', schema_endpoint: 'https://app-b.dev/schema' },
      ],
    })

    fakeFetch
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ modules: [{ name: 'dashboard', actions: ['read'] }] }),
      })

    await runSchemaDiscoveryCycle(null)

    // First app should have been skipped
    expect(fakeFetch).toHaveBeenCalledTimes(2)
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT'),
      ['app-b', expect.any(String)]
    )
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      expect.objectContaining({ endpoint: 'https://app-a.dev/schema' })
    )
  })

  it('handles non-array response from endpoint', async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [
        { slug: 'app-a', name: 'App A', schema_endpoint: 'https://app-a.dev/schema' },
      ],
    })

    fakeFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ modules: 'not-an-array' }),
    })

    await runSchemaDiscoveryCycle(null)

    expect(mockPoolQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT'),
      ['app-a', expect.any(String)]
    )
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('did not return an array'),
      expect.any(Object)
    )
  })

  it('handles non-ok HTTP response', async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [
        { slug: 'app-a', name: 'App A', schema_endpoint: 'https://app-a.dev/schema' },
      ],
    })

    fakeFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await runSchemaDiscoveryCycle(null)

    expect(mockPoolQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT'),
      ['app-a', expect.any(String)]
    )
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('returned 500'),
      expect.any(Object)
    )
  })

  it('does not run while another cycle is in progress', async () => {
    let resolveQuery
    mockPoolQuery.mockReturnValue(new Promise(r => { resolveQuery = r }))
    const cycle1 = runSchemaDiscoveryCycle(null)
    // Give microtask to set running=true
    await new Promise(r => setTimeout(r, 5))
    const cycle2 = runSchemaDiscoveryCycle(null)
    // cycle2 should finish immediately
    await cycle2
    expect(mockPoolQuery).toHaveBeenCalledTimes(1)
    // Clean up
    resolveQuery({ rows: [] })
    await cycle1
  })
})
