# Logout: Admin Session Differentiation & Choice Screen

## Problem

Current logout always constructs an Authentik end-session URL and redirects there. Admin login users (Emergency Admin Access) don't have an Authentik session, so they land on an error page instead of getting logged out gracefully.

## Approach

Backend reads the session's `data` column to detect the login method before deleting it. OIDC sessions have a `sub` field (Authentik subject ID); admin sessions don't. The response tells the frontend which type it was, and the frontend routes accordingly.

## Backend: `POST /api/auth/logout`

**File:** `backend/src/routes/auth.js:274-292`

Before deleting the session, call `validateSession(token)` to inspect `session.data.sub`:

- `sub` exists → `loginType: 'sso'` → return Authentik end-session URL (same as current)
- `sub` absent → `loginType: 'admin'` → return `logoutUrl: null`

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

## Frontend: `Layout.jsx` — redirect by loginType

After `clearUserState()` and `apiClient.logout()`:

```jsx
const data = await res.json()
if (data.loginType === 'sso' && data.logoutUrl) {
  window.location.href = data.logoutUrl
} else {
  window.location.href = '/login?logged_out=true'
}
```

Has try/catch fallback to `/login?logged_out=true`.

## Frontend: `Login.jsx` — choice screen on `?logged_out=true`

When `isLoggedOut` is true (already parsed from query param):

1. **Don't show** "SSO is not configured" warning — that's for `!error && !isLoggedOut`
2. **Show** a neutral "You've been logged out" banner
3. **Show both buttons** simultaneously:
   - "Sign in with SSO" → `<a href="/auth/login">`
   - "Emergency Admin Access" → `<Link to="/login/admin">`

The existing `?logged_out=true` guard (Phase 4c) already prevents auto-OIDC redirect.

## Risks & Edge Cases

| Scenario | Behavior |
|----------|----------|
| SSO user logs out | Redirects to Authentik end-session, returns to `/login?logged_out=true` |
| Admin user logs out | Redirects directly to `/login?logged_out=true`, no Authentik call |
| Both buttons visible | User chooses how to proceed |
| SSO + `?logged_out=true` | Login page shows both buttons; clicking SSO triggers fresh OIDC |
| Session already expired | `validateSession` returns null → defaults to `loginType: 'admin'` — safe fallback |

## Files Changed

| File | Change |
|------|--------|
| `backend/src/routes/auth.js` | Logout handler reads session, returns `loginType` |
| `frontend/src/components/Layout.jsx` | Routes on `loginType` instead of always using `logoutUrl` |
| `frontend/src/pages/Login.jsx` | Shows both buttons when `isLoggedOut`; hides stale warning |
