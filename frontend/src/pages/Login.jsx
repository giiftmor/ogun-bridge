import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { apiClient } from '../services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await apiClient.login(username, password)
      toast.success('Login successful')
      navigate('/')
    } catch (err) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
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

          {error && (
            <div className="mb-4 p-3 bg-danger-bg border border-danger-text/20 rounded-sm">
              <p className="text-[13px] text-danger-text">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-[12px] font-medium text-secondary mb-1.5">Username</label>
              <Input
                id="username" type="text" value={username}
                onChange={(e) => setUsername(e.target.value)} required
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[12px] font-medium text-secondary mb-1.5">Password</label>
              <Input
                id="password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} required
                placeholder="Enter your password"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <Link to="/forgot-password" className="block text-[13px] text-accent hover:text-accent-hover transition-colors duration-150">
              Forgot Password?
            </Link>
            <p className="text-[12px] text-tertiary">Contact your administrator if you need access.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
