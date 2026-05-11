# Production Readiness — Sprint 1: Critical

**Must fix before any production deployment.**

## C-01: Plaintext LDAP password hashing
- [x] `backend/src/services/ldapClient.js:6` — Replaced `hashPasswordLDAP()` no-op with proper SSHA hashing via `crypto.createHash('sha1')` with random 8-byte salt before storing `userPassword`

## C-02: SQL injection in alert cleanup
- [x] `backend/src/services/alertService.js:131` — Replaced string interpolation `'${daysOld} days'` with parameterised query using `$1::integer * INTERVAL '1 day'`

## C-03: Encryption key stored unencrypted in DB
- [x] `backend/src/services/encryption.js` — Removed master encryption key from `service_configs` table; now reads `ENCRYPTION_KEY` from environment only at module init time. `saveKeyToDB()` is a no-op.

## C-04: Hardcoded weak default password
- [x] `backend/src/services/config.js:420` — Removed `|| 'Kali@1403'` fallback from `createSuperAdminIfNeeded()`; throws if `SUPER_ADMIN_PASS` is not set. Startup validation in `index.js:validateRequiredEnv()` already exits with error if missing.

## C-05: Session token leak via query string
- [x] `backend/src/middleware/auth.js:62,110` — Removed `req.query?.token` from both `authenticate()` and `optionalAuth()`; tokens accepted only via `Authorization` header or HTTP-only `auth_token` cookie

## C-06: Zero test coverage
- [x] Installed Vitest (v4.1.6) as dev dependency
- [x] Created `tests/setup.js` with logger mock
- [x] Created `tests/ldapClient.test.js` — 14 tests (hashPasswordLDAP, escapeLDAPFilterValue, escapeLDAPDNValue)
- [x] Created `tests/encryption.test.js` — 6 tests (getEncryptionKey, encrypt/decrypt roundtrip, tampered data)
- [x] Created `tests/auth-middleware.test.js` — 12 tests (validateSession, createSession, deleteSession, authenticate, optionalAuth, no query-string token)
- [x] Created `tests/alertService.test.js` — 6 tests (createAlert, clearOldAlerts parameterised, acknowledgeAlert, getUnacknowledgedAlerts)
- [x] Created `tests/config.test.js` — 6 tests (isSetupComplete, hasAdminUser, createSuperAdminIfNeeded, getServiceConfig)
- [x] Created `tests/health.test.js` — 2 tests (router validity)
- [x] Updated `package.json` test script to `vitest run` — 48 tests pass
- [x] Updated `.github/workflows/ci.yml` — added `test-backend` job running `npm test` on every push/PR
- [x] Updated `.github/workflows/docker.yml` — added `npm test` step to `backend-build` job
- [x] Added `test:ci` npm script: `vitest run --reporter=verbose && node --check src/index.js`
