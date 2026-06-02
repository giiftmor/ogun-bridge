import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Login failed')
      }

      navigate(data.redirect || '/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <Card className="max-w-md w-full p-8">
        <CardContent className="p-0">
          <div className="text-center mb-8">
            <div className="w-10 h-10 rounded-sm bg-warning-bg flex items-center justify-center mx-auto mb-4 border border-warning-text/20">
              <svg className="w-5 h-5 text-warning-text" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-[20px] font-medium text-primary">Emergency Admin Access</h1>
            <p className="text-[13px] text-warning-text mt-1">
              Use this only when SSO is unavailable
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-danger-bg border border-danger-text/20 rounded-sm">
              <p className="text-[13px] text-danger-text">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[13px] font-medium text-secondary mb-1.5">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@spectres.local"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[13px] font-medium text-secondary mb-1.5">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              variant="accent"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-[13px] text-accent hover:text-accent-hover transition-colors duration-150"
            >
              &larr; Back to SSO sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
