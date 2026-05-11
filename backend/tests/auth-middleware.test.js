import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPoolQuery = vi.fn()
vi.mock('../src/lib/db.js', () => ({
  pool: { query: mockPoolQuery },
}))

let authenticate, optionalAuth, validateSession, createSession, deleteSession, cleanupExpiredSessions

beforeEach(async () => {
  vi.resetAllMocks()
  const mod = await import('../src/middleware/auth.js')
  authenticate = mod.authenticate
  optionalAuth = mod.optionalAuth
  validateSession = mod.validateSession
  createSession = mod.createSession
  deleteSession = mod.deleteSession
  cleanupExpiredSessions = mod.cleanupExpiredSessions
})

describe('validateSession', () => {
  it('returns null for empty token', async () => {
    expect(await validateSession(null)).toBeNull()
    expect(await validateSession('')).toBeNull()
  })

  it('returns null when query returns empty', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    expect(await validateSession('valid-token')).toBeNull()
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      ['valid-token']
    )
  })

  it('returns session data when valid', async () => {
    const fakeSession = { id: 1, user_id: 42, username: 'testuser', role: 'admin' }
    mockPoolQuery.mockResolvedValue({ rows: [fakeSession] })
    const result = await validateSession('good-token')
    expect(result).toEqual(fakeSession)
  })

  it('returns null on query error', async () => {
    mockPoolQuery.mockRejectedValue(new Error('DB error'))
    const result = await validateSession('token')
    expect(result).toBeNull()
  })
})

describe('createSession', () => {
  it('inserts a session and returns a token', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    const token = await createSession(1, '127.0.0.1', 'test-agent')
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
    expect(token.length).toBe(128)
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auth_sessions'),
      [1, token, '127.0.0.1', 'test-agent', expect.any(Date)]
    )
  })
})

describe('deleteSession', () => {
  it('deletes by token', async () => {
    mockPoolQuery.mockResolvedValue({ rowCount: 1 })
    await deleteSession('token-to-delete')
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM auth_sessions'),
      ['token-to-delete']
    )
  })
})

describe('cleanupExpiredSessions', () => {
  it('deletes expired sessions', async () => {
    mockPoolQuery.mockResolvedValue({ rowCount: 5 })
    await cleanupExpiredSessions()
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM auth_sessions')
    )
  })
})

describe('authenticate middleware', () => {
  function makeReq(authHeader, cookieToken) {
    return {
      headers: authHeader ? { authorization: authHeader } : {},
      cookies: cookieToken ? { auth_token: cookieToken } : {},
      path: '/api/test',
    }
  }

  function makeRes() {
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    return { status, json }
  }

  it('returns 401 when no token provided', () => {
    const req = makeReq(null, null)
    const res = makeRes()
    authenticate(req, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.status().json).toHaveBeenCalledWith({ error: 'Authentication required' })
  })

  it('extracts token from Bearer header and calls next', async () => {
    const req = makeReq('Bearer header-token', null)
    const res = makeRes()
    mockPoolQuery.mockResolvedValue({
      rows: [{ id: 1, user_id: 1, username: 'user', email: 'a@b.com', role: 'admin' }],
    })

    await new Promise((resolve) => {
      authenticate(req, res, () => {
        expect(req.user).toBeDefined()
        expect(req.user.username).toBe('user')
        resolve()
      })
    })
  })

  it('extracts token from cookie and calls next', async () => {
    const req = makeReq(null, 'cookie-token')
    const res = makeRes()
    mockPoolQuery.mockResolvedValue({
      rows: [{ id: 1, user_id: 1, username: 'user', email: 'a@b.com', role: 'admin' }],
    })

    await new Promise((resolve) => {
      authenticate(req, res, () => {
        expect(req.user).toBeDefined()
        expect(req.user.username).toBe('user')
        resolve()
      })
    })
  })

  it('does NOT accept token from query string', () => {
    const req = {
      headers: {},
      cookies: {},
      query: { token: 'query-token' },
      path: '/api/test',
    }
    const res = makeRes()
    authenticate(req, res, vi.fn())
    // Should fail because query.token is not read
    expect(res.status).toHaveBeenCalledWith(401)
  })
})

describe('optionalAuth middleware', () => {
  function makeReq(authHeader, cookieToken) {
    return {
      headers: authHeader ? { authorization: authHeader } : {},
      cookies: cookieToken ? { auth_token: cookieToken } : {},
      path: '/api/test',
    }
  }

  function makeRes() {
    return { status: vi.fn(), json: vi.fn() }
  }

  it('calls next() when no token', () => {
    const req = makeReq(null, null)
    const next = vi.fn()
    optionalAuth(req, makeRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('sets req.user when valid token in cookie', async () => {
    const req = makeReq(null, 'cookie-token')
    mockPoolQuery.mockResolvedValue({
      rows: [{ id: 1, user_id: 1, username: 'user', email: 'a@b.com', role: 'admin' }],
    })

    await new Promise((resolve) => {
      optionalAuth(req, makeRes(), () => {
        expect(req.user).toBeDefined()
        expect(req.user.username).toBe('user')
        resolve()
      })
    })
  })

  it('does NOT read token from query string', async () => {
    const req = {
      headers: {},
      cookies: {},
      query: { token: 'query-token' },
      path: '/api/test',
    }
    const next = vi.fn()
    // The query string token must not be read — should call next immediately
    optionalAuth(req, makeRes(), next)
    expect(next).toHaveBeenCalled()
    // And no DB query should be made
    expect(mockPoolQuery).not.toHaveBeenCalled()
  })
})
