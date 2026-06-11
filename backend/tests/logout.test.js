import { describe, it, expect, vi, beforeEach } from "vitest"

const mockPoolQuery = vi.fn()
vi.mock("../src/lib/db.js", () => ({
  pool: { query: mockPoolQuery },
}))

let authRouter

beforeEach(async () => {
  mockPoolQuery.mockReset()
  mockPoolQuery.mockResolvedValue({ rows: [] })
  vi.resetModules()
  const mod = await import("../src/routes/auth.js")
  authRouter = mod.authRouter
})

describe("logout route", () => {
  function findLogoutHandler() {
    const route = authRouter.stack.find(
      (r) => r.route && r.route.path === "/logout" && r.route.methods.post,
    )
    return route?.route?.stack?.[0]?.handle
  }

  function makeReq(sessionData) {
    return {
      headers: {},
      cookies: { auth_token: "test-token" },
      path: "/api/auth/logout",
    }
  }

  function makeRes() {
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    return { status, json, clearCookie: vi.fn() }
  }

  it("includes id_token_hint in logout URL when session has idToken", async () => {
    const handler = findLogoutHandler()
    const req = makeReq()
    const res = makeRes()

    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        id: 1, user_id: 1, expires_at: new Date(Date.now() + 86400000),
        data: { sub: "user123", idToken: "stored-id-token-value" },
        username: "user", email: "a@b.com", role: "member", active: true,
      }],
    })
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 })

    process.env.AUTHENTIK_OIDC_ISSUER = "https://auth.spectres.co.za/application/o/ogun-bridge"
    process.env.AUTHENTIK_REDIRECT_URI = "https://ogun.spectres.co.za/auth/callback"
    process.env.AUTHENTIK_CLIENT_ID = "test-client-id"
    process.env.NODE_ENV = "test"

    await handler(req, res)

    expect(res.json).toHaveBeenCalled()
    const callArgs = res.json.mock.calls[0][0]
    expect(callArgs.loginType).toBe("sso")
    expect(callArgs.logoutUrl).toContain("id_token_hint=stored-id-token-value")
    expect(callArgs.logoutUrl).toContain("client_id=test-client-id")
    expect(callArgs.logoutUrl).toContain("post_logout_redirect_uri")
  })

  it("returns logoutUrl: null for admin logout", async () => {
    const handler = findLogoutHandler()
    const req = makeReq()
    const res = makeRes()

    process.env.AUTHENTIK_OIDC_ISSUER = "https://auth.spectres.co.za/application/o/ogun-bridge"
    process.env.NODE_ENV = "test"

    mockPoolQuery.mockResolvedValue({ rows: [] })

    await handler(req, res)

    const callArgs = res.json.mock.calls[0][0]
    expect(callArgs.loginType).toBe("admin")
    expect(callArgs.logoutUrl).toBeNull()
  })

  it("clears auth_token cookie on logout", async () => {
    const handler = findLogoutHandler()
    const req = makeReq()
    const res = makeRes()

    mockPoolQuery.mockResolvedValue({ rows: [] })

    await handler(req, res)
    expect(res.clearCookie).toHaveBeenCalledWith("auth_token")
  })

  it("gracefully handles invalid session on logout", async () => {
    const handler = findLogoutHandler()
    const req = makeReq()
    const res = makeRes()

    mockPoolQuery.mockRejectedValue(new Error("DB error"))

    await handler(req, res)

    expect(res.clearCookie).toHaveBeenCalledWith("auth_token")
    const callArgs = res.json.mock.calls[0][0]
    expect(callArgs.loginType).toBe("admin")
    expect(callArgs.logoutUrl).toBeNull()
  })
})
