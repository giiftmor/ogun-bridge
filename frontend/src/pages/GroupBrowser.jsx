import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, AlertCircle, CheckCircle2, Users, Eye, ArrowLeft, ChevronRight, ChevronDown, GitBranch, Plus, Trash2, Edit3, X, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'

export function GroupBrowser() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [viewMode, setViewMode] = useState('list')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, group: null })
  const [showAddMember, setShowAddMember] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const queryClient = useQueryClient()

  const { data: groups, isLoading, error: groupsError } = useQuery({
    queryKey: ['groups', searchTerm, filterStatus],
    queryFn: () => apiClient.getGroups({
      search: searchTerm,
      status: filterStatus !== 'all' ? filterStatus : undefined
    }),
    refetchInterval: false,
  })

  const filteredGroups = groups

  const { data: treeData, isLoading: treeLoading } = useQuery({
    queryKey: ['group-tree'],
    queryFn: () => apiClient.getGroupTree(),
    enabled: viewMode === 'tree',
  })

  const { data: members } = useQuery({
    queryKey: ['group-members', selectedGroup?.id],
    queryFn: () => apiClient.getGroupMembers(selectedGroup.id),
    enabled: !!selectedGroup?.id,
  })

  const createMutation = useMutation({
    mutationFn: (data) => apiClient.createGroup(data),
    onSuccess: () => { toast.success('Group created'); setShowCreate(false); queryClient.invalidateQueries(['groups']) },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiClient.updateGroup(id, data),
    onSuccess: () => { toast.success('Group updated'); setEditing(false); queryClient.invalidateQueries(['groups']); queryClient.invalidateQueries(['group-detail']) },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => apiClient.deleteGroup(id),
    onSuccess: () => { toast.success('Group deleted'); setDeleteConfirm({ open: false, group: null }); setSelectedGroup(null); queryClient.invalidateQueries(['groups']) },
    onError: (err) => toast.error(err.message),
  })

  const addMemberMutation = useMutation({
    mutationFn: ({ id, usernames }) => apiClient.addGroupMembers(id, usernames),
    onSuccess: () => { toast.success('Members added'); setShowAddMember(false); setMemberSearch(''); queryClient.invalidateQueries(['group-members', selectedGroup?.id]) },
    onError: (err) => toast.error(err.message),
  })

  const removeMemberMutation = useMutation({
    mutationFn: ({ id, username }) => apiClient.removeGroupMember(id, username),
    onSuccess: () => { toast.success('Member removed'); queryClient.invalidateQueries(['group-members', selectedGroup?.id]) },
    onError: (err) => toast.error(err.message),
  })

  const { data: allUsers = [] } = useQuery({
    queryKey: ['public-users'],
    queryFn: () => apiClient.getUsersList(),
  })

  const availableUsers = allUsers.filter(u => {
    if (!members?.authentik) return true
    const memberUsernames = (members.authentik || []).map(m => typeof m === 'string' ? m : m.username)
    return !memberUsernames.includes(u.username)
  })

  const filteredUsers = memberSearch
    ? availableUsers.filter(u => u.username.toLowerCase().includes(memberSearch.toLowerCase()) || u.email?.toLowerCase().includes(memberSearch.toLowerCase()))
    : availableUsers

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Groups</h1>
        <p className="text-muted-foreground mt-2">
          Browse and manage group synchronization
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search groups..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <FilterButton
                active={filterStatus === 'all'}
                onClick={() => setFilterStatus('all')}
              >
                All
              </FilterButton>
              <FilterButton
                active={filterStatus === 'synced'}
                onClick={() => setFilterStatus('synced')}
              >
                Synced
              </FilterButton>
              <FilterButton
                active={filterStatus === 'error'}
                onClick={() => setFilterStatus('error')}
              >
                Errors
              </FilterButton>
              <FilterButton
                active={filterStatus === 'pending'}
                onClick={() => setFilterStatus('pending')}
              >
                Pending
              </FilterButton>
              <div className="border-l pl-2 ml-2 flex gap-2">
                <Button variant="default" size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Create
                </Button>
                <Button
                  variant={viewMode === 'tree' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode(viewMode === 'list' ? 'tree' : 'list')}
                >
                  <GitBranch className="h-4 w-4 mr-1" />
                  {viewMode === 'list' ? 'Tree' : 'List'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {groupsError && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-sm text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Failed to load groups: {groupsError.message}</span>
        </div>
      )}

      {viewMode === 'tree' ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                Group Hierarchy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {treeLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading tree...
                </div>
              ) : treeData?.authentik?.length > 0 ? (
                <div className="max-h-[600px] overflow-y-auto">
                  {treeData.authentik.map((node) => (
                    <GroupTreeItem
                      key={node.pk}
                      node={node}
                      depth={0}
                      selectedId={selectedGroup?.id}
                      onSelect={(group) => setSelectedGroup(group)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No hierarchy data
                </div>
              )}
            </CardContent>
          </Card>
          <div className="sticky top-6">
            {selectedGroup ? (
              <GroupDetails
                group={selectedGroup}
                showParent
                editing={editing}
                onEdit={(id, data) => updateMutation.mutate({ id, data })}
                onDelete={(g) => setDeleteConfirm({ open: true, group: g })}
                onStartEdit={() => setEditing(true)}
                onCancelEdit={() => setEditing(false)}
                onAddMember={() => setShowAddMember(true)}
                onRemoveMember={(id, username) => removeMemberMutation.mutate({ id, username })}
              />
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12 text-muted-foreground">
                    <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a group to view details</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : (
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {filteredGroups?.length || 0} Groups
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading groups...
              </div>
            ) : filteredGroups && filteredGroups.length > 0 ? (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {filteredGroups.map((group) => (
                  <GroupListItem
                    key={group.id}
                    group={group}
                    selected={selectedGroup?.id === group.id}
                    onClick={() => setSelectedGroup(group)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No groups found
              </div>
            )}
          </CardContent>
        </Card>

        <div className="sticky top-6">
          {selectedGroup ? (
            <>
              <button
                onClick={() => setSelectedGroup(null)}
                className="lg:hidden flex items-center gap-1 text-[13px] text-accent hover:text-accent-hover mb-3 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to group list
              </button>
              <GroupDetails
                group={selectedGroup}
                editing={editing}
                onEdit={(id, data) => updateMutation.mutate({ id, data })}
                onDelete={(g) => setDeleteConfirm({ open: true, group: g })}
                onStartEdit={() => setEditing(true)}
                onCancelEdit={() => setEditing(false)}
                onAddMember={() => setShowAddMember(true)}
                onRemoveMember={(id, username) => removeMemberMutation.mutate({ id, username })}
              />
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a group to view details</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      )}

      {/* Create Group Dialog */}
      <CreateGroupDialog open={showCreate} onClose={() => setShowCreate(false)} onConfirm={(data) => createMutation.mutate(data)} groups={treeData?.authentik || []} />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, group: null })}
        onConfirm={() => deleteMutation.mutate(deleteConfirm.group.id)}
        title="Delete Group"
        description={`Are you sure you want to delete '${deleteConfirm.group?.name}'? This will remove it from Authentik and LDAP.`}
        loading={deleteMutation.isPending}
      />

      {/* Add Member Dialog */}
      {showAddMember && (
        <Card className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddMember(false)}>
          <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Add Member</CardTitle>
              <CardDescription>Search and add a user to this group</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Search users..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-[240px] overflow-y-auto space-y-1">
                {filteredUsers.map(u => (
                  <button
                    key={u.username}
                    onClick={() => addMemberMutation.mutate({ id: selectedGroup?.id, usernames: [u.username] })}
                    className="w-full text-left p-2 rounded border hover:bg-subtle text-sm transition-colors"
                  >
                    <span className="font-medium">{u.username}</span>
                    {u.email && <span className="text-tertiary ml-2">{u.email}</span>}
                  </button>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="text-sm text-tertiary text-center py-4">No users found</p>
                )}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => { setShowAddMember(false); setMemberSearch('') }}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </Card>
      )}
    </div>
  )
}

function FilterButton({ children, active, onClick }) {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function GroupListItem({ group, selected, onClick }) {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'synced':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusVariant = (status) => {
    switch (status) {
      case 'synced':
        return 'success'
      case 'error':
        return 'error'
      case 'pending':
        return 'warning'
      default:
        return 'secondary'
    }
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded border transition-colors ${selected
          ? 'bg-primary/5 border-primary'
          : 'hover:bg-accent border-transparent'
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIcon(group.syncStatus)}
            <span className="font-medium truncate">{group.name}</span>
          </div>
          {group.description && (
            <div className="text-sm text-muted-foreground truncate">
              {group.description}
            </div>
          )}
        </div>
        <Badge variant={getStatusVariant(group.syncStatus)} className="shrink-0">
          {group.syncStatus}
        </Badge>
      </div>
      {group.error && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400 truncate">
          {group.error}
        </div>
      )}
    </button>
  )
}

function GroupDetails({ group, showParent, editing, onEdit, onDelete, onStartEdit, onCancelEdit }) {
  const { data: comparison, isLoading: loadingComparison } = useQuery({
    queryKey: ['group-comparison', group.id],
    queryFn: () => apiClient.getGroupComparison(group.id),
  })

  const { data: detail } = useQuery({
    queryKey: ['group-detail', group.id],
    queryFn: () => apiClient.getGroup(group.id),
    enabled: !!showParent,
  })

  const { data: members } = useQuery({
    queryKey: ['group-members', group.id],
    queryFn: () => apiClient.getGroupMembers(group.id),
  })

  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  useEffect(() => {
    if (editing) {
      setEditName(detail?.name || group.name || '')
      setEditDesc(detail?.description || group.description || '')
    }
  }, [editing, detail, group])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Group Details</CardTitle>
          <div className="flex items-center gap-2">
            {!editing && (
              <>
                <Button variant="outline" size="sm" onClick={onStartEdit}>
                  <Edit3 className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => onDelete(group)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {editing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onEdit(group.id, { name: editName, description: editDesc })}>
                Save
              </Button>
              <Button variant="outline" size="sm" onClick={onCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="space-y-2 text-sm">
              <DetailRow label="Name" value={group.name} />
              <DetailRow label="Description" value={group.description || 'N/A'} />
              {showParent && detail?.parentName && (
                <DetailRow label="Parent" value={<Badge variant="outline">{detail.parentName}</Badge>} />
              )}
              {showParent && detail?.childCount > 0 && (
                <DetailRow label="Child Groups" value={<Badge variant="secondary">{detail.childCount}</Badge>} />
              )}
              <DetailRow label="Status" value={<Badge variant={group.syncStatus === 'synced' ? 'success' : 'danger'}>{group.syncStatus}</Badge>} />
            </div>
          </div>
        )}

        {/* Members Section */}
        <div>
          <h3 className="font-semibold mb-3">Members ({members?.authentik?.length || 0})</h3>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {(members?.authentik || []).map((m) => {
              const username = typeof m === 'string' ? m : m.username
              const isDirect = members?.effective_authentik?.includes(username) !== false
              return (
                <div key={username} className="flex items-center justify-between p-2 border rounded text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{username}</span>
                    {!isDirect && <Badge variant="ghost" className="text-[10px]">inherited</Badge>}
                  </div>
                  {isDirect && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemoveMember(group.id, username)}>
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              )
            })}
            {(!members?.authentik || members.authentik.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">No members</p>
            )}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddMember(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Member
          </Button>
        </div>

        {showParent && detail && detail.children?.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Child Groups</h3>
            <div className="space-y-1">
              {detail.children.map((child) => (
                <div key={child.pk} className="flex items-center gap-2 text-sm p-2 bg-accent/50 rounded">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <span>{child.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {group.error && (
          <div>
            <h3 className="font-semibold mb-3 text-red-600 dark:text-red-400">Error Details</h3>
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-sm">
              <p className="text-sm text-red-900 dark:text-red-100 font-mono">{group.error}</p>
            </div>
          </div>
        )}

        {comparison && !loadingComparison && (
          <div>
            <h3 className="font-semibold mb-3">Authentik vs LDAP</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Authentik Data</h4>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-sm">
                  <pre className="text-xs overflow-auto">{JSON.stringify(comparison.authentik, null, 2)}</pre>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">LDAP Data</h4>
                {comparison.ldap ? (
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-sm">
                    <pre className="text-xs overflow-auto">{JSON.stringify(comparison.ldap, null, 2)}</pre>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 dark:bg-gray-950/20 border border-gray-200 dark:border-gray-900 rounded-sm text-sm text-muted-foreground">
                    Group not found in LDAP
                  </div>
                )}
              </div>
              {comparison.differences && Object.keys(comparison.differences).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Differences</h4>
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-sm">
                    <ul className="text-sm space-y-1">
                      {Object.entries(comparison.differences).map(([key, value]) => (
                        <li key={key} className="font-mono">
                          <span className="font-semibold">{key}:</span>{' '}
                          <span className="text-red-600">{value.authentik}</span> →{' '}
                          <span className="text-green-600">{value.ldap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function GroupTreeItem({ node, depth, selectedId, onSelect }) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children?.length > 0

  return (
    <div>
      <button
        onClick={() => {
          onSelect({
            id: node.pk,
            name: node.name,
            description: node.description || '',
            syncStatus: 'synced',
          })
        }}
        className={`w-full text-left p-2 rounded border transition-colors text-sm mb-0.5 flex items-center gap-2 ${
          selectedId === node.pk
            ? 'bg-primary/5 border-primary'
            : 'hover:bg-accent border-transparent'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <span onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        <span className="truncate">{node.name}</span>
        {node.users_count > 0 && (
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {node.users_count} users
          </span>
        )}
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <GroupTreeItem
              key={child.pk || child.cn}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CreateGroupDialog({ open, onClose, onConfirm, groups }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parent, setParent] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Group name is required'); return }
    const data = { name: name.trim(), description: description.trim() }
    if (parent) data.parent = parent
    onConfirm(data)
    setName(''); setDescription(''); setParent('')
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="createName">Group Name *</Label>
              <Input id="createName" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., developers" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="createDesc">Description</Label>
              <Input id="createDesc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Group description" />
            </div>
            <div className="space-y-2">
              <Label>Parent Group (optional)</Label>
              <select
                value={parent}
                onChange={e => setParent(e.target.value)}
                className="w-full h-9 rounded-sm border border-border bg-page px-3 text-sm"
              >
                <option value="">No parent (root group)</option>
                {groups.map(g => (
                  <option key={g.pk} value={g.pk}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-start py-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-right">{value || 'N/A'}</span>
    </div>
  )
}
