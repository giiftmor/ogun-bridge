import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User,
  Key,
  Users,
  Shield,
  Clock,
  Mail,
  Settings,
  Trash2,
  Play,
  Cloud,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { SkeletonCard } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'
import { translateError } from '@/utils/errorTranslator'

const SERVICE_ICONS = {
  mail: Mail,
  vpn: Shield,
  media: Play,
  cloud: Cloud,
  key: Key,
}

export function UserDetail({ username: initialUsername, isOwnProfile = false }) {
  const [username, setUsername] = useState(initialUsername || '')
  const [activeTab, setActiveTab] = useState('profile')
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null })
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const queryClient = useQueryClient()

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers(),
    enabled: !isOwnProfile,
  })

  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ['user-profile', username],
    queryFn: () => apiClient.getUserProfile(username),
    enabled: isOwnProfile || username.length > 0,
  })

  const { data: userGroups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['user-groups', username],
    queryFn: () => apiClient.getGroups({ member: username }),
    enabled: !!username,
  })

  const { data: auditLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['user-audit', username],
    queryFn: () => apiClient.getAuditLogs({ username, limit: 50 }),
    enabled: !!username,
  })

  const forceResetMutation = useMutation({
    mutationFn: (username) => apiClient.forcePasswordReset(username),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Password reset email sent to ${data.email}`)
      } else {
        toast.error(data.error || 'Failed to send email')
      }
    },
    onError: (error) => {
      const translated = translateError(error)
      toast.error(translated.message)
    },
  })

  const inviteUserMutation = useMutation({
    mutationFn: (username) => apiClient.inviteUser(username),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Invitation sent to ${data.email || profile?.email}`)
      } else {
        toast.error(data.error || 'Failed to send invitation')
      }
    },
    onError: (error) => {
      const translated = translateError(error)
      toast.error(translated.message)
    },
  })

  const generateTempPasswordMutation = useMutation({
    mutationFn: (username) => apiClient.generateTempPassword(username),
    onSuccess: (data) => {
      if (data.success || data.email_sent) {
        toast.success(`Temporary password sent to ${data.email}`)
      } else {
        toast.error(data.message || 'Failed to generate password')
      }
    },
    onError: (error) => {
      const translated = translateError(error)
      toast.error(translated.message)
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: () => apiClient.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
    onSuccess: () => {
      toast.success('Password changed successfully')
      setShowPasswordDialog(false)
      resetPasswordFields()
    },
    onError: (error) => {
      const translated = translateError(error)
      toast.error(translated.message)
    },
  })

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    changePasswordMutation.mutate()
  }

  const resetPasswordFields = () => {
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  if (!isOwnProfile && !username) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Detail</h1>
          <p className="text-muted-foreground mt-2">
            Select a user to view their details, manage password, and groups
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Users</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingUsers ? (
                <div className="p-4 space-y-2">
                  <SkeletonCard />
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  {users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => setUsername(user.username)}
                      className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                        username === user.username ? 'bg-muted' : ''
                      }`}
                    >
                      <p className="font-medium text-sm">{user.name || user.username}</p>
                      <p className="text-xs text-muted-foreground">{user.username}</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="md:col-span-3">
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a user from the list to view their details</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading && username) {
    return <SkeletonCard />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {isOwnProfile ? 'My Profile' : 'User Detail'}
        </h1>
        <p className="text-muted-foreground mt-2">
          {isOwnProfile
            ? 'View your profile, services, and change your password'
            : `Manage ${profile?.name || username}'s profile, password, and groups`}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="password">
            <Key className="h-4 w-4 mr-2" />
            Password
          </TabsTrigger>
          <TabsTrigger value="groups">
            <Users className="h-4 w-4 mr-2" />
            Groups
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Clock className="h-4 w-4 mr-2" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  User Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Username</p>
                  <p className="font-medium">{profile?.username}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{profile?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium flex items-center gap-2">
                    {profile?.email || 'Not set'}
                    {profile?.email && <CheckCircle className="h-4 w-4 text-green-500" />}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Alternate Email</p>
                  <p className="font-medium flex items-center gap-2">
                    {profile?.altEmail || 'Not set'}
                    {profile?.altEmail && <CheckCircle className="h-4 w-4 text-green-500" />}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Groups</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {profile?.groups?.length > 0 ? (
                      profile.groups.map(group => (
                        <Badge key={group} variant="outline">{group}</Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">No groups</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Account Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Has Password</span>
                  {profile?.password?.hasPassword ? (
                    <Badge variant="outline" className="border-green-500 text-green-600">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />
                      None
                    </Badge>
                  )}
                </div>
                {profile?.password?.lastChanged && (
                  <div>
                    <p className="text-sm text-muted-foreground">Last Changed</p>
                    <p className="font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {new Date(profile.password.lastChanged).toLocaleDateString()}
                    </p>
                  </div>
                )}
                {profile?.created && (
                  <div>
                    <p className="text-sm text-muted-foreground">Account Created</p>
                    <p className="font-medium">
                      {new Date(profile.created).toLocaleDateString()}
                    </p>
                  </div>
                )}
                {profile?.lastLogin && (
                  <div>
                    <p className="text-sm text-muted-foreground">Last Login</p>
                    <p className="font-medium">
                      {new Date(profile.lastLogin).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {profile?.services && profile.services.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Services
                </CardTitle>
                <CardDescription>
                  Services accessible based on group membership
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {profile.services.map(service => {
                    const IconComponent = SERVICE_ICONS[service.icon] || Shield
                    return (
                      <div
                        key={service.id}
                        className={`border rounded-lg p-4 ${
                          service.hasAccess
                            ? 'border-green-200 bg-green-50 dark:bg-green-950/20'
                            : 'border-muted opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${
                              service.hasAccess
                                ? 'bg-green-100 dark:bg-green-900'
                                : 'bg-muted'
                            }`}>
                              <IconComponent className={`h-5 w-5 ${
                                service.hasAccess
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-muted-foreground'
                              }`} />
                            </div>
                            <div>
                              <p className="font-medium">{service.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {service.description}
                              </p>
                            </div>
                          </div>
                          {service.hasAccess ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        {service.hasAccess && service.url && (
                          <div className="mt-4 pt-4 border-t flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => window.open(service.url, '_blank')}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Open
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(service.url)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Password Tab */}
        <TabsContent value="password" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Password Management</CardTitle>
              <CardDescription>
                Change password, force reset, or send temporary password
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Password Status</p>
                  <p className="text-sm text-muted-foreground">
                    {profile?.password?.hasPassword ? 'Active' : 'Not set'}
                  </p>
                </div>
                {profile?.password?.hasPassword ? (
                  <Badge variant="outline" className="border-green-500 text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    None
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {isOwnProfile ? (
                  <Button onClick={() => setShowPasswordDialog(true)}>
                    <Key className="h-4 w-4 mr-2" />
                    Change Password
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setConfirmDialog({
                          open: true,
                          title: 'Force Password Reset',
                          description: `Force password reset for ${username}? This sends a reset link they can use to create a new password.`,
                          onConfirm: () => {
                            forceResetMutation.mutate(username)
                            setConfirmDialog({ open: false })
                          }
                        })
                      }}
                      disabled={forceResetMutation.isPending}
                    >
                      {forceResetMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Force Reset
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => {
                        setConfirmDialog({
                          open: true,
                          title: 'Invite User',
                          description: `Send password creation invitation to ${profile?.altEmail || profile?.email || username}?`,
                          onConfirm: () => {
                            inviteUserMutation.mutate(username)
                            setConfirmDialog({ open: false })
                          }
                        })
                      }}
                      disabled={inviteUserMutation.isPending}
                    >
                      {inviteUserMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4 mr-2" />
                      )}
                      Invite User
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setConfirmDialog({
                          open: true,
                          title: 'Generate Temporary Password',
                          description: `Generate a new temporary password for ${username} and email it to them? They will be prompted to change it on first login.`,
                          onConfirm: () => {
                            generateTempPasswordMutation.mutate(username)
                            setConfirmDialog({ open: false })
                          }
                        })
                      }}
                      disabled={generateTempPasswordMutation.isPending}
                    >
                      {generateTempPasswordMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Terminal className="h-4 w-4 mr-2" />
                      )}
                      Generate Temp Password
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Groups Tab */}
        <TabsContent value="groups" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User's Groups
              </CardTitle>
              <CardDescription>
                Groups this user belongs to
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingGroups ? (
                <SkeletonCard />
              ) : (
                <div className="space-y-4">
                  {userGroups.map(group => (
                    <div key={group.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium">{group.name}</p>
                          <p className="text-sm text-muted-foreground">{group.description}</p>
                        </div>
                        <Badge variant="outline">{group.memberCount || 0} members</Badge>
                      </div>
                      {group.services && group.services.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {group.services.map(service => (
                            <Badge key={service.id} variant="secondary">
                              {service.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {userGroups.length === 0 && (
                    <p className="text-center py-8 text-muted-foreground">
                      User does not belong to any groups
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>
                Audit logs for this user
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLogs ? (
                <SkeletonCard />
              ) : (
                <div className="space-y-4">
                  {auditLogs.map((log, index) => (
                    <div key={index} className="flex items-start gap-4 pb-4 border-b last:border-0 last:pb-0">
                      <Badge variant={log.action === 'success' ? 'success' : 'error'} className="mt-0.5">
                        {log.action}
                      </Badge>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">{log.message}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {auditLogs.length === 0 && (
                    <p className="text-center py-8 text-muted-foreground">
                      No activity found for this user
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        description={confirmDialog.description}
        loading={forceResetMutation.isPending || inviteUserMutation.isPending || generateTempPasswordMutation.isPending}
      />

      {isOwnProfile && (
        <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
              <DialogDescription>
                Enter your current password and a new password to update.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label htmlFor="oldPassword" className="text-sm font-medium">
                  Current Password
                </label>
                <Input
                  id="oldPassword"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label htmlFor="newPassword" className="text-sm font-medium">
                  New Password
                </label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 8 chars)"
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm New Password
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowPasswordDialog(false)
                resetPasswordFields()
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Change Password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
