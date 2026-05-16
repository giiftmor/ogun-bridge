# Ogun Bridge — Implementation Plan

## Status Legend
- 🔴 **Not started**
- 🟡 **In progress**
- 🟢 **Complete**
- ⚪ **Blocked**

---

## Phase A: Missing DB Table Definitions

Add 3 `CREATE TABLE IF NOT EXISTS` blocks to `backend/src/lib/db.js` before the seed data (line 354). These tables already exist in production (created by external migrations/sync) but are absent from the automated schema, so a fresh DB init would miss them.

| Table | Key Columns | Used By |
|---|---|---|
| `group_sync_config` | `group_name PK`, `sync_direction`, `ldap_ou`, `parent_group`, `is_active`, `group_pk`, timestamps | `groups.js:128,344`, `syncService.js:443,542,583` |
| `group_services` | `id PK`, `group_name`, `service_name`, `service_url`, `service_type`, `description`, `icon`, `is_public`, `is_active`, timestamps, `UNIQUE(group_name, service_name)` | `groupServices.js`, `users.js:382`, `invite.js:42` |
| `sync_state` | `entity_type`, `entity_id`, `sync_direction`, `metadata JSONB`, `last_synced_at`, timestamps, `UNIQUE(entity_type, entity_id)` | `syncService.js:464,482` |

**Files**: `backend/src/lib/db.js`

**Status**: 🔴 Not started

---

## Phase B: Backend Group Lifecycle CRUD

Add routes to a new `backend/src/routes/groupManagement.js` mounted at `/api/groups-manager` (reuses existing prefix from `index.js:177`).

| Route | Purpose | Authentik Call | LDAP Call |
|---|---|---|---|
| `POST /groups` | Create group | `createGroup({name, description, parent})` | `createGroup(name, attrs)` |
| `PUT /groups/:id` | Edit name, description, parent | `updateGroup(id, {name, description, parent})` | `updateGroup(name, {description})` |
| `DELETE /groups/:id` | Delete group | `deleteGroup(id)` | `deleteGroup(name)` |
| `POST /groups/:id/members` | Add user(s) to group | `addUserToGroup(id, username)` | — (sync handles) |
| `DELETE /groups/:id/members/:username` | Remove user from group | `removeUserFromGroup(id, username)` | — (sync handles) |

All routes: create pre-mutation snapshot, write audit log, return `{ success, message, group }`.

**Files created**: `backend/src/routes/groupManagement.js`
**Files modified**: `backend/src/index.js` (import + mount), `frontend/src/services/api.js` (add frontend methods)

**Status**: 🔴 Not started

---

## Phase C: Backend User Lifecycle CRUD

Add routes to `backend/src/routes/users.js`.

| Route | Purpose | Backing Methods |
|---|---|---|
| `POST /` | Create user in Authentik + LDAP | `authentikClient.createUser({username, name, email})`, `ldapClient.updateUser()` |
| `PUT /:id` | Edit name, email, is_active | `authentikClient.updateUser(pk, {name, email, is_active})` |
| `DELETE /:id` | Delete user | `authentikClient.deleteUser(pk)`, `ldapClient.deleteUser(username)` |
| `GET /:username/groups` | List user's groups + available groups | `authentikClient.getGroups()`, resolve membership |
| `POST /:username/groups` | Add user to group | `authentikClient.addUserToGroup(groupPk, username)` |
| `DELETE /:username/groups/:groupId` | Remove user from group | `authentikClient.removeUserFromGroup(groupPk, username)` |

All routes: audit log, pre-mutation snapshot, `{ success, message }`.

**Files modified**: `backend/src/routes/users.js`, `frontend/src/services/api.js`

**Status**: 🔴 Not started

---

## Phase D: Frontend Group CRUD UI

Add UI to `frontend/src/pages/GroupBrowser.jsx`.

| UI Element | Backend Route |
|---|---|
| "Create Group" button + dialog (name, description, parent picker) | `POST /api/groups-manager/groups` |
| Inline edit in detail panel (name, description, parent selector) | `PUT /api/groups-manager/groups/:id` |
| "Delete" button in detail panel (confirmation + impact summary) | `DELETE /api/groups-manager/groups/:id` |
| "Members" tab (list, "Add Member" search, "Remove" per user) | `GET /groups/:id/members`, `POST/DELETE /api/groups-manager/groups/:id/members/...` |

**Files modified**: `frontend/src/pages/GroupBrowser.jsx`, `frontend/src/services/api.js`

**Status**: 🔴 Not started

---

## Phase E: Frontend User CRUD + Group Membership UI

Add UI to `frontend/src/pages/UserBrowser.jsx` and `UserDetail.jsx`.

| Page | UI Element | Backend Route |
|---|---|---|
| UserBrowser | "Create User" button + dialog (username, name, email, group selector, invite checkbox) | `POST /api/users` |
| UserBrowser | "Deactivate" toggle (confirmation) | `PUT /api/users/:id` |
| UserBrowser | "Delete" button (double confirmation) | `DELETE /api/users/:id` |
| UserDetail | "Groups" management section (current groups + "Add to Group" selector + "Remove") | `GET /api/users/:username/groups`, `POST/DELETE` |
| UserDetail | "Edit" mode (name, email fields) | `PUT /api/users/:id` |

**Files modified**: `frontend/src/pages/UserBrowser.jsx`, `frontend/src/pages/UserDetail.jsx`, `frontend/src/services/api.js`

**Status**: 🔴 Not started

---

## Phase F: Service Editing

Add routes to `backend/src/routes/groupServices.js`.

| Route | Purpose |
|---|---|
| `PUT /services/:serviceName` | Update service metadata globally — updates ALL `group_services` rows + Authentik group attributes |
| `DELETE /services/:serviceName` | Delete service globally — removes ALL `group_services` rows + cleans up Authentik attributes |

Add UI to `frontend/src/pages/ServiceManager.jsx`:
- "Edit" button on service detail (dialog pre-filled with current metadata)
- "Delete Service Globally" button (shows all assigned groups, confirmation)

**Files modified**: `backend/src/routes/groupServices.js`, `frontend/src/pages/ServiceManager.jsx`, `frontend/src/services/api.js`

**Status**: 🔴 Not started

---

## Phase G: One-Click Onboarding Wizard

**New backend file**: `backend/src/routes/onboarding.js` mounted at `/api/onboarding`

| Route | Flow |
|---|---|
| `POST /` | 1. `authentikClient.createUser()` 2. `authentikClient.addUserToGroup()` per group 3. `inviteService.sendInvite()` — all in transaction, rollback user if invite fails |

**New frontend file**: `frontend/src/components/OnboardingWizard.jsx`
- Multi-step dialog: User details → Group selection (tree picker) → Invite options → Summary + Submit

**Files created**: `backend/src/routes/onboarding.js`, `frontend/src/components/OnboardingWizard.jsx`
**Files modified**: `backend/src/index.js`, `frontend/src/pages/UserBrowser.jsx`

**Status**: 🔴 Not started

---

## Search Part 1: Global Command Palette

### Backend — new search endpoint
**New file**: `backend/src/routes/search.js` — `GET /api/search?q=...`

Runs 3 queries in parallel with `Promise.allSettled()`, capped at 8 per category, 5s timeout:
1. `authentikClient.getUsers({ search: q })` → `{ username, name, email, _type: 'user' }`
2. `authentikClient.getGroups({ search: q })` → `{ name, description, pk, _type: 'group' }`
3. `pool.query(ILIKE on group_services.service_name)` → `{ service_name, service_url, service_type, _type: 'service' }`

Returns: `{ users: [...], groups: [...], services: [...] }`

**Files created**: `backend/src/routes/search.js`
**Files modified**: `backend/src/index.js` (mount at `/api/search`)

### Frontend — CmdPalette component
**New file**: `frontend/src/components/CmdPalette.jsx`

| Feature | Detail |
|---|---|
| Trigger | `Cmd+K` (Mac) / `Ctrl+K` (Win) global listener; `/` to focus when no input active |
| Search | Debounced 200ms → `api.searchAll(q)` → grouped results with section headers + counts |
| Navigation | Arrow keys, Enter to select, Escape to dismiss |
| Auto-select | Navigates to `/?q=<name>` — page reads URL param to auto-select result |
| States | Loading spinner, empty ("No results for '{q}'"), error (red banner + retry) |

**File modified**: `frontend/src/components/Layout.jsx` (mount component), `frontend/src/services/api.js` (add `searchAll(q)`), `frontend/src/pages/UserBrowser.jsx`, `GroupBrowser.jsx`, `ServiceManager.jsx` (read `?q=` param)

**Status**: 🔴 Not started

---

## Search Part 2: Page-Level Search Fixes

Apply to ALL 10 search inputs across every page.

| Fix | Pages | What |
|---|---|---|
| Debounce (300ms) | GroupBrowser, OperationsCenter, ChangesBrowser, SyncManager, AuditViewer | Replace raw `searchTerm` in queryKey with `useDebounce(searchTerm, 300)` |
| Error states | ALL 10 pages | Render `error` from `useQuery` — red alert banner + retry button |
| Result highlighting | ALL 10 pages | `<Highlight text={item.name} query={searchTerm} />` — wraps matches in `<mark>` |
| Keyboard shortcuts | ALL 10 search inputs | `/` focuses, `Escape` clears/blurs |
| Remove redundant re-filter | UserBrowser, GroupBrowser, SyncManager | Delete client-side `.filter()` after API already searched |
| Pass search param to API | ChangesBrowser, AuditViewer | Add `searchTerm` to API call so backend pre-filters |
| Backend search + limit params | users.js, groups.js, changes.js, audit.js | Accept `search` + `limit` query params |

**Files modified**: All 10 page files in `frontend/src/pages/`, plus `backend/src/routes/users.js`, `groups.js`, `changes.js`, `audit.js`, `changeDetector.js`, `auditService.js`

**Status**: 🔴 Not started

---

## Search Part 3: Backend Search Improvements

| File | Change |
|---|---|
| `backend/src/services/authentikClient.js:59-68` | Pass `page_size` and `ordering` params through to Authentik API |
| `backend/src/routes/users.js:85` | Accept `?limit=`, pass `page_size` to Authentik |
| `backend/src/routes/groups.js:22,50` | Accept `?limit=`, pass `page_size` to Authentik |
| `backend/src/routes/changes.js + changeDetector.js` | Add `?search=` → SQL `ILIKE` on `entity_id` |
| `backend/src/routes/audit.js + auditService.js` | Add `?search=` → SQL `ILIKE` on `entity_id`, `actor` |

**Files modified**: 6 backend files

**Status**: 🔴 Not started

---

## Implementation Order (Dependency Chain)

```
Search Part 3 ──→ Search Part 1 ──→ Search Part 2
(backend infra)   (search route +    (page-level polish)
                   CmdPalette)

Phase A ──→ Phase B ──→ Phase D
(DB)         (backend      (frontend
              group CRUD)   group UI)

Phase C ──→ Phase E
(backend     (frontend
 user CRUD)  user UI)

Phase A ──→ Phase F
(DB)         (service editing)

Phase C + E ──→ Phase G
                 (onboarding)
```

Parallel tracks:
- **Track 1**: Search (Parts 3 → 1 → 2) — all search improvements
- **Track 2**: Groups (A → B → D) — full group lifecycle
- **Track 3**: Users (C → E) — full user lifecycle
- **Track 4**: Services (F) — service editing (needs Phase A)
- **Track 5**: Onboarding (G) — needs Phase C + E

Tracks 1-3 can proceed in parallel after Phase A.
