# ALSM Code Architecture: Service → Route → Frontend

## Overview

ALSM (Authentik LDAP Sync Management) follows a layered architecture pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                       │
│  ┌─────────────────┐        ┌──────────────────────────┐   │
│  │   Pages/UI      │───────▶│   Services (api.js)     │   │
│  │ Dashboard.jsx   │        │   HTTP Requests         │   │
│  └─────────────────┘        └───────────┬──────────────┘   │
└────────────────────────────────────────┼───────────────────┘
                                         │ fetch()
                                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND (Node.js)                      │
│  ┌─────────────────┐        ┌──────────────────────────┐   │
│  │   Routes        │◀───────│   Services                │   │
│  │ dashboard.js    │        │   syncService.js         │   │
│  └────────┬────────┘        │   ldapClient.js           │   │
│           │                 │   authentikClient.js      │   │
│           ▼                 └──────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │   index.js (Express Router Registration)            │  │
│  │   app.use('/api/dashboard', dashboardRouter)        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Backend Services

**Location:** `/backend/src/services/`

Services contain the core business logic and integrations.

### Example: syncService.js

```javascript
// backend/src/services/syncService.js
export function getSyncState() {
  return {
    lastSyncTime: syncState.lastSyncTime,
    status: syncState.status,
    recentErrors: syncState.recentErrors,
    config: syncState.config,
  }
}

export async function startSyncService(config) {
  // Core sync logic between Authentik ↔ LDAP
}
```

**Other Services:**

| Service | Purpose |
|---------|---------|
| `ldapClient.js` | LDAP operations (search, modify, authenticate) |
| `authentikClient.js` | Authentik API integration |
| `mailserver.js` | Docker mailserver integration |
| `logCache.js` | In-memory log storage |
| `auditService.js` | Audit logging |
| `emailService.js` | Password creation email via SMTP |
| `webhookService.js` | Webhook management and triggers |
| `userProfileService.js` | User profile tracking in PostgreSQL |

---

## Layer 2: Backend Routes

**Location:** `/backend/src/routes/`

Routes define API endpoints and connect services to HTTP requests.

### Example: dashboard.js

```javascript
// backend/src/routes/dashboard.js
import express from 'express'
import { getSyncState } from '../services/syncService.js'
import { ldapClient } from '../services/ldapClient.js'
import { authentikClient } from '../services/authentikClient.js'

export const dashboardRouter = express.Router()

// GET /api/dashboard/stats
dashboardRouter.get('/stats', async (req, res) => {
  try {
    const syncState = getSyncState()              // ← calls service
    const [authentikUsers, ldapUsers] = await Promise.all([
      authentikClient.getUsers(),                  // ← calls service
      ldapClient.getUsers(),                       // ← calls service
    ])
    
    res.json({                                     // ← returns JSON
      authentikUsers: authentikUsers.length,
      ldapUsers: ldapUsers.length,
      lastSyncTime: syncState.lastSyncTime,
      syncStatus: syncState.status,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/dashboard/health
dashboardRouter.get('/health', async (req, res) => {
  // Health check logic
})
```

### Route Registration

**Location:** `/backend/src/index.js`

```javascript
// backend/src/index.js
import { dashboardRouter } from './routes/dashboard.js'
import { usersRouter } from './routes/users.js'
import { mailAdminRouter } from './routes/mailAdmin.js'

// Register routes with /api prefix
app.use('/api/dashboard', dashboardRouter)   // → /api/dashboard/*
app.use('/api/users', usersRouter)           // → /api/users/*
app.use('/api/mail/admin', mailAdminRouter)  // → /api/mail/admin/*
```

**URL Pattern:** `/api/{router-name}/{endpoint}`

| Router | Endpoints |
|--------|-----------|
| `/api/dashboard` | `/stats`, `/activity`, `/health` |
| `/api/users` | `/`, `/:id`, `/:id/compare`, `/:username/detail`, `/:username/profile`, `/:username/alt-email` |
| `/api/groups` | `/`, `/:id/compare` |
| `/api/mail/admin` | `/status`, `/mailbox`, `/quota`, `/config` |
| `/api/password` | `/sync/:username`, `/validate`, `/policy`, `/change` |
| `/api/invite` | `/send/:username`, `/send-bulk`, `/force-reset/:username`, `/webhooks` |

---

## New Services (Phase 2)

**Location:** `/frontend/src/services/api.js`

The API service makes HTTP requests to the backend.

### Core Request Handler

```javascript
// frontend/src/services/api.js
const API_BASE_URL = '/api'  // Uses Vite proxy

class ApiClient {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`  // /api + /dashboard/stats
    
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    
    if (!response.ok) throw new Error('API request failed')
    return response.json()
  }
}
```

### Dashboard Endpoints

```javascript
export const apiClient = {
  async getDashboardStats() {
    return this.request('/dashboard/stats')  // → /api/dashboard/stats
  },
  
  async getRecentActivity() {
    return this.request('/dashboard/activity')
  },
  
  async getSystemHealth() {
    return this.request('/dashboard/health')
  },
}
```

### API Base URL Configuration

The frontend uses Vite's proxy to forward API calls:

```javascript
// frontend/vite.config.js
export default {
  server: {
    port: 3331,
    proxy: {
      '/api': {
        target: 'http://192.168.0.200:3333',  // Backend server
        changeOrigin: true,
      },
    },
  },
}
```

---

## Layer 4: Frontend Pages

**Location:** `/frontend/src/pages/`

Pages use React Query to fetch and display data.

### Example: Dashboard.jsx

```javascript
// frontend/src/pages/Dashboard.jsx
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/services/api'

export function Dashboard() {
  // Fetch data using React Query
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],                    // Cache key
    queryFn: apiClient.getDashboardStats.bind(apiClient),
  })
  
  if (isLoading) return <div>Loading...</div>
  
  return (
    <div>
      <h1>Authentik Users: {stats?.authentikUsers}</h1>
      <h1>LDAP Users: {stats?.ldapUsers}</h1>
      <h1>Last Sync: {stats?.lastSyncTime}</h1>
    </div>
  )
}
```

### React Query Flow

```
useQuery({
  queryKey: ['dashboard-stats'],    ← Unique cache key
  queryFn: apiClient.getDashboardStats,  ← Fetch function
})
        │
        ▼
┌───────────────────────────────────────┐
│  1. Check cache for 'dashboard-stats' │
│  2. If stale/missing: fetch()         │
│  3. Store result in cache            │
│  4. Update UI with data              │
└───────────────────────────────────────┘
```

---

## Complete Request Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. USER VISITS /dashboard                                            │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. Dashboard.jsx renders                                             │
│    const { data } = useQuery({                                       │
│      queryKey: ['dashboard-stats'],                                  │
│      queryFn: apiClient.getDashboardStats,                           │
│    })                                                                │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. api.js makes HTTP request                                        │
│    GET /api/dashboard/stats                                         │
│                                                                      │
│    Vite proxy forwards to: http://192.168.0.200:3333/api/dashboard/stats
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. Express matches route                                            │
│    app.use('/api/dashboard', dashboardRouter)                       │
│    dashboardRouter.get('/stats', ...)                               │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 5. Route handler calls services                                     │
│    const syncState = getSyncState()          // syncService.js     │
│    const ldapUsers = await ldapClient.getUsers()  // ldapClient.js   │
│    const akUsers = await authentikClient.getUsers() // authentik.js │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 6. Services return data → Route returns JSON                        │
│    res.json({                                                       │
│      authentikUsers: 9,                                            │
│      ldapUsers: 9,                                                  │
│      lastSyncTime: "2026-02-27T10:00:00Z"                          │
│    })                                                                │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 7. React Query receives response, updates cache, UI re-renders     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## File Structure Summary

```
/opt/alsm/
├── backend/
│   ├── src/
│   │   ├── index.js                 # Express app, route registration
│   │   ├── routes/
│   │   │   ├── dashboard.js        # /api/dashboard/* endpoints
│   │   │   ├── users.js            # /api/users/* endpoints
│   │   │   ├── mailAdmin.js        # /api/mail/admin/* endpoints
│   │   │   └── password.js         # /api/password/* endpoints
│   │   └── services/
│   │       ├── syncService.js      # Sync logic
│   │       ├── ldapClient.js      # LDAP operations
│   │       ├── authentikClient.js  # Authentik API
│   │       └── mailserver.js      # Mailserver integration
│   │   └── utils/
│   │       └── logger.js
│   │
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx      # Dashboard UI
│   │   │   ├── MailAdmin.jsx      # Mail admin UI
│   │   │   └── PasswordManagement.jsx
│   │   ├── services/
│   │   │   ├── api.js             # HTTP client
│   │   │   └── websocket.js       # Real-time updates
│   │   └── App.jsx                # Routes definition
│   └── vite.config.js             # Proxy configuration
```

---

## Key Takeaways

1. **Services** = Business logic (no HTTP code)
2. **Routes** = HTTP endpoints (connect services to requests)
3. **api.js** = Frontend HTTP client
4. **Pages** = React components with useQuery
5. **URL Pattern** = `/api/{router-name}/{endpoint}`

---

*Generated: February 2026*
