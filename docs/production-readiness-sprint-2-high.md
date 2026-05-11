# Production Readiness — Sprint 2: High Priority

**All items completed.**

## H-01: No rate limiting
- [x] Install `express-rate-limit` — added to `backend/package.json`
- [x] Apply rate limiting to all routes (general: 100 req/min) — `backend/src/index.js:68-72`
- [x] Aggressive limits on auth endpoints (login: 10/min, forgot-password/resend: 3/min) — `backend/src/index.js:75-85`

## H-02: Helmet CSP not configured
- [x] `backend/src/index.js:55` — Configured strict CSP with `defaultSrc`, `scriptSrc`, `styleSrc`, `imgSrc`, `fontSrc`, `connectSrc`, `frameSrc`, `objectSrc`

## H-03: Console logger bypass in production paths
- [x] `backend/src/index.js:155,179` — Replaced `console.error` with `logger.error`
- [x] `backend/src/services/syncService.js:417` — Replaced `console.error` with `logger.error`
- [x] `backend/src/services/websocket.js:37` — Replaced `console.error` with `logger.error`
- [x] `backend/src/services/logCache.js:17,29,39,55,64,86` — Added `logger` import, replaced all `console.error` with `logger.error`
- [x] `frontend/src/services/api.js:44,269` — Removed `console.error` (exception passthrough), removed `console.warn`
- [x] `backend/src/index.js:76` — Error handler no longer exposes `error.message` to client
- [x] `backend/src/routes/users.js:180,256,403,480` — Error messages no longer exposed to client

## H-04: Auth tokens in localStorage
- [x] `backend/src/routes/auth.js:183-189` — Login sets HTTP-only `auth_token` cookie (`httpOnly`, `sameSite=strict`, `secure` in production)
- [x] `backend/src/routes/auth.js:224-237` — Logout clears the cookie via `res.clearCookie()`
- [x] `backend/src/middleware/auth.js:59-62` — Auth middleware already supports `req.cookies?.auth_token`
- [x] `backend/src/routes/auth.js` — Added `extractToken()` helper, all routes now check cookies
- [x] `frontend/src/services/api.js:3` — `getToken()` returns `null` (rely on cookie)
- [x] `frontend/src/services/api.js:50-65` — Login no longer stores token in localStorage
- [x] `frontend/src/store/useAppStore.js` — Removed localStorage token management
- [x] `frontend/src/App.jsx:45-74` — ProtectedRoute no longer checks localStorage for token; relies on `/auth/me` API call
- [x] `frontend/src/pages/Login.jsx:21-27` — Login no longer uses localStorage
- [x] `frontend/src/components/Layout.jsx:147-151` — Logout calls `apiClient.logout()` which clears cookie server-side
- [x] `frontend/src/pages/Dashboard.jsx` — Replaced direct fetches with `apiClient` methods that rely on cookie auth

## H-05: Default CORS wildcard in nginx
- [x] `frontend/nginx.conf` — Removed incorrect `proxy_set_header` CORS directives (request headers, not response headers)
- [x] `frontend/nginx.conf:45` — Preflight `Access-Control-Allow-Origin` uses `$cors_origin` variable, set to `https://ogun.spectres.co.za`

## H-06: Missing unhandled rejection/exception handlers
- [x] `backend/src/index.js:96-98` — Added `process.on('unhandledRejection', ...)` handler with structured logging
- [x] `backend/src/index.js:100-104` — Added `process.on('uncaughtException', ...)` handler with structured logging + graceful shutdown

## H-07: Public user list endpoint
- [x] `backend/src/routes/users.js:27` — Added `publicListLimiter` (20 req/min) to `/api/users/public-list`

## H-08: LDAP filter injection
- [x] `backend/src/services/ldapClient.js:11-26` — Added `escapeLDAPFilterValue()` and `escapeLDAPDNValue()` helpers
- [x] `backend/src/services/ldapClient.js:80,113,138,167,212,239,252,275` — All user-supplied values escaped in LDAP filters and DNs
- [x] `backend/src/middleware/auth.js:165,173` — Added `escapeLDAPDNValue()` helper, escaping username in DN construction
- [x] `backend/src/routes/auth.js:215` — Escaped username in LDAP DN construction

## H-09: Mailserver command injection
- [x] `backend/src/services/mailserver.js` — Switched from `exec` (shell) to `spawn` (no shell) for all Docker commands
- [x] Added `validateEmail()` and `validateContainerName()` functions for input validation
- [x] Added `runDockerCommand()` using `spawn` with arguments array — eliminates shell injection entirely

## H-10: NODE_ENV mismatch
- [x] `backend/.env:2` — Removed `NODE_ENV=development` from `.env` so `docker-compose.yml`'s `NODE_ENV: production` takes effect
