import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Plus, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { apiClient } from '@/services/api'
import { toast } from 'react-hot-toast'
import { RequireRole } from '@/components/RequireRole'
import { Link } from 'react-router-dom'

function formatTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="h-5 w-5 text-tertiary animate-spin" />
    </div>
  )
}

export function RoleManagement() {
  const queryClient = useQueryClient()
  const [showCreateApp, setShowCreateApp] = useState(false)
  const [createdApp, setCreatedApp] = useState(null)

  const { data: apps = [], isLoading, error: appsError, refetch: refetchApps } = useQuery({
    queryKey: ['rbac-apps'],
    queryFn: () => apiClient.getRbacApps(),
  })
  useEffect(() => { if (appsError) console.error('[RoleManagement] apps fetch error:', appsError) }, [appsError])

  const createApp = useMutation({
    mutationFn: (data) => apiClient.createRbacApp(data),
    onSuccess: (data) => { setCreatedApp(data); queryClient.invalidateQueries({ queryKey: ['rbac-apps'] }) },
    onError: (e) => toast.error(e.message),
  })

  const handleCreateAppSubmit = (data) => { createApp.mutate(data) }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Role Management</h1>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Role Management</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Registered applications and their RBAC configurations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchApps()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <RequireRole roles={['admin']}>
            <Button size="sm" onClick={() => setShowCreateApp(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create App
            </Button>
          </RequireRole>
        </div>
      </div>

      {apps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>No applications registered yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Slug</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Users</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Roles</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Mappings</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {apps.map(a => (
                  <tr key={a.slug} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <Link to={`/roles/${a.slug}`} className="text-accent hover:text-accent-hover font-medium flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" />
                        {a.display_name || a.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{a.slug}</td>
                    <td className="px-4 py-2.5">{a.user_count || 0}</td>
                    <td className="px-4 py-2.5">{a.role_count || 0}</td>
                    <td className="px-4 py-2.5">{a.mapping_count || 0}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={a.is_active !== false ? 'default' : 'secondary'}>
                        {a.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatTime(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showCreateApp} onClose={() => { setShowCreateApp(false); setCreatedApp(null) }}>
        <DialogHeader>
          <DialogTitle>Register New Application</DialogTitle>
          <DialogDescription>{createdApp ? 'App registered' : 'Add a new consumer app'}</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <CreateAppForm
            createdApp={createdApp}
            onSubmit={handleCreateAppSubmit}
            onCancel={() => { setShowCreateApp(false); setCreatedApp(null) }}
            loading={createApp.isPending}
            apps={apps}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateAppForm({ createdApp, onSubmit, onCancel, loading, apps = [] }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [display_name, setDisplayName] = useState('')
  const [claim_name, setClaimName] = useState('ogun_role')
  const [authentik_slug, setAuthentikSlug] = useState('')
  const [access_group, setAccessGroup] = useState('')
  const [schema_endpoint, setSchemaEndpoint] = useState('')
  const [clone_from, setCloneFrom] = useState('')

  if (createdApp) {
    return (
      <div className="space-y-3 py-2">
        <div className="p-3 bg-accent-tint/30 border border-accent/20 rounded-sm">
          <p className="text-sm font-medium text-accent mb-2">App created successfully!</p>
          <div className="space-y-1.5 text-xs">
            <div>
              <span className="text-muted-foreground">API Key: </span>
              <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono break-all select-all">{createdApp.api_key}</code>
            </div>
            <p className="text-amber-600 dark:text-amber-400 text-[11px]">Copy this key now — it won't be shown again.</p>
          </div>
        </div>
        <DialogFooter><Button onClick={onCancel}>Done</Button></DialogFooter>
      </div>
    )
  }

  const handleSubmit = () => {
    const data = {
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      display_name: display_name || name,
      claim_name,
      authentik_slug: authentik_slug || slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      access_group: access_group || undefined,
      schema_endpoint: schema_endpoint || undefined,
      clone_from: clone_from || undefined,
    }
    onSubmit(data)
  }

  return (
    <div className="space-y-3 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Name *</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My App" className="mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Slug</label>
          <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto: my-app" className="mt-1" />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Display Name</label>
        <Input value={display_name} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. My App" className="mt-1" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">OIDC Claim Name *</label>
        <Input value={claim_name} onChange={e => setClaimName(e.target.value)} placeholder="e.g. my_app_role" className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Authentik Slug</label>
          <Input value={authentik_slug} onChange={e => setAuthentikSlug(e.target.value)} placeholder="e.g. my-app" className="mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Access Group</label>
          <Input value={access_group} onChange={e => setAccessGroup(e.target.value)} placeholder="Authentik group name" className="mt-1" />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Schema Endpoint</label>
        <Input value={schema_endpoint} onChange={e => setSchemaEndpoint(e.target.value)} placeholder="https://app/api/rbac/schema" className="mt-1" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Clone from existing app</label>
        <Select value={clone_from} onValueChange={setCloneFrom}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Don't clone" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Don't clone (start fresh)</SelectItem>
            {apps.filter(a => a.slug !== slug).map(a => (
              <SelectItem key={a.slug} value={a.slug}>{a.display_name || a.name} ({a.role_count || 0} roles)</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button disabled={!name} onClick={handleSubmit}>
          {loading ? 'Creating...' : 'Create App'}
        </Button>
      </DialogFooter>
    </div>
  )
}

export default RoleManagement
