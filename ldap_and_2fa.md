# LDAP as Source of Truth + Custom TOTP 2FA Plan

## LDAP as Source of Truth (Full System)

Flip the sync architecture so LDAP is the primary user directory and Authentik is the synced copy (reverse of current).

### What needs to change

| Phase | Tasks | Time |
|-------|-------|------|
| **1. LDAP User CRUD** | Create/update/delete endpoints for LDAP users. Currently none exist. Need to handle `inetOrgPerson` + `posixAccount` objectClasses, uidNumber allocation, all attributes | ~5hrs |
| **2. LDAP Group CRUD** | Create/update/delete groups in LDAP with proper OU placement, member DN management | ~4hrs |
| **3. Sync Engine Rework** | Flip `runSyncCycle()` to LDAP→Authentik. Currently the engine doesn't even create Authentik users — it would need new Authentik user creation logic. Remove the old Authentik→LDAP path. All per-group sync directions flip | ~5hrs |
| **4. Authentik LDAP Source** | Configure Authentik's built-in LDAP Source feature as a secondary sync mechanism | ~3hrs |
| **5. Read Paths** | Frontend + backend currently expect Authentik data shapes (PKs, `users_obj` arrays). LDAP returns DNs, different IDs. Need translation layer | ~4hrs |
| **6. Password + Edge Cases** | LDAP-first password sync, service account handling, employeeNumber, altEmail, last-login tracking | ~3hrs |
| **7. Testing** | Rebuild containers, verify every page, sync runs, data integrity | ~3hrs |
| **Total LDAP** | | **~27hrs (3-4 days)** |

### Risks

- Frontend expects Authentik data shapes (IDs, PKs, nested `users_obj`) — LDAP returns different structures
- Group membership is represented as DNs in LDAP (`uid=username,ou=people,...`) vs usernames in Authentik — translation layer needed everywhere
- No direct "user last login" in LDAP (Authentik tracks this) — would lose that data

---

## Custom TOTP 2FA in Ogun Bridge

Build TOTP two-factor authentication directly into the Express backend, independent of Authentik.

### What needs to change

| Phase | Tasks | Time |
|-------|-------|------|
| **1. Backend TOTP setup** | `otplib` + `qrcode` packages, `user_2fa` table (encrypted secrets, hashed recovery codes), `2faService.js` | ~3hrs |
| **2. Setup endpoints** | `POST /auth/2fa/init` (generate secret + QR URI), `POST /auth/2fa/enable` (verify + store), `POST /auth/2fa/disable` | ~4hrs |
| **3. Login modification** | Partial-auth token after password when 2FA enabled, `POST /auth/2fa/challenge` for TOTP/recovery code, rate limiting | ~4hrs |
| **4. Frontend setup page** | QR code display, code verification, recovery codes download | ~4hrs |
| **5. Frontend challenge** | TOTP input page after login step, recovery code fallback | ~3hrs |
| **6. Security hardening** | Encrypt secrets, audit logging, brute-force protection, session hardening | ~3hrs |
| **Total 2FA** | | **~21hrs (2.5-3 days)** |

---

## Combined Total: ~48 hours (6-7 days) for a single developer

### Ways to reduce scope
- Skip Authentik LDAP Source config (phase 4) — saves ~3hrs, less robust
- Skip 2FA frontend polish — bare-bones challenge page saves ~2hrs
- Do LDAP first, 2FA second as separate deployments
