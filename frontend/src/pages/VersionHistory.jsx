import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  History, 
  Clock, 
  User, 
  Users, 
  RotateCcw,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/dialog'
import { apiClient } from '@/services/api'
import toast from 'react-hot-toast'

export function VersionHistory() {
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [entityType, setEntityType] = useState('user')
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null })
  const [entityId, setEntityId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedVersions, setExpandedVersions] = useState({})
  const queryClient = useQueryClient()

  const { data: versionedEntities, isLoading: loadingEntities } = useQuery({
    queryKey: ['versioned-entities'],
    queryFn: () => apiClient.getAllVersionedEntities(),
    refetchInterval: 30000,
  })

  const { data: versionHistoryData, isLoading: loadingHistory, refetch } = useQuery({
    queryKey: ['version-history', entityType, entityId],
    queryFn: () => apiClient.getVersionHistory(entityType, entityId, 50),
    enabled: !!entityId,
  })

  const versionHistory = versionHistoryData?.history || []

  const rollbackMutation = useMutation({
    mutationFn: ({ entityType, entityId, versionNumber }) => 
      apiClient.rollbackToVersion(entityType, entityId, versionNumber),
    onSuccess: (data) => {
      toast.success(`Rolled back to version ${data.message?.match(/v(\d+)/)?.[1] || 'unknown'}`)
      queryClient.invalidateQueries({ queryKey: ['version-history'] })
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to rollback')
    },
  })

  const toggleVersion = (versionId) => {
    setExpandedVersions(prev => ({
      ...prev,
      [versionId]: !prev[versionId]
    }))
  }

  const filteredEntities = versionedEntities?.filter(entity => {
    if (!searchTerm) return true
    return entity.entity_id.toLowerCase().includes(searchTerm.toLowerCase())
  }) || []

  const handleEntitySelect = (entity_type, entity_id) => {
    setEntityType(entity_type)
    setEntityId(entity_id)
    setSelectedEntity({ type: entity_type, id: entity_id })
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown'
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Version History</h1>
        <p className="text-muted-foreground mt-2">
          View snapshots and rollback to previous states
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Tracked Entities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                placeholder="Search entities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mb-4"
              />

              {loadingEntities ? (
                <div className="text-center py-4 text-muted-foreground">Loading...</div>
              ) : filteredEntities.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  No versioned entities yet. Snapshots are created automatically during sync.
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {filteredEntities.map((entity) => (
                    <div
                      key={`${entity.entity_type}-${entity.entity_id}`}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedEntity?.id === entity.entity_id && selectedEntity?.type === entity.entity_type
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => handleEntitySelect(entity.entity_type, entity.entity_id)}
                    >
                      <div className="flex items-center gap-3">
                        {entity.entity_type === 'user' ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Users className="h-4 w-4" />
                        )}
                        <span className="font-medium">{entity.entity_id}</span>
                        <Badge variant="outline">{entity.entity_type}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        v{entity.latest_version}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Version Timeline
              {entityId && (
                <Badge variant="outline" className="ml-auto">
                  {versionHistoryData?.count || 0} versions
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!entityId ? (
              <div className="text-center py-8 text-muted-foreground">
                Select an entity from the left to view its version history
              </div>
            ) : loadingHistory ? (
              <div className="text-center py-8 text-muted-foreground">Loading versions...</div>
            ) : versionHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No versions found for {entityId}
              </div>
            ) : (
              <div className="space-y-3">
                {versionHistory.map((version) => (
                  <div
                    key={version.id}
                    className="border rounded-lg overflow-hidden"
                  >
                    <div
                      className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleVersion(version.id)}
                    >
                      <div className="flex items-center gap-3">
                        {expandedVersions[version.id] ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        <span className="font-medium">Version {version.version_number}</span>
                        <Badge variant={version.description?.includes('delete') ? 'destructive' : 'secondary'}>
                          {version.description || 'Auto-snapshot'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          {formatDate(version.created_at)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          by {version.created_by}
                        </span>
                      </div>
                    </div>

                    {expandedVersions[version.id] && (
                      <div className="p-3 border-t bg-background">
                        <div className="mb-3">
                          <h4 className="text-sm font-medium mb-2">Snapshot Data:</h4>
                          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-60">
                            {JSON.stringify(version.snapshot_data, null, 2)}
                          </pre>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const data = JSON.stringify(version.snapshot_data, null, 2)
                              navigator.clipboard.writeText(data)
                              toast.success('Copied to clipboard')
                            }}
                          >
                            Copy Data
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setConfirmDialog({
                                open: true,
                                title: 'Rollback Version',
                                description: `Rollback ${entityId} to version ${version.version_number}? This will create a new version with current data.`,
                                onConfirm: () => {
                                  rollbackMutation.mutate({ 
                                    entityType, 
                                    entityId, 
                                    versionNumber: version.version_number 
                                  })
                                  setConfirmDialog({ open: false })
                                }
                              })
                            }}
                            disabled={rollbackMutation.isPending}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            {rollbackMutation.isPending ? 'Rolling back...' : 'Rollback'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            How Version Control Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Automatic Snapshots
              </h4>
              <p className="text-sm text-muted-foreground">
                Snapshots are automatically created before any sync operation modifies users or groups.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <History className="h-4 w-4 text-blue-500" />
                Version History
              </h4>
              <p className="text-sm text-muted-foreground">
                View all previous versions of any entity with full snapshot data and timestamps.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-orange-500" />
                One-Click Rollback
              </h4>
              <p className="text-sm text-muted-foreground">
                Restore any entity to a previous state with a single click. A new snapshot is created before rollback.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        description={confirmDialog.description}
        loading={rollbackMutation.isPending}
      />
    </div>
  )
}

export default VersionHistory
