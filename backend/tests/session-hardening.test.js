import { describe, it, expect, vi, beforeEach } from "vitest"

const mockPoolQuery = vi.fn()
vi.mock("../src/lib/db.js", () => ({
  pool: { query: mockPoolQuery },
}))

let validateSession, createSession, deleteSession, authenticate

function cleanEnv() {
  delete process.env.SESSION_IP_BINDING
  delete process.env.SESSION_UA_BINDING
  delete process.env.SESSION_SLIDING_EXPIRY
  delete process.env.MAX_CONCURRENT_SESSIONS
  delete process.env.SESSION_MAX_LIFETIME
}

beforeEach(async () => {
  mockPoolQuery.mockReset()
  mockPoolQuery.mockResolvedValue({ rows: [] })
  cleanEnv()
  vi.resetModules()
  const mod = await import("../src/middleware/auth.js")
  validateSession = mod.validateSession
  createSession = mod.createSession
  deleteSession = mod.deleteSession
  authenticate = mod.authenticate
})

describe("validateSession - IP binding", () => {
  it("returns session when IP matches (binding enabled)", async () => {
    process.env.SESSION_IP_BINDING = "true"
    const fakeSession = { id: 1, user_id: 42, ip_address: "1.2.3.4", user_agent: "test-agent", username: "test", email: "a@b.com", role: "admin", active: true }
    mockPoolQuery.mockResolvedValue({ rows: [fakeSession] })

    const result = await validateSession("token", { ipAddress: "1.2.3.4" })
    expect(result).toBeTruthy()
    expect(result.id).toBe(1)
  })

  it("returns null when IP does not match (binding enabled)", async () => {
    process.env.SESSION_IP_BINDING = "true"
    const fakeSession = { id: 1, user_id: 42, ip_address: "1.2.3.4", user_agent: "test-agent", username: "test", email: "a@b.com", role: "admin", active: true }
    mockPoolQuery.mockResolvedValue({ rows: [fakeSession] })

    const result = await validateSession("token", { ipAddress: "5.6.7.8" })
    expect(result).toBeNull()
  })

  it("returns session when binding disabled even with different IP", async () => {
    process.env.SESSION_IP_BINDING = "false"
    const fakeSession = { id: 1, user_id: 42, ip_address: "1.2.3.4", user_agent: "test-agent", username: "test", email: "a@b.com", role: "admin", active: true }
    mockPoolQuery.mockResolvedValue({ rows: [fakeSession] })

    const result = await validateSession("token", { ipAddress: "5.6.7.8" })
    expect(result).toBeTruthy()
  })

  it("returns session when binding enabled but no IP provided", async () => {
    process.env.SESSION_IP_BINDING = "true"
    const fakeSession = { id: 1, user_id: 42, ip_address: "1.2.3.4", user_agent: "test-agent", username: "test", email: "a@b.com", role: "admin", active: true }
    mockPoolQuery.mockResolvedValue({ rows: [fakeSession] })

    const result = await validateSession("token")
    expect(result).toBeTruthy()
  })
})

describe("validateSession - User-Agent binding", () => {
  it("returns null when UA does not match (binding enabled)", async () => {
    process.env.SESSION_UA_BINDING = "true"
    const fakeSession = { id: 1, user_id: 42, ip_address: "1.2.3.4", user_agent: "Chrome/120", username: "test", email: "a@b.com", role: "admin", active: true }
    mockPoolQuery.mockResolvedValue({ rows: [fakeSession] })

    const result = await validateSession("token", { userAgent: "Firefox/90" })
    expect(result).toBeNull()
  })

  it("returns session when UA matches (binding enabled)", async () => {
    process.env.SESSION_UA_BINDING = "true"
    const fakeSession = { id: 1, user_id: 42, ip_address: "1.2.3.4", user_agent: "Chrome/120", username: "test", email: "a@b.com", role: "admin", active: true }
    mockPoolQuery.mockResolvedValue({ rows: [fakeSession] })

    const result = await validateSession("token", { userAgent: "Chrome/120" })
    expect(result).toBeTruthy()
  })
})

describe("createSession - concurrent limits", () => {
  it("evicts oldest session when over limit", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "2"
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ cnt: "2" }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] })

    const token = await createSession(1, "127.0.0.1", "test-agent")
    expect(token).toBeTruthy()
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM auth_sessions"),
      [1, expect.anything()],
    )
  })

  it("allows new session when under limit", async () => {
    process.env.MAX_CONCURRENT_SESSIONS = "5"
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ cnt: "2" }] })
      .mockResolvedValueOnce({ rows: [] })

    const token = await createSession(1, "127.0.0.1", "test-agent")
    expect(token).toBeTruthy()
  })

  it("uses default limit when env not set", async () => {
    delete process.env.MAX_CONCURRENT_SESSIONS
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ cnt: "0" }] })
      .mockResolvedValueOnce({ rows: [] })

    const token = await createSession(1, "127.0.0.1", "test-agent")
    expect(token).toBeTruthy()
  })
})

describe("validateSession - sliding expiry", () => {
  it("extends expires_at when sliding expiry configured", async () => {
    process.env.SESSION_SLIDING_EXPIRY = "30"
    const fakeSession = { id: 1, user_id: 42, created_at: new Date(), ip_address: "1.2.3.4", user_agent: "agent", username: "test", email: "a@b.com", role: "admin", active: true }
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [fakeSession] })
      .mockResolvedValueOnce({ rowCount: 1 })

    const result = await validateSession("token")
    expect(result).toBeTruthy()
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE auth_sessions"),
      expect.anything(),
    )
  })

  it("does not extend when sliding expiry disabled", async () => {
    process.env.SESSION_SLIDING_EXPIRY = "0"
    const fakeSession = { id: 1, user_id: 42, ip_address: "1.2.3.4", user_agent: "agent", username: "test", email: "a@b.com", role: "admin", active: true }
    mockPoolQuery.mockResolvedValue({ rows: [fakeSession] })

    const result = await validateSession("token")
    expect(result).toBeTruthy()
    const updateCalls = mockPoolQuery.mock.calls.filter(
      call => call[0] && call[0].includes("UPDATE"),
    )
    expect(updateCalls.length).toBe(0)
  })

  it("caps sliding expiry at max lifetime", async () => {
    process.env.SESSION_SLIDING_EXPIRY = "30"
    process.env.SESSION_MAX_LIFETIME = "1"
    const created_at = new Date(Date.now() - 55 * 60 * 1000) // 55 min ago
    const fakeSession = { id: 1, user_id: 42, created_at: created_at, ip_address: "1.2.3.4", user_agent: "agent", username: "test", email: "a@b.com", role: "admin", active: true }
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [fakeSession] })
      .mockResolvedValueOnce({ rowCount: 1 })

    await validateSession("token")
    const updateCall = mockPoolQuery.mock.calls.find(
      call => call[0] && call[0].includes("UPDATE"),
    )
    expect(updateCall).toBeTruthy()
    const newExpiry = updateCall[1][0]
    const expectedMax = new Date(created_at.getTime() + 60 * 60 * 1000)
    expect(newExpiry.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + 100)
    expect(newExpiry.getTime()).toBeGreaterThan(Date.now())
  })
})

describe("authenticate middleware - IP binding", () => {
  function makeReq(ip, ua, token) {
    return {
      headers: token ? { authorization: `Bearer ${token}`, "user-agent": ua } : { "user-agent": ua },
      cookies: {},
      ip,
      path: "/api/test",
    }
  }

  function makeRes() {
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    return { status, json }
  }

  it("passes IP to validateSession when binding enabled", async () => {
    process.env.SESSION_IP_BINDING = "true"
    const req = makeReq("1.2.3.4", "Chrome/120", "test-token")
    const res = makeRes()
    mockPoolQuery.mockResolvedValue({
      rows: [{ id: 1, user_id: 1, username: "user", email: "a@b.com", role: "admin", ip_address: "1.2.3.4", user_agent: "Chrome/120" }],
    })

    await new Promise((resolve) => {
      authenticate(req, res, () => {
        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining("SELECT"),
          ["test-token"],
        )
        resolve()
      })
    })
  })
})
