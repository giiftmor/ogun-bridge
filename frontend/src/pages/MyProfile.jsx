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
  RefreshCw,
  ExternalLink,
  Copy,
  Play,
  Cloud,
  Terminal
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SkeletonCard } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'
import { translateError } from '@/utils/errorTranslator'

export function MyProfile() {
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const username = JSON.parse(localStorage.getItem('user') || '{}').username

  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ['my-profile', username],
    queryFn: () => apiClient.getUserProfile(username),
    enabled: !!username,
  })

  const changePasswordMutation = useMutation({
    mutationFn: ({ oldPassword, newPassword }) =>
      apiClient.request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      }),
    onSuccess: () => {
      toast.success('Password changed successfully')
      setChangePasswordOpen(false)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
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
    changePasswordMutation.mutate({ oldPassword, newPassword })
  }

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

  if (!username) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Please log in to view your profile</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground mt-2">
          View your profile, services, and change your password
        </p>
      </div>

      {isLoading && <SkeletonCard />}

      {profile && (
        <>
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
                    <Badge variant="ghost" className="border-green-500 text-green-600">
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
                <Button
                  
                  onClick={() => setChangePasswordOpen(true)}
                  className="mt-4"
                >
                  <Key className="h-4 w-4 mr-2" />
                  Change Password
                </Button>
              </CardContent>
            </Card>
          </div>

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

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Profile
              </Button>
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

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
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
            <Button variant="ghost" onClick={() => setChangePasswordOpen(false)}>
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
    </div>
  )
}
