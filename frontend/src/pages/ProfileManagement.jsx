import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { 
  User, 
  Mail, 
  Shield, 
  Key, 
  Clock, 
  CheckCircle, 
  XCircle,
  Loader2,
  Copy,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Play,
  Cloud,
  Terminal
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { SkeletonCard } from '@/components/ui/skeleton'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'
import { translateError } from '@/utils/errorTranslator'
import { RequireRole } from '@/components/RequireRole'

export function ProfileManagement() {
  const [username, setUsername] = useState('')
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null })

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers(),
  })

  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ['user-profile', username],
    queryFn: () => apiClient.getUserProfile(username),
    enabled: username.length > 0,
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
        toast.success(`Invitation sent to ${data.email || profile.email}`)
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const serviceIcons = {
    mail: Mail,
    vpn: Shield,
    media: Play,
    cloud: Cloud,
    key: Key,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile Management</h1>
        <p className="text-muted-foreground mt-2">
          View user profiles and accessible services
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* User List */}
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

        {/* Profile Details */}
        <div className="md:col-span-3 space-y-6">
          {isLoading && username && (
            <SkeletonCard />
          )}

          {profile && (
            <>
              {/* User Info */}
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
                      <p className="font-medium">{profile.username}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium">{profile.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium flex items-center gap-2">
                        {profile.email || 'Not set'}
                        {profile.email && <CheckCircle className="h-4 w-4 text-green-500" />}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Alternate Email</p>
                      <p className="font-medium flex items-center gap-2">
                        {profile.altEmail || 'Not set'}
                        {profile.altEmail && <CheckCircle className="h-4 w-4 text-green-500" />}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Groups</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {profile.groups?.length > 0 ? (
                          profile.groups.map(group => (
                            <Badge key={group} variant="ghost">{group}</Badge>
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
                      Password Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Has Password</span>
                      {profile.password?.hasPassword ? (
                        <Badge variant="success">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="danger">
                          <XCircle className="h-3 w-3 mr-1" />
                          None
                        </Badge>
                      )}
                    </div>
                    {profile.password?.lastChanged && (
                      <div>
                        <p className="text-sm text-muted-foreground">Last Changed</p>
                        <p className="font-medium flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {new Date(profile.password.lastChanged).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {profile.password?.lastReset && (
                      <div>
                        <p className="text-sm text-muted-foreground">Last Password Reset</p>
                        <p className="font-medium flex items-center gap-2">
                          <RefreshCw className="h-4 w-4" />
                          {new Date(profile.password.lastReset.timestamp).toLocaleDateString()}
                          <Badge variant="ghost" className="ml-2">
                            {profile.password.lastReset.type}
                          </Badge>
                        </p>
                      </div>
                    )}
                    {profile.password?.expires && (
                      <div>
                        <p className="text-sm text-muted-foreground">Expires</p>
                        <p className="font-medium flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          {new Date(profile.password.expires).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {profile.created && (
                      <div>
                        <p className="text-sm text-muted-foreground">Account Created</p>
                        <p className="font-medium">
                          {new Date(profile.created).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {profile.lastLogin && (
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

              {/* Services */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Your Services
                  </CardTitle>
                  <CardDescription>
                    Services you have access to based on your groups
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {profile.services?.map(service => {
                      const IconComponent = serviceIcons[service.icon] || Shield
                      return (
                        <div 
                          key={service.id}
                          className={`border rounded p-4 ${
                            service.hasAccess 
                              ? 'border-green-200 bg-green-50 dark:bg-green-950/20' 
                              : 'border-muted opacity-60'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-sm ${
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
                          
                          {service.hasAccess && (
                            <div className="mt-4 pt-4 border-t">
                              <p className="text-xs text-muted-foreground mb-2">
                                <strong>Access:</strong> {service.accessMethod}
                              </p>
                              {service.url && (
                                <div className="flex gap-2">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="flex-1"
                                    onClick={() => window.open(service.url, '_blank')}
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Open
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => copyToClipboard(service.url)}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button 
                    variant="ghost"
                    onClick={() => refetch()}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Profile
                  </Button>
                  <RequireRole roles={['admin', 'password_manager']}>
                    <Button 
                      
                      onClick={() => {
                        setConfirmDialog({
                          open: true,
                          title: 'Invite User',
                          description: `Send password creation invitation to ${profile.altEmail || profile.email || profile.username}?`,
                          onConfirm: () => {
                            inviteUserMutation.mutate(profile.username)
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
                  </RequireRole>
                  <RequireRole roles={['admin', 'password_manager']}>
                    <Button 
                      variant="ghost"
                      onClick={() => {
                        setConfirmDialog({
                          open: true,
                          title: 'Force Password Reset',
                          description: `Force password reset for ${profile.username}? This sends a reset link they can use to create a new password.`,
                          onConfirm: () => {
                            forceResetMutation.mutate(profile.username)
                            setConfirmDialog({ open: false })
                          }
                        })
                      }}
                      disabled={forceResetMutation.isPending}
                    >
                      {forceResetMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Key className="h-4 w-4 mr-2" />
                      )}
                      Force Password Reset
                    </Button>
                  </RequireRole>
                  <RequireRole roles={['admin', 'password_manager']}>
                    <Button 
                      
                      onClick={() => {
                        setConfirmDialog({
                          open: true,
                          title: 'Generate Temporary Password',
                          description: `Generate a new temporary password for ${profile.username} and email it to them? They will be prompted to change it on first login.`,
                          onConfirm: () => {
                            generateTempPasswordMutation.mutate(profile.username)
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
                  </RequireRole>
                  <Button 
                    variant="ghost"
                    onClick={() => window.open('https://auth.spectres.co.za', '_blank')}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Manage Account
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {!username && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a user from the list to view their profile</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        description={confirmDialog.description}
        loading={forceResetMutation.isPending}
      />
    </div>
  )
}
