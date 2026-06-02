import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Lock,
  CheckCircle,
  XCircle,
  Loader2,
  KeyRound,
  Shield
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter'

export function SelfServicePasswordChange() {
  const [username, setUsername] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validation, setValidation] = useState(null)

  const validateMutation = useMutation({
    mutationFn: (password) => apiClient.validatePassword(password),
    onSuccess: (data) => {
      setValidation(data)
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: ({ username, currentPassword, newPassword }) =>
      apiClient.changePassword(username, currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setValidation(null)
    },
  })

  const handlePasswordInput = (value, setter) => {
    setter(value)
    if (value.length > 0) {
      const timer = setTimeout(() => {
        validateMutation.mutate(value)
      }, 300)
      return () => clearTimeout(timer)
    } else {
      setValidation(null)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!username || !currentPassword || !newPassword) {
      toast.error('Please enter username, current password, and new password')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (validation && !validation.valid) {
      toast.error('Password does not meet requirements')
      return
    }

    changePasswordMutation.mutate({ username, currentPassword, newPassword })
  }

  return (
    <div className="min-h-screen bg-page p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-accent-tint mb-3">
            <Shield className="h-6 w-6 text-accent" />
          </div>
          <h1 className="text-[20px] font-medium text-primary">Change Your Password</h1>
          <p className="text-[13px] text-secondary mt-1">
            Enter your credentials to change your password
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Self Service Password Change
              </CardTitle>
              <CardDescription>
                Your password will be updated in LDAP and Authentik
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-[12px] font-medium text-secondary">Username</label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="mt-1"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="text-[12px] font-medium text-secondary">Current Password</label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="mt-1"
                    autoComplete="current-password"
                  />
                </div>

                <div>
                  <label className="text-[12px] font-medium text-secondary">New Password</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => handlePasswordInput(e.target.value, setNewPassword)}
                    placeholder="Enter new password"
                    className="mt-1"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="text-[12px] font-medium text-secondary">Confirm New Password</label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="mt-1"
                    autoComplete="new-password"
                  />
                </div>

                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <div className="text-[13px] text-danger-text flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Passwords do not match
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={changePasswordMutation.isPending}>
                  {changePasswordMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Changing Password...</>
                  ) : (
                    <><KeyRound className="h-4 w-4 mr-2" />Change Password</>
                  )}
                </Button>

                {changePasswordMutation.isSuccess && (
                  <div className="text-[13px] text-success-text flex items-center gap-2 bg-success-bg p-3 rounded-sm">
                    <CheckCircle className="h-4 w-4" />
                    Password changed successfully! You can now log in with your new password.
                  </div>
                )}

                {changePasswordMutation.isError && (
                  <div className="text-[13px] text-danger-text flex items-center gap-2 bg-danger-bg p-3 rounded-sm">
                    <XCircle className="h-4 w-4" />
                    {changePasswordMutation.error.message}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Security
              </CardTitle>
              <CardDescription>
                Ensure your password is secure and strong
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PasswordStrengthMeter password={newPassword} />
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-[13px] text-secondary mt-6">
          Need help? Contact your system administrator.
        </p>
      </div>
    </div>
  )
}


