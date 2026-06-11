import { describe, it, expect, vi, beforeEach } from "vitest"

const mockJwtVerify = vi.fn()
const mockCreateRemoteJWKSet = vi.fn(() => "mock-jwks")

vi.mock("jose", () => ({
  jwtVerify: mockJwtVerify,
  createRemoteJWKSet: mockCreateRemoteJWKSet,
}))

let verifyIdToken

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  process.env.AUTHENTIK_OIDC_ISSUER = "https://auth.spectres.co.za/application/o/ogun-bridge"
  process.env.AUTHENTIK_CLIENT_ID = "test-client-id"
  const mod = await import("../src/services/jwtVerifier.js")
  verifyIdToken = mod.verifyIdToken
})

describe("verifyIdToken", () => {
  it("returns invalid when no token provided", async () => {
    const result = await verifyIdToken(null)
    expect(result.valid).toBe(false)
    expect(result.error).toBe("No ID token provided")
  })

  it("returns invalid when issuer not configured", async () => {
    delete process.env.AUTHENTIK_OIDC_ISSUER
    const result = await verifyIdToken("some-token")
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/not configured/i)
  })

  it("returns invalid when client ID not configured", async () => {
    delete process.env.AUTHENTIK_CLIENT_ID
    const result = await verifyIdToken("some-token")
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/not configured/i)
  })

  it("returns valid payload on successful verification", async () => {
    const fakePayload = { sub: "user123", iss: "https://auth.spectres.co.za", aud: "test-client-id" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    const result = await verifyIdToken("valid-token")
    expect(result.valid).toBe(true)
    expect(result.payload).toEqual(fakePayload)
  })

  it("returns invalid on jwtVerify error", async () => {
    mockJwtVerify.mockRejectedValue(new Error("jwt malformed"))

    const result = await verifyIdToken("bad-token")
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it("rejects token with nonce mismatch", async () => {
    const fakePayload = { sub: "user123", nonce: "wrong-nonce" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    const result = await verifyIdToken("valid-token", { nonce: "expected-nonce" })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/nonce/i)
  })

  it("accepts token with matching nonce", async () => {
    const fakePayload = { sub: "user123", nonce: "expected-nonce" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    const result = await verifyIdToken("valid-token", { nonce: "expected-nonce" })
    expect(result.valid).toBe(true)
    expect(result.payload.sub).toBe("user123")
  })

  it("allows token without nonce when nonce not expected", async () => {
    const fakePayload = { sub: "user123" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    const result = await verifyIdToken("valid-token")
    expect(result.valid).toBe(true)
  })

  it("accepts token when payload has no nonce even if nonce was sent", async () => {
    const fakePayload = { sub: "user123" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    const result = await verifyIdToken("valid-token", { nonce: "sent-nonce" })
    expect(result.valid).toBe(true)
  })

  it("rejects token when azp does not match client_id", async () => {
    const fakePayload = { sub: "user123", azp: "other-client" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    const result = await verifyIdToken("valid-token")
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/azp/i)
  })

  it("accepts token without azp claim", async () => {
    const fakePayload = { sub: "user123" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    const result = await verifyIdToken("valid-token")
    expect(result.valid).toBe(true)
  })

  it("accepts token when azp matches client_id", async () => {
    const fakePayload = { sub: "user123", azp: "test-client-id" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    const result = await verifyIdToken("valid-token")
    expect(result.valid).toBe(true)
  })

  it("applies clock tolerance when provided", async () => {
    const fakePayload = { sub: "user123" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    await verifyIdToken("valid-token", { clockTolerance: 120 })
    expect(mockJwtVerify).toHaveBeenCalledWith(
      "valid-token",
      "mock-jwks",
      expect.objectContaining({ clockTolerance: 120 }),
    )
  })

  it("uses default clock tolerance from env when not provided", async () => {
    process.env.JWT_CLOCK_TOLERANCE_SECONDS = "30"
    const fakePayload = { sub: "user123" }
    mockJwtVerify.mockResolvedValue({ payload: fakePayload })

    await verifyIdToken("valid-token")
    expect(mockJwtVerify).toHaveBeenCalledWith(
      "valid-token",
      "mock-jwks",
      expect.objectContaining({ clockTolerance: 30 }),
    )
  })

  it("refreshes JWKS cache on key error and retries once", async () => {
    const fakePayload = { sub: "user123" }
    mockJwtVerify
      .mockRejectedValueOnce(new Error("key not found"))
      .mockResolvedValueOnce({ payload: fakePayload })

    const result = await verifyIdToken("valid-token")
    expect(result.valid).toBe(true)
    expect(result.payload).toEqual(fakePayload)
    expect(mockJwtVerify).toHaveBeenCalledTimes(2)
    expect(mockCreateRemoteJWKSet).toHaveBeenCalledTimes(2)
  })

  it("does not retry on non-key errors", async () => {
    mockJwtVerify.mockRejectedValue(new Error("token expired"))

    const result = await verifyIdToken("valid-token")
    expect(result.valid).toBe(false)
    expect(mockJwtVerify).toHaveBeenCalledTimes(1)
  })

  it("fails after retry if key error persists", async () => {
    mockJwtVerify.mockRejectedValue(new Error("key not found"))

    const result = await verifyIdToken("valid-token")
    expect(result.valid).toBe(false)
    expect(mockJwtVerify).toHaveBeenCalledTimes(2)
  })
})
