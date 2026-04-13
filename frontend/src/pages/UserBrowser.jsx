import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, AlertCircle, CheckCircle2, User, Eye, UserCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SkeletonList, SkeletonCard } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/useDebounce'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'

export function UserBrowser() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedUser, setSelectedUser] = useState(null)
  
  const debouncedSearch = useDebounce(searchTerm, 300)

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', debouncedSearch, filterStatus],
    queryFn: () => apiClient.getUsers({
      search: debouncedSearch,
      status: filterStatus !== 'all' ? filterStatus : undefined
    }),
    refetchInterval: false,
  })

  const filteredUsers = users?.filter(user => {
    const matchesSearch = !searchTerm ||
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchTerm.toLowerCase())

    let matchesStatus = filterStatus === 'all' || user.syncStatus === filterStatus
    
    if (filterStatus === 'inactive') {
      matchesStatus = !user.hasPassword
    }

    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground mt-2">
          Browse and manage user synchronization
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
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
              <FilterButton
                active={filterStatus === 'inactive'}
                onClick={() => setFilterStatus('inactive')}
              >
                Inactive
              </FilterButton>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User List */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Users List */}
        <Card>
          <CardHeader>
            <CardTitle>
              {filteredUsers?.length || 0} Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <SkeletonList items={8} />
            ) : filteredUsers && filteredUsers.length > 0 ? (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {filteredUsers.map((user) => (
                  <UserListItem
                    key={user.id}
                    user={user}
                    selected={selectedUser?.id === user.id}
                    onClick={() => setSelectedUser(user)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No users found
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Details */}
        <div className="sticky top-6">
          {selectedUser ? (
            <UserDetails user={selectedUser} />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a user to view details</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
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

function UserListItem({ user, selected, onClick }) {
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

  const getRelativeTime = (timestamp) => {
    if (!timestamp) return ''
    const now = new Date()
    const then = new Date(timestamp)
    const diffMs = now - then
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const getPasswordActionInfo = (action) => {
    switch (action) {
      case 'password_invite_sent':
        return { icon: '📧', label: 'Invite', variant: 'default' }
      case 'password_force_reset':
        return { icon: '🔄', label: 'Force reset', variant: 'error' }
      case 'password_changed':
        return { icon: '🔑', label: 'Changed', variant: 'success' }
      case 'password_reset':
        return { icon: '🔑', label: 'Reset', variant: 'warning' }
      default:
        return { icon: '❓', label: action, variant: 'secondary' }
    }
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border transition-colors ${selected
          ? 'bg-primary/5 border-primary'
          : 'hover:bg-accent border-transparent'
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIcon(user.syncStatus)}
            <span className="font-medium truncate">{user.username}</span>
          </div>
          {user.email && (
            <div className="text-sm text-muted-foreground truncate">
              {user.email}
            </div>
          )}
          {user.name && (
            <div className="text-sm text-muted-foreground truncate">
              {user.name}
            </div>
          )}
          {user.lastPasswordAction && (
            <div className="mt-1">
              <Badge variant={getPasswordActionInfo(user.lastPasswordAction.action).variant} className="text-xs">
                {getPasswordActionInfo(user.lastPasswordAction.action).icon} {getPasswordActionInfo(user.lastPasswordAction.action).label} {getRelativeTime(user.lastPasswordAction.timestamp)}
              </Badge>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!user.hasPassword && user.isActive && (
            <Badge variant="warning" title="No password set">
              Active - No Password
            </Badge>
          )}
          {!user.hasPassword && !user.isActive && (
            <Badge variant="secondary" title="Inactive user">
              Inactive
            </Badge>
          )}
          <Badge variant={getStatusVariant(user.syncStatus)}>
            {user.syncStatus}
          </Badge>
        </div>
      </div>
      {user.error && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400 truncate">
          {user.error}
        </div>
      )}
    </button>
  )
}

function UserDetails({ user }) {
  const navigate = useNavigate()
  
  const { data: comparison, isLoading } = useQuery({
    queryKey: ['user-comparison', user.id],
    queryFn: () => apiClient.getUserComparison(user.id),
  })

  const handleTestMapping = async () => {
    try {
      await apiClient.testUserMapping(user.id)
      toast.success('Mapping test successful!')
    } catch (error) {
      toast.error(`Mapping test failed: ${error.message}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>User Details</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(`/users/${user.username}`)}>
              <UserCircle className="h-4 w-4 mr-2" />
              Full Profile
            </Button>
            <Button size="sm" variant="outline" onClick={handleTestMapping}>
              <Eye className="h-4 w-4 mr-2" />
              Test Mapping
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Info */}
        <div>
          <h3 className="font-semibold mb-3">Basic Information</h3>
          <div className="space-y-2 text-sm">
            <DetailRow label="Username" value={user.username} />
            <DetailRow label="Email" value={user.email} />
            <DetailRow label="Name" value={user.name} />
            <DetailRow
              label="Status"
              value={<Badge variant={user.syncStatus === 'synced' ? 'success' : 'error'}>
                {user.syncStatus}
              </Badge>}
            />
            {user.lastSynced && (
              <DetailRow
                label="Last Synced"
                value={new Date(user.lastSynced).toLocaleString()}
              />
            )}
          </div>
        </div>

        {/* Error Details */}
        {user.error && (
          <div>
            <h3 className="font-semibold mb-3 text-red-600 dark:text-red-400">
              Error Details
            </h3>
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md">
              <p className="text-sm text-red-900 dark:text-red-100 font-mono">
                {user.error}
              </p>
            </div>
          </div>
        )}

        {/* Comparison */}
        {comparison && !isLoading && (
          <div>
            <h3 className="font-semibold mb-3">Authentik vs LDAP</h3>
            <div className="space-y-4">
              {/* Authentik Data */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Authentik Data
                </h4>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md">
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(comparison.authentik, null, 2)}
                  </pre>
                </div>
              </div>

              {/* LDAP Data */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  LDAP Data
                </h4>
                {comparison.ldap ? (
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-md">
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(comparison.ldap, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 dark:bg-gray-950/20 border border-gray-200 dark:border-gray-900 rounded-md text-sm text-muted-foreground">
                    User not found in LDAP
                  </div>
                )}
              </div>

              {/* Differences */}
              {comparison.differences && Object.keys(comparison.differences).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Differences
                  </h4>
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-md">
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

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-start py-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-right">{value || 'N/A'}</span>
    </div>
  )
}
