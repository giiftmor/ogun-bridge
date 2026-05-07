import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { apiClient } from '../services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Shield, Loader2 } from 'lucide-react'

function Requirement({ label, status }) {
  if (status === null) return <div className="flex items-center gap-2 text-secondary"><XCircle className="h-4 w-4" /><span className="text-[13px]">{label}</span></div>
  if (status === 'pending') return <div className="flex items-center gap-2 text-[#b45309]"><XCircle className="h-4 w-4" /><span className="text-[13px]">{label}</span></div>
  return <div className="flex items-center gap-2 text-success-text"><CheckCircle className="h-4 w-4" /><span className="text-[13px]">{label}</span></div>
}

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

  const getRequirementStatus = (requirement) => {
    if (!password) return null
    switch (requirement) {
      case '10 characters': return password.length >= 10 ? 'met' : 'pending'
      case 'uppercase': return /[A-Z]/.test(password) ? 'met' : 'pending'
      case 'lowercase': return /[a-z]/.test(password) ? 'met' : 'pending'
      case 'number': return /[0-9]/.test(password) ? 'met' : 'pending'
      case 'special': return /[!@#$%^&*]/.test(password) ? 'met' : 'pending'
      case 'no spaces': return !/\s/.test(password) ? 'met' : 'pending'
      default: return null
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!password || !confirmPassword) { toast.error('Please enter and confirm your new password'); return }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return }
    const reqs = [
      { label: '10 characters', status: getRequirementStatus('10 characters') },
      { label: 'uppercase letter', status: getRequirementStatus('uppercase') },
      { label: 'lowercase letter', status: getRequirementStatus('lowercase') },
      { label: 'number', status: getRequirementStatus('number') },
      { label: 'special character (!@#$%^&*)', status: getRequirementStatus('special') },
      { label: 'no spaces', status: getRequirementStatus('no spaces') },
    ]
    if (reqs.filter(r => r.status !== 'met').length > 0) { toast.error('Password does not meet all requirements'); return }
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
              <p className="text-[13px] font-medium text-primary mb-2">Password must contain:</p>
              <div className="grid grid-cols-2 gap-2">
                <Requirement label="At least 10 characters" status={getRequirementStatus('10 characters')} />
                <Requirement label="At least one uppercase letter" status={getRequirementStatus('uppercase')} />
                <Requirement label="At least one lowercase letter" status={getRequirementStatus('lowercase')} />
                <Requirement label="At least one number" status={getRequirementStatus('number')} />
                <Requirement label="One special character (!@#$%^&*)" status={getRequirementStatus('special')} />
                <Requirement label="No spaces allowed" status={getRequirementStatus('no spaces')} />
              </div>
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
