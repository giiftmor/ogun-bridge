import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Plus, Edit2, Trash2, RefreshCw, Check, X, ChevronDown, Users, Folder } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectItem } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { apiClient } from '@/services/api'
import { toast } from 'react-hot-toast'

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="h-5 w-5 text-tertiary animate-spin" />

      <Dialog open={showAddApp} onClose={() => { setShowAddApp(false); setCreatedApp(null) }}>
        <DialogHeader>
          <DialogTitle>Register New Application</DialogTitle>
          <DialogDescription>{createdApp ? 'App registered successfully' : 'Add a new consumer app to the RBAC system'}</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <CreateAppForm
            createdApp={createdApp}
            onSubmit={(data) => createApp.mutate(data)}
            onCancel={() => { setShowAddApp(false); setCreatedApp(null) }}
            loading={createApp.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmptyState({ message }) {
  return <div className="text-center py-8 text-tertiary text-[13px]">{message}</div>
}

// ── Apps Tab ──────────────────────────────────────────────────────────────

function AppsTab() {
  const [editApp, setEditApp] = useState(null)
  const [appForm, setAppForm] = useState({})
  const [showAddApp, setShowAddApp] = useState(false)
  const [createdApp, setCreatedApp] = useState(null)

  const { data: apps = [], isLoading, refetch } = useQuery({
    queryKey: ['rbac-apps'],
    queryFn: apiClient.getRbacApps,
  })

  const updateApp = useMutation({
    mutationFn: ({ slug, data }) => apiClient.updateRbacApp(slug, data),
    onSuccess: () => {
      toast.success('App updated')
      setEditApp(null)
      queryClient.invalidateQueries({ queryKey: ['rbac-apps'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const queryClient = useQueryClient()

  const createApp = useMutation({
    mutationFn: (data) => apiClient.createRbacApp(data),
    onSuccess: (data) => {
      setCreatedApp(data)
      queryClient.invalidateQueries({ queryKey: ['rbac-apps'] })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[16px] font-medium text-primary">Registered Applications</h2>
          <p className="text-[13px] text-secondary mt-0.5">Configure which apps use Ogun Bridge for authorization</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowAddApp(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" /> Create App
          </Button>
          <Button onClick={() => refetch()} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="grid gap-4">
          {apps.map(app => (
            <Card key={app.slug}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-[14px] font-medium text-primary">{app.display_name || app.name}</h3>
                    <p className="text-[12px] text-secondary mt-0.5">slug: {app.slug}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={app.is_active ? 'default' : 'secondary'}>
                      {app.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditApp(app.slug)
                      setAppForm({
                        authentik_slug: app.authentik_slug || '',
                        access_group: app.access_group || '',
                        schema_endpoint: app.schema_endpoint || '',
                        is_active: app.is_active,
                        display_name: app.display_name || '',
                      })
                    }}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                  <div>
                    <span className="text-tertiary">Authentik</span>
                    <p className="text-secondary font-mono">{app.authentik_slug || '—'}</p>
                  </div>
                  <div>
                    <span className="text-tertiary">Access Group</span>
                    <p className="text-secondary font-mono">{app.access_group || '—'}</p>
                  </div>
                  <div>
                    <span className="text-tertiary">Users</span>
                    <p className="text-secondary">{app.user_count || 0}</p>
                  </div>
                  <div>
                    <span className="text-tertiary">Roles</span>
                    <p className="text-secondary">{app.role_count || 0}</p>
                  </div>
                </div>

                {editApp === app.slug && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[12px] text-secondary">Authentik slug</label>
                        <Input
                          value={appForm.authentik_slug || ''}
                          onChange={e => setAppForm(f => ({ ...f, authentik_slug: e.target.value }))}
                          placeholder="e.g. spectres-pantheon"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-[12px] text-secondary">Access group</label>
                        <Input
                          value={appForm.access_group || ''}
                          onChange={e => setAppForm(f => ({ ...f, access_group: e.target.value }))}
                          placeholder="Authentik group name"
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[12px] text-secondary">Schema endpoint</label>
                      <Input
                        value={appForm.schema_endpoint || ''}
                        onChange={e => setAppForm(f => ({ ...f, schema_endpoint: e.target.value }))}
                        placeholder="https://app/api/rbac/schema"
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={appForm.is_active}
                        onCheckedChange={v => setAppForm(f => ({ ...f, is_active: v }))}
                      />
                      <span className="text-[13px] text-secondary">Active</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateApp.mutate({ slug: app.slug, data: appForm })}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditApp(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Mappings Tab ──────────────────────────────────────────────────────────


function CreateAppForm({ createdApp, onSubmit, onCancel, loading }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [display_name, setDisplayName] = useState('')
  const [claim_name, setClaimName] = useState('ogun_role')
  const [authentik_slug, setAuthentikSlug] = useState('')
  const [access_group, setAccessGroup] = useState('')
  const [schema_endpoint, setSchemaEndpoint] = useState('')

  if (createdApp) {
    return (
      <div className="space-y-3 py-2">
        <div className="p-3 bg-accent-tint/30 border border-accent/20 rounded-sm">
          <p className="text-[13px] font-medium text-accent mb-2">App created successfully!</p>
          <div className="space-y-1.5 text-[12px]">
            <div>
              <span className="text-tertiary">API Key: </span>
              <code className="text-primary font-mono bg-subtle px-1.5 py-0.5 rounded text-[11px] break-all select-all">{createdApp.api_key}</code>
            </div>
            <p className="text-warning text-[11px]">Copy this key now — it won't be shown again.</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onCancel}>Done</Button>
        </DialogFooter>
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
    }
    onSubmit(data)
  }

  return (
    <div className="space-y-3 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[12px] text-secondary">Name *</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My App" />
        </div>
        <div>
          <label className="text-[12px] text-secondary">Slug</label>
          <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto: my-app" />
        </div>
      </div>
      <div>
        <label className="text-[12px] text-secondary">Display Name</label>
        <Input value={display_name} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. My App" />
      </div>
      <div>
        <label className="text-[12px] text-secondary">OIDC Claim Name *</label>
        <Input value={claim_name} onChange={e => setClaimName(e.target.value)} placeholder="e.g. my_app_role" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[12px] text-secondary">Authentik Slug</label>
          <Input value={authentik_slug} onChange={e => setAuthentikSlug(e.target.value)} placeholder="e.g. my-app" />
        </div>
        <div>
          <label className="text-[12px] text-secondary">Access Group</label>
          <Input value={access_group} onChange={e => setAccessGroup(e.target.value)} placeholder="Authentik group name" />
        </div>
      </div>
      <div>
        <label className="text-[12px] text-secondary">Schema Endpoint</label>
        <Input value={schema_endpoint} onChange={e => setSchemaEndpoint(e.target.value)} placeholder="https://app/api/rbac/schema" />
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


function MappingsTab({ appSlug, setActiveApp }) {
  const [showCreate, setShowCreate] = useState(false)
  const [filterApp, setFilterApp] = useState(appSlug || '')

  const { data: apps = [] } = useQuery({
    queryKey: ['rbac-apps'],
    queryFn: apiClient.getRbacApps,
  })

  const { data: mappings = [], isLoading, refetch } = useQuery({
    queryKey: ['rbac-mappings', filterApp || apps[0]?.slug],
    queryFn: () => apiClient.getRbacMappings(filterApp || apps[0]?.slug),
    enabled: !!(filterApp || apps[0]?.slug),
  })

  const { data: roles = [] } = useQuery({
    queryKey: ['rbac-roles', filterApp || apps[0]?.slug],
    queryFn: () => apiClient.getRbacRoles(filterApp || apps[0]?.slug),
    enabled: !!(filterApp || apps[0]?.slug),
  })

  const { data: authGroups = [] } = useQuery({
    queryKey: ['rbac-authentik-groups'],
    queryFn: apiClient.getRbacAuthentikGroups,
  })

  const createMapping = useMutation({
    mutationFn: (data) => apiClient.createRbacMapping(filterApp || apps[0]?.slug, data),
    onSuccess: () => { toast.success('Mapping created'); setShowCreate(false); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const updateMapping = useMutation({
    mutationFn: ({ id, data }) => apiClient.updateRbacMapping(id, data),
    onSuccess: () => { toast.success('Mapping updated'); queryClient.invalidateQueries({ queryKey: ['rbac-mappings'] }) },
    onError: (e) => toast.error(e.message),
  })

  const deleteMapping = useMutation({
    mutationFn: (id) => apiClient.deleteRbacMapping(id),
    onSuccess: () => { toast.success('Mapping removed'); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const queryClient = useQueryClient()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[16px] font-medium text-primary">Authentik Group → Role Mappings</h2>
          <p className="text-[13px] text-secondary mt-0.5">Map Authentik groups to roles per app</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterApp || apps[0]?.slug || ''} onValueChange={setFilterApp}>
            {apps.map(a => <SelectItem key={a.slug} value={a.slug}>{a.name}</SelectItem>)}
          </Select>
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={!filterApp && !apps[0]?.slug}>
            <Plus className="h-4 w-4 mr-1" /> Add Mapping
          </Button>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : mappings.length === 0 ? (
        <EmptyState message="No mappings configured for this app yet" />
      ) : (
        <div className="border border-border rounded-sm overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-subtle">
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Authentik Group</th>
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Mapped Role</th>
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Priority</th>
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Status</th>
                <th className="text-right px-4 py-2.5 font-medium text-secondary">Actions</th>
                <th className="text-right px-4 py-2.5 font-medium text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.id} className="border-t border-border hover:bg-subtle/50">
                  <td className="px-4 py-2.5 font-mono text-primary">{m.authentik_group}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="default">{m.role_name || '—'}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-secondary">{m.priority || 0}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={m.is_active ? 'default' : 'secondary'}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => updateMapping.mutate({ id: m.id, data: { ...m, is_active: !m.is_active } })}
                      className="text-tertiary hover:text-primary mr-3"
                    >
                      {m.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => deleteMapping.mutate(m.id)}
                      className="text-tertiary hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showCreate} onClose={() => setShowCreate(false)}>
        <DialogHeader>
          <DialogTitle>Create Group → Role Mapping</DialogTitle>
          <DialogDescription>Map an Authentik group to a role for this app</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <MappingForm
            roles={roles}
            authGroups={authGroups}
            onSubmit={(data) => createMapping.mutate(data)}
            onCancel={() => setShowCreate(false)}
            loading={createMapping.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MappingForm({ roles, authGroups, onSubmit, onCancel, loading }) {
  const [authentik_group, setAuthentikGroup] = useState('')
  const [role_definition_id, setRoleDefinitionId] = useState('')
  const [priority, setPriority] = useState(0)
  const [groupSearch, setGroupSearch] = useState('')

  const filteredGroups = groupSearch
    ? authGroups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
    : authGroups

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[12px] text-secondary">Authentik Group</label>
        <div className="relative mb-2">
          <Input
            value={groupSearch}
            onChange={e => setGroupSearch(e.target.value)}
            placeholder="Search groups..."
            className="text-[12px]"
          />
        </div>
        <Select value={authentik_group} onValueChange={(v) => { setAuthentikGroup(v); setGroupSearch('') }}>
          <SelectItem value="">Select group... ({filteredGroups.length} available)</SelectItem>
          {filteredGroups.map(g => <SelectItem key={g.name} value={g.name}>{g.name} ({g.users} users)</SelectItem>)}
        </Select>
        {filteredGroups.length === 0 && groupSearch && (
          <p className="text-[11px] text-tertiary mt-1">No groups matching "{groupSearch}"</p>
        )}
      </div>
      <div>
        <label className="text-[12px] text-secondary">Role</label>
        <Select value={role_definition_id} onValueChange={setRoleDefinitionId}>
          <SelectItem value="">Select role...</SelectItem>
          {roles.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.display_name || r.name}</SelectItem>)}
        </Select>
      </div>
      <div>
        <label className="text-[12px] text-secondary">Priority</label>
        <Input type="number" value={priority} onChange={e => setPriority(parseInt(e.target.value) || 0)} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button disabled={!authentik_group || !role_definition_id} onClick={() => onSubmit({ authentik_group, role_definition_id: parseInt(role_definition_id), priority })}>
          {loading ? 'Creating...' : 'Create Mapping'}
        </Button>
      </DialogFooter>
    </div>
  )
}

// ── Roles Tab ──────────────────────────────────────────────────────────────

function RolesTab({ appSlug }) {
  const [filterApp, setFilterApp] = useState(appSlug || '')
  const [showCreate, setShowCreate] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [permsDialog, setPermsDialog] = useState(null)

  const { data: apps = [] } = useQuery({ queryKey: ['rbac-apps'], queryFn: apiClient.getRbacApps })

  const { data: roles = [], isLoading, refetch } = useQuery({
    queryKey: ['rbac-roles', filterApp || apps[0]?.slug],
    queryFn: () => apiClient.getRbacRoles(filterApp || apps[0]?.slug),
    enabled: !!(filterApp || apps[0]?.slug),
  })

  const { data: schema = { modules: [] } } = useQuery({
    queryKey: ['rbac-schema', filterApp || apps[0]?.slug],
    queryFn: () => apiClient.getRbacSchema(filterApp || apps[0]?.slug),
    enabled: !!(filterApp || apps[0]?.slug),
  })

  const { data: currentPerms = [] } = useQuery({
    queryKey: ['rbac-role-perms', permsDialog],
    queryFn: () => apiClient.getRbacRolePermissions(permsDialog),
    enabled: !!permsDialog,
  })

  const createRole = useMutation({
    mutationFn: (data) => apiClient.createRbacRole(filterApp || apps[0]?.slug, data),
    onSuccess: () => { toast.success('Role created'); setShowCreate(false); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const updateRole = useMutation({
    mutationFn: ({ id, data }) => apiClient.updateRbacRole(id, data),
    onSuccess: () => { toast.success('Role updated'); setEditingRole(null); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const deleteRole = useMutation({
    mutationFn: (id) => apiClient.deleteRbacRole(id),
    onSuccess: () => { toast.success('Role deactivated'); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const updatePerms = useMutation({
    mutationFn: ({ id, permissions }) => apiClient.updateRbacRolePermissions(id, permissions),
    onSuccess: () => { toast.success('Permissions saved'); setPermsDialog(null) },
    onError: (e) => toast.error(e.message),
  })

  const queryClient = useQueryClient()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[16px] font-medium text-primary">Role Definitions</h2>
          <p className="text-[13px] text-secondary mt-0.5">Define roles and their module permissions per app</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterApp || apps[0]?.slug || ''} onValueChange={setFilterApp}>
            {apps.map(a => <SelectItem key={a.slug} value={a.slug}>{a.name}</SelectItem>)}
          </Select>
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={!filterApp && !apps[0]?.slug}>
            <Plus className="h-4 w-4 mr-1" /> Create Role
          </Button>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : roles.length === 0 ? (
        <EmptyState message="No roles defined for this app yet" />
      ) : (
        <div className="border border-border rounded-sm overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-subtle">
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Display Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Base Role</th>
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Modules</th>
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Status</th>
                <th className="text-right px-4 py-2.5 font-medium text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map(r => (
                <tr key={r.id} className="border-t border-border hover:bg-subtle/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {r.is_default && <Badge variant="default" className="text-[10px]">default</Badge>}
                      <span className="font-mono text-primary">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-secondary">{r.display_name || '—'}</td>
                  <td className="px-4 py-2.5"><Badge variant="secondary">{r.base_role || 'viewer'}</Badge></td>
                  <td className="px-4 py-2.5 text-secondary">{r.module_count || 0} modules</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setPermsDialog(r.id)} className="text-tertiary hover:text-primary mr-3" title="Edit permissions">
                      <Shield className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingRole(r)} className="text-tertiary hover:text-primary mr-3">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    {!r.is_default && (
                      <button onClick={() => deleteRole.mutate(r.id)} className="text-tertiary hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showCreate} onClose={() => setShowCreate(false)}>
        <DialogHeader>
          <DialogTitle>Create Role</DialogTitle>
          <DialogDescription>Define a new role for this application</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <RoleForm
            onSubmit={(data) => createRole.mutate(data)}
            onCancel={() => setShowCreate(false)}
            loading={createRole.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingRole} onClose={() => setEditingRole(null)}>
        <DialogHeader>
          <DialogTitle>Edit Role: {editingRole?.name}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <RoleForm
            initial={editingRole}
            onSubmit={(data) => updateRole.mutate({ id: editingRole.id, data })}
            onCancel={() => setEditingRole(null)}
            loading={updateRole.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!permsDialog} onClose={() => setPermsDialog(null)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Permissions: {roles.find(r => r.id === permsDialog)?.display_name}</DialogTitle>
          <DialogDescription>Configure which modules and actions this role can access</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <PermissionsBuilder
            modules={schema.modules || []}
            currentPerms={currentPerms}
            onSave={(permissions) => updatePerms.mutate({ id: permsDialog, permissions })}
            onCancel={() => setPermsDialog(null)}
            loading={updatePerms.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RoleForm({ initial, onSubmit, onCancel, loading }) {
  const [name, setName] = useState(initial?.name || '')
  const [display_name, setDisplayName] = useState(initial?.display_name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [base_role, setBaseRole] = useState(initial?.base_role || 'viewer')
  const [is_default, setIsDefault] = useState(initial?.is_default || false)

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[12px] text-secondary">Name (slug)</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. support_agent" disabled={!!initial} />
      </div>
      <div>
        <label className="text-[12px] text-secondary">Display Name</label>
        <Input value={display_name} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Support Agent" />
      </div>
      <div>
        <label className="text-[12px] text-secondary">Description</label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description" />
      </div>
      <div>
        <label className="text-[12px] text-secondary">Base Role</label>
        <Select value={base_role} onValueChange={setBaseRole}>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="viewer">Viewer</SelectItem>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked={is_default} onCheckedChange={setIsDefault} />
        <span className="text-[13px] text-secondary">Default role (assigned when no group mapping matches)</span>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button disabled={!name} onClick={() => onSubmit({ name, display_name, description, base_role, is_default })}>
          {loading ? 'Saving...' : initial ? 'Save Changes' : 'Create Role'}
        </Button>
      </DialogFooter>
    </div>
  )
}

function PermissionsBuilder({ modules, currentPerms = [], onSave, onCancel, loading }) {
  const [perms, setPerms] = useState(() => {
    const map = {}
    for (const p of currentPerms) {
      map[p.module_name] = p.actions
    }
    return map
  })

  const toggleAction = (moduleName, action) => {
    setPerms(prev => {
      const current = prev[moduleName] || []
      const updated = current.includes(action)
        ? current.filter(a => a !== action)
        : [...current, action]
      return { ...prev, [moduleName]: updated }
    })
  }

  const handleSave = () => {
    const permissions = Object.entries(perms)
      .filter(([, actions]) => actions.length > 0)
      .map(([module_name, actions]) => ({ module_name, actions }))
    onSave(permissions)
  }

  if (modules.length === 0) {
    return (
      <div className="text-center py-8 text-tertiary text-[13px]">
        No modules registered for this app yet. App must push its schema via POST /api/rbac/schema/:appSlug
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {modules.map(mod => (
          <div key={mod.name} className="border border-border rounded-sm p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-[13px] font-medium text-primary">{mod.name}</span>
                {mod.description && <span className="text-[12px] text-secondary ml-2">— {mod.description}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(mod.actions || []).map(action => (
                <label key={action} className="flex items-center gap-1.5 text-[12px] text-secondary cursor-pointer">
                  <Checkbox
                    checked={(perms[mod.name] || []).includes(action)}
                    onCheckedChange={() => toggleAction(mod.name, action)}
                  />
                  {action}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <DialogFooter className="mt-4">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave}>{loading ? 'Saving...' : 'Save Permissions'}</Button>
      </DialogFooter>
    </div>
  )
}

// ── Users Tab ──────────────────────────────────────────────────────────────

function UsersTab({ appSlug }) {
  const [filterApp, setFilterApp] = useState(appSlug || '')
  const [overrideUser, setOverrideUser] = useState(null)
  const [overrideRole, setOverrideRole] = useState('')

  const { data: apps = [] } = useQuery({ queryKey: ['rbac-apps'], queryFn: apiClient.getRbacApps })

  const { data: roles = [] } = useQuery({
    queryKey: ['rbac-roles', filterApp || apps[0]?.slug],
    queryFn: () => apiClient.getRbacRoles(filterApp || apps[0]?.slug),
    enabled: !!(filterApp || apps[0]?.slug),
  })

  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ['rbac-users', filterApp || apps[0]?.slug],
    queryFn: () => apiClient.getRbacUsers(filterApp || apps[0]?.slug),
    enabled: !!(filterApp || apps[0]?.slug),
  })

  const syncUsers = useMutation({
    mutationFn: () => apiClient.syncRbacUsers(filterApp || apps[0]?.slug),
    onSuccess: (data) => { toast.success('Synced ' + data.synced + ' users'); refetch() },
    onError: (e) => toast.error(e.message),
  })

  const overrideMutation = useMutation({
    mutationFn: ({ sub, role_definition_id }) => apiClient.overrideRbacUserRole(filterApp || apps[0]?.slug, sub, role_definition_id),
    onSuccess: () => {
      toast.success('Role override saved')
      setOverrideUser(null)
      setOverrideRole('')
      refetch()
    },
    onError: (e) => toast.error(e.message),
  })

  const queryClient = useQueryClient()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[16px] font-medium text-primary">App Users</h2>
          <p className="text-[13px] text-secondary mt-0.5">Users who have authenticated to this app and their resolved roles</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterApp || apps[0]?.slug || ''} onValueChange={setFilterApp}>
            {apps.map(a => <SelectItem key={a.slug} value={a.slug}>{a.name}</SelectItem>)}
          </Select>
          <Button size="sm" variant="ghost" onClick={() => syncUsers.mutate()} disabled={syncUsers.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncUsers.isPending ? 'animate-spin' : ''}`} />
            Sync from Authentik
          </Button>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : users.length === 0 ? (
        <EmptyState message="No users have authenticated to this app yet" />
      ) : (
        <div className="border border-border rounded-sm overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-subtle">
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Email / Sub</th>
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Role</th>
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Last Auth</th>
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Last Sync</th>
                <th className="text-left px-4 py-2.5 font-medium text-secondary">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.oidc_sub} className="border-t border-border hover:bg-subtle/50">
                  <td className="px-4 py-2.5 text-primary">{u.email || u.oidc_sub}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="default">{u.role_name || 'viewer'}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-secondary">
                    {u.last_auth ? new Date(u.last_auth).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-secondary">
                    {u.last_sync ? new Date(u.last_sync).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={u.is_active ? 'default' : 'secondary'}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => { setOverrideUser(u); setOverrideRole('') }}
                      className="text-[12px] text-accent hover:text-accent-hover"
                    >
                      Override Role
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!overrideUser} onClose={() => { setOverrideUser(null); setOverrideRole('') }}>
        <DialogHeader>
          <DialogTitle>Override Role for {overrideUser?.email || overrideUser?.oidc_sub}</DialogTitle>
          <DialogDescription>Manually assign a role to this user for the current app</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-3 py-2">
            <div className="text-[13px] text-secondary">
              Current role: <Badge variant="default">{overrideUser?.role_name || 'viewer'}</Badge>
            </div>
            <div>
              <label className="text-[12px] text-secondary">New Role</label>
              <Select value={overrideRole} onValueChange={setOverrideRole}>
                <SelectItem value="">Clear override (use group mapping)</SelectItem>
                {roles.map(r => (
                  <SelectItem key={r.id} value={String(r.id)}>{r.display_name || r.name}</SelectItem>
                ))}
              </Select>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setOverrideUser(null); setOverrideRole('') }}>Cancel</Button>
              <Button
                onClick={() => overrideMutation.mutate({ sub: overrideUser.oidc_sub, role_definition_id: overrideRole ? parseInt(overrideRole) : null })}
                disabled={overrideMutation.isPending}
              >
                {overrideMutation.isPending ? 'Saving...' : 'Save Override'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Permissions Reference Tab ───────────────────────────────────────────────

function PermissionsReferenceTab() {
  const [filterApp, setFilterApp] = useState('')
  const [expandedApps, setExpandedApps] = useState({})

  const { data: apps = [] } = useQuery({ queryKey: ['rbac-apps'], queryFn: apiClient.getRbacApps })

  const { data: allRoles = [] } = useQuery({
    queryKey: ['rbac-roles-all'],
    queryFn: async () => {
      const results = {}
      for (const app of apps) {
        try {
          const roles = await apiClient.getRbacRoles(app.slug)
          results[app.slug] = roles
        } catch {
          results[app.slug] = []
        }
      }
      return results
    },
    enabled: apps.length > 0,
  })

  const { data: allSchemas = {} } = useQuery({
    queryKey: ['rbac-schemas-all'],
    queryFn: async () => {
      const results = {}
      for (const app of apps) {
        try {
          const schema = await apiClient.getRbacSchema(app.slug)
          results[app.slug] = schema
        } catch {
          results[app.slug] = { modules: [] }
        }
      }
      return results
    },
    enabled: apps.length > 0,
  })

  const toggleApp = (slug) => {
    setExpandedApps(prev => ({ ...prev, [slug]: !prev[slug] }))
  }

  const filteredApps = apps.filter(a => !filterApp || a.slug === filterApp)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[16px] font-medium text-primary">Permissions Reference</h2>
          <p className="text-[13px] text-secondary mt-0.5">Matrix of all apps, roles, modules and actions</p>
        </div>
        <Select value={filterApp || 'all'} onValueChange={v => setFilterApp(v === 'all' ? '' : v)}>
          <SelectItem value="all">All Apps</SelectItem>
          {apps.map(a => <SelectItem key={a.slug} value={a.slug}>{a.name}</SelectItem>)}
        </Select>
      </div>

      <div className="space-y-4">
        {filteredApps.map(app => {
          const roles = allRoles[app.slug] || []
          const schema = allSchemas[app.slug] || { modules: [] }
          const modules = schema.modules || []

          return (
            <div key={app.slug} className="border border-border rounded-sm">
              <button
                onClick={() => toggleApp(app.slug)}
                className="w-full flex items-center justify-between px-4 py-3 bg-subtle hover:bg-subtle/80 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-secondary" />
                  <span className="text-[14px] font-medium text-primary">{app.name}</span>
                  <Badge variant="secondary">{roles.length} roles · {modules.length} modules</Badge>
                </div>
                <ChevronDown className={`h-4 w-4 text-tertiary transition-transform ${expandedApps[app.slug] ? 'rotate-180' : ''}`} />
              </button>

              {expandedApps[app.slug] && (
                <div className="p-4">
                  {roles.length === 0 ? (
                    <div className="text-center py-4 text-tertiary text-[13px]">No roles configured for this app</div>
                  ) : modules.length === 0 ? (
                    <div className="text-center py-4 text-tertiary text-[13px]">No modules registered for this app</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[11px] font-medium text-tertiary uppercase tracking-wider px-4">
                        <span className="min-w-[120px]">Role</span>
                        {modules.map(m => (
                          <span key={m.name} className="flex-1 text-center">{m.name}</span>
                        ))}
                      </div>
                      {roles.map(r => {
                        const permMap = {}
                        for (const p of (r._permissions || [])) {
                          permMap[p.module_name] = p.actions
                        }
                        return (
                          <div key={r.id} className="flex items-center gap-2 text-[12px] px-4 py-2 border border-border rounded-sm">
                            <span className="min-w-[120px] font-medium text-primary">{r.display_name || r.name}</span>
                            {modules.map(m => (
                              <div key={m.name} className="flex-1 flex flex-wrap gap-1 justify-center">
                                {(m.actions || []).map(a => (
                                  <span key={a} className="text-[10px] px-1 py-0.5 rounded bg-subtle">
                                    {(permMap[m.name] || []).includes(a) ? (
                                      <span className="text-accent">{a}</span>
                                    ) : (
                                      <span className="text-tertiary">—</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Role Management Page ────────────────────────────────────────────────

export function RoleManagement() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[20px] font-medium text-primary flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Role Management
        </h1>
        <p className="text-[13px] text-secondary mt-1">
          Centralized RBAC — map Authentik groups to roles, configure module permissions, resolve authorization
        </p>
      </div>

      <Tabs defaultValue="roles" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="apps">Apps</TabsTrigger>
          <TabsTrigger value="mappings">Group Mappings</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="reference">Permissions Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="apps">
          <AppsTab />
        </TabsContent>

        <TabsContent value="mappings">
          <MappingsTab />
        </TabsContent>

        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>

        <TabsContent value="users">
          <UsersTab />
        </TabsContent>

        <TabsContent value="reference">
          <PermissionsReferenceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default RoleManagement