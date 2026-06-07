import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPoolQuery = vi.fn()

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
}
const mockPoolConnect = vi.fn().mockResolvedValue(mockClient)

vi.mock('../src/lib/db.js', () => ({
  pool: { query: mockPoolQuery, connect: mockPoolConnect },
}))

const mockCreateAuditLog = vi.fn()
vi.mock('../src/services/auditService.js', () => ({
  createAuditLog: mockCreateAuditLog,
}))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    if (!req.user) req.user = { role: 'super_admin', username: 'testadmin' }
    next()
  },
  requireSuperAdmin: (req, res, next) => {
    req.user = req.user || { role: 'super_admin', username: 'testadmin' }
    next()
  },
  requireAppApiKey: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
}))

let rbacRouter

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(async () => {
  vi.resetAllMocks()
  const mod = await import('../src/routes/rbac.js')
  rbacRouter = mod.rbacRouter
})

function makeReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    ip: '127.0.0.1',
    ...overrides,
    user: overrides.user || { role: 'super_admin', username: 'testadmin' },
  }
}

function makeRes() {
  const json = vi.fn()
  const status = vi.fn(() => ({ json }))
  return { status, json, end: vi.fn() }
}

function findRoute(method, path) {
  return rbacRouter.stack.find(
    (layer) => layer.route && layer.route.methods[method] && layer.route.path === path
  )
}

async function callRoute(method, path, reqOverrides) {
  const route = findRoute(method, path)
  if (!route) throw new Error(`Route ${method} ${path} not found`)

  const handlers = route.route.stack.map((s) => s.handle)
  const req = makeReq(reqOverrides)
  const res = makeRes()

  // Chain the handlers: each calls next() to invoke the next in line
  function createNext(index) {
    return () => {
      if (index < handlers.length) {
        handlers[index](req, res, createNext(index + 1))
      }
    }
  }

  // Start the chain
  if (handlers.length > 0) {
    await handlers[0](req, res, createNext(1))
  }

  return { req, res }
}

describe('GET /apps', () => {
  it('returns app list from DB', async () => {
    const fakeApps = [
      { id: 1, name: 'spectres-pantheon', slug: 'spectres-pantheon', is_active: true },
      { id: 2, name: 'thoth-esu-gateway', slug: 'thoth-esu-gateway', is_active: true },
    ]
    mockPoolQuery.mockResolvedValue({ rows: fakeApps })

    const { res } = await callRoute('get', '/apps')

    expect(res.json).toHaveBeenCalledWith(fakeApps)
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT a.id')
    )
  })

  it('returns 500 on DB error', async () => {
    mockPoolQuery.mockRejectedValue(new Error('DB down'))

    const { res } = await callRoute('get', '/apps')

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Internal server error' })
    )
  })
})

describe('POST /apps', () => {
  const validBody = {
    name: 'Test App',
    slug: 'test-app',
    claim_name: 'test_role',
    display_name: 'Test Application',
  }

  it('creates an app and returns it with API key', async () => {
    const fakeInsert = {
      id: 3,
      name: 'Test App',
      slug: 'test-app',
      api_key: 'aabbccdd1122334455667788',
    }
    mockPoolQuery.mockResolvedValue({ rows: [fakeInsert] })

    const { res } = await callRoute('post', '/apps', { body: validBody })

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.status().json).toHaveBeenCalledWith(fakeInsert)
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO apps'),
      expect.arrayContaining(['test-app', 'Test App'])
    )
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rbac_app_created',
        entity_id: 'test-app',
      })
    )
  })

  it('returns 400 when name is missing', async () => {
    const { res } = await callRoute('post', '/apps', {
      body: { slug: 'test-app', claim_name: 'test_role' },
    })

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'name, slug, and claim_name are required' })
    )
    expect(mockPoolQuery).not.toHaveBeenCalled()
  })

  it('returns 400 when slug is missing', async () => {
    const { res } = await callRoute('post', '/apps', {
      body: { name: 'Test App', claim_name: 'test_role' },
    })

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 400 when claim_name is missing', async () => {
    const { res } = await callRoute('post', '/apps', {
      body: { name: 'Test App', slug: 'test-app' },
    })

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 409 on duplicate slug', async () => {
    const dbError = new Error('duplicate key')
    dbError.code = '23505'
    mockPoolQuery.mockRejectedValue(dbError)

    const { res } = await callRoute('post', '/apps', { body: validBody })

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('already exists') })
    )
  })

  it('returns 500 on unexpected DB error', async () => {
    mockPoolQuery.mockRejectedValue(new Error('connection refused'))

    const { res } = await callRoute('post', '/apps', { body: validBody })

    expect(res.status).toHaveBeenCalledWith(500)
  })
})

describe('POST /apps with clone_from', () => {
  const cloneBody = {
    name: 'Cloned App',
    slug: 'cloned-app',
    claim_name: 'cloned_role',
    clone_from: 'source-app',
  }

  const sourceAppRow = { slug: 'source-app' }
  const newAppRow = { id: 42, name: 'Cloned App', slug: 'cloned-app', api_key: 'clonekey123' }

  beforeEach(() => {
    vi.resetAllMocks()
    mockPoolConnect.mockResolvedValue(mockClient)
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('returns 404 when source app does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] }) // source check returns empty

    const { res } = await callRoute('post', '/apps', { body: cloneBody })

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Source app not found' })
    )
  })

  it('clones roles, permissions, mappings, and schema from source', async () => {
    // Source check + INSERT new app
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [sourceAppRow] }) // source exists
      .mockResolvedValueOnce({ rows: [newAppRow] })    // INSERT new app

    // Transaction queries via client
    mockClient.query
      .mockResolvedValueOnce()                          // BEGIN
      .mockResolvedValueOnce({                          // SELECT source roles
        rows: [
          { id: 10, name: 'admin', display_name: 'Admin', description: 'Admins', base_role: 'admin', is_default: true, is_active: true },
          { id: 11, name: 'viewer', display_name: 'Viewer', description: null, base_role: 'viewer', is_default: false, is_active: true },
        ]
      })
      .mockResolvedValueOnce({ rows: [{ id: 100 }] })  // INSERT role admin -> id 100
      .mockResolvedValueOnce({ rows: [{ id: 101 }] })  // INSERT role viewer -> id 101
      .mockResolvedValueOnce({                          // SELECT permissions for role 10
        rows: [{ module_name: 'dashboard', actions: ['read', 'write'] }]
      })
      .mockResolvedValueOnce()                          // INSERT permission
      .mockResolvedValueOnce({                          // SELECT permissions for role 11
        rows: [{ module_name: 'dashboard', actions: ['read'] }]
      })
      .mockResolvedValueOnce()                          // INSERT permission
      .mockResolvedValueOnce({                          // SELECT mappings
        rows: [
          { authentik_group: 'ogun_admin', role_definition_id: 10, priority: 100, is_active: true },
          { authentik_group: 'ogun_viewer', role_definition_id: 11, priority: 0, is_active: true },
        ]
      })
      .mockResolvedValueOnce()                          // INSERT mapping 1
      .mockResolvedValueOnce()                          // INSERT mapping 2
      .mockResolvedValueOnce({                          // SELECT schema
        rows: [{ modules: [{ name: 'dashboard' }], source: 'app_push' }]
      })
      .mockResolvedValueOnce()                          // INSERT schema
      .mockResolvedValueOnce()                          // COMMIT

    const { res } = await callRoute('post', '/apps', { body: cloneBody })
    await flush()

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.status().json).toHaveBeenCalledWith(newAppRow)

    // Verify clone audit log was created
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rbac_app_cloned',
        entity_id: 'cloned-app',
        changes: expect.objectContaining({ cloned_from: 'source-app', roleCount: 2 }),
      })
    )

    // Verify create audit log too
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rbac_app_created',
        entity_id: 'cloned-app',
      })
    )
  })

  it('rolls back transaction on error during clone', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [sourceAppRow] }) // source exists
      .mockResolvedValueOnce({ rows: [newAppRow] })    // INSERT new app

    mockClient.query
      .mockResolvedValueOnce()                          // BEGIN
      .mockRejectedValueOnce(new Error('DB fail'))      // SELECT roles fails

    const { res } = await callRoute('post', '/apps', { body: cloneBody })
    await flush()

    expect(res.status).toHaveBeenCalledWith(500)
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    expect(mockClient.release).toHaveBeenCalled()

    // Should not have clone audit
    expect(mockCreateAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rbac_app_cloned' })
    )
  })

  it('works without clone_from (no source validation)', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [newAppRow] })

    const { res } = await callRoute('post', '/apps', {
      body: { name: 'Simple App', slug: 'simple', claim_name: 'simple_role' },
    })

    expect(res.status).toHaveBeenCalledWith(201)
    expect(mockPoolQuery).toHaveBeenCalledTimes(1) // only INSERT, no source check
  })
})

describe('PUT /apps/:slug', () => {
  it('updates an app and returns it', async () => {
    const fakeUpdate = {
      id: 1,
      name: 'Test App',
      slug: 'test-app',
      is_active: true,
    }
    mockPoolQuery.mockResolvedValue({ rows: [fakeUpdate] })

    const { res } = await callRoute('put', '/apps/:slug', {
      params: { slug: 'test-app' },
      body: { display_name: 'Updated App', is_active: true },
    })

    expect(res.json).toHaveBeenCalledWith(fakeUpdate)
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE apps'),
      expect.arrayContaining(['test-app'])
    )
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rbac_app_updated',
        entity_id: 'test-app',
      })
    )
  })

  it('returns 404 when app does not exist', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })

    const { res } = await callRoute('put', '/apps/:slug', {
      params: { slug: 'nonexistent' },
      body: { display_name: 'Nope' },
    })

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'App not found' })
    )
  })

  it('returns 500 on DB error', async () => {
    mockPoolQuery.mockRejectedValue(new Error('DB down'))

    const { res } = await callRoute('put', '/apps/:slug', {
      params: { slug: 'test-app' },
      body: { display_name: 'Updated' },
    })

    expect(res.status).toHaveBeenCalledWith(500)
  })
})

describe('PUT /roles/:id/permissions', () => {
  const roleId = 42
  const permissions = [
    { module_name: 'dashboard', actions: ['read', 'write'] },
    { module_name: 'admin-panel', actions: ['read'] },
  ]

  it('updates permissions and cascades to app_users cache', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ app_slug: 'some-app' }] })
    mockPoolConnect.mockResolvedValue(mockClient)
    mockClient.query
      .mockResolvedValueOnce()                          // BEGIN
      .mockResolvedValueOnce()                          // DELETE old permissions
      .mockResolvedValueOnce()                          // INSERT dashboard perm
      .mockResolvedValueOnce()                          // INSERT admin-panel perm
      .mockResolvedValueOnce()                          // UPDATE app_users cache cascade
      .mockResolvedValueOnce()                          // UPDATE role_definitions
      .mockResolvedValueOnce()                          // COMMIT

    const { res } = await callRoute('put', '/roles/:id/permissions', {
      params: { id: String(roleId) },
      body: { permissions },
    })
    await flush()

    expect(res.json).toHaveBeenCalledWith({ success: true })

    // Verify cascade UPDATE was called with correct cache and role id
    const cascadeCall = mockClient.query.mock.calls.find(
      call => call[0] && call[0].includes('UPDATE app_users SET permissions_cache')
    )
    expect(cascadeCall).toBeTruthy()
    expect(cascadeCall[1]).toEqual([
      JSON.stringify({ dashboard: ['read', 'write'], 'admin-panel': ['read'] }),
      String(roleId),
    ])
  })

  it('returns 400 when permissions is not an array', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ app_slug: 'some-app' }] })
    const { res } = await callRoute('put', '/roles/:id/permissions', {
      params: { id: String(roleId) },
      body: { permissions: 'not-array' },
    })
    await flush()

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 500 on DB error', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ app_slug: 'some-app' }] })
    mockPoolConnect.mockRejectedValue(new Error('connection refused'))

    const { res } = await callRoute('put', '/roles/:id/permissions', {
      params: { id: String(roleId) },
      body: { permissions },
    })
    await flush()

    expect(res.status).toHaveBeenCalledWith(500)
  })
})

describe('POST /mappings/:appSlug/bulk', () => {
  const appSlug = 'test-app'
  const bulkBody = {
    groups: ['group-a', 'group-b', 'group-c'],
    role_definition_id: 42,
    priority: 10,
  }

  it('creates multiple mappings and returns results', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, authentik_group: 'group-a', priority: 10, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, authentik_group: 'group-b', priority: 10, is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 3, authentik_group: 'group-c', priority: 10, is_active: true }] })

    const { res } = await callRoute('post', '/mappings/:appSlug/bulk', {
      params: { appSlug },
      body: bulkBody,
    })
    await flush()

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({
        created: expect.arrayContaining([
          expect.objectContaining({ authentik_group: 'group-a' }),
          expect.objectContaining({ authentik_group: 'group-b' }),
          expect.objectContaining({ authentik_group: 'group-c' }),
        ]),
        successCount: 3,
        errorCount: 0,
        total: 3,
      })
    )
    expect(mockPoolQuery).toHaveBeenCalledTimes(3)
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rbac_mappings_bulk_created',
        entity_id: appSlug,
        changes: expect.objectContaining({ created: 3, failed: 0 }),
      })
    )
  })

  it('returns 400 when groups is not an array', async () => {
    const { res } = await callRoute('post', '/mappings/:appSlug/bulk', {
      params: { appSlug },
      body: { groups: 'not-an-array', role_definition_id: 42 },
    })

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 400 when groups is empty', async () => {
    const { res } = await callRoute('post', '/mappings/:appSlug/bulk', {
      params: { appSlug },
      body: { groups: [], role_definition_id: 42 },
    })

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 400 when role_definition_id is missing', async () => {
    const { res } = await callRoute('post', '/mappings/:appSlug/bulk', {
      params: { appSlug },
      body: { groups: ['group-a'] },
    })

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('partially succeeds when some groups already mapped', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, authentik_group: 'group-a', priority: 10, is_active: true }] })
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }))
      .mockResolvedValueOnce({ rows: [{ id: 3, authentik_group: 'group-c', priority: 10, is_active: true }] })

    const { res } = await callRoute('post', '/mappings/:appSlug/bulk', {
      params: { appSlug },
      body: bulkBody,
    })
    await flush()

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({
        successCount: 2,
        errorCount: 1,
        total: 3,
      })
    )
  })

  it('reports errors when all groups fail', async () => {
    mockPoolQuery.mockRejectedValue(new Error('connection refused'))

    const { res } = await callRoute('post', '/mappings/:appSlug/bulk', {
      params: { appSlug },
      body: bulkBody,
    })
    await flush()

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({
        successCount: 0,
        errorCount: 3,
        total: 3,
      })
    )
  })
})

let registerApp

beforeEach(async () => {
  const mod = await import("../src/routes/rbac.js")
  registerApp = mod.registerApp
})

describe("registerApp handler", () => {
  const validBody = {
    name: "Registered App",
    slug: "registered-app",
    claim_name: "registered_role",
  }

  function makeReq(body) {
    return {
      body: body || {},
      headers: {},
      ip: "127.0.0.1",
    }
  }

  function makeRes() {
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    return { status, json, end: vi.fn() }
  }

  it("returns 400 when name is missing", async () => {
    const res = makeRes()
    await registerApp(makeReq({ slug: "test", claim_name: "role" }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("required") })
    )
  })

  it("returns 400 when slug is missing", async () => {
    const res = makeRes()
    await registerApp(makeReq({ name: "Test", claim_name: "role" }), res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("returns 400 when claim_name is missing", async () => {
    const res = makeRes()
    await registerApp(makeReq({ name: "Test", slug: "test" }), res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it("creates app and returns it with API key", async () => {
    const fakeInsert = {
      id: 10,
      name: "Registered App",
      slug: "registered-app",
      api_key: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      is_active: true,
    }
    mockPoolQuery.mockResolvedValue({ rows: [fakeInsert] })

    const res = makeRes()
    await registerApp(makeReq(validBody), res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.status().json).toHaveBeenCalledWith(fakeInsert)
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rbac_app_registered",
        entity_id: "registered-app",
      })
    )
  })

  it("returns 409 on duplicate slug", async () => {
    const dbError = new Error("duplicate key")
    dbError.code = "23505"
    mockPoolQuery.mockRejectedValue(dbError)

    const res = makeRes()
    await registerApp(makeReq(validBody), res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.status().json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("already exists") })
    )
  })

  it("returns 500 on unexpected DB error", async () => {
    mockPoolQuery.mockRejectedValue(new Error("connection refused"))

    const res = makeRes()
    await registerApp(makeReq(validBody), res)

    expect(res.status).toHaveBeenCalledWith(500)
  })
})
