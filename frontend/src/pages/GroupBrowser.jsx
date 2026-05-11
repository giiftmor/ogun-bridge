import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, AlertCircle, CheckCircle2, Users, Eye, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/services/api'

export function GroupBrowser() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedGroup, setSelectedGroup] = useState(null)

  const { data: groups, isLoading } = useQuery({
    queryKey: ['groups', searchTerm, filterStatus],
    queryFn: () => apiClient.getGroups({
      search: searchTerm,
      status: filterStatus !== 'all' ? filterStatus : undefined
    }),
    refetchInterval: false,
  })

  const filteredGroups = groups?.filter(group => {
    const matchesSearch = !searchTerm ||
      group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.description?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = filterStatus === 'all' || group.syncStatus === filterStatus

    return matchesSearch && matchesStatus
  })

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
            </div>
          </div>
        </CardContent>
      </Card>

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
              <GroupDetails group={selectedGroup} />
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

function GroupDetails({ group }) {
  const { data: comparison, isLoading } = useQuery({
    queryKey: ['group-comparison', group.id],
    queryFn: () => apiClient.getGroupComparison(group.id),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Group Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="font-semibold mb-3">Basic Information</h3>
          <div className="space-y-2 text-sm">
            <DetailRow label="Name" value={group.name} />
            <DetailRow label="Description" value={group.description || 'N/A'} />
            <DetailRow
              label="Status"
              value={<Badge variant={group.syncStatus === 'synced' ? 'success' : 'error'}>
                {group.syncStatus}
              </Badge>}
            />
            {group.lastSynced && (
              <DetailRow
                label="Last Synced"
                value={new Date(group.lastSynced).toLocaleString()}
              />
            )}
          </div>
        </div>

        {group.error && (
          <div>
            <h3 className="font-semibold mb-3 text-red-600 dark:text-red-400">
              Error Details
            </h3>
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-sm">
              <p className="text-sm text-red-900 dark:text-red-100 font-mono">
                {group.error}
              </p>
            </div>
          </div>
        )}

        {comparison && !isLoading && (
          <div>
            <h3 className="font-semibold mb-3">Authentik vs LDAP</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Authentik Data
                </h4>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-sm">
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(comparison.authentik, null, 2)}
                  </pre>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  LDAP Data
                </h4>
                {comparison.ldap ? (
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-sm">
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(comparison.ldap, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 dark:bg-gray-950/20 border border-gray-200 dark:border-gray-900 rounded-sm text-sm text-muted-foreground">
                    Group not found in LDAP
                  </div>
                )}
              </div>

              {comparison.differences && Object.keys(comparison.differences).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Differences
                  </h4>
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

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-start py-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-right">{value || 'N/A'}</span>
    </div>
  )
}
