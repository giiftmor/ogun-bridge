import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { apiClient } from '../services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Shield, Loader2 } from 'lucide-react'
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter'

export function CreatePassword() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [validToken, setValidToken] = useState(false)
  const [username, setUsername] = useState('')

  useEffect(() => {
    const verifyToken = async () => {
      try { const data = await apiClient.verifyResetToken(token); setValidToken(true); setUsername(data.username || '') }
      catch (err) { setValidToken(false); toast.error('Invalid or expired invitation link') }
      finally { setVerifying(false) }
    }
    if (token) verifyToken()
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!password || !confirmPassword) { toast.error('Please enter and confirm your new password'); return }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return }
    // Validate password strength
    const hasLength = password.length >= 10
    const hasUpper = /[A-Z]/.test(password)
    const hasLower = /[a-z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    const hasSpecial = /[!@#$%^&*]/.test(password)
    const hasNoSpaces = !/\s/.test(password)
    if (!hasLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial || !hasNoSpaces) {
      toast.error('Password does not meet all requirements')
      return
    }
    setLoading(true)
    try { await apiClient.resetPassword(token, password); toast.success('Password created successfully!'); navigate('/login') }
    catch (err) { toast.error(err.message || 'Failed to create password') }
    finally { setLoading(false) }
  }

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <Card className="max-w-md w-full p-8">
          <CardContent className="p-0 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-accent mx-auto" />
            <p className="mt-4 text-[13px] text-secondary">Verifying invitation link...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!validToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <Card className="max-w-md w-full p-8">
          <CardContent className="p-0 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-danger-bg mb-4">
              <XCircle className="h-6 w-6 text-danger-text" />
            </div>
            <h1 className="text-[20px] font-medium text-primary mb-2">Invalid Link</h1>
            <p className="text-[13px] text-secondary">This invitation link is invalid or has expired.</p>
            <div className="mt-4">
              <Link to="/login" className="text-[13px] text-accent hover:text-accent-hover transition-colors duration-150">Back to Login</Link>
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
          <div className="text-center mb-6">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-accent-tint mb-4">
              <Shield className="h-6 w-6 text-accent" />
            </div>
            <h1 className="text-[20px] font-medium text-primary">Create Your Password</h1>
            <p className="text-[13px] text-secondary mt-1">
              Welcome! Set a password for <strong className="text-primary">{username}</strong>
            </p>
            <p className="text-[12px] text-tertiary mt-1">Your account has been created. Set your password to get started.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-[12px] font-medium text-secondary mb-1.5">New Password</label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Enter new password" />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-[12px] font-medium text-secondary mb-1.5">Confirm Password</label>
              <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Confirm new password" />
            </div>

            <div className="bg-subtle border border-border rounded-sm p-4">
              <PasswordStrengthMeter password={password} />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Creating Password...' : 'Create Password'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-[13px] text-accent hover:text-accent-hover transition-colors duration-150">Back to Login</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
