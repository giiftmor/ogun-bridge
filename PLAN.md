# Ogun Bridge UI Enhancement & System Fixes Plan

## Goal
Enhance Ogun Bridge UI for non-technical administrators with task-centric design, couple Password/Profile/Group Manager, keep Dashboard as standalone landing page, and fix nginx proxy/CORS issues.

## Constraints & Preferences
- Dashboard remains standalone landing page (not merged with Operations Center)
- Use task-centric design (not entity-centric) for non-technical admins
- Use Recharts (already installed) for trends visualization
- Map technical errors to user-friendly messages with action buttons
- Query local database for user's groups/services
- Service access activates on first login via LDAP/Authentik group sync

---

## Progress Tracking

### ✅ Done
- [x] Enhanced nginx.conf: added CORS headers, 60s API/7d WebSocket timeouts, /health endpoint, OPTIONS preflight handling
- [x] Fixed docker-compose.yml: renamed containers alsm-* → ogun-bridge-*, changed frontend to host network mode, updated CORS_ORIGIN to ogun.spectres.co.za
- [x] Committed and pushed: `fix: enhance nginx proxy with CORS headers, timeouts, and health endpoint` to `origin/feature/group-manager-and-bidirectional-sync`
- [x] Investigated bidirectional sync: code implemented in syncService.js (lines 470-517), supports authentik-to-ldap/ldap-to-authentik/bidirectional
- [x] Found UI components: GroupManager.jsx (sync direction selector), Dashboard.jsx (sync now/force sync), ChangesBrowser.jsx (drift detection)
- [x] Researched admin dashboard patterns: task-centric design, status page components, progressive disclosure
- [x] Analyzed current UI: Recharts installed but unused, custom components built on Tailwind, developer-centric (raw errors, no trends)
- [x] Investigated thoth-esu email relay failure: mailcow postfix logs show `SASL PLAIN authentication failed` for `oracle@spectres.co.za` from IP 172.30.1.1
- [x] Found ogun-bridge works via thoth-esu SMTP (port 2525), but thoth-esu direct relay to mailcow (port 587) fails
- [x] Analyzed current navigation: 3 separate categories (Sync/Passwords/Mailing) should merge to "User Administration"
- [x] Identified Dashboard only shows sync stats, needs full system overview (service health, metrics, needs attention)
- [x] **Implemented navigation restructure in Layout.jsx**: created "User Administration" and "Monitoring" sections
- [x] **Created MyProfile.jsx**: personal self-service profile page with groups/services/password change
- [x] **Enhanced Dashboard.jsx**: added system health grid (4 services), 8 stats cards, "Needs Attention" section
- [x] **Created errorTranslator.js**: maps 12 common technical errors to user-friendly messages with action buttons
- [x] **Created ProgressBar.jsx**: shows bidirectional sync progress (A→L and L→A separately) with compact variant

### 🔄 In Progress
- [x] **Integrate ProgressBar into Dashboard.jsx**: Add sync progress visualization when sync is running
- [x] **Integrate errorTranslator.js**: Replace raw error messages in toast notifications across pages
- [x] ~~Resolve thoth-esu mailcow auth: fix credentials in mailcow UI OR route through local SMTP (port 2525)~~ **(User handling - moved mailcow to own server, updating IP in config)**
- [x] **Recharts dashboards**: Sync success rate (7-day line chart), error distribution (pie chart), response time (area chart)

### 🚧 Blocked
- [ ] thoth-esu → mailcow SMTP auth: credentials `oracle@spectres.co.za` / `Kali@1403` rejected by mailcow (Options: fix mailcow user or route through local SMTP like ogun-bridge does)

---

## Key Decisions
- **Dashboard stays standalone**: User wants it as landing page, not merged with Operations Center health grid
- **Navigation restructure**: Split into "User Administration" (Users/Groups/Passwords/Admin Profile) + "Monitoring" (Dashboard/Operations/Changes/Audit/Logs) + "System" (Mail/Schema/Versions)
- **Rename "Operations" page to "Monitoring"**: Better describes purpose of the page
- **Rename "/profile" to "Admin Profile"**: Clarifies it shows admin functions for any user, not personal profile
- **Create "/my-profile"**: Personal self-service profile for logged-in user (separate from admin profile)
- **Couple Password + Profile + Group Manager**: Create unified UserDetail.jsx with tabs (Profile/Password/Groups/Activity)
- **Enhance Dashboard**: Add service health grid, 8 metrics tiles, "Needs Attention" task-centric section
- **Error translation layer**: Map technical errors to user-friendly messages with action buttons
- **Use Recharts for trends**: Sync success rate (7-day line chart), error distribution (pie chart), response time (area chart)

---

## Next Steps
1. [ ] Implement navigation restructure in `Layout.jsx`: create "User Administration" and "Monitoring" sections
2. [ ] Create `MyProfile.jsx`: personal profile page with groups/services/change password
3. [ ] Modify `Dashboard.jsx`: add service health grid, metrics tiles, needs attention section
4. [ ] Create `errorTranslator.js`: map 10 common technical errors to user-friendly messages
5. [ ] Implement `ProgressBar` component: show bidirectional sync progress (A→L and L→A separately)
6. [ ] Resolve thoth-esu mailcow auth: fix credentials in mailcow UI OR route through local SMTP (port 2525)

---

## Critical Context
- **Mailcow auth failure**: `warning: unknown[172.30.1.1]: SASL PLAIN authentication failed: (reason unavailable), sasl_username=oracle@spectres.co.za`
- **LDAP bind**: `cn=Directory Manager,dc=spectres,dc=co,dc=za` with password `Kali@1403`
- **389DS password scheme**: SSHA512 (send plain text, 389DS hashes internally)
- **Docker containers**: backend :3333 (0.0.0.0), frontend :3331 (host network mode)
- **Repository**: `git@github.com:giiftmor/ogun-bridge.git` (branch: `feature/group-manager-and-bidirectional-sync`)
- **Bidirectional sync code exists**: `syncService.js` lines 470-710 (unverified if working, need DB access to check `group_sync_config` table)
- **Recharts installed but unused**: `package.json` has recharts dependency, no charts implemented
- **UI stack**: Custom components on Tailwind CSS, Lucide React icons, no shadcn/ui

---

## Relevant Files
| File | Purpose |
|------|---------|
| `frontend/nginx.conf` | Proxy config, CORS headers, timeouts |
| `docker-compose.yml` | Container config, network mode, build args |
| `frontend/src/components/Layout.jsx` | Sidebar navigation (lines 26-65) to restructure |
| `frontend/src/pages/Dashboard.jsx` | Enhance with health grid + metrics |
| `frontend/src/pages/GroupManager.jsx` | Sync direction selector, RBAC services |
| `frontend/src/pages/ProfileManagement.jsx` | Admin-style profile (rename to "Admin Profile") |
| `frontend/src/pages/MyProfile.jsx` | CREATE: personal self-service profile |
| `backend/src/services/syncService.js` | Bidirectional sync logic (lines 470-710) |
| `backend/src/routes/groups.js` | Sync direction API (PATCH /:id/sync-direction) |
| `thoth-esu-gateway/localmail-api/config.yaml` | Mailcow relay config (host: 100.96.233.80, port: 587) |

---

## Revised Dashboard Enhancement Plan (Standalone Landing Page)
*Approved: [ ] Pending user approval*

### Current Dashboard Analysis (`Dashboard.jsx` lines 1-265)
| Section | Content | Source |
|---------|---------|--------|
| Header | "Dashboard", "Monitor your Authentik LDAP sync service" | Static text |
| Status Banner | System status icon, Last sync time, Sync Running badge | `syncStatus`, `stats.lastSyncTime` |
| Stats Grid (4 cards) | Authentik Users, LDAP Users, Pending Changes, Failed Syncs | `getDashboardStats()` |
| Recent Activity | Sync history list | `getRecentActivity()` |

### Missing Metrics for Landing Page Overview
| Missing Metric | Why It Matters |
|----------------|----------------|
| System Health Indicators | Users shouldn't navigate to Operations to see service status |
| Active Users/Sessions | Key operational metric for current system usage |
| Failed Logins (24h) | Security/operational health indicator |
| Response Time | Performance indicator |
| Last Sync Duration | Execution time for last sync |
| "Needs Attention" Section | Actionable tasks for admins to address immediately |

### Proposed Enhanced Layout
```
┌─────────────────────────────────────────────────────┐
│  Dashboard                                         │
├─────────────────────────────────────────────────────┤
│  Monitor your Authentik LDAP sync service          │
│                                                     │
│  ┌─────────────────────────────────────┐           │
│  │  ✅ Healthy • Last sync: 2m ago     │           │
│  └─────────────────────────────────────┘           │
│                                                     │
│  SYSTEM HEALTH (4 service indicators)               │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│  │Auth ✅ │ │LDAP ✅ │ │DB  ✅ │ │SMTP ❌ │     │
│  └────────┘ └────────┘ └────────┘ └────────┘     │
│                                                     │
│  STATS (8 cards)                                    │
│  [Auth Users] [LDAP Users] [Active Sessions]       │
│  [Pending]    [Failed Syncs] [Failed Logins]       │
│  [Response]   [Last Sync Duration]                 │
│                                                     │
│  NEEDS ATTENTION (task-centric)                    │
│  📊 2 pending changes from LDAP drift  [Review]    │
│  🔴 1 service down (SMTP)                [Fix]     │
│  📧 3 invites pending password setup        [Send]  │
│                                                     │
│  QUICK ACTIONS                                      │
│  [🔄 Sync Now] [📧 Invite] [⚙️ Health Check]     │
│                                                     │
│  RECENT ACTIVITY (sync history)                    │
│  ✅ Sync completed - 9 users updated  2m ago       │
│  ✅ User "neo" changed password     15m ago        │
└─────────────────────────────────────────────────────┘
```

### Dashboard Implementation Steps
1. [ ] Add System Health Indicators from `/health` endpoint
   - Create `ServiceIndicator` component
   - Add health query to Dashboard.jsx
2. [ ] Expand Stats Grid from 4 to 8 cards
   - Add Active Sessions, Failed Logins, Response Time, Sync Duration
3. [ ] Add "Needs Attention" task-centric section
   - Show pending changes, failed syncs, failed logins with action buttons
4. [ ] Enhance Quick Actions
   - Add Health Check button to Status Banner

---

## Navigation Restructure Plan
*Approved: [ ] Pending user approval*

### Proposed Layout
```
User Administration
├── Users (/users)
├── Groups (/groups)
├── Group Manager (/groups-manager)
├── Passwords (/password)
└── Admin Profile (/profile)  ← Renamed from "Profile"

Monitoring
├── Dashboard (/)
├── Monitoring (/operations)  ← Renamed from "Operations"
├── Changes (/changes)
├── Audit (/audit)
└── Logs (/logs)

System
├── Mail Settings (/mail)
├── Schema Mapper (/schema)
└── Version History (/versions)

User Menu (top right)
├── My Profile (/my-profile)  ← New personal profile
└── Logout
```

### Layout.jsx Changes Needed
| Change | Line | Reason |
|--------|------|--------|
| Rename "Profile" to "Admin Profile" | 41 | Clarifies it shows any user's data, not personal |
| Create "User Administration" section | 26-45 | Group user management tools |
| Create "Monitoring" section | 46-65 | Group system monitoring tools |
| Rename "Operations" to "Monitoring" | 60 | Better describes page purpose |
| Add "My Profile" to user menu | 188-203 | Personal self-service profile link |

---

## Error Handling Plan
*Approved: [ ] Pending user approval*

### Error Translation Layer
Create `frontend/src/utils/errorTranslator.js` to map technical errors to user-friendly messages with action buttons.

| Technical Error | User-Friendly Message | Action Button |
|-----------------|-----------------------|---------------|
| `535 5.7.8 Error: authentication failed` | Mail server password is incorrect | [Update SMTP Password] |
| `LDAP: invalid credentials` | LDAP bind credentials are invalid | [Update LDAP Config] |
| `Authentik: 401 Unauthorized` | Authentik API token expired | [Refresh Token] |
| `ECONNREFUSED: Connection refused` | Service is unreachable | [Check Health] |

### ProgressBar Component
Create `frontend/src/components/ProgressBar.jsx` to show bidirectional sync progress:
- Separate bars for Authentik → LDAP and LDAP → Authentik
- Show percentage complete, current step, estimated time remaining
