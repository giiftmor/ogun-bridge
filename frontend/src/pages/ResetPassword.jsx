import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { apiClient } from '../services/api'
import { CheckCircle, XCircle, Mail, ArrowRight } from 'lucide-react'

export function ResetPassword() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [validToken, setValidToken] = useState(false)
  const [username, setUsername] = useState('')
  const [resendInput, setResendInput] = useState('')
  const [resending, setResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)

  useEffect(() => {
    const verifyToken = async () => {
      try {
        const data = await apiClient.verifyResetToken(token)
        setValidToken(true)
        setUsername(data.username || '')
      } catch (err) {
        setValidToken(false)
        toast.error('Invalid or expired reset link')
      } finally {
        setVerifying(false)
      }
    }

    if (token) {
      verifyToken()
    }
  }, [token])

  const getRequirementStatus = (requirement) => {
    if (!password) return null
    
    switch (requirement) {
      case '10 characters':
        return password.length >= 10 ? 'met' : 'pending'
      case 'uppercase':
        return /[A-Z]/.test(password) ? 'met' : 'pending'
      case 'lowercase':
        return /[a-z]/.test(password) ? 'met' : 'pending'
      case 'number':
        return /[0-9]/.test(password) ? 'met' : 'pending'
      case 'special':
        return /[!@#$%^&*]/.test(password) ? 'met' : 'pending'
      case 'no spaces':
        return !/\s/.test(password) ? 'met' : 'pending'
      default:
        return null
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!password || !confirmPassword) {
      toast.error('Please enter and confirm your new password')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    // Validate against policy
    const requirements = [
      { label: '10 characters', status: getRequirementStatus('10 characters') },
      { label: 'uppercase letter', status: getRequirementStatus('uppercase') },
      { label: 'lowercase letter', status: getRequirementStatus('lowercase') },
      { label: 'number', status: getRequirementStatus('number') },
      { label: 'special character (!@#$%^&*)', status: getRequirementStatus('special') },
      { label: 'no spaces', status: getRequirementStatus('no spaces') },
    ]

    const unmet = requirements.filter(r => r.status !== 'met')
    if (unmet.length > 0) {
      toast.error('Password does not meet all requirements')
      return
    }

    setLoading(true)

    try {
      await apiClient.resetPassword(token, password)
      toast.success('Password reset successfully')
      navigate('/login')
    } catch (err) {
      toast.error(err.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="max-w-md w-full p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Verifying reset link...</p>
          </div>
        </div>
      </div>
    )
  }

  const handleResend = async (e) => {
    e.preventDefault()
    if (!resendInput.trim()) {
      toast.error('Please enter your username or email')
      return
    }
    setResending(true)
    try {
      await apiClient.resendResetToken(resendInput.trim())
      setResendSuccess(true)
      toast.success('If an account exists, a reset email will be sent')
    } catch (err) {
      toast.error(err.message || 'Failed to resend reset email')
    } finally {
      setResending(false)
    }
  }

  if (!validToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="max-w-md w-full p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
          {resendSuccess ? (
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Check Your Email
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                If an account matches that username/email, a reset link will be sent.
              </p>
              <Link
                to="/login"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Back to Login
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 mb-4">
                  <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Invalid Link
                </h1>
                <p className="text-gray-500 dark:text-gray-400">
                  This password reset link is invalid or has expired.
                </p>
              </div>
              <form onSubmit={handleResend} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Username or Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={resendInput}
                      onChange={(e) => setResendInput(e.target.value)}
                      placeholder="Enter your username or email"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={resending}
                  className="w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {resending ? (
                    <span className="flex items-center">
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                      Sending...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Resend Reset Link
                    </span>
                  )}
                </button>
              </form>
              <div className="mt-4 text-center">
                <Link
                  to="/login"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Back to Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="max-w-md w-full p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Reset Password
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Enter your new password for <strong>{username}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              New Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Enter new password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="Confirm new password"
            />
          </div>

          {/* Password Requirements */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password must contain:
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Requirement label="At least 10 characters" status={getRequirementStatus('10 characters')} />
              <Requirement label="At least one uppercase letter" status={getRequirementStatus('uppercase')} />
              <Requirement label="At least one lowercase letter" status={getRequirementStatus('lowercase')} />
              <Requirement label="At least one number" status={getRequirementStatus('number')} />
              <Requirement label="One special character (!@#$%^&*)" status={getRequirementStatus('special')} />
              <Requirement label="No spaces allowed" status={getRequirementStatus('no spaces')} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  )
}

function Requirement({ label, status }) {
  if (status === null) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <XCircle className="h-4 w-4" />
        <span>{label}</span>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
        <XCircle className="h-4 w-4" />
        <span>{label}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
      <CheckCircle className="h-4 w-4" />
      <span>{label}</span>
    </div>
  )
}

export default ResetPassword