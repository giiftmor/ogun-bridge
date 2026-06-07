import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest"

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))

vi.stubGlobal("fetch", mockFetch)

const mockPoolQuery = vi.fn()
vi.mock("../src/lib/db.js", () => ({
  pool: { query: mockPoolQuery },
}))

let resolveRole, checkPermission, syncUsersForApp

beforeEach(async () => {
  vi.resetAllMocks()
  const mod = await import("../src/services/authorizer.js")
  resolveRole = mod.resolveRole
  checkPermission = mod.checkPermission
  syncUsersForApp = mod.syncUsersForApp
})

describe("resolveRole", () => {
  const appRows = [
    { id: 1, slug: "test-app", name: "Test App", access_group: "test-users", authentik_slug: "test-app", is_active: true },
  ]

  it("returns error when app not found", async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    const result = await resolveRole("sub123", "a@b.com", [], "nonexistent")
    expect(result.error).toBe("App not found")
    expect(result.authorized).toBe(false)
  })

  it("returns error when app is not active", async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ ...appRows[0], is_active: false }] })
    const result = await resolveRole("sub123", "a@b.com", [], "test-app")
    expect(result.error).toBe("App is not active")
    expect(result.authorized).toBe(false)
  })

  it("resolves role via preResolvedRole", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: appRows })
      .mockResolvedValueOnce({ rows: [{ id: 10, name: "admin", display_name: "Admin", base_role: "admin" }] })
      .mockResolvedValueOnce({ rows: [{ module_name: "dashboard", actions: ["read", "write"] }] })
      .mockResolvedValueOnce({ rows: [] })
    const result = await resolveRole("sub123", "a@b.com", ["some-group"], "test-app", "admin")
    expect(result.authorized).toBe(true)
    expect(result.roleDefinition.name).toBe("admin")
  })

  it("rejects when user not in access_group", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: appRows })
      .mockResolvedValueOnce({ rows: [] })
    const result = await resolveRole("sub123", "a@b.com", ["wrong-group"], "test-app")
    expect(result.error).toBe("User not in access group for this app")
    expect(result.authorized).toBe(false)
  })

  it("resolves role via group mapping", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: appRows })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 20, authentik_group: "test-users", priority: 10, role_definition_id: 10,
            rd_id: 10, rd_name: "manager", rd_display_name: "Manager", rd_base_role: "admin",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ module_name: "dashboard", actions: ["read", "write"] }] })
      .mockResolvedValueOnce({ rows: [] })
    const result = await resolveRole("sub123", "a@b.com", ["test-users"], "test-app")
    expect(result.authorized).toBe(true)
    expect(result.roleDefinition.name).toBe("manager")
    expect(result.source).toBe("group_mapping")
    expect(result.matchedGroup).toBe("test-users")
  })

  it("falls back to default role when no group match", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: appRows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 30, name: "viewer", display_name: "Viewer", base_role: "viewer" }] })
      .mockResolvedValueOnce({ rows: [{ module_name: "dashboard", actions: ["read"] }] })
      .mockResolvedValueOnce({ rows: [] })
    const result = await resolveRole("sub123", "a@b.com", ["test-users"], "test-app")
    expect(result.authorized).toBe(true)
    expect(result.roleDefinition.name).toBe("viewer")
    expect(result.source).toBe("default_role")
  })

  it("upserts app_user record on role resolution", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: appRows })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 20, authentik_group: "test-users", priority: 10, role_definition_id: 10,
            rd_id: 10, rd_name: "manager", rd_display_name: "Manager", rd_base_role: "admin",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ module_name: "dashboard", actions: ["read"] }] })
      .mockResolvedValueOnce({ rows: [] })
    await resolveRole("sub123", "a@b.com", ["test-users"], "test-app")
    const upsertCall = mockPoolQuery.mock.calls.find(
      (call) => call[0] && call[0].includes("INSERT INTO app_users"),
    )
    expect(upsertCall).toBeTruthy()
    expect(upsertCall[1]).toContain("sub123")
  })
})

describe("checkPermission", () => {
  const appRows = [
    { id: 1, slug: "test-app", name: "Test App", access_group: "test-users", authentik_slug: "test-app", is_active: true },
  ]

  it("returns unauthorized when resolveRole fails", async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    const result = await checkPermission("sub123", [], "nonexistent", "dashboard", "read")
    expect(result.authorized).toBe(false)
    expect(result.error).toBe("App not found")
  })

  it("grants super_admin full access regardless of permissions", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: appRows })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 20, authentik_group: "test-users", priority: 10, role_definition_id: 40,
            rd_id: 40, rd_name: "super_admin", rd_display_name: "Super Admin", rd_base_role: "admin",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ module_name: "dashboard", actions: ["read"] }] })
      .mockResolvedValueOnce({ rows: [] })
    const result = await checkPermission("sub123", ["test-users"], "test-app", "dashboard", "delete")
    expect(result.authorized).toBe(true)
    expect(result.roleDefinition.name).toBe("super_admin")
  })

  it("returns authorized when no requiredModule", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: appRows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 30, name: "viewer", display_name: "Viewer", base_role: "viewer" }] })
      .mockResolvedValueOnce({ rows: [] })
    const result = await checkPermission("sub123", ["test-users"], "test-app", null, null)
    expect(result.authorized).toBe(true)
  })

  it("returns unauthorized when module not in permissions", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: appRows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 30, name: "viewer", display_name: "Viewer", base_role: "viewer" }] })
      .mockResolvedValueOnce({ rows: [] })
    const result = await checkPermission("sub123", ["test-users"], "test-app", "admin-panel", "read")
    expect(result.authorized).toBe(false)
  })

  it("returns authorized when action is in permissions", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: appRows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 30, name: "admin", display_name: "Admin", base_role: "admin" }] })
      .mockResolvedValueOnce({ rows: [{ module_name: "dashboard", actions: ["read", "write"] }] })
      .mockResolvedValueOnce({ rows: [] })
    const result = await checkPermission("sub123", ["test-users"], "test-app", "dashboard", "write")
    expect(result.authorized).toBe(true)
  })

  it("returns unauthorized when action not in permissions", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: appRows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 30, name: "admin", display_name: "Admin", base_role: "admin" }] })
      .mockResolvedValueOnce({ rows: [{ module_name: "dashboard", actions: ["read"] }] })
      .mockResolvedValueOnce({ rows: [] })
    const result = await checkPermission("sub123", ["test-users"], "test-app", "dashboard", "delete")
    expect(result.authorized).toBe(false)
  })
})

describe("syncUsersForApp", () => {
  beforeAll(() => {
    vi.stubEnv("AUTHENTIK_API_TOKEN", "test-token")
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it("throws when app not found", async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] })
    await expect(syncUsersForApp("nonexistent")).rejects.toThrow("App not found")
  })

  it("throws when AUTHENTIK_API_TOKEN not configured", async () => {
    vi.stubEnv("AUTHENTIK_API_TOKEN", "")
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 1, authentik_slug: "test", access_group: "test-users" }] })
    await expect(syncUsersForApp("test-app")).rejects.toThrow("AUTHENTIK_API_TOKEN not configured")
    vi.stubEnv("AUTHENTIK_API_TOKEN", "test-token")
  })

  it("returns synced count 0 when no access_group", async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 1, authentik_slug: "test", access_group: null }] })
    const result = await syncUsersForApp("test-app")
    expect(result.synced).toBe(0)
    expect(result.note).toContain("No access_group")
  })

  it("syncs users from Authentik group", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, authentik_slug: "test", access_group: "test-users" }] })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ pk: 10, name: "test-users" }] }) })
      .mockResolvedValueOnce({
        ok: true, json: async () => ({
          results: [
            { pk: 101, uuid: "uuid-101", email: "user1@test.com" },
            { pk: 102, uuid: "uuid-102", email: "user2@test.com" },
          ],
        }),
      })
      // User 1: fetch groups
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ name: "test-users" }, { name: "managers" }] }) })
      // User 2: fetch groups
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ name: "test-users" }] }) })

    const appRows = [{ id: 1, slug: "test-app", name: "Test App", access_group: "test-users", authentik_slug: "test-app", is_active: true }]

    mockPoolQuery
      // User 1 resolveRole calls:
      .mockResolvedValueOnce({ rows: appRows })          // get app
      .mockResolvedValueOnce({                            // get mappings
        rows: [{ id: 20, authentik_group: "managers", priority: 10, role_definition_id: 10, rd_id: 10, rd_name: "manager", rd_display_name: "Manager", rd_base_role: "admin" }],
      })
      .mockResolvedValueOnce({ rows: [{ module_name: "dashboard", actions: ["read", "write"] }] }) // permissions
      .mockResolvedValueOnce({ rows: [] })                // upsert app_user
      // User 1: update last_sync
      .mockResolvedValueOnce({ rows: [] })
      // User 2 resolveRole calls:
      .mockResolvedValueOnce({ rows: appRows })          // get app
      .mockResolvedValueOnce({ rows: [] })                // get mappings (no match)
      .mockResolvedValueOnce({ rows: [{ id: 30, name: "viewer", display_name: "Viewer", base_role: "viewer" }] }) // default role
      .mockResolvedValueOnce({ rows: [{ module_name: "dashboard", actions: ["read"] }] }) // permissions
      .mockResolvedValueOnce({ rows: [] })                // upsert app_user
      // User 2: update last_sync
      .mockResolvedValueOnce({ rows: [] })

    const result = await syncUsersForApp("test-app")
    expect(result.synced).toBe(2)
    expect(result.total).toBe(2)
  })
})
