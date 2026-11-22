import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPoolQuery = vi.fn()
vi.mock('../src/lib/db.js', () => ({ pool: { query: mockPoolQuery, connect: vi.fn() } }))

const mockAudit = vi.fn()
vi.mock('../src/services/auditService.js', () => ({ createAuditLog: mockAudit }))

vi.mock('../src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => next(),
  requireSuperAdmin: (req, res, next) => next(),
  requireAppApiKey: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
  requireModule: () => (req, res, next) => next(),
}))

const mockSendApiKeyEmail = vi.fn()
vi.mock('../src/services/emailService.js', () => ({ sendApiKeyEmail: mockSendApiKeyEmail }))

let rbacRouter

function makeReq(overrides = {}) {
  return {
    body: {}, params: {}, query: {}, ip: '127.0.0.1',
    ...overrides,
    user: overrides.user || { role: 'super_admin', username: 'testadmin' },
  }
}

function makeRes() {
  const res = { json: vi.fn(), end: vi.fn() }
  res.status = vi.fn((code) => { res.statusCode = code; return res })
  return res
}

async function callRoute(method, path, reqOverrides = {}) {
  const route = rbacRouter.stack.find(
    (layer) => layer.route && layer.route.methods[method] && layer.route.path === path
  )
  if (!route) throw new Error(`Route ${method} ${path} not found`)

  const handlers = route.route.stack.map((stack) => stack.handle)
  const req = makeReq(reqOverrides)
  const res = makeRes()

  function createNext(index) {
    return () => {
      if (index < handlers.length) return handlers[index](req, res, createNext(index + 1))
    }
  }

  if (handlers.length) await handlers[0](req, res, createNext(1))
  return { req, res }
}

const reqFor = (body) => ({ params: { slug: 'thoth' }, body })

beforeEach(async () => {
  vi.resetAllMocks()
  const mod = await import('../src/routes/rbac.js')
  rbacRouter = mod.rbacRouter
  mockPoolQuery.mockResolvedValue({ rows: [{ id: 1, name: 'Thoth' }] })
  mockSendApiKeyEmail.mockResolvedValue({ sent: true })
})

describe('POST /apps/:slug/rotate-key', () => {
  it('rotates the key without email when no address is supplied', async () => {
    const { res } = await callRoute('post', '/apps/:slug/rotate-key', reqFor({}))

    expect(res.json).toHaveBeenCalledTimes(1)
    const payload = res.json.mock.calls[0][0]
    expect(payload.success).toBe(true)
    expect(payload.api_key).toMatch(/^[0-9a-f]{48}$/)
    expect(payload.emailSent).toBe(false)
    expect(mockSendApiKeyEmail).not.toHaveBeenCalled()
    expect(mockPoolQuery).toHaveBeenCalledTimes(2)
    expect(mockPoolQuery.mock.calls[1][0]).toContain('UPDATE apps SET api_key')
    expect(JSON.stringify(mockAudit.mock.calls[0][0])).not.toContain(payload.api_key)
  })

  it('emails the new key to a developer and audits delivery', async () => {
    const { res } = await callRoute('post', '/apps/:slug/rotate-key', reqFor({ email: 'dev@example.com' }))

    const payload = res.json.mock.calls[0][0]
    expect(payload.emailSent).toBe(true)
    expect(mockSendApiKeyEmail).toHaveBeenCalledWith({
      to: 'dev@example.com',
      appName: 'Thoth',
      slug: 'thoth',
      rawKey: payload.api_key,
      actor: 'testadmin',
    })
    expect(mockAudit.mock.calls[0][0].changes.delivered).toBe(true)
  })

  it('keeps rotation successful when email delivery fails', async () => {
    mockSendApiKeyEmail.mockResolvedValue({ sent: false, error: 'SMTP down' })

    const { res } = await callRoute('post', '/apps/:slug/rotate-key', reqFor({ email: 'dev@example.com' }))

    expect(res.status).not.toHaveBeenCalled()
    const payload = res.json.mock.calls[0][0]
    expect(payload.success).toBe(true)
    expect(payload.emailSent).toBe(false)
    expect(payload.emailError).toBe('SMTP down')
    const audit = mockAudit.mock.calls[0][0]
    expect(audit.changes.delivered).toBe(false)
    expect(audit.changes.deliveryError).toBe('SMTP down')
  })

  it('rejects an invalid email without rotating', async () => {
    const { res } = await callRoute('post', '/apps/:slug/rotate-key', reqFor({ email: 'not-an-email' }))

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockPoolQuery).not.toHaveBeenCalled()
    expect(mockSendApiKeyEmail).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('returns 404 when the app does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] })

    const { res } = await callRoute('post', '/apps/:slug/rotate-key', reqFor({}))

    expect(res.status).toHaveBeenCalledWith(404)
    expect(mockPoolQuery).toHaveBeenCalledTimes(1)
    expect(mockSendApiKeyEmail).not.toHaveBeenCalled()
  })
})
