import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  ClipboardList, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  User,
  Search,
  Filter,
  RefreshCw,
  Loader2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/services/api'
import { wsService } from '@/services/websocket'

export function ChangesBrowser() {
  const [filterStatus, setFilterStatus] = useState('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const queryClient = useQueryClient()

  const { data: changes = [], isLoading, refetch } = useQuery({
    queryKey: ['changes', filterStatus],
    queryFn: () => apiClient.getChanges({ status: filterStatus }),
    refetchInterval: 30000,
  })

  const { data: stats } = useQuery({
    queryKey: ['changes-stats'],
    queryFn: () => apiClient.getChanges({ limit: 1000 }),
    refetchInterval: 30000,
  })

  useEffect(() => {
    const unsubscribe = wsService.subscribeChanges(() => {
      queryClient.invalidateQueries({ queryKey: ['changes'] })
      queryClient.invalidateQueries({ queryKey: ['changes-stats'] })
    })
    return () => unsubscribe?.()
  }, [queryClient])

  const filteredChanges = changes.filter(change => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      change.entity_id?.toLowerCase().includes(search) ||
      change.change_type?.toLowerCase().includes(search) ||
      change.field_name?.toLowerCase().includes(search)
    )
  })

  const statsByStatus = {
    pending: stats?.filter(c => c.status === 'pending').length || 0,
    approved: stats?.filter(c => c.status === 'approved').length || 0,
    rejected: stats?.filter(c => c.status === 'rejected').length || 0,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Change Queue</h1>
        <p className="text-muted-foreground mt-2">
          Review and approve pending changes from LDAP drift detection
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{statsByStatus.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold">{statsByStatus.approved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold">{statsByStatus.rejected}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search changes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <FilterButton
                active={filterStatus === 'pending'}
                onClick={() => setFilterStatus('pending')}
              >
                Pending
              </FilterButton>
              <FilterButton
                active={filterStatus === 'approved'}
                onClick={() => setFilterStatus('approved')}
              >
                Approved
              </FilterButton>
              <FilterButton
                active={filterStatus === 'rejected'}
                onClick={() => setFilterStatus('rejected')}
              >
                Rejected
              </FilterButton>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Changes List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filteredChanges.length} {filteredChanges.length === 1 ? 'Change' : 'Changes'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading changes...
            </div>
          ) : filteredChanges.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No changes found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredChanges.map((change) => (
                <ChangeItem key={change.id} change={change} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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

function ChangeItem({ change }) {
  const queryClient = useQueryClient()
  const [showDetails, setShowDetails] = useState(false)

  const approveMutation = useMutation({
    mutationFn: (comment) => apiClient.approveChange(change.id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changes'] })
      queryClient.invalidateQueries({ queryKey: ['changes-stats'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (reason) => apiClient.rejectChange(change.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changes'] })
      queryClient.invalidateQueries({ queryKey: ['changes-stats'] })
    },
  })

  const getStatusBadge = () => {
    switch (change.status) {
      case 'pending':
        return <Badge variant="warning">Pending</Badge>
      case 'approved':
        return <Badge variant="success">Approved</Badge>
      case 'rejected':
        return <Badge variant="error">Rejected</Badge>
      default:
        return <Badge>{change.status}</Badge>
    }
  }

  const getChangeTypeBadge = () => {
    switch (change.change_type) {
      case 'orphan':
        return <Badge variant="outline">Orphan</Badge>
      case 'field_mismatch':
        return <Badge variant="outline">Field Mismatch</Badge>
      case 'inactive_user':
        return <Badge variant="outline">Inactive User</Badge>
      default:
        return <Badge variant="outline">{change.change_type}</Badge>
    }
  }

  return (
    <div className="border rounded p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <User className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="font-medium">{change.entity_id}</div>
            <div className="text-sm text-muted-foreground">
              {change.entity_type} • {change.field_name || 'N/A'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getChangeTypeBadge()}
          {getStatusBadge()}
        </div>
      </div>

      {change.change_type === 'field_mismatch' && (
        <div className="bg-muted rounded-sm p-3 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span className="font-medium">Value Mismatch</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <span className="text-muted-foreground">Authentik:</span>
              <div className="font-mono text-xs">{change.authentik_value || 'N/A'}</div>
            </div>
            <div>
              <span className="text-muted-foreground">LDAP:</span>
              <div className="font-mono text-xs">{change.ldap_value || 'N/A'}</div>
            </div>
          </div>
        </div>
      )}

      {change.change_type === 'orphan' && (
        <div className="bg-muted rounded-sm p-3 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span>User exists in LDAP but not in Authentik</span>
          </div>
        </div>
      )}

      {change.change_type === 'inactive_user' && (
        <div className="bg-muted rounded-sm p-3 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span>User has no password set in Authentik</span>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Detected: {new Date(change.detected_at).toLocaleString()}
      </div>

      {change.status === 'pending' && (
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            onClick={() => {
              const comment = prompt('Add a comment (optional):')
              approveMutation.mutate(comment)
            }}
            disabled={approveMutation.isPending}
          >
            {approveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-1" />
            )}
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              const reason = prompt('Reason for rejection:')
              if (reason) {
                rejectMutation.mutate(reason)
              }
            }}
            disabled={rejectMutation.isPending}
          >
            {rejectMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <XCircle className="h-4 w-4 mr-1" />
            )}
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}
