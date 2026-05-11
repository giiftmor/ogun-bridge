# Production Readiness — Sprint 3: Medium Priority

**Important improvements for stability, observability, and operational hygiene.**

## M-01: No HEALTHCHECK on containers
- [x] `backend/Dockerfile` — Add `HEALTHCHECK` instruction (e.g. curl `http://localhost:3333/health`)
- [x] `frontend/Dockerfile` — Add `HEALTHCHECK` instruction (e.g. check nginx status)
- [x] `docker-compose.yml` — Add `depends_on` with `condition: service_healthy`

## M-02: No container resource limits
- [x] `docker-compose.yml` — Add `deploy.resources.limits` for CPU and memory on backend and frontend
  - Backend: 1 CPU, 512MB memory
  - Frontend: 0.5 CPU, 256MB memory

## M-03: Floating Node.js tag
- [x] `backend/Dockerfile:1` — Pin `node:25-alpine` to a specific minor version match `package.json` (`^25.6.1` → `node:25.6.1-alpine`)

## M-04: nginx runs as root
- [x] `frontend/Dockerfile` — Add `USER nginx` directive or configure nginx user in config

## M-05: DB pool connection monitoring
- [x] `backend/src/lib/db.js` — Add pool event listeners (`connect`, `acquire`, `remove`)
- [x] Expose pool metrics (totalCount, idleCount, waitingCount) via health endpoint

## M-06: No request ID tracking
- [x] `backend/src/index.js` — Add middleware that generates UUID per request
- [x] Include request ID in all log entries and `X-Request-Id` response header

## M-07: dotenv.config() called twice
- [x] Remove `dotenv.config()` from `backend/src/lib/db.js:6` — call once in entry point `backend/src/index.js:4` only

## M-08: No env var validation at startup
- [x] `backend/src/index.js` — Add startup validation that all required env vars (`ENCRYPTION_KEY`, `SUPER_ADMIN_PASS`, `DB_HOST`, etc.) are set, fail fast with clear error if missing

## M-09: Hardcoded infrastructure defaults
- [x] `backend/src/services/config.js` — Audit hardcoded LDAP domain values (`dc=spectres,dc=co,dc=za`) and make configurable via env vars or fail at startup

## M-10: Schema auto-creation in production
- [x] Disable `CREATE TABLE IF NOT EXISTS` auto-schema in `backend/src/lib/db.js:36-195` for production
- [x] Implement proper migration tooling (node-pg-migrate, Knex migrations)
- [x] Only run migrations via explicit migration script, not on app startup

## M-11: network_mode: host on frontend
- [x] `docker-compose.yml:50` — Replace `network_mode: host` with bridge network + port mapping

## M-12: --legacy-peer-deps in Dockerfile
- [x] `frontend/Dockerfile` — Remove `--legacy-peer-deps` flag or resolve peer dependency conflicts properly

## M-13: Frontend bundle code-splitting
- [x] `frontend/src/pages/Dashboard.jsx` — Lazy-load heavy chart dependencies (recharts) with dynamic `import()`
- [x] `frontend/vite.config.js` — Configure `build.rollupOptions.output.manualChunks` to split vendor chunks (React, recharts, lucide-react) from app code
- [x] Wrap page-level route components with `React.lazy()` and `<Suspense>` in `App.jsx` to reduce initial bundle size (currently 911 KB)

## Nice-to-haves
- [x] `.env:52` — Fix typo `# DatabaseW` → `# Database`
- [x] `frontend/vite.config.js:19` — Replace hardcoded `192.168.0.200:3333` with environment variable
- [x] `backend/package.json:10` — Replace placeholder test script `"echo \"Error: no test specified\" && exit 1"` with actual test runner
- [x] `backend/src/services/websocket.js:26-39` — Demote "Service heartbeat" to debug level to reduce log noise
- [x] `backend/package.json:28` — Investigate and remove unused `electron` devDependency
