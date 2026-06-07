# RoleManagement Page — End-to-End Flow

> File: `frontend/src/pages/RoleManagement.jsx` (1253 lines)
> Entry: `export function RoleManagement()` → `<Tabs defaultValue="apps">`
> Tab behavior: `TabsContent` returns `null` when inactive → **component unmounts/remounts on tab switch** — all local state resets

---

## Shared Dependencies (all tabs)

| Import | Source | Purpose |
|--------|--------|---------|
| `apiClient` | `@/services/api` | All API calls (cookie-based auth via `VITE_API_URL=/api`) |
| `logger` | `@/lib/logger` | Client-side logging |
| `useAppStore` | `@/store/useAppStore` | `currentUser` (role, username, email) |
| `useQuery`, `useMutation`, `useQueryClient` | `@tanstack/react-query` | Data fetching / mutations |
| `wrapQueryFn`, `wrapMutationFn` | `@/lib/logger` | Wraps queries/mutations with debug logging |

### QueryClient defaults (`staleTime: 5000`)

Data stays fresh for 5s across tab switches. After 5s, refetch on mount.

---

## Tab 1 — AppsTab

**Function:** `AppsTab()` (line 32)

### State
```
currentUser ← useAppStore
editApp, appForm, showAddApp, showApiKey, createdApp ← useState
```

### Data Queries

| Query | Key | API Route | Default |
|-------|-----|-----------|---------|
| Apps list | `['rbac-apps']` | `GET /api/rbac/apps` | `[]` |

### Mutations

| Mutation | Method | Route | Side effects |
|----------|--------|-------|--------------|
| `updateApp` | PATCH | `/api/rbac/apps/:slug` | `invalidateQueries('rbac-apps')`, `setEditApp(null)`, toast |
| `createApp` | POST | `/api/rbac/apps` | `invalidateQueries('rbac-apps')`, `setCreatedApp(data)`, toast |

### Flow
1. Mount → `GET /api/rbac/apps` → render cards
2. Each card: display_name, slug, authentik_slug, access_group, user/role counts, API key (toggleable for super_admin), Active badge
3. **Edit** (super_admin): inline form opens below card → edit authentik_slug, access_group, schema_endpoint, active toggle → Save/Cancel
4. **Create** (super_admin): Dialog → `CreateAppForm`
5. Error state: red banner with `error.message`

### Sub-component: CreateAppForm (line 238)
```
Props: createdApp, onSubmit, onCancel, loading, apps
State: name, slug, display_name, claim_name('ogun_role'), authentik_slug, access_group, schema_endpoint, clone_from
```
- If `createdApp` is set → shows success panel with API key (copy-to-clipboard)
- `clone_from` dropdown: pre-fills config from existing app via `POST /api/rbac/apps` `clone_from` field
- Validation: name required, slug generated from name if empty

---

## Tab 2 — MappingsTab

**Function:** `MappingsTab()` (line 336)

### State
```
filterApp ← useState('ogun')        ← default app for queries
showCreate, showBulkImport           ← dialog toggles
```

### Data Queries

| Query | Key | API Route | Default | Enabled |
|-------|-----|-----------|---------|---------|
| Apps | `['rbac-apps']` | `GET /api/rbac/apps` | `[]` | always |
| Mappings | `['rbac-mappings', slug]` | `GET /api/rbac/mappings/:slug` | `[]` | `!!slug` |
| Roles | `['rbac-roles', slug]` | `GET /api/rbac/roles/:slug` | `[]` | `!!slug` |
| AuthGroups | `['authentik-groups']` | `GET /api/rbac/authentik-groups` | `[]` | always |

`slug = filterApp || apps[0]?.slug` — safety fallback if filterApp is empty

### Mutations

| Mutation | Method | Route | Side effects |
|----------|--------|-------|--------------|
| `createMapping` | POST | `/api/rbac/mappings/:slug` | `refetch()`, toast |
| `createBulk` | POST | `/api/rbac/mappings/:slug/bulk` | `refetch()`, toast (success + skipped count) |
| `updateMapping` | PUT | `/api/rbac/mappings/:id` | `refetch()`, toast |
| `deleteMapping` | DELETE | `/api/rbac/mappings/:id` | `refetch()`, toast |

### Flow
1. Mount → default `filterApp='ogun'` → fetch mappings, roles, authGroups
2. Renders table: `authentik_group` ↔ `role` (with group search input, role dropdown, priority, active toggle)
3. **App selector** dropdown at top switches `filterApp` → all queries refetch
4. **Create** (single): Dialog → `MappingForm`
5. **Bulk Import**: Dialog → `BulkImportForm` — multi-select groups, assign single role
6. **Edit**: inline row edit — group unchanged, role dropdown + priority + active
7. **Delete**: confirm → soft delete (sets `is_active=false`)
8. Error state: red banner with `mappingsError.message`

### Sub-component: MappingForm (line 504)
```
Props: roles, authGroups, onSubmit, onCancel, loading
State: authentik_group, role_definition_id, priority, groupSearch
```
- Group search: filters authGroups by name match
- Selected group shows as badge above dropdown

### Sub-component: BulkImportForm (line 555)
```
Props: roles, authGroups, existingMappings, onSubmit, onCancel, loading
State: selectedGroups[], role_definition_id, priority, groupSearch
```
- Multi-select groups with checkboxes
- Filters out groups already mapped (from `existingMappings`)
- Search narrows the list

---

## Tab 3 — RolesTab

**Function:** `RolesTab()` (line 646)

### State
```
filterApp ← useState('ogun')
showCreate, editingRole, permsDialog ← useState(null)
```

### Data Queries

| Query | Key | API Route | Default | Enabled |
|-------|-----|-----------|---------|---------|
| Apps | `['rbac-apps']` | `GET /api/rbac/apps` | `[]` | always |
| Roles | `['rbac-roles', slug]` | `GET /api/rbac/roles/:slug` | `[]` | `!!slug` |
| Schema | `['rbac-schema', slug]` | `GET /api/rbac/schema/:slug` | `{modules:[]}` | `!!slug` |
| Current Perms | `['rbac-role-perms', permsDialog]` | `GET /api/rbac/roles/:id/permissions` | `[]` | `!!permsDialog` |

### Mutations

| Mutation | Method | Route | Side effects |
|----------|--------|-------|--------------|
| `createRole` | POST | `/api/rbac/roles/:slug` | `refetch()`, toast |
| `updateRole` | PUT | `/api/rbac/roles/:id` | `refetch()`, `setEditingRole(null)`, toast |
| `deleteRole` | DELETE | `/api/rbac/roles/:id` | `refetch()`, toast (deactivate) |
| `updatePerms` | PUT | `/api/rbac/roles/:id/permissions` | `setPermsDialog(null)`, toast |

### Flow
1. Mount → default `filterApp='ogun'` → fetch roles + schema
2. Renders table: name, display_name, description, base_role, Default badge, module_count, actions
3. **App selector** dropdown switches `filterApp`
4. **Create**: Dialog → `RoleForm` (empty initial)
5. **Edit**: Dialog → `RoleForm` (pre-filled with `editingRole`)
6. **Deactivate**: soft delete → sets `is_active=false`
7. **Permissions**: Dialog → `PermissionsBuilder` — fetches current perms → save
8. Error state: red banner with `rolesError.message`

### Sub-component: RoleForm (line 817)
```
Props: initial, onSubmit, onCancel, loading
State: name, display_name, description, base_role('viewer'), is_default(false)
```
- `base_role` dropdown: viewer, admin, password_manager (seeded system roles)
- `is_default`: checked = default role for new users

### Sub-component: PermissionsBuilder (line 859)
```
Props: modules, currentPerms, onSave, onCancel, loading
State: perms ← { module_name → actions[] }
```
- Groups modules by `category` from schema
- Checkbox per action (create, read, update, delete, manage, approve, export)
- Submit builds array: `[{module_name, actions}, ...]` — only non-empty actions included
- Submit also includes any `currentPerms` modules not in schema (preserves legacy)

---

## Tab 4 — UsersTab

**Function:** `UsersTab()` (line 928)

### State
```
filterApp ← useState('ogun')
overrideUser, overrideRole          ← override dialog
```

### Data Queries

| Query | Key | API Route | Default | Enabled |
|-------|-----|-----------|---------|---------|
| Apps | `['rbac-apps']` | `GET /api/rbac/apps` | `[]` | always |
| Roles | `['rbac-roles', slug]` | `GET /api/rbac/roles/:slug` | `[]` | `!!slug` |
| Users | `['rbac-users', slug]` | `GET /api/rbac/users/:slug` | `[]` | `!!slug` |

### Mutations

| Mutation | Method | Route | Side effects |
|----------|--------|-------|--------------|
| `syncUsers` | POST | `/api/rbac/sync/:slug` | `refetch()`, toast |
| `overrideMutation` | PUT | `/api/rbac/users/:slug/:sub/role` | `refetch()`, `setOverrideUser(null)`, toast |

### Flow
1. Mount → default `filterApp='ogun'` → fetch roles + users
2. Renders table: oidc_sub, email, last_auth, role name, actions
3. **Sync** button → triggers Authentik → app_users pull for this app slug
4. **Override** → select a user → pick a different role from dropdown → saves `role_definition_id` + recomputes `permissions_cache` in DB
5. Active/inactive status shown
6. Error state: red banner with `usersError.message`

---

## Tab 5 — PermissionsReferenceTab

**Function:** `PermissionsReferenceTab()` (line 1072)

### State
```
filterApp ← useState('')            ← '' = show all apps
expandedApps                        ← accordion state
```

### Data Queries

| Query | Key | API Route | Default |
|-------|-----|-----------|---------|
| Apps | `['rbac-apps']` | `GET /api/rbac/apps` | `[]` |
| All Roles | `['rbac-roles']` | `GET /api/rbac/roles` | `[]` |
| All Schemas | `['rbac-schemas']` | `GET /api/rbac/schemas` | `{}` |

> Note: roles/schemas queries fetch **across all apps** (no slug filter)

### Flow
1. Mount → fetch ALL roles + ALL schemas
2. Groups roles by `app_slug`, groups schemas by app
3. App selector dropdown filters which app to view (default = all)
4. Renders accordion: per app → per role → per module → list of allowed actions
5. Highlights mismatches (orange indicator): roles referencing modules not in that app's schema
6. Visual: `role_name` → `module_name [create, read, etc.]`

---

## Shared UI Components

| Component | Usage |
|-----------|-------|
| `LoadingSpinner` | Centered `RefreshCw` spin icon, shown during `isLoading` |
| `EmptyState` | Centered gray text, shown when data array is `length === 0` |
| Error banner | Red `danger-text` div with `error.message`, shown before loading/empty checks |
| `Select`, `SelectItem` | App switcher dropdown in Mappings, Roles, Users, PermsRef |
| `Button` | Actions: Create, Save, Cancel, Refresh, Sync |
| `Dialog` system | Create/Edit forms, Permissions builder, Override user role |
| `Badge` | Active/Inactive, Default role |
| `Card`, `CardContent` | App cards in AppsTab |
| `Input`, `Checkbox` | Form fields |
