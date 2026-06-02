# Ogun Bridge — Project Scope

## Overview

Ogun Bridge is a centralized identity management and authorization hub for the Spectres Tailnet. It synchronizes users and groups between **Authentik** (SSO/IdP) and **389 Directory Server** (LDAP), manages passwords across the ecosystem, provides **role-based access control (RBAC)** for all consuming apps (Spectres Pantheon, Groove Payroll, Thoth ESU Gateway), and exposes a unified management UI.

**Deployment:** spectres — frontend `:3331`, backend `:3333`

---

## System Architecture

```
                                    ┌──────────────────┐
                                    │   Browser (UI)   │
                                    │   port 3331      │
                                    └────────┬─────────┘
                                             │ REST + WS
                                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Ogun Bridge Backend                          │
│                    Express + Socket.IO + PostgreSQL             │
│                    port 3333                                    │
│                                                                │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Routes      │  │ Services     │  │ Middleware            │  │
│  │ • /api/*    │  │ • syncService│  │ • authenticate       │  │
│  │             │  │ • ldapClient │  │ • requireSuperAdmin  │  │
│  │             │  │ • authClient │  │ • requireModule      │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────────────────┘  │
└─────────┼─────────────────┼────────────────────────────────────┘
          │                 │
     ┌────┴────┐       ┌────┴────┐
     │  REST   │       │  LDAP   │
     │  API    │       │  (389)  │
     ▼         ▼       ▼         ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Authentik│ │ Postgres │ │ 389 DS   │
│ (SSO/IdP)│ │ (state)  │ │ (users)  │
└──────────┘ └──────────┘ └──────────┘

Consuming Apps (call POST /api/authorize):
  • Spectres Pantheon (port 8764)
  • Groove Payroll (port 8888)
  • Thoth ESU Gateway (port 3010)
```

---

## Tech Stack

### Backend
| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 25+ (ES modules) |
| Framework | Express 4.x |
| Database | PostgreSQL 16 (external) |
| LDAP | ldapts 4.x |
| Auth | Authentik OIDC + custom session tokens |
| Real-time | Socket.IO 4.x |
| Logging | Winston 3.x |
| Email | Nodemailer (SMTP via Thoth ESU Gateway) |

### Frontend
| Component | Technology |
|-----------|-----------|
| Runtime | React 18 |
| Bundler | Vite 7.x |
| Styling | Tailwind CSS 3.x + shadcn/ui |
| State | Zustand |
| Data Fetching | TanStack Query 5.x |
| Routing | React Router 6.x |
| Charts | Recharts 2.x |
| Notifications | react-hot-toast |

---

## Core Flows

### 1. Authentication & Authorization Flow
```
User → Browser → Authentik OIDC → Callback → /auth/callback
  → resolveRole (check group mappings) → Create session (7-day token)
  → Set HTTP-only cookie → Redirect to UI
  → Each API call: cookie → authenticate middleware → req.user
```

### 2. User Sync Flow
```
Sync cycle (every 5 min):
  GET /api/v3/core/users/ (Authentik)
  ldap.search() (389 DS)
  Compare users by username
  Create missing users in LDAP
  Update changed attributes
  Sync group memberships
  Log results → audit_log
```

### 3. Authorization (Central Authorizer)
```
Consumer app OIDC callback → onAuthorize hook
  → POST /api/authorize { sub, email, groups[], appSlug }
  → Check app access_group membership
  → Check group_role_mappings for highest-priority role
  → Fall back to default role (or viewer)
  → Upsert app_users record
  → Return { roleDefinition, permissions }
  → Consumer stores in session
```

### 4. Password Flow
```
Admin sets password:
  POST /api/password/sync/:username
  → Generate SSHA hash
  → ldap.modify() userPassword attribute
  → POST /api/v3/core/users/:id/set_password/ (Authentik)
  → Store metadata in user_profiles
  → Send invite email (optional)
```

### 5. Group ↔ Service Mapping Flow
```
Service assigned to LDAP group:
  INSERT INTO group_services (group_name, service_name, service_url, ...)
  → User's profile shows all services for their groups
  → Used in profile page, invite emails, and onboarding
```

---

## System Features

### Identity & Sync
- User CRUD (Authentik + LDAP simultaneously)
- Group CRUD (Authentik + LDAP simultaneously)
- Profile management (alt-email, password status, service access)
- Schema mapping (Authentik fields ↔ LDAP attributes)
- Service account filtering (ak-*, *_outpost_*, ldap_api)
- Change detection and approval workflow

### Password Management
- Password sync to LDAP (SSHA hashing) + Authentik
- Self-service password change
- Password policy enforcement (10+ chars, upper, lower, number, special)
- Password expiration dates and notifications
- Password invite system (email with token)
- Force password reset
- Bulk invite sending
- Password strength meter (UI)
- Password history via audit logs

### RBAC (Role-Based Access Control)
- App registry (register consuming apps)
- Role definitions per app (custom names, display names)
- Permission builder (module + CRUD actions per role)
- Authentik group → role mappings with priority
- User role overrides per app
- Super admin / admin / viewer base roles
- Module schema registration (apps push their module tree)
- Session-cached permissions (no DB hit per request)
- `requireModule(module, action?)` middleware
- Authentik group sync for app access groups

### Services & Groups
- Service CRUD (name, URL, type, icon, public/private)
- Group assignment to services
- Service health checks (SSRF-protected)
- Group lifecycle CRUD
- Member management (add/remove users)

### User Administration
- User browser with search, filter, pagination
- User detail with sync status, password status, groups, services
- Group membership management
- Active/inactive toggle, delete
- Bulk CSV import/export
- Onboarding wizard (create user, assign groups, send invite)
- Profile management page (own profile + service access)

### Monitoring & Operations
- Real-time dashboard (WebSocket)
- Sync statistics and health metrics
- Operations center (logs, stats, service health)
- Log viewer with real-time streaming, filtering, search
- Audit log viewer with filtering and search
- Activity feed
- Mount metrics (DB pool, request IDs)

### Mail Administration
- Mailbox creation/deletion
- Quota management
- Mail server status monitoring

### Search & Navigation
- Global command palette (Cmd+K / Ctrl+K)
- Debounced search across users, groups, services
- Keyboard navigation (arrows, Enter, Escape)
- Section headers with counts

### System
- God-mode setup wizard (DB config, admin creation)
- Limited startup mode (when critical services down)
- Full startup mode (all features + sync)
- Health checks on backend and frontend containers
- Rate limiting (global 100/min, auth 10/min)
- Request ID tracking
- CSP headers
- Graceful shutdown

---

## API Endpoints

### Auth (`/api/auth`)
| Endpoint | Purpose |
|----------|---------|
| `POST /login` | Admin login |
| `POST /logout` | Logout (differentiates admin vs SSO) |
| `GET /me` | Current user session |
| `POST /register` | User registration |
| `POST /forgot-password` | Request reset |
| `POST /reset-password` | Complete reset |
| `GET /verify-reset-token/:token` | Verify token |
| `POST /resend-reset-token` | Resend token |
| `POST /change-password` | Change own password |
| `GET /callback` | Authentik OIDC callback |
| `POST /generate-temp-password` | Generate temp password |

### Users (`/api/users`)
| Endpoint | Purpose |
|----------|---------|
| `GET /` | List users |
| `GET /public-list` | Public user list (rate-limited) |
| `GET /export/csv` | Export users as CSV |
| `POST /import/csv` | Import users from CSV |
| `POST /` | Create user |
| `PUT /:id` | Update user |
| `DELETE /:id` | Delete user |
| `GET /:username/detail` | Full user detail |
| `GET /:username/profile` | User profile with services |
| `PUT /:username/alt-email` | Set alt email |
| `GET /:username/groups` | List user's groups |
| `POST /:username/groups` | Add user to group |
| `DELETE /:username/groups/:groupId` | Remove from group |

### Groups (`/api/groups`, `/api/groups-manager`)
| Endpoint | Purpose |
|----------|---------|
| `GET /groups` | List groups |
| `GET /groups/:id` | Get group detail |
| `POST /groups-manager/groups` | Create group |
| `PUT /groups-manager/groups/:id` | Update group |
| `DELETE /groups-manager/groups/:id` | Delete group |
| `POST /groups-manager/groups/:id/members` | Add members |
| `DELETE /groups-manager/groups/:id/members/:username` | Remove member |

### Password (`/api/password`)
| Endpoint | Purpose |
|----------|---------|
| `POST /sync/:username` | Sync password to LDAP + Authentik |
| `POST /change` | Self-service change |
| `POST /validate` | Validate against policy |
| `GET /policy` | Get policy |
| `GET /history/:username` | Password change history |
| `GET /expiration/:username` | Get expiration |
| `POST /expiration/:username` | Set expiration |

### Authorization (`/api/authorize`)
| Endpoint | Purpose |
|----------|---------|
| `POST /` | Resolve role for consumer app (API key auth) |
| `GET /` | Check current authorization |

### RBAC (`/api/rbac`)
| Endpoint | Purpose |
|----------|---------|
| `GET /apps` | List registered apps |
| `PUT /apps/:slug` | Update app config |
| `GET /roles/:appSlug` | List role definitions |
| `POST /roles/:appSlug` | Create role definition |
| `PUT /roles/:id` | Update role |
| `DELETE /roles/:id` | Delete role |
| `GET /roles/:id/permissions` | Get role permissions |
| `PUT /roles/:id/permissions` | Update permissions |
| `GET /mappings/:appSlug` | List group→role mappings |
| `POST /mappings/:appSlug` | Create mapping |
| `PUT /mappings/:id` | Update mapping |
| `DELETE /mappings/:id` | Delete mapping |
| `GET /schema/:appSlug` | Get module schema |
| `POST /schema/:appSlug` | Register/update schema |
| `GET /users/:appSlug` | List app users with roles |
| `PUT /users/:appSlug/:sub/role` | Override user role |
| `POST /sync/:appSlug` | Sync Authentik group members |
| `GET /authentik-groups` | Fetch groups from Authentik |
| `GET /base-roles` | List base roles |

### Services (`/api/groups-manager`)
| Endpoint | Purpose |
|----------|---------|
| `GET /services` | List all services |
| `PUT /services/:serviceName` | Update service globally |
| `DELETE /services/:serviceName` | Delete service globally |
| `POST /health/:serviceName` | Check service health |

### Other
| Endpoint | Purpose |
|----------|---------|
| `GET /api/dashboard/stats` | Dashboard statistics |
| `GET /api/dashboard/activity` | Recent activity |
| `GET /api/sync/run` | Trigger sync |
| `GET /api/sync/preview` | Preview sync changes |
| `GET /api/changes` | Pending changes |
| `GET /api/audit` | Audit logs |
| `GET /api/logs` | Log viewer |
| `GET /api/search?q=` | Global search |
| `GET /api/health` | System health |
| `GET /api/mail/admin/*` | Mail admin endpoints |
| `POST /api/invite/*` | Invite endpoints |
| `GET /api/versions/*` | Version history |
| `GET /api/operations/*` | Operations center |

---

## Database Schema

### Core Tables
| Table | Purpose |
|-------|---------|
| `changes` | Pending sync changes |
| `versions` | Snapshot history |
| `audit_log` | All operations audit trail |
| `user_profiles` | User metadata, password status |
| `auth_users` | Admin/OIDC user accounts |
| `auth_sessions` | Session tokens (7-day expiry) |
| `active_sessions` | Active session tracking |
| `password_reset_tokens` | Password reset tokens |
| `service_configs` | Encrypted service configs |
| `field_mappings` | Authentik ↔ LDAP field mapping |
| `group_sync_config` | Per-group sync settings |
| `group_services` | Group → service assignments |
| `sync_state` | Sync tracking per entity |

### RBAC Tables
| Table | Purpose |
|-------|---------|
| `apps` | Registered consumer apps |
| `base_roles` | System-level roles (super_admin, admin, viewer) |
| `role_definitions` | Per-app custom roles |
| `role_permissions` | Module+action permissions per role |
| `group_role_mappings` | Authentik group → role mapping |
| `app_users` | Per-app user cache |
| `app_schemas` | Cached module schemas |
| `business_roles` | Business role templates |

---

## Future Roadmap

| Feature | Description | Priority |
|---------|-------------|----------|
| Multi-language (i18n) | Internationalization support | Low |
| MFA / TOTP 2FA | Built-in two-factor auth in Ogun Bridge | Low |
| Config editor UI | Edit sync-config from browser | Low |
| Calendar-based sync scheduling | Schedule syncs by day/time | Low |
| LDAP group hierarchy visualization | Tree view of LDAP OUs | Low |
| Mobile/responsive UI | Proper mobile support | Low |
| API documentation page | Interactive API docs (Swagger/OpenAPI) | Low |
| Dark mode toggle | User-selectable theme | Low |
| LDAP as primary source | Flip sync architecture to LDAP-first | Low |
