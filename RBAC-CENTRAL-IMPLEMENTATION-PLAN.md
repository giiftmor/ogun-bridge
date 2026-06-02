# Ogun Bridge Central RBAC — Implementation Plan

## Goal

Build Ogun Bridge as a **centralized RBAC authorizer** that manages roles, module permissions (with per-action CRUD), and Authentik group → role mappings for all consuming apps (spectres-pantheon, thoth-esu-gateway, groove-payroll), replacing each app's independent role resolution.

## Constraints

- **1 predefined role**: only `super_admin` is baked in; all other roles (admin, viewer, custom per-app roles) are created in Ogun Bridge's UI.
- **No `spectres_role` claim dependency**: roles come from Authentik group membership, resolved through Ogun Bridge's DB-driven mapping.
- **Permission schema is standardized**: `{ module: actions[] }` across all apps.
- **Authentik is the authenticator** — user must be in the app's Authentik group to access. If user is in the group but no role mapped in Ogun Bridge → default `viewer`.
- **Ogun Bridge is the sole authorizer**: consuming apps call Ogun Bridge's resolve API, then enforce locally (route guards, UI visibility, CRUD checks).

## Current State Audit

### Authentik
- **6 applications**: groove-payroll, ogun-bridge, spectres-ldap, spectres-pantheon, spectres-sso-portal, thoth-esu-gateway
- **13 groups**: authentik Admins, authentik-read-only, grafana, jellyfin, nextcloud, ogun-bridge, password_manager, penpot, plane, spectre-service-accounts, spectres-pantheon, systems_admins, thoth-esu-gateway
- **User membership patterns**: systems_admins → most apps, app-specific groups (ogun-bridge, spectres-pantheon, thoth-esu-gateway) for normal users

### Ogun Bridge (current)
- `apps` table: 3 apps (ogun, thoth, groove) with `role_mapping` JSONB column (unused)
- `auth_middleware`: static `roleMapping` object for super_admin detection
- `POST /api/authorize`: resolves roles for consuming apps (thoth, groove) — will extend
- `GET /auth/callback`: OIDC callback, stores `userSession` with `role`
- Frontend: RoleGuard + ProtectedRoute pattern, Sync Manager sidebar item (removed)

### Spectres Pantheon (current)
- **Two role layers**:
  - `Role` + `RolePermission` + `Permission` → CASL resource-level (`manage`, `read`, `write`)
  - `BusinessRole` + `modules JSONB` → module-level (dashboard, projects, tasks, tickets, clients, finances, documents, calendar, time_tracking, reports)
- `packages/auth/src/oidc/provider.ts`: static `roleMapping` from Authentik `spectres_role` claim
- `src/server/middleware/authorize.ts`: `requireAbility()` for CASL
- `src/server/middleware/moduleAccess.ts`: `requireModuleAccess()` for BusinessRole.modules

### Thoth ESU Gateway (current)
- Fastify + SQLite + `@spectres/auth` OIDC
- All routes locked to `['admin', 'super_admin', 'emergency']` via hardcoded array
- No module-level RBAC, no UI permission filtering

## Branch Strategy

| Repo | Branch |
|------|--------|
| ogun-bridge | `feature/rbac-ogun-managed` |
| spectres-pantheon | `feature/rbac-ogun-managed` |
| thoth-esu-gateway | `feature/rbac-ogun-managed` |

Ogun Bridge first. Others reference it.

## Phase 1: Ogun Bridge — RBAC Manager

### 1.1 Database Schema

**`base_roles`** — Predefined base roles (seeded, not configurable per-app)

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `name` | VARCHAR(50) UNIQUE | `super_admin`, `admin`, `viewer` |
| `display_name` | VARCHAR(255) | "Super Admin", "Admin", "Viewer" |
| `priority` | INTEGER | Higher wins in multi-group scenarios |
| `is_system` | BOOLEAN | Can't delete, only edit priority |
| `description` | TEXT | |
| `created_at` | TIMESTAMP | |

Seed: `super_admin(120)`, `admin(100)`, `viewer(20)`.

**`apps`** — Existing table, add columns:

| Column | Type | Notes |
|--------|------|-------|
| `authentik_slug` | VARCHAR(100) | Match `applications.slug` from Authentik |
| `access_group` | VARCHAR(255) | Authentik group that gates access |
| `schema_endpoint` | VARCHAR(255) | `GET /api/rbac/schema` URL for module discovery |
| `is_active` | BOOLEAN | Disable app without deleting |

Migrate existing seed data: `ogun` → `ogun-bridge`, `thoth` → `thoth-esu-gateway`, `groove` → `groove-payroll`.

**`role_definitions`** — Custom roles built per-app

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `app_slug` | VARCHAR(100) FK | References `apps.slug` |
| `name` | VARCHAR(50) | Role name (e.g., "Support Agent", "Developer") |
| `display_name` | VARCHAR(255) | Human label |
| `description` | TEXT | |
| `base_role` | VARCHAR(50) | Maps to base_roles.name (`admin`, `viewer`) |
| `is_default` | BOOLEAN | True = users with no explicit mapping get this |
| `is_active` | BOOLEAN | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `updated_by` | VARCHAR(255) | |
| UNIQUE | `(app_slug, name)` | |

**`role_permissions`** — Module permissions per role

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `role_definition_id` | INT FK | |
| `module_name` | VARCHAR(100) | e.g., `users`, `mail`, `passwords` |
| `actions` | JSONB | `["read"]` or `["read","write","delete"]` |
| `created_at` | TIMESTAMP | |
| UNIQUE | `(role_definition_id, module_name)` | |

**`group_role_mappings`** — Authentik group → role mapping

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `app_slug` | VARCHAR(100) FK | |
| `authentik_group` | VARCHAR(255) | Authentik group name |
| `role_definition_id` | INT FK | |
| `priority` | INTEGER | Higher wins in multi-group scenarios |
| `is_active` | BOOLEAN | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `updated_by` | VARCHAR(255) | |
| UNIQUE | `(app_slug, authentik_group)` | |

**`app_users`** — Per-app user cache (enhance existing table)

| Column | Type | Notes |
|--------|------|-------|
| `app_id` | INT FK | |
| `oidc_sub` | VARCHAR(255) | |
| `email` | VARCHAR(255) | |
| `role_definition_id` | INT FK | Nullable = viewer fallback |
| `permissions_cache` | JSONB | Cached from role_definitions |
| `last_sync` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |
| UNIQUE | `(app_id, oidc_sub)` | |

**`app_schemas`** — Cached module schemas (hybrid registration)

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `app_slug` | VARCHAR(100) FK | |
| `modules` | JSONB | Array of `{ name, actions[], description }` |
| `source` | VARCHAR(50) | `app_push` or `admin_override` |
| `last_synced` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| UNIQUE | `(app_slug)` | |

### 1.2 Module Schema Registration

Each app exposes `GET /api/rbac/schema` returning:

```json
{
  "modules": [
    { "name": "users", "actions": ["read", "write", "delete"], "description": "User management" },
    { "name": "groups", "actions": ["read", "write"], "description": "Group management" },
    { "name": "passwords", "actions": ["read", "write", "force_reset"], "description": "Password management" },
    { "name": "mail", "actions": ["read", "write"], "description": "Mail settings" },
    { "name": "dashboard", "actions": ["read"], "description": "Dashboard access" },
    { "name": "settings", "actions": ["read", "write"], "description": "System settings" }
  ]
}
```

Ogun Bridge caches schemas in `app_schemas` table (fetched on demand, 5 min TTL). App can push via `POST /api/rbac/schema/:appSlug` on startup. Admin can override modules in the UI.

### 1.3 API Endpoints

All RBAC endpoints require `super_admin` role (checked via middleware).

**Schema:**
- `GET /api/rbac/schema/:appSlug` — Get cached module schema for app
- `POST /api/rbac/schema/:appSlug` — App registers/updates its module schema

**Roles:**
- `GET /api/rbac/roles/:appSlug` — List role definitions for app
- `POST /api/rbac/roles/:appSlug` — Create role definition
- `PUT /api/rbac/roles/:id` — Update role definition
- `DELETE /api/rbac/roles/:id` — Delete (non-default, non-system)

**Permissions:**
- `GET /api/rbac/roles/:id/permissions` — Get permissions for a role
- `PUT /api/rbac/roles/:id/permissions` — Bulk update permissions

**Mappings:**
- `GET /api/rbac/mappings/:appSlug` — List group → role mappings
- `POST /api/rbac/mappings/:appSlug` — Create mapping
- `PUT /api/rbac/mappings/:id` — Update mapping
- `DELETE /api/rbac/mappings/:id` — Remove mapping

**Resolution:**
- `POST /api/rbac/resolve` — Core endpoint:
  ```
  Request: { sub, email, groups[], appSlug }
  Logic:
    1. For each group in groups[], find matching group_role_mapping
    2. Pick highest-priority mapped role
    3. If no mapping → use app's default role (or built-in viewer)
    4. Load role_definition's permissions
    5. Upsert into app_users
  Response: { roleDefinition: { id, name, display_name },
              permissions: { users: ["read","write"], ... },
              matchedGroup: "systems_admins",
              source: "group_mapping" }
  ```
- `GET /api/rbac/check` — Authorization check for middleware:
  ```
  Request: { appSlug, oidcSub, groups[], requiredModule, requiredAction }
  Response: { authorized: bool, permissions: {...} }
  ```

**Users:**
- `GET /api/rbac/users/:appSlug` — List users with roles
- `POST /api/rbac/sync/:appSlug` — Sync Authentik group members
- `PUT /api/rbac/users/:appSlug/:sub/role` — Override user's role

**Apps:**
- `GET /api/rbac/apps` — List all apps with group + schema info

**Authentik proxy:**
- `GET /api/rbac/authentik-groups` — Fetch groups from Authentik API for autocomplete

### 1.4 Auth Callback & Session Flow

Updated `/auth/callback`:

```
1. OIDC code exchange → Authentik returns { sub, email, groups[] }
2. POST /api/rbac/resolve { sub, email, groups[], appSlug: "ogun" }
3. Response: { roleDefinition, permissions, matchedGroup }
4. Session stores: { sub, email, roleDefinition, permissions, groups, matchedGroup }
5. /me returns: { sub, email, role: roleDefinition.name, displayName, permissions, groups }
```

### 1.5 Middleware Layer

- `authenticate` — session check (existing, no change)
- `requireSuperAdmin` — checks session.roleDefinition.name === 'super_admin' (replaces current `requireRole('super_admin')`)
- `requireModule(module, action?)` — checks session.permissions[module] includes action

All RBAC middleware reads from session (set by auth callback). No DB hit per request.

**Cache invalidation:**
- On role definition update → bust in-memory cache for that app's roles
- On group mapping update → bust in-memory cache
- `app_users` table provides persistent per-user cache across restarts

### 1.6 User Sync Strategy

**Sync on login** (default):
- On every `/api/rbac/resolve` call, if user's group has no role_definitions mapping, auto-assign the app's default role.
- Log auto-assignment to audit_log.

**Manual sync** (admin-initiated):
- `POST /api/rbac/sync/:appSlug`:
  - Fetches Authentik group members for `apps.access_group`
  - Compares with `app_users` for this app
  - New users → upsert with default role
  - Users no longer in group → mark inactive

### 1.7 Frontend: Role Management UI

**Route:** `/roles` — under USER ADMINISTRATION, `minRole: 'super_admin'`

**Sidebar nav item:**
```js
{ name: 'Role Management', href: '/roles', icon: ShieldCheck, minRole: 'super_admin' }
```

**5 tabs:**

1. **Apps** — List all registered apps. Add/Edit app. Sync groups from Authentik.
2. **Group Mappings** (per app) — Table of Authentik group → role mappings. Create/edit with autocomplete. Shows unmapped groups.
3. **Roles** (per app) — List role definitions. Create/edit with permission builder (checkboxes per module per action).
4. **Users** (per app) — List users with role, last sync. Manual override. Sync button.
5. **Permissions Reference** (global) — Matrix: all apps × all modules × all actions. Collapsible by app.

### 1.8 Existing Module UX Updates

- **Users page:** Show effective role with group source tooltip
- **Groups page:** Show "Mapped Role" column if mapped in Ogun Bridge
- **Services page:** Assigned groups show role badges

## Phase 2: Spectres Pantheon — Integration

### 2.1 Changes

**OIDC Provider (`packages/auth/src/oidc/provider.ts`):**
- Remove static `roleMapping` config
- On callback, call `POST /api/rbac/resolve { appSlug: "spectres-pantheon", groups[] }`
- Store `{ roleDefinition, permissions }` in session

**Auth middleware (`src/server/middleware/authorize.ts`):**
- Keep CASL for self-referential permissions (can User A edit User B's profile)
- Load abilities from session permissions JSON instead of local DB

**Module access middleware (`src/server/middleware/moduleAccess.ts`):**
- Replace `BusinessRole.modules` lookup with `session.permissions`
- `requireModuleAccess(moduleName)` → checks `session.permissions[moduleName]`

**Schema (`prisma/schema.prisma`):**
- Keep `User` model (for local data)
- Remove `roleId` FK, `businessRoleId` FK
- Remove `Role`, `RolePermission`, `Permission`, `BusinessRole` tables

**Module registration:**
- On startup, `POST /api/rbac/schema/spectres-pantheon` with modules:
  ```json
  {
    "modules": [
      { "name": "dashboard", "actions": ["read"] },
      { "name": "projects", "actions": ["read", "create", "edit", "delete"] },
      { "name": "tasks", "actions": ["read", "create", "edit", "delete", "comment"] },
      { "name": "clients", "actions": ["read", "create", "edit"] },
      { "name": "finances", "actions": ["read", "create", "edit"] },
      { "name": "reports", "actions": ["read"] },
      { "name": "calendar", "actions": ["read"] },
      { "name": "time_tracking", "actions": ["read", "create", "edit"] },
      { "name": "tickets", "actions": ["read", "create", "comment"] },
      { "name": "settings", "actions": ["read", "write"] },
      { "name": "users", "actions": ["read", "create", "edit", "delete"] },
      { "name": "documents", "actions": ["read", "upload", "delete"] }
    ]
  }
  ```

**Frontend:**
- `Sidebar.tsx` — use `user.permissions` for module filtering (no change needed)
- `src/lib/useBusinessRole.ts` — refactor to read from `user.permissions`

## Phase 3: Thoth ESU Gateway — Integration

### 3.1 Changes

**OIDC plugin (`localmail-api/src/plugins/auth.ts`):**
- On OIDC callback, call `POST /api/rbac/resolve { appSlug: "thoth-esu-gateway", groups[] }`
- Store `{ roleDefinition, permissions }` in session

**Auth middleware (`localmail-api/src/api/middleware/auth.ts`):**
- Keep session check
- `requireRole(roles[])` → reads from session's `roleDefinition.name`
- Add `requireModule(module, action?)` — checks `session.permissions`

**Route protection (`localmail-api/src/app.ts`):**
- Replace hardcoded role arrays with session-based checks

**Module registration:**
- On startup, `POST /api/rbac/schema/thoth-esu-gateway` with modules:
  ```json
  {
    "modules": [
      { "name": "emails", "actions": ["read", "write", "delete"] },
      { "name": "templates", "actions": ["read", "create", "edit", "delete"] },
      { "name": "webhooks", "actions": ["read", "create", "edit", "delete"] },
      { "name": "audits", "actions": ["read"] },
      { "name": "logs", "actions": ["read", "clear"] },
      { "name": "settings", "actions": ["read", "write"] },
      { "name": "config", "actions": ["read", "write"] }
    ]
  }
  ```

**Frontend:**
- `Sidebar.tsx` — filter nav items by `session.permissions`
- `providers.tsx` — show effective role + group source in user menu

## Phase 4: Groove Payroll — Future

Same pattern, not in initial scope.

## Implementation Order

| Phase | Work | Branch |
|-------|------|--------|
| **1a** | Ogun Bridge: DB schema + seed data | `feature/rbac-ogun-managed` |
| **1b** | Ogun Bridge: API endpoints (resolve, check, roles, mappings, schema) | `feature/rbac-ogun-managed` |
| **1c** | Ogun Bridge: Auth callback updates (call resolver, cache permissions) | `feature/rbac-ogun-managed` |
| **1d** | Ogun Bridge: Frontend Role Management UI (5 tabs + sidebar) | `feature/rbac-ogun-managed` |
| **1e** | Ogun Bridge: UX updates (Users, Groups, Services pages) | `feature/rbac-ogun-managed` |
| **1f** | Ogun Bridge: Middleware layer (requireModule, requireSuperAdmin) | `feature/rbac-ogun-managed` |
| **2** | Spectres Pantheon: Replace BusinessRole + CASL with Ogun Bridge | `feature/rbac-ogun-managed` |
| **3** | Thoth ESU Gateway: Replace hardcoded roles with Ogun Bridge | `feature/rbac-ogun-managed` |

## Key Decisions Summary

| Decision | Choice |
|----------|--------|
| Base roles | `super_admin`, `admin`, `viewer` only (seeded) |
| Custom roles | Stored in `role_definitions` per-app |
| Permission granularity | Module name + actions array |
| User sync | On-demand (during resolve) + manual sync button |
| Authentik app groups | Read from `apps.access_group`, enforced in middleware |
| Spectres: replace CASL? | Keep CASL for self-referential perms, replace BusinessRole.modules |
| Caching | Session (per-request) + `app_users` table (cross-restart) |
| App module registration | Hybrid — apps push via `POST /api/rbac/schema/:slug`, admin overrides in UI |
| Authentication | Authentik OIDC (apps gate by `access_group`); Ogun Bridge authorizes |
