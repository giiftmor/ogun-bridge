# Central Authorizer Ecosystem — Implementation Status

Last updated: 2026-05-28

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete |
| 🔄 | In Progress |
| ⬜ | Not Started |
| ⚠️ | Blocked / Bug |

---

## Architecture

```
authentik
   │ OIDC login
   ▼
spectres-pantheon ───┐
groove_co-payroll  ───┤── onAuthorize hook ──► Ogun Bridge (POST /api/authorize)
thoth-esu-gateway  ───┘                              │
                                                      ▼
                                                 LDAP sync
                                                 Authentik API
                                                 n8n workflow trigger
```

**Ogun Bridge** (vision:3333) receives a login event from any consumer app and:
- Syncs the user into LDAP if new
- Syncs the user into Authentik if missing
- Triggers downstream n8n workflows for provisioning (mailbox, Nextcloud, Jellyfin, etc.)

---

## Components

| Component | Location | Language | Status |
|-----------|----------|----------|--------|
| `@spectres/auth` provider | `spectres-pantheon/packages/auth/` | TypeScript | ✅ v2 (onAuthorize added) |
| Ogun Bridge API | `ogun-bridge/backend/` | Node/Express | ⬜ Not running |
| Spectres Pantheon consumer | `spectres-pantheon/src/` | TypeScript | ✅ Wired |
| Groove Payroll consumer | `groove_co-payroll/backend/` | JavaScript | ✅ Wired |
| Thoth ESU Gateway consumer | `thoth-esu-gateway/localmail-api/` | TypeScript/Fastify | ✅ Wired |

---

## Provider Changes (`@spectres/auth`)

| Change | File | Status |
|--------|------|--------|
| Add `onAuthorize` to `OIDCProviderOptions` type | `packages/auth/src/types.ts` | ✅ |
| Add `onAuthorize` hook call in `callbackHandler` | `packages/auth/src/oidc/provider.ts` | ✅ |
| Pass full user object to hook (sub, email, accessToken, role, groups, name, username, mfa_enrolled, provider) | `packages/auth/src/oidc/provider.ts` | ✅ |
| Publish updated JS + DTS | `packages/auth/dist/` | ✅ |

---

## Consumer Wiring

### Spectres Pantheon

| Task | File | Status |
|------|------|--------|
| Create `ogunConfig.ts` — reads OGUN_URL/API_KEY/APP_SLUG from DB settings | `src/server/auth/ogunConfig.ts` | ✅ |
| Create `ogunBridgeRoutes` — GET /status, POST /test, DELETE /clear-cache | `src/server/routes/ogunBridge.ts` | ✅ |
| Wire routes into server | `src/server/index.ts` | ✅ |
| Pass `onAuthorize` to `callbackHandler` in callback route | `src/server/routes/auth.ts` | ✅ |
| Add `ogun.status()` and `ogun.test()` to client API lib | `src/lib/api.ts` | ✅ |
| Create Settings > Ogun Bridge page with toggle, URL/key fields, test button, status badge | `src/app/settings/ogun/page.tsx` | ✅ |
| Add nav link to settings layout | `src/app/settings/layout.tsx` | ✅ |

### Groove Payroll

| Task | File | Status |
|------|------|--------|
| Copy updated `provider.js` to vendor (force-added, gitignored) | `backend/vendor/@spectres/auth/dist/oidc/provider.js` | ✅ |
| `callOgunAuthorize()` service already existed | `backend/src/services/ogunBridge.js` | ✅ |
| Wire `onAuthorize` in callback handler | `backend/server.js` | ✅ |
| Add Ogun section to admin SettingsTab | `frontend/src/components/admin/SettingsTab.jsx` | ✅ |
| Add `/api/admin/ogun/status` and `/api/admin/ogun/test` endpoints | `backend/server.js` | ✅ |

### Thoth ESU Gateway

| Task | File | Status |
|------|------|--------|
| Copy updated `provider.js` + missing `utils/logger.js` to vendor | `localmail-api/vendor/@spectres/auth/dist/` | ✅ |
| Create `ogunBridge.ts` — calls `POST /api/authorize`, no-ops if `OGUN_API_URL` unset | `localmail-api/src/services/ogunBridge.ts` | ✅ |
| Pass `onAuthorize: ogunBridge.authorize` to `createProvider()` | `localmail-api/src/plugins/auth.ts` | ✅ |
| Add `GET /api/health/ogun/status` and `GET /api/health/ogun/test` | `localmail-api/src/api/routes/health.ts` | ✅ |
| Add `OGUN_API_URL` and `OGUN_TIMEOUT` to `.env.example` | `localmail-api/.env.example` | ✅ |
| Add `.gitignore` exception for vendored auth dist | `.gitignore` | ✅ |

---

## Ogun Bridge Service (Not Yet Deployed)

| Task | Status | Notes |
|------|--------|-------|
| Container running on vision:3333 | ⬜ | Not started |
| `POST /api/authorize` endpoint | ⬜ | Must accept `{sub, email, accessToken, role, groups, name, username, mfa_enrolled, provider}` |
| LDAP sync on authorize | ⬜ | Create/update LDAP user on login |
| Authentik sync on authorize | ⬜ | Ensure Authentik user exists |
| n8n workflow trigger | ⬜ | Provision mail, Nextcloud, Jellyfin, etc. |
| Health/status endpoint | ⬜ | `GET /api/status` |

---

## Known Bugs

| # | Category | Bug | Component | Status | Reported | Fixed In |
|---|----------|-----|-----------|--------|----------|----------|
| 1 | config | `vendor/@spectres/auth/dist` is gitignored by `dist/` pattern — must force-add provider.js | groove, thoth | ✅ Fixed | 2026-05-28 | `.gitignore` exception added (thoth), `-f` used (groove) |
| 2 | missing-dependency | Updated `provider.js` imports `../utils/logger.js` which doesn't exist in vendored copies | thoth | ✅ Fixed | 2026-05-28 | Copied `utils/logger.js` from auth package dist |
| 3 | build | TypeScript build error: `ogunBridge` imported but unused in `health.ts` | thoth | ✅ Fixed | 2026-05-28 | Removed unused import |
| 4 | build | TypeScript build error: `data` is type `unknown` from `res.json()` | thoth | ✅ Fixed | 2026-05-28 | Added `as Record<string, unknown>` cast |
| 5 | design | `onAuthorize` hook only passed `{sub, email, accessToken, role}` — too narrow for provisioning | all | ✅ Fixed | 2026-05-28 | Updated to pass full user object |
| 6 | infra | `docker-compose.yml` has pre-existing error: "volumes must be a mapping" | thoth | ⬜ | 2026-05-28 | Pre-existing, not yet fixed |
| 7 | deployment | Ogun Bridge service not running — consumer hooks are no-ops | ogun-bridge | ⬜ | 2026-05-28 | Awaiting deployment |
| 8 | routing | `POST /api/auth/admin-login` returns 404 from inside container despite route existing in compiled `plugins/auth.js` — GET returns proper Fastify 404, POST returns generic `{"error":"Not found"}` suggesting a route conflict or middleware interception | thoth | 🔄 | 2026-05-28 | Not yet diagnosed |

---

## Remaining Work

### Ogun Bridge Deployment

- [ ] Containerize ogun-bridge backend
- [ ] Deploy to vision with `OGUN_API_KEY` set
- [ ] Wire n8n workflow to `POST /api/authorize`
- [ ] Add LDAP sync logic
- [ ] Add Authentik sync logic

### Integration Testing

- [ ] Set `OGUN_API_URL` on spectres-pantheon env
- [ ] Set `OGUN_API_URL` on groove env
- [ ] Set `OGUN_API_URL` on thoth env
- [ ] Login via Authentik OIDC on each app
- [ ] Verify `POST /api/authorize` called on Ogun
- [ ] Verify downstream n8n workflow triggers

### Hardening

- [ ] Add retry with backoff to `onAuthorize` hook
- [ ] Add circuit breaker if Ogun is down
- [ ] Log Ogun failures to app-specific audit log
- [ ] Make `OGUN_TIMEOUT` consistent across all apps

---

## Git History

| Repo | Commit | Message |
|------|--------|---------|
| spectres-pantheon | `9a8faa7` | `feat(auth): add onAuthorize to OIDCProviderOptions type` |
| spectres-pantheon | `6fde38e` | `fix(auth): pass full user object to onAuthorize hook` |
| groove_co-payroll | `bd7cd92` | `feat(ogun): wire onAuthorize hook into Groove Payroll` |
| groove_co-payroll | `ad85d05` | `fix(ogun): pass full user object to onAuthorize hook` |
| thoth-esu-gateway | `dd13a9b` | `feat(ogun): wire onAuthorize hook into Thoth ESU Gateway` |

---

## Environment Variables

```bash
# Required on consumer apps to enable Ogun bridge calls:
OGUN_API_URL=http://vision:3333     # Ogun Bridge base URL
OGUN_TIMEOUT=5000                   # Request timeout in ms

# Required on Ogun Bridge itself:
OGUN_API_KEY=<shared-secret>        # API key for consumer auth
AUTHENTIK_API_TOKEN=<token>         # For Authentik user sync
LDAP_URL=ldap://spectres:389
LDAP_BIND_DN=cn=admin,dc=spectres,dc=co,dc=za
LDAP_BIND_PASSWORD=<password>
```

---

## File Changes Summary

### spectres-pantheon
```
M  packages/auth/src/types.ts                    +1 line  (onAuthorize type)
M  packages/auth/src/oidc/provider.ts            +3 lines (hook call + full payload)
M  packages/auth/dist/types.d.ts                 +1 line
M  packages/auth/dist/oidc/provider.js           +changes
A  src/server/auth/ogunConfig.ts                 New — DB config reader
A  src/server/routes/ogunBridge.ts               New — admin status/test endpoints
M  src/server/index.ts                           +ogun routes wiring
M  src/server/routes/auth.ts                     +onAuthorize hook
M  src/lib/api.ts                                +ogun.status()/.test()
A  src/app/settings/ogun/page.tsx                New — Ogun Bridge settings page
M  src/app/settings/layout.tsx                   +nav link
```

### groove_co-payroll
```
M  backend/vendor/@spectres/auth/dist/oidc/provider.js  Updated provider
M  backend/server.js                                      +onAuthorize + admin endpoints
A  frontend/src/components/admin/SettingsTab.jsx          Ogun section
```

### thoth-esu-gateway
```
M  .gitignore                                              +vendor exception
M  localmail-api/.env.example                              +OGUN_* vars
A  localmail-api/vendor/@spectres/auth/dist/utils/logger.js   New dependency
A  localmail-api/src/services/ogunBridge.ts                   New service
A  localmail-api/src/plugins/auth.ts                          +onAuthorize
M  localmail-api/src/api/routes/health.ts                     +ogun endpoints
```
