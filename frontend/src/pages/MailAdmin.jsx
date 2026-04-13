import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Mail, 
  MailPlus, 
  Trash2, 
  RefreshCw, 
  Settings,
  HardDrive,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Users
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SkeletonCard, SkeletonList } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'

export function MailAdmin() {
  const queryClient = useQueryClient()
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null })
  const [showCreate, setShowCreate] = useState(false)
  const [newMailbox, setNewMailbox] = useState({ username: '', email: '' })

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['mail-status'],
    queryFn: apiClient.getMailStatus.bind(apiClient),
  })

  const createMutation = useMutation({
    mutationFn: ({ username, email }) => apiClient.createMailbox(username, email),
    onSuccess: () => {
      toast.success('Mailbox created successfully')
      setShowCreate(false)
      setNewMailbox({ username: '', email: '' })
      queryClient.invalidateQueries({ queryKey: ['mail-status'] })
    },
    onError: (error) => {
      toast.error(`Failed to create mailbox: ${error.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (email) => apiClient.deleteMailbox(email),
    onSuccess: () => {
      toast.success('Mailbox deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['mail-status'] })
    },
    onError: (error) => {
      toast.error(`Failed to delete mailbox: ${error.message}`)
    },
  })

  const handleCreate = () => {
    if (!newMailbox.username || !newMailbox.email) {
      toast.error('Please enter username and email')
      return
    }
    createMutation.mutate(newMailbox)
  }

  const handleEmailChange = (value) => {
    setNewMailbox(prev => ({
      username: value.split('@')[0],
      email: value
    }))
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mail Administration</h1>
        <p className="text-muted-foreground mt-2">
          Manage mailboxes and mail server settings
        </p>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                  <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Mailboxes</p>
                  <p className="text-2xl font-bold">{status?.mailboxCount || 0}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                  <HardDrive className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Domain</p>
                  <p className="font-medium">{status?.domain || 'N/A'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                  <Settings className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Container</p>
                  <p className="font-medium">{status?.container || 'N/A'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {status?.enabled ? (
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900">
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="font-medium">{status?.enabled ? 'Enabled' : 'Disabled'}</p>
                </div>
              </div>
              <Badge variant={status?.enabled ? 'success' : 'destructive'}>
                {status?.enabled ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mailbox List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Mailboxes
                </CardTitle>
                <CardDescription>
                  All mailboxes on the server
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
                  <MailPlus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {showCreate && (
              <div className="mb-4 p-4 border rounded-lg bg-muted/50">
                <h4 className="font-medium mb-3">Create New Mailbox</h4>
                <div className="flex gap-2">
                  <Input
                    placeholder="username"
                    value={newMailbox.username}
                    onChange={(e) => setNewMailbox(prev => ({
                      ...prev,
                      username: e.target.value,
                      email: `${e.target.value}@${status?.domain || 'spectres.co.za'}`
                    }))}
                    className="flex-1"
                  />
                  <Input
                    placeholder={`@${status?.domain || 'spectres.co.za'}`}
                    value={newMailbox.email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Create'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {status?.mailboxes?.length > 0 ? (
              <div className="space-y-2">
                {status.mailboxes.map((mbx) => (
                  <div 
                    key={mbx.email} 
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{mbx.email}</p>
                        <p className="text-sm text-muted-foreground">
                          Quota: {mbx.quota}
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => {
                        setConfirmDialog({
                          open: true,
                          title: 'Delete Mailbox',
                          description: `Are you sure you want to delete mailbox ${mbx.email}? This action cannot be undone.`,
                          onConfirm: () => {
                            deleteMutation.mutate(mbx.email)
                            setConfirmDialog({ open: false })
                          }
                        })
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No mailboxes found</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setShowCreate(true)}
                >
                  Create First Mailbox
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Status
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => setShowCreate(true)}
            >
              <MailPlus className="h-4 w-4 mr-2" />
              Create Mailbox
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => window.open('/mail', '_self')}
            >
              <Settings className="h-4 w-4 mr-2" />
              SMTP Settings
            </Button>
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        description={confirmDialog.description}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
