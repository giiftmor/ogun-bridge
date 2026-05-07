import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { apiClient } from '../services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CheckCircle } from 'lucide-react'

export function ForgotPassword() {
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!usernameOrEmail.trim()) { toast.error('Please enter your username or email'); return }
    setLoading(true)
    try {
      await apiClient.forgotPassword(usernameOrEmail)
      setSubmitted(true)
      toast.success('If an account exists, a reset email will be sent')
    } catch (err) {
      toast.error(err.message || 'Failed to process request')
    } finally { setLoading(false) }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <Card className="max-w-md w-full p-8">
          <CardContent className="p-0 text-center">
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-success-bg mb-4">
                <CheckCircle className="h-6 w-6 text-success-text" />
              </div>
              <h1 className="text-[20px] font-medium text-primary">Check Your Email</h1>
              <p className="text-[13px] text-secondary mt-2">
                If an account exists, we've sent password reset instructions.
              </p>
            </div>
            <Link to="/login" className="text-[13px] text-accent hover:text-accent-hover transition-colors duration-150">
              Back to Login
            </Link>
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
            <h1 className="text-[20px] font-medium text-primary">Forgot Password</h1>
            <p className="text-[13px] text-secondary mt-1">
              Enter your username or email address and we'll send you instructions to reset your password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="usernameOrEmail" className="block text-[12px] font-medium text-secondary mb-1.5">Username or Email</label>
              <Input
                id="usernameOrEmail" type="text" value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)} required
                placeholder="Enter your username or email"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-[13px] text-accent hover:text-accent-hover transition-colors duration-150">
              Back to Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
