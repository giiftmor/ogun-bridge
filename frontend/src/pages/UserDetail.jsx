import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User, Key, Users, Shield, Clock, Mail,
  CheckCircle, XCircle, ExternalLink, Copy, Loader2, RefreshCw,
  Terminal, Search, Plus, Server, Play, Cloud, Network,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { SkeletonCard } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'
import { translateError } from '@/utils/errorTranslator'

const SERVICE_ICONS = { mail: Mail, vpn: Shield, media: Play, cloud: Cloud, key: Key }

export function UserDetail({ username: initialUsername, isOwnProfile = false }) {
  const [username] = useState(initialUsername || '')
  const [activeTab, setActiveTab] = useState('profile')
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null })
  const [verifyPassword, setVerifyPassword] = useState('')
  const [verifyResult, setVerifyResult] = useState(null)
  const [showAddService, setShowAddService] = useState(false)
  const [selectedService, setSelectedService] = useState('')
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', username],
    queryFn: () => apiClient.getUserProfile(username),
    enabled: !!username,
  })

  const { data: userGroups = [] } = useQuery({
    queryKey: ['user-groups', username],
    queryFn: () => apiClient.getGroups({ member: username }),
    enabled: !!username,
  })

  const { data: passwordHistory = [] } = useQuery({
    queryKey: ['password-history', username],
    queryFn: () => apiClient.getPasswordHistory(username),
    enabled: !!username,
  })

  const { data: allServices = [] } = useQuery({
    queryKey: ['services-list'],
    queryFn: () => apiClient.getServicesList(),
  })

  const { data: expiration } = useQuery({
    queryKey: ['password-expiration', username],
    queryFn: () => apiClient.getPasswordExpiration(username),
    enabled: !!username,
  })

  const forceResetMutation = useMutation({
    mutationFn: (u) => apiClient.forcePasswordReset(u),
    onSuccess: (data) => {
      if (data.success) toast.success(`Password reset email sent to ${data.email}`)
      else toast.error(data.error || 'Failed to send email')
    },
    onError: (error) => toast.error(translateError(error).message),
  })

  const inviteUserMutation = useMutation({
    mutationFn: (u) => apiClient.inviteUser(u),
    onSuccess: (data) => {
      if (data.success) toast.success(`Invitation sent to ${data.email || profile?.email}`)
      else toast.error(data.error || 'Failed to send invitation')
    },
    onError: (error) => toast.error(translateError(error).message),
  })

  const generateTempPasswordMutation = useMutation({
    mutationFn: (u) => apiClient.generateTempPassword(u),
    onSuccess: (data) => {
      if (data.success || data.email_sent) toast.success(`Temporary password sent to ${data.email}`)
      else toast.error(data.message || 'Failed to generate password')
    },
    onError: (error) => toast.error(translateError(error).message),
  })

  const addUserToGroupMutation = useMutation({
    mutationFn: ({ uname, groupName }) => apiClient.addUserToGroup(uname, groupName),
    onSuccess: (data) => {
      toast.success(data.message)
      setShowAddService(false)
      setSelectedService('')
      queryClient.invalidateQueries(['user-groups', username])
      queryClient.invalidateQueries(['user-profile', username])
    },
    onError: (error) => toast.error(error.message),
  })

  const verifyMutation = useMutation({
    mutationFn: ({ uname, password }) => apiClient.verifyLdapPassword(uname, password),
    onSuccess: (data) => setVerifyResult(data),
    onError: (error) => setVerifyResult({ valid: false, message: error.message }),
  })

  const handleVerify = (e) => {
    e.preventDefault()
    if (username && verifyPassword) verifyMutation.mutate({ uname: username, password: verifyPassword })
  }

  const handleAddServiceSubmit = () => {
    const svc = allServices.find(s => s.id.toString() === selectedService)
    if (!svc || !svc.groups?.length) { toast.error('No groups found for this service'); return }
    svc.groups.forEach(groupName => addUserToGroupMutation.mutate({ uname: username, groupName }))
    queryClient.invalidateQueries(['user-profile', username])
  }

  const copyToClipboard = (text) => { navigator.clipboard.writeText(text); toast.success('Copied to clipboard') }

  const serviceOptions = allServices
    .filter(s => !profile?.services?.some(ps => ps.name === s.service_name))

  if (!username) return null
  if (isLoading) return <SkeletonCard />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{isOwnProfile ? 'My Profile' : username}</h1>
        <p className="text-muted-foreground mt-2">
          {isOwnProfile ? 'View your profile and manage your account' : `Manage ${username}'s profile`}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile"><User className="h-4 w-4 mr-2" />Profile</TabsTrigger>
          <TabsTrigger value="password"><Key className="h-4 w-4 mr-2" />Password</TabsTrigger>
          <TabsTrigger value="services"><Server className="h-4 w-4 mr-2" />Services</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <User className="h-6 w-6 text-primary" />
                <span>{profile?.name || username}</span>
                <Badge variant={profile?.password?.hasPassword ? 'default' : 'secondary'} className="ml-auto">
                  {profile?.password?.hasPassword ? 'Active' : 'No Password'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <DetailRow label="Username" value={profile?.username} />
                  <DetailRow label="Employee Number" value={profile?.employeeNumber} />
                  <DetailRow label="Email" value={profile?.email} />
                  <DetailRow label="Alternate Email" value={profile?.altEmail} />
                </div>
                <div className="space-y-3">
                  <DetailRow label="Status" value={
                    <Badge variant={profile?.password?.hasPassword ? 'default' : 'secondary'}>
                      {profile?.password?.hasPassword ? 'Active' : 'Inactive'}
                    </Badge>
                  } />
                  <DetailRow label="Last Password Change" value={
                    profile?.password?.lastChanged ? new Date(profile.password.lastChanged).toLocaleDateString() : 'N/A'
                  } />
                  <DetailRow label="Account Created" value={
                    profile?.created ? new Date(profile.created).toLocaleDateString() : 'N/A'
                  } />
                  <DetailRow label="Last Login" value={
                    profile?.lastLogin ? new Date(profile.lastLogin).toLocaleDateString() : 'N/A'
                  } />
                </div>
              </div>
              {profile?.groups?.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <p className="text-sm font-medium mb-3">Groups</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.groups.map(group => <Badge key={group} variant="ghost">{group}</Badge>)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Password Management</CardTitle>
              <CardDescription>Manage password for {username}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded">
                <div>
                  <p className="font-medium">Password Status</p>
                  <p className="text-sm text-muted-foreground">{profile?.password?.hasPassword ? 'Active' : 'Not set'}</p>
                </div>
                {profile?.password?.hasPassword
                  ? <Badge variant="ghost" className="border-green-500 text-green-600"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>
                  : <Badge variant="danger"><XCircle className="h-3 w-3 mr-1" />None</Badge>}
              </div>
              {expiration && (
                <div className="p-4 border rounded">
                  <p className="text-sm font-medium">Expiration</p>
                  <p className="text-sm text-muted-foreground">
                    Expires: {new Date(expiration.expiration).toLocaleDateString()}
                    {expiration.expires && ` (${Math.ceil((new Date(expiration.expiration) - new Date()) / (1000 * 60 * 60 * 24))} days remaining)`}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {!isOwnProfile && (
                  <>
                    <Button variant="ghost" onClick={() => setConfirmDialog({
                      open: true, title: 'Force Password Reset',
                      description: `Force password reset for ${username}?`,
                      onConfirm: () => { forceResetMutation.mutate(username); setConfirmDialog({ open: false }) }
                    })} disabled={forceResetMutation.isPending}>
                      {forceResetMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Force Reset
                    </Button>
                    <Button onClick={() => setConfirmDialog({
                      open: true, title: 'Invite User',
                      description: `Send invitation to ${profile?.altEmail || profile?.email || username}?`,
                      onConfirm: () => { inviteUserMutation.mutate(username); setConfirmDialog({ open: false }) }
                    })} disabled={inviteUserMutation.isPending}>
                      {inviteUserMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                      Invite User
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmDialog({
                      open: true, title: 'Generate Temporary Password',
                      description: `Generate temp password for ${username}?`,
                      onConfirm: () => { generateTempPasswordMutation.mutate(username); setConfirmDialog({ open: false }) }
                    })} disabled={generateTempPasswordMutation.isPending}>
                      {generateTempPasswordMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Terminal className="h-4 w-4 mr-2" />}
                      Generate Temp PW
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Password Verification</CardTitle>
              <CardDescription>Test if the LDAP password is valid</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input type="password" value={verifyPassword} onChange={(e) => setVerifyPassword(e.target.value)} placeholder="Enter password to verify" />
                </div>
                <Button type="submit" variant="ghost" disabled={!verifyPassword || verifyMutation.isPending}>
                  {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}Verify
                </Button>
              </form>
              {verifyResult && (
                <div className={`mt-3 p-3 rounded-sm flex items-center gap-2 ${
                  verifyResult.valid ? 'bg-green-50 dark:bg-green-950 text-green-700' : 'bg-red-50 dark:bg-red-950 text-red-700'
                }`}>
                  {verifyResult.valid ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <span className="text-sm font-medium">{verifyResult.message}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Password History</CardTitle>
              <CardDescription>Recent password changes</CardDescription>
            </CardHeader>
            <CardContent>
              {passwordHistory.length === 0
                ? <p className="text-center py-8 text-muted-foreground">No password history</p>
                : <div className="space-y-3">
                    {passwordHistory.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 border rounded-sm">
                        <div className="flex items-center gap-3">
                          {item.success ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                          <div>
                            <div className="font-medium text-sm">
                              {item.changes?.ldap === 'success' ? 'LDAP + ' : ''}
                              {item.changes?.authentik === 'success' ? 'Authentik' : ''}
                            </div>
                            <div className="text-xs text-muted-foreground">{new Date(item.timestamp).toLocaleString()}</div>
                          </div>
                        </div>
                        <Badge variant={item.success ? 'success' : 'destructive'}>{item.success ? 'Success' : 'Failed'}</Badge>
                      </div>
                    ))}
                  </div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="space-y-6">
          {profile?.services?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Assigned Services</CardTitle>
                <CardDescription>Services accessible based on group membership</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {profile.services.map(service => {
                    const IconComponent = SERVICE_ICONS[service.icon] || Shield
                    return (
                      <div key={service.id} className={`border rounded p-4 ${service.hasAccess ? 'border-green-200 bg-green-50 dark:bg-green-950/20' : 'border-muted opacity-60'}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-sm ${service.hasAccess ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'}`}>
                              <IconComponent className={`h-5 w-5 ${service.hasAccess ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                            </div>
                            <div>
                              <p className="font-medium">{service.name}</p>
                              <p className="text-sm text-muted-foreground">{service.description}</p>
                            </div>
                          </div>
                          {service.hasAccess ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        {service.hasAccess && service.url && (
                          <div className="mt-4 pt-4 border-t flex gap-2">
                            <Button variant="ghost" size="sm" className="flex-1" onClick={() => window.open(service.url, '_blank')}>
                              <ExternalLink className="h-3 w-3 mr-1" />Open
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(service.url)}>
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

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Network className="h-5 w-5" />Add to Groove</CardTitle>
                  <CardDescription>Grant service access by adding user to the required group</CardDescription>
                </div>
                <Button size="sm" onClick={() => setShowAddService(true)}><Plus className="h-4 w-4 mr-2" />Assign Service</Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Select a service to add {username} to the groups that grant access.</p>
            </CardContent>
          </Card>

          {showAddService && (
            <Card>
              <CardHeader>
                <CardTitle>Assign Service to User</CardTitle>
                <CardDescription>Select a service to add {username} to the required groups</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Select value={selectedService} onValueChange={setSelectedService}>
                    <SelectTrigger><SelectValue placeholder="Select a service..." /></SelectTrigger>
                    <SelectContent>
                      {serviceOptions.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.service_name} <span className="text-xs text-muted-foreground">({s.groups?.length || 0} groups)</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button onClick={handleAddServiceSubmit} disabled={!selectedService || addUserToGroupMutation.isPending}>
                      {addUserToGroupMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Add to Groups
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowAddService(false); setSelectedService('') }}>Cancel</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {userGroups.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Group Memberships</CardTitle>
                <CardDescription>Groups this user belongs to</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {userGroups.map(group => (
                    <div key={group.id} className="border rounded p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium">{group.name}</p>
                          <p className="text-sm text-muted-foreground">{group.description}</p>
                        </div>
                        <Badge variant="ghost">{group.memberCount || 0} members</Badge>
                      </div>
                      {group.services?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {group.services.map(svc => <Badge key={svc.id} variant="neutral">{svc.name}</Badge>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
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
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-start py-1">
      <span className="text-sm text-muted-foreground">{label}:</span>
      <span className="text-sm font-medium text-right">{value || 'N/A'}</span>
    </div>
  )
}
