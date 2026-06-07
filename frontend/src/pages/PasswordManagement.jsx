import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { 
  Shield, 
  Lock, 
  Clock, 
  CheckCircle, 
  XCircle,
  Loader2,
  KeyRound,
  Search,
  AlertCircle
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'
import { RequireRole } from '@/components/RequireRole'

const EXPIRATION_OPTIONS = [
  { value: null, label: 'No expiration' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year' },
]

export function PasswordManagement() {
  const [selectedUser, setSelectedUser] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validation, setValidation] = useState(null)
  const [expirationDays, setExpirationDays] = useState(null)
  const [verifyPassword, setVerifyPassword] = useState('')
  const [verifyResult, setVerifyResult] = useState(null)

  const { data: policy } = useQuery({
    queryKey: ['password-policy'],
    queryFn: () => apiClient.getPasswordPolicy(),
  })

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => apiClient.getUsersList(),
  })

  const { data: expiration, refetch: refetchExpiration } = useQuery({
    queryKey: ['password-expiration', selectedUser],
    queryFn: () => apiClient.getPasswordExpiration(selectedUser),
    enabled: !!selectedUser,
  })

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['password-history', selectedUser],
    queryFn: () => apiClient.getPasswordHistory(selectedUser),
    enabled: !!selectedUser,
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
      toast.success('Password synced successfully!')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const validateMutation = useMutation({
    mutationFn: (password) => apiClient.validatePassword(password),
    onSuccess: (data) => {
      setValidation(data)
    },
  })

  const verifyMutation = useMutation({
    mutationFn: ({ username, password }) => apiClient.verifyLdapPassword(username, password),
    onSuccess: (data) => {
      setVerifyResult(data)
    },
    onError: (error) => {
      setVerifyResult({ valid: false, message: error.message })
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

  const handleSync = (e) => {
    e.preventDefault()
    
    if (!selectedUser || !newPassword) {
      toast.error('Please select a user and enter a password')
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

    syncMutation.mutate({ username: selectedUser, password: newPassword, expirationDays })
  }

  const handleVerify = (e) => {
    e.preventDefault()
    if (selectedUser && verifyPassword) {
      verifyMutation.mutate({ username: selectedUser, password: verifyPassword })
    }
  }

  const getRequirementStatus = (requirement) => {
    if (!newPassword) return null
    
    switch (requirement) {
      case '10 characters':
        return newPassword.length >= 10 ? 'met' : 'pending'
      case 'uppercase':
        return /[A-Z]/.test(newPassword) ? 'met' : 'pending'
      case 'lowercase':
        return /[a-z]/.test(newPassword) ? 'met' : 'pending'
      case 'number':
        return /[0-9]/.test(newPassword) ? 'met' : 'pending'
      case 'special':
        return /[!@#$%^&*]/.test(newPassword) ? 'met' : 'pending'
      case 'no spaces':
        return !/\s/.test(newPassword) ? 'met' : 'pending'
      default:
        if (!validation) return 'pending'
        const met = !validation.errors.some(e => e.toLowerCase().includes(requirement))
        return met ? 'met' : 'pending'
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Password Management Center</h1>
        <p className="text-muted-foreground mt-2">
          Set and sync passwords across LDAP and Authentik (Admin)
        </p>
      </div>

      {/* User Selection - Above Tabs */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="w-full sm:w-72">
              <label className="text-sm font-medium mb-2 block">Select User</label>
              <Select 
                value={selectedUser || ""} 
                onValueChange={(val) => {
                  setSelectedUser(val === "" ? "" : val)
                  setVerifyResult(null)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">-- Select a user --</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.username}>
                      {user.username} ({user.email || 'no email'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!selectedUser && (
              <div className="flex items-center gap-2 text-muted-foreground mt-4 sm:mt-6">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Select a user to manage their password</span>
              </div>
            )}
            {selectedUser && (
              <div className="mt-4 sm:mt-6">
                <Badge variant="ghost" className="text-sm px-3 py-1">
                  Managing password for: <span className="font-semibold">{selectedUser}</span>
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="set" className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="w-full min-w-[400px] grid grid-cols-3">
          <TabsTrigger value="set" className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            <span className="hidden sm:inline">Set Password</span>
          </TabsTrigger>
          <TabsTrigger value="verify" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Verification</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
        </TabsList>
        </div>

        {/* Tab 1: Set Password */}
        <TabsContent value="set" className="space-y-4">
          {!selectedUser ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a user above to set their password
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5" />
                    Set Password (Admin)
                  </CardTitle>
                  <CardDescription>
                    Enter a new password to sync to LDAP and Authentik
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSync} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Username</label>
                      <Input
                        value={selectedUser}
                        disabled
                        className="mt-1 bg-muted"
                      />
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

                    <RequireRole roles={['admin', 'password_manager']}>
                      <div>
                        <label className="text-sm font-medium">Password Expiration</label>
                        <Select 
                          value={expirationDays?.toString() || 'null'} 
                          onValueChange={(val) => setExpirationDays(val === 'null' ? null : parseInt(val))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
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
                    </RequireRole>

                    {newPassword && confirmPassword && newPassword !== confirmPassword && (
                      <div className="text-sm text-red-500 flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Passwords do not match
                      </div>
                    )}

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

                    <RequireRole roles={['admin', 'password_manager']}>
                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={syncMutation.isPending || !newPassword || !confirmPassword}
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
                    </RequireRole>
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
                      label="Minimum 10 characters"
                      status={getRequirementStatus('10 characters')}
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
                    <Requirement 
                      label="One special character (!@#$%^&*)"
                      status={getRequirementStatus('special')}
                    />
                    <Requirement 
                      label="No spaces allowed"
                      status={getRequirementStatus('no spaces')}
                    />
                  </div>

                  {validation?.valid && newPassword && (
                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 rounded-sm flex items-center gap-2 text-green-700 dark:text-green-300">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm">Password meets all requirements</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Verification */}
        <TabsContent value="verify" className="space-y-4">
          {!selectedUser ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a user above to verify their password
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Quick Password Verification
                  </CardTitle>
                  <CardDescription>
                    Test if the user's LDAP password is valid
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleVerify} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Username</label>
                      <Input
                        value={selectedUser}
                        disabled
                        className="mt-1 bg-muted"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Password to Verify</label>
                      <Input
                        type="password"
                        value={verifyPassword}
                        onChange={(e) => setVerifyPassword(e.target.value)}
                        placeholder="Enter password to verify"
                        className="mt-1"
                      />
                    </div>

                    <Button
                      type="submit"
                      variant="ghost"
                      className="w-full"
                      disabled={!verifyPassword || verifyMutation.isPending}
                    >
                      {verifyMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4 mr-2" />
                          Verify Password
                        </>
                      )}
                    </Button>

                    {verifyResult && (
                      <div className={`p-3 rounded-sm flex items-center gap-2 ${
                        verifyResult.valid
                          ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'
                          : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                      }`}>
                        {verifyResult.valid ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        <span className="text-sm font-medium">{verifyResult.message}</span>
                      </div>
                    )}
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Password Expiration
                  </CardTitle>
                  <CardDescription>
                    Current password expiration status for {selectedUser}
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
            </div>
          )}
        </TabsContent>

        {/* Tab 3: History */}
        <TabsContent value="history" className="space-y-4">
          {!selectedUser ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a user above to view their password history
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Password History
                </CardTitle>
                <CardDescription>
                  Recent password changes for {selectedUser}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No password history found for this user
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 border rounded-sm">
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
          )}
        </TabsContent>
      </Tabs>
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