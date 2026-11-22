# Changelog

## [Unreleased]

### Added
- 2026-11-22: Add admin UI on /roles/:slug to rotate an app's RBAC API key, optionally email it to a developer, and copy a POST /api/authorize integration snippet
- 2026-07-05: Add `ldapClient.createUser()` — creates LDAP entry via `client.add()` with SSHA temp password, uidNumber auto-assignment, and all required posixAccount attributes
- 2026-06-29: Add DELETE endpoint for app_users removal (`DELETE /api/rbac/users/:appSlug/:sub`)
- 2026-06-29: Add "Remove" button in RBAC app Users table with confirmation dialog
- 2026-06-29: Add `deleteRbacUser()` to frontend API client
- 2026-06-29: Add bulk actions (checkboxes, select-all, bulk delete, bulk override role) to Users table in AppRoleDetail.jsx

### Changed
- 2026-11-22: Add `[skip deploy]` (or `[skip-deploy]`) commit-message sentinel to skip the GitHub Actions host deploy; frontend unit tests now run in both CI workflows
- 2026-06-29: Improve logger console transport to show metadata (error details now visible in console output)
- 2026-06-29: Restructure `syncUsersForApp()` to use explicit find-then-act pattern — always query existing user by OIDC sub before acting, skip users with failed resolveRole

### Fixed
- 2026-11-22: Fix SSO-declared super admins not seeing app admin controls (Edit, Rotate & send API Key, Schema) on `/roles/:slug` — the gate checked only the legacy `role` field, while OIDC sessions carry the RBAC role in `roleDefinition.name`
- 2026-11-22: Fix red CI backend suite (164/164 tests now pass) — stale test mocks and an unconsumed async handler were masking regressions in RBAC routes, authorizer role resolution, and Authentik sync; the missing-token error now names the real `AUTHENTIK_TOKEN` env var
- 2026-11-22: Fix backend silently entering god-mode after a transient Authentik failure at boot — critical service verification is now retried 3 times, limited mode self-recovers every 60s and reports HTTP 503 instead of 200, shutdown is hardened against stuck Socket.IO connections, and stray unhandled rejections no longer stop the server
- 2026-07-05: Fix SSHA hash encoding bug in `ldapClient.js` and `syncService.js` — `salt.toString('binary')` caused bytes > 127 to expand to multi-byte UTF-8, making LDAP password verification always fail 0x31; replaced with `Buffer.concat([Buffer.from(password), salt])` to preserve raw bytes
- 2026-07-05: Fix audit log at `password.js:198` — `ldap` field now reflects `verifyPassword()` result instead of being hardcoded to `'success'`
- 2026-07-05: Create migration script `backend/scripts/migrate-ldap-hashes.js` that re-sets all existing broken LDAP hashes with corrected SSHA computation; ran against tammymhlahlo — verification now passes
- 2026-07-05: Fix new users having no LDAP entry — `POST /api/users/` and `POST /onboarding` now call `ldapClient.createUser()` (add) instead of `ldapClient.updateUser()` (modify on non-existent DN), ensuring LDAP entry exists before any password operation
- 2026-07-05: Fix sync service `createLDAPUser()` to use SSHA (consistent with ldapClient) instead of bcrypt for `userPassword` attribute
- 2026-06-29: Fix `POST /api/rbac/sync/:appSlug` - replace non-existent Authentik API endpoints (`/groups/{pk}/users/`, `/users/{pk}/groups/`) with correct group/user detail endpoints using `users_obj`/`groups_obj` embedded fields
- 2026-06-29: Fix same Authentik API pattern in `getUserOgunRole()` for consistency
- 2026-06-29: Remove test users `test@example.com` and `test@test.com` from app_users across all apps
- 2026-06-29: Fix audit log tab for apps — pass `entity_type=rbac_app&entity_id=slug` instead of `entity_type=slug`
- 2026-06-29: Add missing `entity_id` filter to `getAuditLogs()` in auditService.js
