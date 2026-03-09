# Centralized Users & Passwords Management and Sync
**Project Phase 2 - ALSM**

## Overview

Extend ALSM to create a unified user and password system that:
1. Tracks users from LDAP → Authentik → Mailserver
2. Manages password lifecycle with email notifications
3. Provides profile management showing accessible services

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           LDAP (389 DS)                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │
│  │ uid         │  │ mail        │  │ altEmail    │                   │
│  │ cn          │  │             │  │ (synced)    │                   │
│  │ sn          │  │             │  │             │                   │
│  └─────────────┘  └─────────────┘  └─────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ sync (Authentik → LDAP)
┌─────────────────────────────────────────────────────────────────────────┐
│                         Authentik                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ username    │  │ email       │  │ alt_email   │  │ password    │   │
│  │ name        │  │             │  │ (custom)    │  │ status      │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ALSM Database (PostgreSQL)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ user_profiles│ │ webhooks   │  │ audit_log  │  │ changes    │   │
│  │ username    │  │ name       │  │ action     │  │ entity_id  │   │
│  │ alt_email   │  │ url        │  │ timestamp  │  │ status     │   │
│  │ password_*  │  │ events     │  │ success   │  │            │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Mailserver (SMTP)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │
│  │ Password    │  │ Welcome     │  │ Password    │                      │
│  │ Creation    │  │ Email       │  │ Reset       │                      │
│  └─────────────┘  └─────────────┘  └─────────────┘                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Features Implemented

### ✅ 1. Alt-Email Management
- **LDAP**: `altEmail` attribute synced from Authentik
- **Authentik**: Custom property `alt_email` in user attributes
- **API**: `PUT /api/users/:username/alt-email` to set alt-email
- **Priority**: Alt-email takes precedence for password emails

### ✅ 2. Profile Management Page
- Access at `/profile` in ALSM UI
- Shows:
  - User info (name, email, alt-email, groups)
  - Role (admin/user based on systems_admins group)
  - Password status (hasPassword, lastChanged, expires, lastReset)
  - Services access with login credentials
- User list on left sidebar

### ✅ 3. Password Creation Email
- HTML formatted welcome email
- Sent via SMTP (localhost:587)
- Includes:
  - Account details
  - Services user has access to
  - Link to create password
- Sends to both primary and alt-email if configured

### ✅ 4. Force Password Reset
- Button in profile page quick actions
- Sends password creation email
- Logs to audit with `password_force_reset` action

### ✅ 5. Webhooks
- CRUD endpoints for webhook management
- Events: `password_created`
- Payload includes username, email, services

### ✅ 6. Service Account Filtering
- Filters out service accounts (ak-*, *_outpost_*, ldap_api)
- Applied to:
  - User list API
  - Sync service (skips creating LDAP entries)
  - Profile management

### ✅ 7. Password Sync Based on Login
- Sync now checks `last_login` instead of `password_change_date`
- Users who have never logged in are skipped

---

## Database Schema

### user_profiles table
```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  alt_email VARCHAR(255),
  password_method VARCHAR(50),                -- 'manual', 'email_invite', 'reset'
  password_created_at TIMESTAMP,
  password_synced_to_ldap BOOLEAN DEFAULT false,
  password_synced_to_authentik BOOLEAN DEFAULT false,
  email_invite_sent BOOLEAN DEFAULT false,
  email_invite_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### webhooks table
```sql
CREATE TABLE IF NOT EXISTS webhooks (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(500) NOT NULL,
  events VARCHAR[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users` | GET | List users (excludes service accounts) |
| `/api/users/:username/profile` | GET | Get user profile with services |
| `/api/users/:username/alt-email` | PUT | Set alt-email |
| `/api/users/no-password` | GET | Users who never logged in |
| `/api/invite/send/:username` | POST | Send password email to user |
| `/api/invite/send-bulk` | POST | Bulk send password emails |
| `/api/invite/force-reset/:username` | POST | Force password reset email |
| `/api/invite/webhooks` | GET/POST | List/create webhooks |
| `/api/invite/webhooks/:id` | DELETE | Delete webhook |
| `/api/invite/webhooks/:id/test` | POST | Test webhook |

---

## Profile Response Example

```json
{
  "username": "neomoruri",
  "name": "Neo Moruri",
  "email": "neomoruri@spectres.co.za",
  "altEmail": "neo7moruri@gmail.com",
  "groups": ["jellyfin", "nextcloud", "systems_admins"],
  "role": "admin",
  "isAdmin": true,
  "services": [
    {
      "id": "mail",
      "name": "Email",
      "hasAccess": true,
      "url": "https://webmail.spectres.co.za"
    },
    {
      "id": "media",
      "name": "Media Server",
      "hasAccess": true,
      "url": "https://jellyfin.spectres.co.za"
    }
  ],
  "password": {
    "hasPassword": true,
    "lastChanged": "2026-02-25T11:04:43.283803Z",
    "hasLoggedIn": true,
    "lastLogin": "2026-03-09T13:40:06.342600Z",
    "lastReset": {
      "timestamp": "2026-03-09T13:40:00Z",
      "type": "force_reset"
    }
  }
}
```

---

## SMTP Configuration

Add to `/opt/alsm/backend/.env`:
```
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=cn=seer
SMTP_PASSWORD=Kali@1403
SMTP_FROM_NAME=Spectres HUB
SMTP_FROM_ADDRESS=oracle@spectres.co.za
APP_URL=https://alsm.spectres.co.za
```

Note: Mailserver must be configured to accept SMTP auth from localhost.

---

## Services Access Reference

| Service | Access Method | URL | Required Group |
|---------|--------------|-----|---------------|
| Email | IMAP/SMTP | mail.spectres.co.za | None (all users) |
| Webmail | HTTPS | webmail.spectres.co.za | None |
| Media Server | OAuth | jellyfin.spectres.co.za | jellyfin |
| Cloud Storage | OAuth | nc.spectres.co.za | nextcloud |
| VPN | WireGuard | Contact admin | vpn |

---

## Implementation Status

- [x] 1. Add alt-email attribute to LDAP schema
- [x] 2. Add alt-email to Authentik custom attributes mapping
- [x] 3. Track users without synced passwords - add flag in database
- [x] 4. Create Profile Management page showing user services/access
- [x] 5. Add password creation email template and send via SMTP
- [x] 6. Create webhook endpoint for password creation success
- [x] 7. Build workflow/button to track users without passwords
- [x] 8. Bulk email existing users without passwords
- [x] 9. Update password sync to handle alt-email

---

## Files Modified

### Backend
- `src/services/syncService.js` - Service account filter, alt-email sync
- `src/services/ldapClient.js` - Added altEmail to attributes
- `src/services/emailService.js` - Password creation email
- `src/services/webhookService.js` - Webhook management
- `src/services/userProfileService.js` - User profile CRUD
- `src/routes/users.js` - Profile endpoint with alt-email, role
- `src/routes/invite.js` - Password email endpoints
- `src/lib/db.js` - user_profiles, webhooks tables

### Frontend
- `src/pages/ProfileManagement.jsx` - Profile UI with services
- `src/services/api.js` - Added profile, alt-email, force reset endpoints

---

*Updated: March 2026*
