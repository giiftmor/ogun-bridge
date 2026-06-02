# Logout Admin Choice Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Differentiate admin vs SSO logouts so admin users get a choice screen instead of an Authentik error page.

**Architecture:** Backend reads session `data.sub` before deleting to detect login method. Returns `loginType: 'sso'|'admin'`. Frontend routes based on loginType. Login page shows both buttons when `?logged_out=true`.

**Tech Stack:** Node.js/Express, React/Zustand, Authentik OIDC

---

### Task 1: Backend — differentiate login type in logout handler

**Files:**
- Modify: `backend/src/routes/auth.js:274-292`

- [ ] **Step 1: Replace logout handler with session-aware version**

Current handler:
```js
authRouter.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.cookies?.auth_token
  if (token) {
    await deleteSession(token).catch(err => logger.error('Logout error', { error: err.message }))
  }
  res.clearCookie('auth_token')

  const authentikUrl = (process.env.AUTHENTIK_URL || '').replace(/\/+$/, '')
  const redirectUri = encodeURIComponent(
    (process.env.CORS_ORIGIN || 'https://ogun.spectres.co.za') + '/login?logged_out=true'
  )
  const logoutUrl = `${authentikUrl}/application/o/ogun-bridge/end-session/?post_logout_redirect_uri=${redirectUri}`

  res.json({ success: true, logoutUrl })
})
```

Replace with:
```js
authRouter.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.cookies?.auth_token

  let loginType = 'admin'
  if (token) {
    const session = await validateSession(token)
    if (session?.data?.sub) loginType = 'sso'
    await deleteSession(token).catch(err => logger.error('Logout error', { error: err.message }))
  }
  res.clearCookie('auth_token')

  if (loginType === 'sso') {
    const authentikUrl = (process.env.AUTHENTIK_URL || '').replace(/\/+$/, '')
    const redirectUri = encodeURIComponent(
      (process.env.CORS_ORIGIN || 'https://ogun.spectres.co.za') + '/login?logged_out=true'
    )
    const logoutUrl = `${authentikUrl}/application/o/ogun-bridge/end-session/?post_logout_redirect_uri=${redirectUri}`
    return res.json({ success: true, loginType, logoutUrl })
  }

  res.json({ success: true, loginType, logoutUrl: null })
})
```

- [ ] **Step 2: Verify backend starts without errors**

Run: `docker compose restart backend` and check logs

---

### Task 2: Frontend Layout — route by loginType

**Files:**
- Modify: `frontend/src/components/Layout.jsx`

- [ ] **Step 1: Update logout onClick to use loginType**

Current handler:
```jsx
onClick={async () => {
  clearUserState()
  try {
    const res = await apiClient.logout()
    const data = await res.json()
    if (data.logoutUrl) {
      window.location.href = data.logoutUrl
    } else {
      window.location.href = '/login'
    }
  } catch {
    window.location.href = '/login'
  }
}}
```

Replace with:
```jsx
onClick={async () => {
  clearUserState()
  try {
    const res = await apiClient.logout()
    const data = await res.json()
    if (data.loginType === 'sso' && data.logoutUrl) {
      window.location.href = data.logoutUrl
    } else {
      window.location.href = '/login?logged_out=true'
    }
  } catch {
    window.location.href = '/login?logged_out=true'
  }
}}
```

Note: Always redirect to `/login?logged_out=true` for both admin logouts and fallbacks.

---

### Task 3: Frontend Login — show both buttons on `?logged_out=true`

**Files:**
- Modify: `frontend/src/pages/Login.jsx`

- [ ] **Step 1: Add isLoggedOut check and hide stale warning**

The `isLoggedOut` variable already exists from Phase 4c (line 9). Replace the section that shows the "SSO is not configured" warning and the single-button block with a proper logged-out view.

Current (lines 96-125):
```jsx
          {!error && (
            <div className="mb-4 p-3 bg-warning-bg border border-warning-text/20 rounded-sm">
              <p className="text-[13px] text-warning-text">
                SSO is not configured. Use the emergency admin login below.
              </p>
            </div>
          )}

          <div className="text-center space-y-4">
            {error ? (
              <a
                href="/auth/login"
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-accent text-white rounded-sm text-[13px] font-medium hover:bg-accent-hover transition-colors duration-150"
              >
                ...
                Try Again with SSO
              </a>
            ) : (
              <Link
                to="/login/admin"
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-warning-bg text-warning-text border border-warning-text/30 rounded-sm text-[13px] font-medium hover:bg-warning-text/10 transition-colors duration-150"
              >
                ...
                Emergency Admin Access
              </Link>
            )}
          </div>
```

Replace with:
```jsx
          {isLoggedOut && (
            <div className="mb-4 p-3 bg-neutral-bg border border-border rounded-sm">
              <p className="text-[13px] text-primary font-medium mb-1">Logged out successfully</p>
              <p className="text-[13px] text-secondary">
                Choose how you'd like to sign back in.
              </p>
            </div>
          )}

          {!error && !isLoggedOut && (
            <div className="mb-4 p-3 bg-warning-bg border border-warning-text/20 rounded-sm">
              <p className="text-[13px] text-warning-text">
                SSO is not configured. Use the emergency admin login below.
              </p>
            </div>
          )}

          <div className="text-center space-y-3">
            <a
              href="/auth/login"
              className="block w-full px-4 py-2.5 bg-accent text-white rounded-sm text-[13px] font-medium hover:bg-accent-hover transition-colors duration-150"
            >
              <svg className="w-4 h-4 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Sign in with SSO
            </a>
            <Link
              to="/login/admin"
              className="block w-full px-4 py-2.5 bg-page border border-border text-secondary rounded-sm text-[13px] font-medium hover:bg-subtle hover:text-primary transition-colors duration-150"
            >
              Emergency Admin Access
            </Link>
          </div>
```

---

### Task 4: Rebuild, restart, verify

**Files:**
- N/A

- [ ] **Step 1: Rebuild and restart containers**

Run from project root:
```bash
docker compose up -d --build
```

- [ ] **Step 2: Verify containers are healthy**

Run: `docker compose ps` — both should show "healthy" or "(healthy)"

- [ ] **Step 3: Test admin logout path**

Run: `curl -s -X POST http://localhost:3333/api/auth/logout | python3 -m json.tool`

Expected output (no session cookie sent, so defaults to admin):
```json
{
    "success": true,
    "loginType": "admin",
    "logoutUrl": null
}
```
