import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'

export function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')
  const isLoggedOut = searchParams.get('logged_out') === 'true'
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function checkProviders() {
      try {
        const res = await fetch('/api/auth/public/providers')
        const data = await res.json()
        if (cancelled) return

        const oidc = data.providers?.find(p => p.type === 'oidc')
        if (oidc?.enabled) {
          window.location.href = '/auth/login'
          return
        }
        setChecking(false)
      } catch {
        if (!cancelled) setChecking(false)
      }
    }

    if (!error && !isLoggedOut) {
      checkProviders()
    } else {
      setChecking(false)
    }

    return () => { cancelled = true }
  }, [error, isLoggedOut])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <Card className="max-w-md w-full p-8">
          <CardContent className="p-0">
            <div className="text-center">
              <p className="text-[13px] text-secondary">Checking configuration...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <Card className="max-w-md w-full p-8">
        <CardContent className="p-0">
          <div className="text-center mb-8">
            <div className="w-10 h-10 rounded-sm bg-accent flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-[20px] font-medium text-primary">Ogun Bridge</h1>
            <p className="text-[13px] text-secondary mt-1">Authentik LDAP Sync Management</p>
          </div>

          {error === 'access_denied' && (
            <div className="mb-4 p-3 bg-danger-bg border border-danger-text/20 rounded-sm">
              <p className="text-[13px] text-danger-text font-medium mb-1">Access Denied</p>
              <p className="text-[13px] text-danger-text">
                Your account is not authorized for Ogun Bridge. Contact your administrator.
              </p>
            </div>
          )}

          {error === 'callback_failed' && (
            <div className="mb-4 p-3 bg-danger-bg border border-danger-text/20 rounded-sm">
              <p className="text-[13px] text-danger-text font-medium mb-1">Login Failed</p>
              <p className="text-[13px] text-danger-text">
                Authentication failed. Please try again.
              </p>
            </div>
          )}

          {error === 'token_exchange_failed' && (
            <div className="mb-4 p-3 bg-danger-bg border border-danger-text/20 rounded-sm">
              <p className="text-[13px] text-danger-text font-medium mb-1">Authentication Error</p>
              <p className="text-[13px] text-danger-text">
                Could not exchange authorization code. Please try again.
              </p>
            </div>
          )}

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

          <div className="mt-6 text-center">
            <p className="text-[12px] text-tertiary">Contact your administrator if you need access.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
