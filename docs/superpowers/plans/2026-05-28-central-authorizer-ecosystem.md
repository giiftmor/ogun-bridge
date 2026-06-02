# Central Authorizer — Hook Ecosystem into Ogun

**Goal:** Make Spectres Pantheon, Groove Payroll, and Thoth ESU Gateway call Ogun Bridge's `/api/authorize` after Authentik login — so Ogun becomes the single source of truth for app-specific roles across the ecosystem.

**Architecture:**
- Add `onAuthorize` hook to canonical `@spectres/auth` (Spectres Pantheon `packages/auth/`)
- After Authentik login + session creation, call Ogun's `POST /api/authorize` with the app's API key
- Store Ogun URL + API key in each app's existing settings store (Spectres Pantheon: `AppSetting`, Groove: `settings`, Thoth: env vars)
- Ogun creates/updates `app_users` record, returns `role` + `businessRole` — app stores in session

**Tech Stack:** TypeScript (Spectres Pantheon, Thoth), JavaScript (Groove), Express (Spectres, Groove), Fastify (Thoth)

---

## Task 1: Add `onAuthorize` hook to canonical `@spectres/auth`

**Files:**
- Modify: `spectres-pantheon/packages/auth/src/oidc/provider.ts`

- [ ] Add `opts` parameter to `callbackHandler` signature
- [ ] Call `opts.onAuthorize` after `createSession` before redirect
- [ ] Build the package
- [ ] Commit

## Task 2: Wire onAuthorize into Spectres Pantheon callback

**Files:**
- Modify: `spectres-pantheon/src/server/routes/auth.ts`
- Create: `spectres-pantheon/src/server/auth/ogunConfig.ts`
- Create: `spectres-pantheon/src/server/routes/ogunBridge.ts`
- Create: `spectres-pantheon/src/app/(app)/settings/ogun/page.tsx`
- Modify: `spectres-pantheon/src/app/(app)/settings/layout.tsx`
- Modify: `spectres-pantheon/src/lib/api.ts`

- [ ] Create `ogunConfig.ts` — config loader (DB-first, env fallback)
- [ ] Create `ogunBridge.ts` routes — admin API for test/save/refresh
- [ ] Wire ogunBridgeRouter into app
- [ ] Update callback route to pass `onAuthorize` hook
- [ ] Add Ogun Bridge methods to `api.ts`
- [ ] Create settings page at `/settings/ogun`
- [ ] Add nav link to settings layout
- [ ] Commit

## Task 3: Update Groove Payroll

**Files:**
- Modify: `groove_co-payroll/backend/vendor/@spectres/auth/dist/oidc/provider.js`
- Modify: `groove_co-payroll/backend/server.js`
- Create: `groove_co-payroll/backend/src/services/ogunBridge.js`
- Modify: `groove_co-payroll/frontend/src/components/admin/SettingsTab.jsx`

- [ ] Copy updated provider.js with onAuthorize hook
- [ ] Create `ogunBridge.js` service
- [ ] Update callback route + settings API in server.js
- [ ] Add Ogun section to SettingsTab.jsx
- [ ] Commit

## Task 4: Update Thoth ESU Gateway

**Files:**
- Modify: `thoth-esu-gateway/localmail-api/vendor/@spectres/auth/dist/oidc/provider.js`
- Modify: `thoth-esu-gateway/localmail-api/src/plugins/auth.ts`
- Create: `thoth-esu-gateway/localmail-api/src/services/ogunBridge.ts`

- [ ] Copy updated provider.js with onAuthorize hook
- [ ] Create `ogunBridge.ts` service
- [ ] Update callback handler in auth.ts with onAuthorize
- [ ] Commit

## Task 5: Verify — test all three apps call Ogun

- [ ] Get API keys from Ogun's DB for spectres, groove, thoth
- [ ] Configure Spectres Pantheon via UI
- [ ] Configure Groove .env
- [ ] Configure Thoth .env
- [ ] Verify app_users table populated for all three apps
