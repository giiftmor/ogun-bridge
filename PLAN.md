# Ogun Bridge — Implementation Plan

## Phase 8 — Seed ogun role_permissions + app_schemas

**Goal:** Create the role_permissions and app_schemas records for the ogun app so that resolved roles carry actual module/action permissions, and the UI can display ogun module definitions.

**Background:** The 3 role_definitions for ogun (admin, password_manager, viewer) already exist in the DB (created by resolveRole() upsert). But role_permissions are empty for ogun, meaning req.user.permissions is {} in every session. app_schemas is also empty for all apps.

### Sub-tasks

- Seed role_permissions for ogun role_definitions (ids: 1=admin, 2=password_manager, 3=viewer):
  - admin: dashboard [read,write], password [read,write,manage], users [read,write,manage], groups [read,write], audit [read], logs [read], settings [read,write]
  - password_manager: dashboard [read], password [read,write,manage], users [read], audit [read], logs [read]
  - viewer: dashboard [read], audit [read], logs [read]
- Seed app_schemas for ogun with matching module definitions (modules JSONB array with name, actions, description)
- Use idempotent INSERT (ON CONFLICT DO NOTHING) in db.js initializeTables()
- Verify: fresh login session has populated permissions object, UI shows ogun modules

## Phase 9 — Fix empty app_schemas for spectres/thoth

**Goal:** Investigate and fix why the app_schemas table is empty for ALL apps. Schema auto-discovery should have populated records for spectres and thoth (which have schema_endpoint set), but the table has zero rows.

### Sub-tasks

- Check if schema discovery service starts correctly in backend/src/index.js
- Check service logs: docker logs ogun-bridge-backend | grep schema
- Verify spectres and thoth schema endpoints respond correctly
- Test POST /api/rbac/schema/:appSlug/push manually with valid API key
- Fix any discovered issues (timeout, network, parsing error)
- If auto-discovery is broken beyond quick fix: seed app_schemas manually in db.js
- Verify: app_schemas contains records for spectres and thoth

## Phase 10 — Backend: role-gate Ogun's own routes

**Goal:** Apply the already-resolved role from the user session to protect Ogun Bridge backend routes. Currently most routes only check authenticate — any authenticated user (even viewer) can perform admin operations.

**Key insight:** The OIDC callback stores the resolved role in session.data.roleDefinition.name. The requireRole() middleware already checks req.user.roleDefinition.name. Just need to apply it consistently.

### Routes to harden

| Route | Current guard | New guard |
|-------|--------------|-----------|
| POST /api/invite/force-reset/:username | authenticate | requireRole('admin', 'password_manager') |
| POST /api/invite/send/:username | authenticate | requireRole('admin', 'password_manager') |
| POST /api/password/sync/:username | requireRole('admin') | requireRole('admin', 'password_manager') |
| POST /api/password/expiration/:username | authenticate | requireRole('admin', 'password_manager') |
| POST /api/auth/generate-temp-password | authenticate | requireRole('admin', 'password_manager') |
| POST /api/auth/change-password | token-based | keep (self-service) |
| POST /api/password/change | authenticate | keep (self-service, verifies current pw) |
| GET /api/password/history/:username | authenticate | keep (viewable by all) |

### Sub-tasks

- Update routes/invite.js: add requireRole to force-reset and send
- Update routes/password.js: extend sync guard; add guard to expiration POST
- Update routes/auth.js: add guard to generate-temp-password
- Verify requireRole is imported in all affected files
- Test: viewer gets 403, password_manager gets 200, admin gets 200

## Phase 11 — Backend: systems_admin protection for password operations

**Goal:** Prevent password_manager users from performing password operations on users who have the admin role for Ogun Bridge. Only a fellow admin can change another admin's password.

### Sub-tasks

- Create helper getUserOgunRole(username) in services/authorizer.js:
  - Query app_users WHERE app_slug='ogun' JOIN role_definitions
  - Return role name or null
  - Fallback: query Authentik API for user group membership if no app_users record
- Create middleware protectPasswordOperation in middleware/auth.js:
  - Extract targetUsername from req.params.username
  - Look up target user's Ogun role
  - If requester is password_manager AND target is admin -> 403
  - Super admins always pass through
- Apply to: force-reset, sync-password, expiration, generate-temp-password
- Test: password_manager can reset regular user but gets 403 for admin user

## Phase 12 — Frontend: sidebar filtering via roleDefinition.name

**Goal:** Hide sidebar navigation items based on the user's resolved Ogun role (currentUser.roleDefinition.name). Currently all 13 items shown to everyone.

**Important difference from current code:** The existing checks use currentUser.role (auth_users column: super_admin/admin/member/viewer). This phase uses currentUser.roleDefinition.name (resolved Ogun role: admin/password_manager/viewer). These are different role systems.

**Files:** frontend/src/components/Sidebar.jsx, frontend/src/components/Layout.jsx

### Permission map

| roleDefinition.name | Visible sidebar items |
|--------------------|----------------------|
| viewer | Dashboard, Audit, Logs |
| password_manager | Dashboard, Users, Passwords, Audit, Logs |
| admin | All 13 items |
| super_admin | All 13 items (fallback: show all if no roleDefinition) |

### Sub-tasks

- Read currentUser.roleDefinition?.name from useAppStore in Layout.jsx
- Pass as userRole prop to Sidebar
- Add rolePermissions map in Sidebar.jsx
- Filter defaultNavigation through the map
- Handle edge cases: null roleDefinition (show all), undefined (show all)
- Test each role

## Phase 13 — Frontend: action-level gating across all pages

**Goal:** Every page with destructive or admin-only actions must gate them behind currentUser.roleDefinition.name. Currently no page (except RoleManagement's 3 super_admin checks) has any role-based gating.

### Pages requiring gating

| Page | Actions to gate | Minimum role |
|------|----------------|-------------|
| PasswordManagement | Sync password, Set expiration, Generate temp password | password_manager |
| UserBrowser | Create user, Delete user, Force reset, Invite user | password_manager |
| UserDetail | Edit user, Force reset, Delete user | password_manager |
| ProfileManagement | Force password reset, Generate temp password | password_manager |
| GroupBrowser | Create group, Delete group, Edit group | admin |
| OperationsCenter | Run sync, Approve changes | admin |
| LogViewer | (all view-only) | any authenticated |
| AuditViewer | (all view-only) | any authenticated |

### Pattern

Create reusable `<RequireRole roles={['admin', 'password_manager']}>` component:
- Reads currentUser.roleDefinition?.name from useAppStore
- If user role is in allowed list, render children
- Otherwise, disable or hide children
- Super admin always passes through

### Sub-tasks

- Create src/components/RequireRole.jsx
- Apply to PasswordManagement.jsx
- Apply to UserBrowser.jsx and UserDetail.jsx
- Apply to ProfileManagement.jsx
- Apply to GroupBrowser.jsx
- Apply to OperationsCenter.jsx
- Test each page as viewer, password_manager, admin

## Phase 14 — Redesign RoleManagement into app overview page

**Goal:** Replace the 5-tab layout (Apps, Mappings, Roles, Users, Permissions Reference) with an app-first drill-down page showing all RBAC functions for a selected app in one place.

**File:** frontend/src/pages/RoleManagement.jsx

### New layout

```
+-- App Selector + Sync/Create buttons ----+
|  App Info Card (name, slug, status)      |
+-- Roles ---------------------------------+
|  role_1 | modules: 5 | users: 12         |
|  [+ Add Role]                            |
+-- Users ---------------------------------+
|  user@example.com | role_1 | last_auth   |
|  [Sync Users]                            |
+-- Group Mappings ------------------------+
|  authentik_group_A -> role_1             |
+-- Audit Log -----------------------------+
|  recent activity for this app...         |
+-- Permissions Reference (collapsible) ---+
|  role_1 | module_A [R]  module_B [R,W]   |
```

### Ogun-specific restriction

When filterApp == 'ogun':
- No Roles section (controlled by Authentik)
- No Mappings section
- Users section is read-only (no override/sync buttons)
- Permissions reference is read-only

### Sub-tasks

- Redesign page: app selector + sections instead of tabs
- Each section fetches its own data via useQuery
- Implement restricted view for ogun
- Remove dead 5-tab code

## Phase 15 — Per-app audit log filtering

**Goal:** Show filtered audit log for the selected app in the overview page.

**Background:** Backend supports GET /api/audit?entity_type=...&search=.... Frontend has apiClient.getAuditLogs(params). Just need to wire them together.

### Sub-tasks

- Add audit log query to RoleManagement section
- Render compact table: action, actor, timestamp, entity_id
- Limit to last 20 entries, auto-refresh on app switch

## Phase 16 — Remove ogun from RBAC CRUD write routes

**Goal:** Prevent creating/editing/deleting roles, mappings, and permissions for the ogun app through the RBAC admin API. Ogun's RBAC is managed by Authentik.

**File:** backend/src/routes/rbac.js

### Sub-tasks

- In each write route where appSlug is ogun, add guard returning 403 with message
- Allow PUT /api/rbac/apps/:slug for ogun (app config still valid)
- Read operations (GET) for ogun remain open
- Audit log entry when ogun write is blocked
- POST /api/rbac/sync/ogun remains open (app_users population needed)

## Architecture Reference

Authentik groups structure:
```
ogun-bridge (access gate)
  users: oracle, neomoruri, admin, ...
systems_admins (parent, inherits to password_manager)
  users: neomoruri, admin, break-glass-admin
  password_manager (child, inherits from systems_admins)
    users: ldap_api, sallygwesela, itumoruri
```

Scope mapping (Authentik -> OIDC claim):
```
if 'ogun-bridge' not in groups -> hasAccess: false
if 'systems_admins' in groups -> role: admin
elif 'password_manager' in groups -> role: password_manager
else -> role: viewer
```

Data flow:
```
User -> Authentik Login -> OIDC Callback -> resolveRole('ogun', ogunClaim.role)
  -> Session: { roleDefinition: { name: viewer|password_manager|admin }, permissions: {...} }
  -> Backend: authenticate -> requireRole()
  -> Frontend: currentUser.roleDefinition.name -> gate UI
```

## Relevant files

| File | Purpose |
|------|---------|
| backend/src/lib/db.js | DB initialization + seeding |
| backend/src/middleware/auth.js | authenticate, requireRole, requireModule |
| backend/src/services/authorizer.js | resolveRole(), permission resolution |
| backend/src/services/authentikClient.js | Authentik API calls |
| backend/src/services/schemaDiscoveryService.js | Schema auto-discovery |
| backend/src/routes/rbac.js | All RBAC CRUD routes |
| backend/src/routes/password.js | Password management routes |
| backend/src/routes/invite.js | Invite + force-reset routes |
| backend/src/routes/auth.js | Auth routes including OIDC callback |
| backend/src/services/auditService.js | Audit log functions |
| frontend/src/pages/RoleManagement.jsx | Role management page |
| frontend/src/components/Sidebar.jsx | Sidebar navigation |
| frontend/src/store/useAppStore.js | Auth store |
| frontend/src/services/api.js | API client |
