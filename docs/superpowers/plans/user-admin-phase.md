# User Administration Phase Plan

## Context
Ogun Bridge is an LDAP/Authentik sync management platform. The user administration module spans four pillars: Users, Services, Roles (RBAC), and Passwords. This plan documents the current state, identifies gaps, and sequences remediation work.

## Current State Summary

### 1. Users — Feature Complete
- **User list**: Search, filter, view details. Shows sync status (Authentik vs LDAP), password status, active/inactive state.
- **User creation**: Create with username, name, email, assign to groups. Optional "send invite email after creation."
- **Onboarding wizard**: `OnboardingWizard` component exists (needs end-to-end verification).
- **User editing**: Edit name/email, activate/deactivate, delete.
- **Profile view**: Username, employee number, email, alternate email, status, password status, last password change, created date, last login, RBAC role.
- **Group management**: View direct/inherited groups, add/remove from groups.
- **Backend**: Full CRUD via `backend/src/routes/users.js`. Combines Authentik + LDAP data, public list endpoint, creates/updates/deletes in both systems.

### 2. Services — Feature Complete
- **Service list**: Search, view details.
- **Service CRUD**: Create (name, URL, type, description, icon, public/private, assign to group), edit, delete.
- **Group assignments**: Assign/unassign LDAP groups to services. Shows which groups grant access.
- **User context**: Shows services user has access to based on group membership, with open/copy URL buttons.
- **Backend**: `backend/src/routes/groupServices.js`. Full CRUD, aggregates services by name across groups.

### 3. Roles (RBAC) — Feature Complete
- **Apps registry**: View registered apps, edit config (authentik_slug, access_group, schema_endpoint, active status).
- **Role definitions**: Create/edit/delete roles per app, set base_role (admin/viewer), default role flag.
- **Permissions builder**: Module/action-based permissions per role (app pushes schema via API).
- **Group mappings**: Map Authentik groups to roles with priority, enable/disable mappings.
- **User overrides**: Override individual user roles.
- **Backend**: `backend/src/routes/rbac.js`. Full schema/roles/mappings/permissions/users CRUD. Super admin required for most endpoints.

### 4. Passwords — Feature Complete
- **Password policy**: Enforced validation (10 chars, upper/lower/number/special, no spaces).
- **Password sync**: Sync to both LDAP and Authentik.
- **Force reset**: Sends reset email to user.
- **Invite**: Sends password creation invitation.
- **Temp password**: Generate and email temporary password.
- **Verify**: Test LDAP password validity.
- **History**: View audit log of password changes.
- **Expiration**: Set/view expiration dates.
- **Self-service**: `SelfServicePasswordChange` page for users to change their own password.
- **Backend**: `backend/src/routes/password.js`. Full policy validation, sync, expiration, history, verification.

---

## Identified Gaps

### Gap A: Onboarding Wizard End-to-End Verification
**Area**: Users
**Severity**: Medium
**Description**: The `OnboardingWizard` component exists in the frontend but needs verification that the full flow works correctly — from user creation in Authentik, to LDAP sync, to invitation email.
**Relevant files**: `frontend/src/components/OnboardingWizard.jsx`, `backend/src/routes/onboarding.js`

### Gap B: Bulk User Operations
**Area**: Users
**Severity**: Low
**Description**: No bulk operations (import, export, bulk activate/deactivate, bulk delete). Administrators must manage users one by one.
**Relevant files**: `frontend/src/pages/UserBrowser.jsx`, `backend/src/routes/users.js`

### Gap C: Password Strength Meter
**Area**: Passwords
**Severity**: Low
**Description**: Password policy is enforced server-side but the UI lacks a real-time strength meter during password creation/change.
**Relevant files**: `frontend/src/pages/PasswordManagement.jsx`, `frontend/src/pages/SelfServicePasswordChange.jsx`

### Gap D: Automated Password Expiration Notifications
**Area**: Passwords
**Severity**: Low
**Description**: Password expiration dates are tracked but no automated email notifications are sent when a password is about to expire.
**Relevant files**: `backend/src/routes/password.js`, `backend/src/services/mailService.js`

### Gap E: Service Health/Status Checks
**Area**: Services
**Severity**: Low
**Description**: Services have URLs but no automated health checks to verify they are reachable.
**Relevant files**: `frontend/src/pages/ServiceManager.jsx`

### Gap F: RBAC Audit Trail
**Area**: Roles
**Severity**: Low
**Description**: No audit log of who changed roles, mappings, or permissions and when.
**Relevant files**: `backend/src/routes/rbac.js`

---

## Implementation Sequence

### Phase 1: Verify & Harden (Priority: Medium) ✅ COMPLETE
1. **Gap A**: Verify OnboardingWizard end-to-end flow — Fixed 5 missing auth endpoints (`verify-reset-token`, `reset-password`, `forgot-password`, `change-password`, `resend-reset-token`) in `backend/src/routes/auth.js`. Fixed `password_reset_tokens` schema mismatch: corrected `user_id` → `username` in onboarding.js, invite.js, and new auth endpoints.
2. **Gap C**: Add password strength meter to UI — Added reusable `PasswordStrengthMeter.jsx` component with visual strength bar and real-time requirement checklist. Integrated into `CreatePassword.jsx` and `SelfServicePasswordChange.jsx`. Fixed SelfServicePasswordChange showing "Minimum 8 characters" — now correctly shows 10+.

### Phase 2: Convenience & UX (Priority: Low) ✅ COMPLETE
3. **Gap B**: Add bulk user operations (import/export via CSV) — Backend `GET /api/users/export/csv` exports all users; `POST /api/users/import/csv` bulk-creates in Authentik + LDAP + local DB with group assignment. Frontend `UserBrowser.jsx` has Export button and Import dialog.
4. **Gap E**: Add service health check pings — Backend endpoint `POST /api/groups-manager/health/:serviceName` with SSRF protection. Frontend `ServiceManager.jsx` shows health status badge and check button.

### Phase 3: Automation (Priority: Low) ✅ COMPLETE
5. **Gap D**: Add automated expiration notification emails — New `sendPasswordExpirationEmail()` in `emailService.js` with urgency-based templates (7/3/1 day thresholds). New `passwordNotificationService.js` scheduler runs daily, checks LDAP `shadowExpire`, sends emails via SMTP. Admin manual trigger at `POST /auth/trigger-expiration-notifications`.
6. **Gap F**: Add RBAC audit logging — Added `createAuditLog()` calls to all RBAC mutation endpoints: schema update, role create/update/deactivate, permissions update, mapping create/update/delete, user role override, app update, user sync.

---

## Notes
- All backend routes are protected by appropriate middleware (authenticate, requireSuperAdmin, requireRole).
- The LDAP/Authentik sync runs every 5 minutes via `backend/src/services/syncService.js`.
- Mail is handled by Thoth Esu Gateway (`SMTP_HOST=thoth-esu-gateway-api-1:2525`).
