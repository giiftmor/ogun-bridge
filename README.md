# Ogun Bridge

Central identity management and authorization hub for the Spectres Tailnet. Synchronises users and groups between Authentik (SSO) and the 389 Directory Server (LDAP), manages passwords, and provides role-based access control for the whole ecosystem.

**Live at:** `spectres:3331` (frontend) and `spectres:3333` (backend)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Zustand |
| Backend | Node.js 25, Express, Socket.IO, Winston |
| Database | PostgreSQL (external) |
| LDAP | 389 Directory Server via ldapts |
| Auth | Authentik OIDC + session tokens (HTTP-only cookies) |
| Email | SMTP via Thoth ESU Gateway |

---

## How To (System Admin Guide)

### Accessing the Web UI

Open a browser on a machine connected to the tailnet:

```
https://spectres:3331
```

You'll see the login screen. Two ways in:
- **Sign in with SSO** — redirects to Authentik (use your normal tailnet credentials)
- **Emergency Admin Access** — local admin login (use the super admin credentials set during deployment)

### Container Management

Everything runs in two Docker containers on the spectres server. SSH in first:

```bash
ssh ghost@spectres
cd ~/projects/ogun-bridge
```

| Task | Command |
|------|---------|
| Check both containers are running | `docker compose ps` |
| View live backend logs | `docker compose logs -f backend` |
| View live frontend logs | `docker compose logs -f frontend` |
| Restart the backend | `docker compose restart backend` |
| Restart everything | `docker compose down && docker compose up -d` |
| Rebuild and restart | `docker compose up -d --build` |
| Check container health | `docker ps --filter name=ogun` |

Both containers show `(healthy)` when everything is working. If one shows `(unhealthy)`, check its logs.

###  Common Admin Tasks

#### Creating a New User
1. Go to **Users** in the sidebar
2. Click **Create User** (top-right)
3. Enter username, display name, email
4. Optionally assign to groups and send an invite email
5. Click **Create**

The user is created in both Authentik and LDAP simultaneously.

#### Resetting a User's Password
1. Go to **Users**, find the user, click their name
2. In the detail panel, click **Force Password Reset**
3. An email is sent to the user with a reset link
4. Alternatively, click **Generate Temp Password** to get a one-time password

#### Assigning a Service to a Group
1. Go to **Services** in the sidebar
2. Click **Add Service**, fill in the name and URL
3. Select which group(s) get access
4. Users in those groups will see the service on their profile page

#### Checking Sync Status
1. Go to the **Dashboard** — sync stats are at the top
2. You'll see: last sync time, users in Authentik vs LDAP, groups in each
3. If sync fails, errors appear in the **Operations Center** and **Logs**

#### Managing Roles (RBAC)
1. Go to **Role Management** (super admin only)
2. The **Apps** tab shows all registered consumer apps
3. The **Roles** tab lets you create custom roles per app
4. The **Group Mappings** tab connects Authentik groups to roles
5. The **Permissions** tab sets what each role can do (read/write/delete per module)

### Logs & Monitoring

| Page | What It Shows |
|------|--------------|
| Dashboard | Live sync stats, health, activity feed |
| Operations | Consolidated logs with filtering by level/category |
| Logs | Real-time streaming log viewer |
| Audit | All operations with actor, action, and timestamp |
| Changes | Pending sync changes waiting for approval |

### When Something Goes Wrong

**"Can't log in"**
- Try "Emergency Admin Access" on the login page
- Check `docker compose logs backend` for auth errors
- If the database is unreachable, the backend starts in "god-mode" — visit `/god-mode` in the browser to reconfigure

**"Sync isn't running"**
- Check `docker compose logs backend` for sync errors
- Go to Dashboard to see last sync time
- If Authentik or LDAP is unreachable, the Operations Center will show connection errors
- Restart the backend: `docker compose restart backend`

**"Container is unhealthy"**
- Check logs: `docker compose logs backend`
- Rebuild if code changed: `docker compose up -d --build`
- If the database is down, check the PostgreSQL server

**"Password email not sending"**
- Verify Thoth ESU Gateway is reachable (`spectres:3010`)
- Check SMTP settings in the database's `service_configs` table
- Go to Mail Settings in the UI to test the connection

---

## Quick Reference

| Service | Host | Port | Container |
|---------|------|------|-----------|
| Ogun Bridge UI | spectres | 3331 | ogun-bridge-frontend |
| Ogun Bridge API | spectres | 3333 | ogun-bridge-backend |
| PostgreSQL | external | 5432 | — |
| Authentik | auth.spectres.co.za | 443 | — |
| 389 DS (LDAP) | spectres | 389 | — |

All data persists in PostgreSQL. Container restarts are safe — no data loss.

---

## Further Reading

- [PROJECT-SCOPE.md](./PROJECT-SCOPE.md) — Full architecture, API endpoints, database schema, future roadmap
- [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) — What's built, what's planned
