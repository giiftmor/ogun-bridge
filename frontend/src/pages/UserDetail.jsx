import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { 
  User, 
  Mail, 
  Lock, 
  Clock, 
  Shield, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Users,
  Activity,
  RefreshCw,
  Save,
  X
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/services/api'
import toast from 'react-hot-toast'

export function UserDetail() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const [altEmail, setAltEmail] = useState('')
  const [isEditingAltEmail, setIsEditingAltEmail] = useState(false)

  const { data: userDetail, isLoading, error, refetch } = useQuery({
    queryKey: ['user-detail', username],
    queryFn: () => apiClient.getUserDetail(username),
    enabled: !!username,
  })

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', username],
    queryFn: () => apiClient.getUserProfile(username),
    enabled: !!username,
  })

  // Initialize altEmail when profile loads
  useEffect(() => {
    if (userProfile?.altEmail !== undefined && !altEmail) {
      setAltEmail(userProfile.altEmail || '')
    }
  }, [userProfile])

  const setAltEmailMutation = useMutation({
    mutationFn: ({ username, altEmail }) => apiClient.setUserAltEmail(username, altEmail),
    onSuccess: (data) => {
      toast.success(`Alt-email updated for ${username}`)
      setIsEditingAltEmail(false)
      refetch()
    },
    onError: (error) => {
      toast.error(`Failed to update alt-email: ${error.message}`)
    },
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const handleSaveAltEmail = () => {
    setAltEmailMutation.mutate({ username, altEmail: altEmail || null })
  }

  const handleCancelAltEmail = () => {
    setIsEditingAltEmail(false)
    setAltEmail(userProfile?.altEmail || '')
  }

  // Initialize altEmail when profile loads
  if (userProfile?.altEmail && !altEmail && !isEditingAltEmail) {
    setAltEmail(userProfile.altEmail)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/users')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Button>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-500">
              <XCircle className="h-5 w-5" />
              <span>Error loading user: {error.message}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!userDetail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/users')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Button>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-5 w-5" />
              <span>User not found</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { authentik, ldap, password, syncStatus, recentChanges } = userDetail

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/users')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{username}</h1>
            <p className="text-muted-foreground">User Profile & Details</p>
          </div>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Sync Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                  <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Authentik</p>
                  <p className="font-medium">{syncStatus.inAuthentik ? 'Exists' : 'Not Found'}</p>
                </div>
              </div>
              {syncStatus.inAuthentik ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                  <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">LDAP</p>
                  <p className="font-medium">{syncStatus.inLDAP ? 'Exists' : 'Not Found'}</p>
                </div>
              </div>
              {syncStatus.inLDAP ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                  <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sync Status</p>
                  <p className="font-medium">{syncStatus.synced ? 'Synced' : 'Not Synced'}</p>
                </div>
              </div>
              <Badge variant={syncStatus.synced ? 'success' : 'destructive'}>
                {syncStatus.synced ? 'Synced' : 'Not Synced'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Authentik Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Authentik
            </CardTitle>
            <CardDescription>User information from Authentik</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {authentik ? (
              <>
                <DetailRow label="User ID" value={authentik.pk} />
                <DetailRow label="Username" value={username} />
                <DetailRow label="Email" value={authentik.email} />
                <DetailRow label="Display Name" value={authentik.name || '-'} />
                <DetailRow 
                  label="Status" 
                  value={authentik.is_active ? 'Active' : 'Inactive'}
                  badge={authentik.is_active ? 'success' : 'destructive'}
                />
                <DetailRow 
                  label="Last Login" 
                  value={authentik.last_login ? new Date(authentik.last_login).toLocaleString() : 'Never'}
                />
                <DetailRow 
                  label="Password Changed" 
                  value={authentik.password_change_date 
                    ? new Date(authentik.password_change_date).toLocaleDateString()
                    : 'Never'
                  }
                />
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <XCircle className="h-4 w-4" />
                <span>User not found in Authentik</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* LDAP Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              LDAP
            </CardTitle>
            <CardDescription>User information from LDAP</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ldap ? (
              <>
                <DetailRow label="UID" value={ldap.uid} />
                <DetailRow label="DN" value={ldap.dn} />
                <DetailRow label="Email" value={ldap.mail} />
                
                {/* Alt Email - Editable */}
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Alternate Email (for password invites)</p>
                  {isEditingAltEmail ? (
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        value={altEmail}
                        onChange={(e) => setAltEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveAltEmail}
                        disabled={setAltEmailMutation.isPending}
                      >
                        {setAltEmailMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleCancelAltEmail}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={userProfile?.altEmail ? 'font-medium' : 'text-muted-foreground'}>
                          {userProfile?.altEmail || 'Not set'}
                        </span>
                        {userProfile?.altEmail && (
                          <Badge variant="success" className="text-xs">Active</Badge>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setIsEditingAltEmail(true)}>
                        Edit
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Password invitation emails will be sent here
                  </p>
                </div>
                
                <DetailRow label="Common Name" value={ldap.cn} />
                <DetailRow label="Surname" value={ldap.sn} />
                
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Groups</p>
                  <div className="flex flex-wrap gap-2">
                    {ldap.memberOf?.length > 0 ? (
                      ldap.memberOf.map((group) => (
                        <Badge key={group} variant="outline">
                          {group}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">No groups</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <XCircle className="h-4 w-4" />
                <span>User not found in LDAP</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Password Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Password Status
            </CardTitle>
            <CardDescription>Password information and history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DetailRow 
              label="Expiration" 
              value={password.expiration 
                ? new Date(password.expiration).toLocaleDateString()
                : 'No expiration'
              }
              badge={password.expiration ? (
                new Date(password.expiration) > new Date() ? 'success' : 'destructive'
              ) : null
              }
            />
            
            {password.expiration && new Date(password.expiration) > new Date() && (
              <DetailRow 
                label="Days Remaining" 
                value={`${Math.ceil((new Date(password.expiration) - new Date()) / (1000 * 60 * 60 * 24))} days`}
              />
            )}

            <div>
              <p className="text-sm text-muted-foreground mb-2">Recent Password Changes</p>
              <div className="space-y-2">
                {password.history?.length > 0 ? (
                  password.history.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm p-2 border rounded">
                      <div className="flex items-center gap-2">
                        {item.success ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-muted-foreground">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {item.ldap === 'success' && (
                          <Badge variant="outline" className="text-xs">LDAP</Badge>
                        )}
                        {item.authentik === 'success' && (
                          <Badge variant="outline" className="text-xs">Authentik</Badge>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">No password history</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Recent changes and events</CardDescription>
          </CardHeader>
          <CardContent>
            {recentChanges?.length > 0 ? (
              <div className="space-y-2">
                {recentChanges.map((change, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm p-2 border rounded">
                    <div>
                      <p className="font-medium">{change.action}</p>
                      <p className="text-xs text-muted-foreground">
                        by {change.actor} • {change.source}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {change.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(change.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DetailRow({ label, value, badge }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <p className="font-medium">{value}</p>
        {badge && <Badge variant={badge}>{value}</Badge>}
      </div>
    </div>
  )
}
