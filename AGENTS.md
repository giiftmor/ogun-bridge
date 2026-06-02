# AGENTS.md — Ogun Bridge

## Project Overview

Ogun Bridge is a centralized identity management and authorization hub for the Spectres Tailnet. It runs on **spectres** at ports 3331 (frontend) and 3333 (backend).

**Don't try to find this on vision — it runs on spectres.**

---

## 🔴 Mandatory: Read These First

**AT THE START OF EVERY SESSION:**
1. Read `docker-compose.yml` to understand the environment
2. Read `.env` for service configuration
3. Run `docker ps` to check container status
4. Read `PROJECT-SCOPE.md` for current architecture and roadmap
5. Read `IMPLEMENTATION-STATUS.md` for what's built

---

## Deployment

| Component | Host | Port | Container | Status |
|-----------|------|------|-----------|--------|
| Frontend (React) | spectres | 3331 | ogun-bridge-frontend | ✅ Running (healthy) |
| Backend (Express) | spectres | 3333 | ogun-bridge-backend | ✅ Running (healthy) |
| Database | external | 5432 | — | ✅ External PostgreSQL |

URLs from neomoruri: `spectres:3331` / `spectres:3333`

---

## Container Management

```bash
docker compose up -d              # Start all services
docker compose up -d --build      # Rebuild and start
docker compose down               # Stop all services
docker compose logs -f backend    # Follow backend logs
docker compose restart backend    # Restart backend only
docker compose ps                 # Status
```

---

## Key Integrations

| Integration | Connection | Notes |
|-------------|-----------|-------|
| Authentik | `auth.spectres.co.za` (OIDC + API) | SSO IdP |
| 389 DS (LDAP) | `spectres:389` | User/group directory |
| PostgreSQL | External (env var) | Persistence |
| Thoth ESU Gateway | `spectres:3010` | SMTP for emails |
| Spectres Pantheon | `spectres:8764` | Consumer of `/api/authorize` |
| Groove Payroll | `spectres:8888` | Consumer of `/api/authorize` |

---

## Architecture Summary

```
Browser → spectres:3331 (React)
           → spectres:3333 (Express API)
              → Authentik (OIDC + API)
              → 389 DS (LDAP)
              → PostgreSQL
              → Consumer apps via POST /api/authorize
```

---

## Important Notes

- **NEVER run `npm run dev` directly on host** — use `docker compose up`
- The backend has two startup modes: **Full** (all features + sync) and **Limited** (god-mode setup only)
- Ogun Bridge is the central authorizer for Spectres Pantheon, Groove Payroll, and Thoth ESU Gateway
- All session auth is via HTTP-only cookies, not localStorage
- Version control features are degraded — we only compare users/groups across providers
- Mailserver integration docs have been removed — Ogun Bridge sends email via Thoth ESU Gateway SMTP
