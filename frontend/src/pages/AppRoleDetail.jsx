import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield, Plus, Edit2, Trash2, RefreshCw, ChevronDown,
  Folder, Search, History, Users, Key, ExternalLink, ArrowLeft,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { apiClient } from '@/services/api'
import { toast } from 'react-hot-toast'
import { useAppStore } from '@/store/useAppStore'
import { RequireRole } from '@/components/RequireRole'

function ModuleTreeNode({ mod, effectivePerms, togglePermAction, depth }) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = mod.children && mod.children.length > 0
  const indent = depth * 16

  return (
    <div style={{ marginLeft: indent }}>
      <div className="border border-border rounded-sm p-3">
        <div className="flex items-center gap-2 mb-2">
          {hasChildren && (
            <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground p-0.5">
              <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (expanded ? "" : "-rotate-90")} />
            </button>
          )}
          <span className="text-sm font-medium">{mod.name}</span>
          {mod.description && <span className="text-xs text-muted-foreground">— {mod.description}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {(mod.actions || []).map(action => (
            <label key={action} className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={(effectivePerms[mod.name] || []).includes(action)}
                onCheckedChange={() => togglePermAction(mod.name, action)}
              />
              {action}
            </label>
          ))}
        </div>
      </div>
      {hasChildren && expanded && (
        <div className="ml-4 space-y-3 mt-3">
          {mod.children.map(child => (
            <ModuleTreeNode key={child.name} mod={child} effectivePerms={effectivePerms} togglePermAction={togglePermAction} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="h-5 w-5 text-tertiary animate-spin" />
    </div>
  )
}

function EmptyState({ message }) {
  return <div className="text-center py-8 text-tertiary text-[13px]">{message}</div>
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-start py-1">
      <span className="text-[13px] text-secondary">{label}:</span>
      <span className="text-[13px] font-medium text-right">{value || 'N/A'}</span>
    </div>
  )
}

function formatTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

export function AppRoleDetail() {
  const { slug } = useParams()
  const currentUser = useAppStore((s) => s.currentUser)
  const queryClient = useQueryClient()

  const [showCreateRole, setShowCreateRole] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [permsDialog, setPermsDialog] = useState(null)

  const [showCreateMapping, setShowCreateMapping] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [overrideUser, setOverrideUser] = useState(null)
  const [overrideRole, setOverrideRole] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, onConfirm: null, title: '', description: '' })
  const [groupSearch, setGroupSearch] = useState('')
  const [bulkGroupSearch, setBulkGroupSearch] = useState('')
  const [bulkSelectedGroups, setBulkSelectedGroups] = useState([])
  const [bulkRoleId, setBulkRoleId] = useState('')
  const [bulkPriority, setBulkPriority] = useState(0)

  const [mappingGroupSearch, setMappingGroupSearch] = useState('')
  const [newMappingGroup, setNewMappingGroup] = useState('')
  const [newMappingRole, setNewMappingRole] = useState('')
  const [newMappingPriority, setNewMappingPriority] = useState(0)

  const [roleName, setRoleName] = useState('')
  const [roleDisplayName, setRoleDisplayName] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [roleBaseRole, setRoleBaseRole] = useState('viewer')
  const [roleIsDefault, setRoleIsDefault] = useState(false)

  const [editRoleName, setEditRoleName] = useState('')
  const [editRoleDisplay, setEditRoleDisplay] = useState('')
  const [editRoleDesc, setEditRoleDesc] = useState('')
  const [editRoleBase, setEditRoleBase] = useState('')
  const [editRoleDefault, setEditRoleDefault] = useState(false)

  const [permEditor, setPermEditor] = useState({})
  const [showApiKey, setShowApiKey] = useState(false)
  const [editApp, setEditApp] = useState(false)
  const [appForm, setAppForm] = useState({})

  const isOgun = slug === 'ogun'

  const { data: apps = [], isLoading: appsLoading } = useQuery({
    queryKey: ['rbac-apps'],
    queryFn: () => apiClient.getRbacApps(),
  })

  const selectedApp = apps.find(a => a.slug === slug) || null

  const { data: roles = [], isLoading: rolesLoading, refetch: refetchRoles } = useQuery({
    queryKey: ['rbac-roles', slug],
    queryFn: () => apiClient.getRbacRoles(slug),
    enabled: !!slug,
  })

  const { data: schema = { modules: [] } } = useQuery({
    queryKey: ['rbac-schema', slug],
    queryFn: () => apiClient.getRbacSchema(slug),
    enabled: !!slug,
  })

  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['rbac-users', slug],
    queryFn: () => apiClient.getRbacUsers(slug),
    enabled: !!slug,
  })

  const { data: mappings = [], isLoading: mappingsLoading, refetch: refetchMappings } = useQuery({
    queryKey: ['rbac-mappings', slug],
    queryFn: () => apiClient.getRbacMappings(slug),
    enabled: !!slug,
  })

  const { data: authGroups = [] } = useQuery({
    queryKey: ['rbac-authentik-groups'],
    queryFn: () => apiClient.getRbacAuthentikGroups(),
  })

  const { data: currentPerms = [] } = useQuery({
    queryKey: ['rbac-role-perms', permsDialog],
    queryFn: () => apiClient.getRbacRolePermissions(permsDialog),
    enabled: !!permsDialog,
  })

  const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
    queryKey: ['rbac-audit', slug],
    queryFn: () => apiClient.getAuditLogs({ entity_type: slug, limit: 20 }),
    enabled: !!slug,
  })

  const updateApp = useMutation({
    mutationFn: ({ slug, data }) => apiClient.updateRbacApp(slug, data),
    onSuccess: () => { toast.success('App updated'); setEditApp(false); queryClient.invalidateQueries({ queryKey: ['rbac-apps'] }) },
    onError: (e) => toast.error(e.message),
  })

  const createRole = useMutation({
    mutationFn: (data) => apiClient.createRbacRole(slug, data),
    onSuccess: () => { toast.success('Role created'); setShowCreateRole(false); setRoleName(''); setRoleDisplayName(''); setRoleDescription(''); setRoleBaseRole('viewer'); setRoleIsDefault(false); refetchRoles() },
    onError: (e) => toast.error(e.message),
  })

  const updateRole = useMutation({
    mutationFn: ({ id, data }) => apiClient.updateRbacRole(id, data),
    onSuccess: () => { toast.success('Role updated'); setEditingRole(null); refetchRoles() },
    onError: (e) => toast.error(e.message),
  })

  const deleteRole = useMutation({
    mutationFn: (id) => apiClient.deleteRbacRole(id),
    onSuccess: () => { toast.success('Role deactivated'); refetchRoles() },
    onError: (e) => toast.error(e.message),
  })

  const updatePerms = useMutation({
    mutationFn: ({ id, permissions }) => apiClient.updateRbacRolePermissions(id, permissions),
    onSuccess: () => { toast.success('Permissions saved'); setPermsDialog(null) },
    onError: (e) => toast.error(e.message),
  })

  const createMapping = useMutation({
    mutationFn: (data) => apiClient.createRbacMapping(slug, data),
    onSuccess: () => { toast.success('Mapping created'); setShowCreateMapping(false); setNewMappingGroup(''); setNewMappingRole(''); setNewMappingPriority(0); refetchMappings() },
    onError: (e) => toast.error(e.message),
  })

  const createBulk = useMutation({
    mutationFn: (data) => apiClient.createRbacMappingsBulk(slug, data),
    onSuccess: (data) => {
      toast.success(`Created ${data.successCount} mappings` + (data.errorCount > 0 ? ` (${data.errorCount} skipped)` : ''))
      setShowBulkImport(false); setBulkSelectedGroups([]); setBulkRoleId(''); setBulkPriority(0); refetchMappings()
    },
    onError: (e) => toast.error(e.message),
  })

  const updateMapping = useMutation({
    mutationFn: ({ id, data }) => apiClient.updateRbacMapping(id, data),
    onSuccess: () => { toast.success('Mapping updated'); refetchMappings() },
    onError: (e) => toast.error(e.message),
  })

  const deleteMapping = useMutation({
    mutationFn: (id) => apiClient.deleteRbacMapping(id),
    onSuccess: () => { toast.success('Mapping removed'); refetchMappings() },
    onError: (e) => toast.error(e.message),
  })

  const syncUsers = useMutation({
    mutationFn: () => apiClient.syncRbacUsers(slug),
    onSuccess: (data) => { toast.success(`Synced ${data.synced} users`); refetchUsers() },
    onError: (e) => toast.error(e.message),
  })

  const overrideMutation = useMutation({
    mutationFn: ({ sub, role_definition_id }) => apiClient.overrideRbacUserRole(slug, sub, role_definition_id),
    onSuccess: () => { toast.success('Role override saved'); setOverrideUser(null); setOverrideRole(''); refetchUsers() },
    onError: (e) => toast.error(e.message),
  })

  const handleCreateRoleSubmit = () => {
    if (!roleName.trim()) { toast.error('Role name is required'); return }
    createRole.mutate({ name: roleName.trim(), display_name: roleDisplayName.trim() || roleName.trim(), description: roleDescription.trim(), base_role: roleBaseRole, is_default: roleIsDefault })
  }

  const handleEditRoleSubmit = () => {
    if (!editingRole) return
    updateRole.mutate({ id: editingRole.id, data: { name: editRoleName, display_name: editRoleDisplay, description: editRoleDesc, base_role: editRoleBase, is_default: editRoleDefault } })
  }

  const handleEditRole = (role) => {
    setEditingRole(role)
    setEditRoleName(role.name)
    setEditRoleDisplay(role.display_name || '')
    setEditRoleDesc(role.description || '')
    setEditRoleBase(role.base_role || 'viewer')
    setEditRoleDefault(role.is_default || false)
  }

  const confirmDelete = (title, description, onConfirm) => {
    setDeleteConfirm({ open: true, title, description, onConfirm })
  }

  const filteredMappingGroups = mappingGroupSearch
    ? authGroups.filter(g => g.name.toLowerCase().includes(mappingGroupSearch.toLowerCase()))
    : authGroups

  const mappedGroupNames = new Set(mappings.map(m => m.authentik_group))
  const unmappedGroups = authGroups.filter(g => !mappedGroupNames.has(g.name))
  const filteredBulkGroups = bulkGroupSearch
    ? unmappedGroups.filter(g => g.name.toLowerCase().includes(bulkGroupSearch.toLowerCase()))
    : unmappedGroups

  const toggleBulkGroup = (name) => {
    setBulkSelectedGroups(prev => prev.includes(name) ? prev.filter(g => g !== name) : [...prev, name])
  }

  const handleBulkSubmit = () => {
    if (bulkSelectedGroups.length === 0 || !bulkRoleId) { toast.error('Select groups and a role'); return }
    createBulk.mutate({ groups: bulkSelectedGroups, role_definition_id: parseInt(bulkRoleId), priority: bulkPriority })
  }

  const permMap = {}
  for (const p of currentPerms) {
    permMap[p.module_name] = p.actions
  }

  const togglePermAction = (moduleName, action) => {
    setPermEditor(prev => {
      const current = prev[moduleName] || permMap[moduleName] || []
      const updated = current.includes(action)
        ? current.filter(a => a !== action)
        : [...current, action]
      return { ...prev, [moduleName]: updated }
    })
  }

  const handleSavePerms = () => {
    const allPerms = { ...permMap }
    for (const [mod, actions] of Object.entries(permEditor)) {
      allPerms[mod] = actions
    }
    const permissions = Object.entries(allPerms)
      .filter(([, actions]) => actions.length > 0)
      .map(([module_name, actions]) => ({ module_name, actions }))
    updatePerms.mutate({ id: permsDialog, permissions })
  }

  const getEffectivePerms = () => {
    const merged = { ...permMap }
    for (const [mod, actions] of Object.entries(permEditor)) {
      merged[mod] = actions
    }
    return merged
  }

  const modules = schema.modules || []

  if (appsLoading) {
    return (
      <div className="space-y-6">
        <Link to="/roles" className="text-sm text-accent hover:text-accent-hover flex items-center gap-1 w-fit">&larr; Back to Apps</Link>
        <LoadingSpinner />
      </div>
    )
  }

  if (!selectedApp) {
    return (
      <div className="space-y-6">
        <Link to="/roles" className="text-sm text-accent hover:text-accent-hover flex items-center gap-1 w-fit">&larr; Back to Apps</Link>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>App '{slug}' not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/roles" className="text-sm text-accent hover:text-accent-hover flex items-center gap-1 w-fit">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Apps
      </Link>

      {/* App Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Folder className="h-5 w-5" />
            {selectedApp?.display_name || selectedApp?.name || slug}
            {isOgun && <Badge variant="secondary" className="text-[10px]">Ogun Bridge (self)</Badge>}
          </CardTitle>
          <CardDescription>slug: {slug}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Authentik Slug</span>
              <p className="font-medium font-mono">{selectedApp?.authentik_slug || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Access Group</span>
              <p className="font-medium font-mono">{selectedApp?.access_group || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Users</span>
              <p className="font-medium">{selectedApp?.user_count || users.length || 0}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <p><Badge variant={selectedApp?.is_active !== false ? 'default' : 'secondary'}>{selectedApp?.is_active !== false ? 'Active' : 'Inactive'}</Badge></p>
            </div>
          </div>
          {currentUser?.role === 'super_admin' && (
            <div className="mt-3 pt-3 border-t flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setEditApp(true); setAppForm({ authentik_slug: selectedApp?.authentik_slug || '', access_group: selectedApp?.access_group || '', schema_endpoint: selectedApp?.schema_endpoint || '', is_active: selectedApp?.is_active !== false, display_name: selectedApp?.display_name || '' }) }}>
                <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowApiKey(!showApiKey)}>
                <Key className="h-3.5 w-3.5 mr-1" /> {showApiKey ? 'Hide' : 'Show'} API Key
              </Button>
              {slug !== 'ogun' && (
                <Button variant="ghost" size="sm" onClick={() => window.open(selectedApp?.schema_endpoint || '#', '_blank')} disabled={!selectedApp?.schema_endpoint}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Schema
                </Button>
              )}
            </div>
          )}
          {showApiKey && selectedApp?.api_key && (
            <div className="mt-2 text-sm">
              <code className="bg-muted px-2 py-1 rounded text-xs font-mono select-all break-all">{selectedApp.api_key}</code>
            </div>
          )}
          {editApp && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Authentik slug</label>
                  <Input value={appForm.authentik_slug || ''} onChange={e => setAppForm(f => ({ ...f, authentik_slug: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Access group</label>
                  <Input value={appForm.access_group || ''} onChange={e => setAppForm(f => ({ ...f, access_group: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Schema endpoint</label>
                <Input value={appForm.schema_endpoint || ''} onChange={e => setAppForm(f => ({ ...f, schema_endpoint: e.target.value }))} className="mt-1" />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={appForm.is_active} onCheckedChange={v => setAppForm(f => ({ ...f, is_active: v }))} />
                <span className="text-sm text-muted-foreground">Active</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => updateApp.mutate({ slug, data: appForm })}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditApp(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          {!isOgun && <TabsTrigger value="mappings">Mappings</TabsTrigger>}
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="roles">
          {isOgun ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                <Shield className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p>Roles for Ogun Bridge are managed by Authentik</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5" />
                  Roles
                </CardTitle>
                <CardDescription>Role definitions and module permissions</CardDescription>
              </CardHeader>
              <CardContent>
                {rolesLoading ? <LoadingSpinner /> : roles.length === 0 ? (
                  <EmptyState message="No roles defined for this app" />
                ) : (
                  <div className="border rounded-sm overflow-hidden mb-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Display Name</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Base Role</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Modules</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roles.map(r => (
                          <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {r.is_default && <Badge variant="secondary" className="text-[10px]">default</Badge>}
                                <span className="font-mono">{r.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{r.display_name || '—'}</td>
                            <td className="px-4 py-2.5"><Badge variant="secondary">{r.base_role || 'viewer'}</Badge></td>
                            <td className="px-4 py-2.5 text-muted-foreground">{r.module_count || 0} modules</td>
                            <td className="px-4 py-2.5">
                              <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button onClick={() => { setPermsDialog(r.id); setPermEditor({}) }} className="text-muted-foreground hover:text-foreground mr-3" title="Edit permissions">
                                <Shield className="h-4 w-4" />
                              </button>
                              <button onClick={() => handleEditRole(r)} className="text-muted-foreground hover:text-foreground mr-3">
                                <Edit2 className="h-4 w-4" />
                              </button>
                              {!r.is_default && (
                                <button onClick={() => confirmDelete('Deactivate Role', `Deactivate '${r.display_name || r.name}'?`, () => { deleteRole.mutate(r.id); setDeleteConfirm({ open: false }) })} className="text-muted-foreground hover:text-destructive">
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
                <RequireRole roles={['admin']}>
                  <Button size="sm" onClick={() => setShowCreateRole(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Role
                  </Button>
                </RequireRole>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Users
                {isOgun && <Badge variant="secondary" className="text-[10px]">read-only</Badge>}
              </CardTitle>
              <CardDescription>Users who have authenticated to this app</CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? <LoadingSpinner /> : users.length === 0 ? (
                <EmptyState message="No users have authenticated to this app yet" />
              ) : (
                <div className="border rounded-sm overflow-hidden mb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email / Sub</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Role</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Last Auth</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Last Sync</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                        {!isOgun && <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.oidc_sub} className="border-t border-border hover:bg-muted/30">
                          <td className="px-4 py-2.5">{u.email || u.oidc_sub}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant="default">{u.role_name || 'viewer'}</Badge>
                            {u.override_role && <Badge variant="secondary" className="ml-1 text-[10px]">overridden</Badge>}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{formatTime(u.last_auth)}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{formatTime(u.last_sync)}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant={u.is_active !== false ? 'default' : 'secondary'}>{u.is_active !== false ? 'Active' : 'Inactive'}</Badge>
                          </td>
                          {!isOgun && (
                            <td className="px-4 py-2.5 text-right">
                              <button onClick={() => { setOverrideUser(u); setOverrideRole('') }} className="text-xs text-accent hover:text-accent-hover">Override Role</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!isOgun && (
                <Button size="sm" variant="ghost" onClick={() => syncUsers.mutate()} disabled={syncUsers.isPending}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${syncUsers.isPending ? 'animate-spin' : ''}`} />
                  Sync from Authentik
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {!isOgun && (
          <TabsContent value="mappings">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Key className="h-5 w-5" />
                      Group Mappings
                    </CardTitle>
                    <CardDescription>Authentik group → role mappings</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <RequireRole roles={['admin']}>
                      <Button size="sm" variant="outline" onClick={() => setShowBulkImport(true)}>Bulk Import</Button>
                      <Button size="sm" onClick={() => setShowCreateMapping(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Add Mapping
                      </Button>
                    </RequireRole>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {mappingsLoading ? <LoadingSpinner /> : mappings.length === 0 ? (
                  <EmptyState message="No mappings configured for this app" />
                ) : (
                  <div className="border rounded-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Authentik Group</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Mapped Role</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Priority</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                          <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappings.map(m => (
                          <tr key={m.id} className="border-t border-border hover:bg-muted/30">
                            <td className="px-4 py-2.5 font-mono">{m.authentik_group}</td>
                            <td className="px-4 py-2.5"><Badge variant="default">{m.role_name || '—'}</Badge></td>
                            <td className="px-4 py-2.5 text-muted-foreground">{m.priority || 0}</td>
                            <td className="px-4 py-2.5">
                              <Badge variant={m.is_active ? 'default' : 'secondary'}>{m.is_active ? 'Active' : 'Inactive'}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <RequireRole roles={['admin']}>
                                <button onClick={() => updateMapping.mutate({ id: m.id, data: { ...m, is_active: !m.is_active } })} className="text-muted-foreground hover:text-foreground mr-3 text-xs">
                                  {m.is_active ? 'Disable' : 'Enable'}
                                </button>
                                <button onClick={() => confirmDelete('Remove Mapping', `Remove mapping for group '${m.authentik_group}'?`, () => { deleteMapping.mutate(m.id); setDeleteConfirm({ open: false }) })} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </RequireRole>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5" />
                Audit Log
              </CardTitle>
              <CardDescription>Recent activity for this app (last 20 entries)</CardDescription>
            </CardHeader>
            <CardContent>
              {auditLoading ? <LoadingSpinner /> : auditLogs.length === 0 ? (
                <EmptyState message="No audit log entries for this app" />
              ) : (
                <div className="border rounded-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Actor</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Timestamp</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Entity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log, idx) => (
                        <tr key={log.id || idx} className="border-t border-border hover:bg-muted/30">
                          <td className="px-4 py-2.5">
                            <Badge variant="secondary" className="text-[11px]">{log.action}</Badge>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs">{log.actor || '—'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatTime(log.timestamp)}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{log.entity_id || log.entity_type || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ── */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={deleteConfirm.onConfirm}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
      />

      <Dialog open={showCreateRole} onClose={() => setShowCreateRole(false)}>
        <DialogHeader><DialogTitle>Create Role</DialogTitle><DialogDescription>Define a new role for this application</DialogDescription></DialogHeader>
        <DialogContent>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Name (slug) *</label>
              <Input value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="e.g. support_agent" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Display Name</label>
              <Input value={roleDisplayName} onChange={e => setRoleDisplayName(e.target.value)} placeholder="e.g. Support Agent" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <Input value={roleDescription} onChange={e => setRoleDescription(e.target.value)} placeholder="Brief description" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Base Role</label>
              <Select value={roleBaseRole} onValueChange={setRoleBaseRole}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={roleIsDefault} onCheckedChange={setRoleIsDefault} />
              <span className="text-sm text-muted-foreground">Default role</span>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowCreateRole(false)}>Cancel</Button>
              <Button disabled={!roleName.trim()} onClick={handleCreateRoleSubmit}>
                {createRole.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingRole} onClose={() => setEditingRole(null)}>
        <DialogHeader><DialogTitle>Edit Role: {editingRole?.name}</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={editRoleName} onChange={e => setEditRoleName(e.target.value)} className="mt-1" disabled />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Display Name</label>
              <Input value={editRoleDisplay} onChange={e => setEditRoleDisplay(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <Input value={editRoleDesc} onChange={e => setEditRoleDesc(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Base Role</label>
              <Select value={editRoleBase} onValueChange={setEditRoleBase}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={editRoleDefault} onCheckedChange={setEditRoleDefault} />
              <span className="text-sm text-muted-foreground">Default role</span>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditingRole(null)}>Cancel</Button>
              <Button onClick={handleEditRoleSubmit}>{updateRole.isPending ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!permsDialog} onClose={() => setPermsDialog(null)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Permissions: {roles.find(r => r.id === permsDialog)?.display_name}</DialogTitle>
          <DialogDescription>Configure which modules and actions this role can access</DialogDescription>
        </DialogHeader>
        <DialogContent>
          {modules.length === 0 ? (
            <div className="text-center py-8 text-tertiary text-[13px]">No modules registered for this app yet</div>
          ) : (
            <div>
              <div className="max-h-96 overflow-y-auto space-y-1">
                {modules.map(mod => (
                  <ModuleTreeNode key={mod.name} mod={mod} effectivePerms={getEffectivePerms()} togglePermAction={togglePermAction} depth={0} />
                ))}
              </div>
              <DialogFooter className="mt-4">
                <Button variant="ghost" onClick={() => setPermsDialog(null)}>Cancel</Button>
                <Button onClick={handleSavePerms}>{updatePerms.isPending ? 'Saving...' : 'Save Permissions'}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateMapping} onClose={() => setShowCreateMapping(false)}>
        <DialogHeader><DialogTitle>Create Group → Role Mapping</DialogTitle><DialogDescription>Map an Authentik group to a role</DialogDescription></DialogHeader>
        <DialogContent>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Authentik Group</label>
              <Input value={mappingGroupSearch} onChange={e => setMappingGroupSearch(e.target.value)} placeholder="Search groups..." className="mt-1 text-xs" />
              <Select value={newMappingGroup} onValueChange={(v) => { setNewMappingGroup(v); setMappingGroupSearch('') }}>
                <SelectTrigger className="mt-2"><SelectValue placeholder="Select group..." /></SelectTrigger>
                <SelectContent>
                  {filteredMappingGroups.map(g => (
                    <SelectItem key={g.name} value={g.name}>{g.name} ({g.users} users)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Role</label>
              <Select value={newMappingRole} onValueChange={setNewMappingRole}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select role..." /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.display_name || r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Priority</label>
              <Input type="number" value={newMappingPriority} onChange={e => setNewMappingPriority(parseInt(e.target.value) || 0)} className="mt-1" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowCreateMapping(false)}>Cancel</Button>
              <Button disabled={!newMappingGroup || !newMappingRole} onClick={() => createMapping.mutate({ authentik_group: newMappingGroup, role_definition_id: parseInt(newMappingRole), priority: newMappingPriority })}>
                {createMapping.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkImport} onClose={() => setShowBulkImport(false)} className="max-w-lg">
        <DialogHeader><DialogTitle>Bulk Import Group Mappings</DialogTitle><DialogDescription>Map multiple groups to a role at once</DialogDescription></DialogHeader>
        <DialogContent>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Select Groups ({bulkSelectedGroups.length} selected)</label>
              <Input value={bulkGroupSearch} onChange={e => setBulkGroupSearch(e.target.value)} placeholder="Search groups..." className="mt-1 text-xs" />
              <div className="flex items-center gap-2 mt-2 mb-2">
                <Button size="sm" variant="ghost" onClick={() => setBulkSelectedGroups(filteredBulkGroups.map(g => g.name))} className="text-[11px]">Select All</Button>
                <Button size="sm" variant="ghost" onClick={() => setBulkSelectedGroups([])} className="text-[11px]">Clear</Button>
                <span className="text-[11px] text-muted-foreground">{filteredBulkGroups.length} unmapped groups</span>
              </div>
              <div className="max-h-48 overflow-y-auto border border-border rounded-sm p-2 space-y-1">
                {filteredBulkGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {bulkGroupSearch ? 'No groups matching search' : 'All groups already mapped'}
                  </p>
                ) : filteredBulkGroups.map(g => (
                  <label key={g.name} className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:bg-muted px-2 py-1 rounded-sm">
                    <Checkbox checked={bulkSelectedGroups.includes(g.name)} onCheckedChange={() => toggleBulkGroup(g.name)} />
                    <span className="font-mono">{g.name}</span>
                    {g.users !== undefined && <span className="text-muted-foreground ml-auto">({g.users})</span>}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Role</label>
              <Select value={bulkRoleId} onValueChange={setBulkRoleId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select role..." /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.display_name || r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Priority</label>
              <Input type="number" value={bulkPriority} onChange={e => setBulkPriority(parseInt(e.target.value) || 0)} className="mt-1" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowBulkImport(false)}>Cancel</Button>
              <Button disabled={bulkSelectedGroups.length === 0 || !bulkRoleId} onClick={handleBulkSubmit}>
                {createBulk.isPending ? 'Importing...' : `Import ${bulkSelectedGroups.length} group${bulkSelectedGroups.length !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!overrideUser} onClose={() => { setOverrideUser(null); setOverrideRole('') }}>
        <DialogHeader>
          <DialogTitle>Override Role for {overrideUser?.email || overrideUser?.oidc_sub}</DialogTitle>
          <DialogDescription>Manually assign a role override</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-3 py-2">
            <div className="text-sm text-muted-foreground">
              Current role: <Badge variant="default">{overrideUser?.role_name || 'viewer'}</Badge>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">New Role</label>
              <Select value={overrideRole} onValueChange={setOverrideRole}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Clear override</SelectItem>
                  {roles.map(r => (<SelectItem key={r.id} value={String(r.id)}>{r.display_name || r.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setOverrideUser(null); setOverrideRole('') }}>Cancel</Button>
              <Button onClick={() => overrideMutation.mutate({ sub: overrideUser.oidc_sub, role_definition_id: overrideRole ? parseInt(overrideRole) : null })} disabled={overrideMutation.isPending}>
                {overrideMutation.isPending ? 'Saving...' : 'Save Override'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
