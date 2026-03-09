import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { 
  Shield, 
  Lock, 
  Clock, 
  CheckCircle, 
  XCircle,
  Loader2,
  KeyRound
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'

const EXPIRATION_OPTIONS = [
  { value: null, label: 'No expiration' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year' },
]

export function PasswordManagement() {
  const [username, setUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validation, setValidation] = useState(null)
  const [expirationDays, setExpirationDays] = useState(null)

  const { data: policy } = useQuery({
    queryKey: ['password-policy'],
    queryFn: apiClient.getPasswordPolicy,
  })

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers(),
  })

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['password-history', username],
    queryFn: () => apiClient.getPasswordHistory(username),
    enabled: !!username,
  })

  const { data: expiration, refetch: refetchExpiration } = useQuery({
    queryKey: ['password-expiration', username],
    queryFn: () => apiClient.getPasswordExpiration(username),
    enabled: !!username,
  })

  const syncMutation = useMutation({
    mutationFn: ({ username, password, expirationDays }) => 
      apiClient.syncPassword(username, password, expirationDays),
    onSuccess: () => {
      refetchHistory()
      refetchExpiration()
      setNewPassword('')
      setConfirmPassword('')
      setValidation(null)
    },
  })

  const validateMutation = useMutation({
    mutationFn: (password) => apiClient.validatePassword(password),
    onSuccess: (data) => {
      setValidation(data)
    },
  })

  useEffect(() => {
    if (newPassword.length > 0) {
      const timer = setTimeout(() => {
        validateMutation.mutate(newPassword)
      }, 300)
      return () => clearTimeout(timer)
    } else {
      setValidation(null)
    }
  }, [newPassword])

  const handleSubmit = (e) => {
    e.preventDefault()
    
    if (!username || !newPassword) {
      toast.error('Please enter username and password')
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

    syncMutation.mutate({ username, password: newPassword, expirationDays })
  }

  const getRequirementStatus = (requirement) => {
    if (!newPassword) return null
    if (!validation) return 'pending'
    
    const met = !validation.errors.some(e => e.toLowerCase().includes(requirement))
    return met ? 'met' : 'failed'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Password Management Center</h1>
        <p className="text-muted-foreground mt-2">
          Set and sync passwords across LDAP and Authentik (Admin)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Set Password (Admin)
            </CardTitle>
            <CardDescription>
              Enter a username and password to sync to both LDAP and Authentik
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Username</label>
                <Select value={username} onValueChange={setUsername}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={loadingUsers ? "Loading users..." : "Select a user"} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.username}>
                        {user.username} ({user.email || 'no email'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">New Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Confirm Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Password Expiration</label>
                <Select value={expirationDays?.toString() || 'null'} onValueChange={(val) => setExpirationDays(val === 'null' ? null : parseInt(val))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select expiration" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value ?? 'null'} value={opt.value?.toString() ?? 'null'}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <div className="text-sm text-red-500 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Passwords do not match
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full"
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Sync Password
                  </>
                )}
              </Button>

              {syncMutation.isSuccess && (
                <div className="text-sm text-green-600 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Password synced successfully!
                </div>
              )}

              {syncMutation.isError && (
                <div className="text-sm text-red-500 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  {syncMutation.error.message}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Password Requirements
            </CardTitle>
            <CardDescription>
              Password must meet the following criteria
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Requirement 
                label="Minimum 8 characters"
                status={getRequirementStatus('8 characters')}
              />
              <Requirement 
                label="At least one uppercase letter"
                status={getRequirementStatus('uppercase')}
              />
              <Requirement 
                label="At least one lowercase letter"
                status={getRequirementStatus('lowercase')}
              />
              <Requirement 
                label="At least one number"
                status={getRequirementStatus('number')}
              />
            </div>

            {validation?.valid && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Password meets all requirements</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {username && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Password Expiration
            </CardTitle>
            <CardDescription>
              Current password expiration status for {username}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {expiration ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-medium">
                    Expires: {new Date(expiration.expiration).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {expiration.expires 
                      ? `${Math.ceil((new Date(expiration.expiration) - new Date()) / (1000 * 60 * 60 * 24))} days remaining`
                      : 'Password has expired'
                    }
                  </p>
                </div>
                <Badge variant={expiration.expires ? 'success' : 'destructive'}>
                  {expiration.expires ? 'Active' : 'Expired'}
                </Badge>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle className="h-4 w-4" />
                <span>No expiration set</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Password History
          </CardTitle>
          <CardDescription>
            Recent password changes for {username || 'selected user'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!username ? (
            <div className="text-center py-8 text-muted-foreground">
              Enter a username above to view password history
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No password history found for this user
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {item.success ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <div className="font-medium">
                        {item.changes?.ldap === 'success' ? 'LDAP + ' : ''}
                        {item.changes?.authentik === 'success' ? 'Authentik' : ''}
                        {item.changes?.authentik === 'skipped' ? 'LDAP only (Authentik skipped)' : ''}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(item.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <Badge variant={item.success ? 'success' : 'destructive'}>
                    {item.success ? 'Success' : 'Failed'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Requirement({ label, status }) {
  if (status === null) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="w-5 h-5 rounded-full border-2" />
        <span>{label}</span>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span>{label}</span>
      </div>
    )
  }

  if (status === 'met') {
    return (
      <div className="flex items-center gap-3 text-green-600 dark:text-green-400">
        <CheckCircle className="w-5 h-5" />
        <span>{label}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 text-red-500">
      <XCircle className="w-5 h-5" />
      <span>{label}</span>
    </div>
  )
}
