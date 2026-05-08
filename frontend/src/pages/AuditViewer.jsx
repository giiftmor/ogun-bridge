import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  ClipboardList, 
  Search, 
  Filter,
  RefreshCw,
  User,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Shield
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/services/api'

export function AuditViewer() {
  const [filterAction, setFilterAction] = useState('all')
  const [filterEntity, setFilterEntity] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', filterAction, filterEntity],
    queryFn: () => apiClient.getAuditLogs({
      action: filterAction !== 'all' ? filterAction : undefined,
      entity_type: filterEntity !== 'all' ? filterEntity : undefined,
      limit: 100,
    }),
    refetchInterval: 30000,
  })

  const { data: stats } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: apiClient.getAuditStats,
    refetchInterval: 60000,
  })

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      log.entity_id?.toLowerCase().includes(search) ||
      log.actor?.toLowerCase().includes(search) ||
      log.action?.toLowerCase().includes(search)
    )
  })

  const getActionBadge = (action) => {
    if (action?.includes('password')) return <Badge variant="warning">Password</Badge>
    if (action?.includes('sync')) return <Badge variant="default">Sync</Badge>
    if (action?.includes('approve')) return <Badge variant="success">Approved</Badge>
    if (action?.includes('reject')) return <Badge variant="destructive">Rejected</Badge>
    return <Badge variant="outline">{action}</Badge>
  }

  const getSuccessIcon = (success) => {
    if (success === false) return <XCircle className="h-4 w-4 text-red-500" />
    return <CheckCircle className="h-4 w-4 text-green-500" />
  }

  const uniqueActions = [...new Set(logs.map(l => l.action).filter(Boolean))]
  const uniqueEntities = [...new Set(logs.map(l => l.entity_type).filter(Boolean))]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Trail</h1>
        <p className="text-muted-foreground mt-2">
          System activity and change history
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Events</p>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
              </div>
              <ClipboardList className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Password Events</p>
                <p className="text-2xl font-bold">
                  {stats?.byAction?.find(a => a.action === 'password_synced')?.count || 0}
                </p>
              </div>
              <Shield className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sync Events</p>
                <p className="text-2xl font-bold">
                  {stats?.byAction?.filter(a => a.action?.includes('sync')).reduce((sum, a) => sum + parseInt(a.count), 0) || 0}
                </p>
              </div>
              <RefreshCw className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed Events</p>
                <p className="text-2xl font-bold">
                  {stats?.byAction?.find(a => a.action === 'password_sync_failed')?.count || 0}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
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
                placeholder="Search audit logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <select
                className="border rounded px-3 py-2 text-sm"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
              >
                <option value="all">All Actions</option>
                {uniqueActions.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
              <select
                className="border rounded px-3 py-2 text-sm"
                value={filterEntity}
                onChange={(e) => setFilterEntity(e.target.value)}
              >
                <option value="all">All Entities</option>
                {uniqueEntities.map(entity => (
                  <option key={entity} value={entity}>{entity}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log List */}
      <Card>
        <CardHeader>
          <CardTitle>{filteredLogs.length} Events</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading audit logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No audit logs found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <div key={log.id} className="border rounded p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getSuccessIcon(log.success)}
                      <div>
                        <div className="flex items-center gap-2">
                          {getActionBadge(log.action)}
                          <span className="font-medium">{log.entity_id}</span>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                          <User className="h-3 w-3" />
                          {log.actor}
                          <span>•</span>
                          <Clock className="h-3 w-3" />
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline">{log.entity_type}</Badge>
                  </div>
                  {log.changes && Object.keys(log.changes).length > 0 && (
                    <div className="mt-3 bg-muted rounded p-2 text-xs font-mono">
                      {JSON.stringify(log.changes, null, 2)}
                    </div>
                  )}
                  {log.error_message && (
                    <div className="mt-2 text-xs text-red-500">
                      Error: {log.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
