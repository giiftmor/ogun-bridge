# Ogun Bridge - Authentik LDAP Sync Management

A unified management interface for synchronizing users between Authentik (SSO/IdP) and LDAP directory server.

## Features

### Core Functionality
- **User Synchronization** - Bidirectional sync between Authentik and LDAP
- **Group Management** - View and manage LDAP groups
- **Change Detection** - Automatic detection of drift between systems
- **Approval Workflow** - Review and approve pending changes

### Password Management
- **Password Sync** - Sync passwords to both LDAP and Authentik
- **Self-Service Password Change** - Users can change their own passwords
- **Password Expiration** - Set expiration policies for passwords
- **Password History** - Track password changes via audit logs
- **Password Policy** - Enforce minimum requirements (8+ chars, uppercase, lowercase, number)

### Additional Features
- **Real-time Monitoring** - Live dashboard with WebSocket updates
- **Audit Logging** - Complete audit trail of all operations
- **Schema Mapping** - Configure field mappings between systems
- **Mail Settings** - SMTP configuration for notifications

### Frontend Improvements
- Toast notifications (react-hot-toast)
- Loading skeletons for better UX
- Debounced search (300ms)
- Organized navigation by function

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Port 3331)                     │
│              React 18 + Vite + Tailwind CSS                 │
│  Dashboard | Users | Groups | Passwords | Audit | Logs      │
└────────────────────────┬────────────────────────────────────┘
                         │ REST + WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Port 3333)                      │
│                  Node.js + Express                           │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐          │
│  │ Authentik   │ │    LDAP     │ │  PostgreSQL  │          │
│  │   API       │ │   Server    │ │   Database   │          │
│  └─────────────┘ └─────────────┘ └──────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend
- React 18
- Vite
- Tailwind CSS
- shadcn/ui components
- React Query (TanStack Query)
- React Router
- React Hot Toast
- Zustand (state management)

### Backend
- Node.js 25+
- Express
- ldapts (LDAP client)
- PostgreSQL (database)
- Socket.IO (WebSocket)

## Getting Started

### Prerequisites
- Node.js 25+
- PostgreSQL
- LDAP Directory Server
- Authentik instance

### Installation

```bash
# Backend
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

### Environment Variables

```env
# Backend (.env)
DATABASE_URL=postgresql://user:pass@localhost:5432/alsm
LDAP_HOST=localhost
LDAP_PORT=389
LDAP_BIND_DN=cn=Directory Manager,dc=example,dc=com
LDAP_BIND_PASSWORD=your_password
LDAP_BASE_DN=dc=example,dc=com
AUTHENTIK_URL=https://authentik.example.com
AUTHENTIK_TOKEN=your_token
PORT=3333
```

## API Endpoints

### Users
- `GET /api/users` - List all users
- `GET /api/users/:username/detail` - Get full user details (PID)

### Passwords
- `POST /api/password/sync/:username` - Sync password to LDAP + Authentik
- `POST /api/password/change` - Self-service password change
- `POST /api/password/validate` - Validate password against policy
- `GET /api/password/policy` - Get password policy
- `GET /api/password/history/:username` - Get password history
- `GET /api/password/expiration/:username` - Get password expiration
- `POST /api/password/expiration/:username` - Set password expiration

### Sync
- `POST /api/sync/users` - Trigger user sync
- `POST /api/sync/groups` - Trigger group sync

### Changes
- `GET /api/changes` - List pending changes
- `POST /api/changes/:id/approve` - Approve change
- `POST /api/changes/:id/reject` - Reject change

## Routes

| Path | Description |
|------|-------------|
| `/` | Dashboard |
| `/users` | User Browser |
| `/users/:username` | User Detail (PID) |
| `/groups` | Group Browser |
| `/password` | Password Management (Admin) |
| `/self-service-password` | Self-Service Password Change |
| `/changes` | Approval Queue |
| `/audit` | Audit Logs |
| `/logs` | Log Viewer |
| `/mail` | Mail Settings |
| `/schema` | Schema Mapper |

## Optional Improvements

See [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md#optional-improvements) for a complete list of possible enhancements.

### Quick Wins
- Keyboard shortcuts (`/` to search)
- CSV/JSON export
- Bulk user operations
- Enhanced dark mode

### Future Ideas
- Role-Based Access Control (RBAC)
- Multi-language support (i18n)
- Version control & rollback
- MFA integration
- Audit log retention policies

## License

MIT
