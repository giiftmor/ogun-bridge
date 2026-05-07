# AGENTS.md - Dockerized Projects Guide

## 🔴 MANDATORY: Read Docker Compose BEFORE Any Commands

**AT THE START OF EVERY SESSION, BEFORE RUNNING ANY COMMANDS:**
1. Read `docker-compose.yml` to understand the full environment
2. Read `.env` to check service configuration
3. Run `docker ps` to see running containers
4. ONLY THEN proceed with development tasks

**NEVER assume this is a standard (non-Docker) setup. NEVER run `npm run dev` directly on host.**

---

## Project Registry

| Project | Type | Database | DB Location | Host Ports | Special Notes |
|---------|------|-----------|-------------|------------|---------------|
| **groove_co-payroll** | Next.js + Express | PostgreSQL | Container (postgres:16-alpine) | 8888 (nginx), 5433→5432 | Redis container, mailcow network |
| **mimir-labs** | Flask + SQLite | PostgreSQL | External (192.168.0.200) | 5000 | PG container commented out |
| **ogun-bridge** | Next.js + Express | PostgreSQL | External (env var) | 3333 (backend) | LDAP integration, Authentik |
| **skill-stacker** | Next.js | SQLite | Local (cvbuilder.db) | None (dev only) | No docker-compose |
| **spectres-pantheon** | Next.js + Express | PostgreSQL | External (env var) | 8764 (nginx) | LDAP/RBAC, n8n workflows |
| **thoth-esu-gateway** | Next.js + Fastify | SQLite (sql.js) | Local (volume) | 3010, 3001 | Mail gateway, SSE |

---

## Environment: Dockerized Development

All active projects use Docker containers managed via `docker-compose.yml`.

### Standard Service Pattern
| Service | Image | Purpose |
|---------|-------|---------|
| **nginx** | nginx:alpine | Reverse proxy (entry point) |
| **app/frontend** | built from `Dockerfile` | Next.js/React frontend |
| **api/backend** | built from `Dockerfile` | Express/Fastify API server |
| **postgres** | postgres:16-alpine | Database (only in groove_co-payroll) |
| **redis** | redis:alpine | Cache/sessions (some projects) |

### Networks & Volumes
- Networks: Project-specific bridge networks
- Volumes: Database persistence, uploads, backups

---

## Correct Commands (Dockerized)

| Action | Command |
|--------|---------|
| Start all services | `docker compose up -d` |
| Stop all services | `docker compose down` |
| View all logs | `docker compose logs -f` |
| View app logs | `docker compose logs -f app` (or `frontend`/`backend`/`api`) |
| Restart service | `docker compose restart <service-name>` |
| Run migrations | `docker exec -it <container_name> npm run prisma:migrate` |
| Generate Prisma client | `docker exec -it <container_name> npm run prisma:generate` |
| Access database | `docker exec -it <db_container> psql -U <user> <dbname>` |
| Check DB ready | `docker exec -it <db_container> pg_isready -U <user>` |
| Check running containers | `docker ps` |
| Rebuild image | `docker compose up -d --build <service-name>` |

---

## Project-Specific Notes

### groove_co-payroll
- **Container**: `groove-payroll-db` (postgres:16-alpine)
- **DB Port (host)**: 5433 → 5432 (container)
- **Backend**: Express on port 5005, uses Redis
- **Frontend**: Next.js on port 3000 (via nginx on 8888)
- **Commands**: Use `docker exec -it groove-payroll-backend...` for backend ops

### mimir-labs
- **DB**: External PostgreSQL at 192.168.0.200:5432 (configured in .env)
- **PG container**: Commented out in docker-compose.yml (lines 21-38)
- **No Redis or nginx** - Flask app exposed directly on 5000

### ogun-bridge
- **DB**: External via `DB_HOST` env var (default: postgres container name)
- **Frontend**: Uses `network_mode: host` (not bridge)
- **Integrations**: Authentik JWT, LDAP, Localmail

### skill-stacker
- **No docker-compose** - runs locally with `npm run dev`
- **DB**: SQLite (cvbuilder.db) - no container needed
- **Tools**: Biome (not ESLint), Turbopack

### spectres-pantheon
- **DB**: External via `DATABASE_URL` env var (required in production)
- **Auth**: Lucia Auth → Migrating to Authentik JWT
- **Features**: RBAC, LDAP integration, n8n workflows
- **Networks**: Isolated `spectre-network` (bridge) - only nginx on host port 8764

### thoth-esu-gateway
- **DB**: SQLite (sql.js) - pure JavaScript, no native compilation
- **API**: Fastify on 3010, UI: Next.js on 3001
- **No nginx** - services exposed directly
- **Sessions**: Persisted to `db/sessions.json`

---

## Development Practices

### ✅ DO:
- Use `docker exec -it <container_name> <command>` for in-container operations
- Check `docker ps` first if a port seems "in use"
- Use `docker compose logs -f` to debug issues
- Read `docker-compose.yml` before starting/stopping services
- Reference `.env` for environment variables (DATABASE_URL, SMTP_*, etc.)
- Check project-specific notes in the Project Registry above

### ❌ DON'T:
- Run `npm run dev` directly on host — use `docker compose up`
- Connect to DB directly without checking Docker setup
- Assume standard ports (each project uses different ports)
- Kill/restart processes directly — use `docker compose` commands
- Forget nginx is often the entry point, not the app directly

---

## Debugging Tips

### Port Already in Use (EADDRINUSE)
```bash
# Check which containers are using ports
docker ps

# Fix: restart services cleanly
docker compose down && docker compose up -d
```

### Database Connection Issues
```bash
# Check DB logs (if containerized)
docker compose logs postgres

# Verify DB is ready
docker exec -it <db_container> pg_isready -U <user>

# Connect directly
docker exec -it <db_container> psql -U <user> <dbname>
```

### App Not Responding (500 Errors)
```bash
# Check app logs
docker compose logs -f <app_service_name>

# Check nginx logs (if applicable)
docker compose logs -f nginx

# Restart app container
docker compose restart <app_service_name>

# Rebuild if needed
docker compose up -d --build <service_name>
```

### Stale Containers / Processes
```bash
# Kill ALL related containers
docker compose down

# Start fresh
docker compose up -d

# Check what's actually running
docker ps
```

---

## Session Startup Checklist

At the start of EVERY session, verify:
- [ ] Read `docker-compose.yml` to understand current environment
- [ ] Read `.env` to check service configurations
- [ ] Run `docker ps` to see running containers
- [ ] Run `docker compose logs -f` to check for errors
- [ ] Check project-specific notes in the Project Registry above
- [ ] ONLY THEN proceed with development tasks

**If you skip these steps, you will "go rogue" and try to run commands directly on host.**

---

## Important Notes

1. **Each project has its own `docker-compose.yml`** - always cd to the project directory first
2. **Database setups vary** - check the Project Registry before connecting to any DB
3. **groove_co-payroll is the only project with a PostgreSQL container** - all others use external DBs or SQLite
4. **Never commit `.env` files** - they contain secrets
5. **Project-specific AGENTS.md files** exist in `mimir-labs/` and `thoth-esu-gateway/` for detailed project context
