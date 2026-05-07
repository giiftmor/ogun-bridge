import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  ArrowLeftRight,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Eye,
  Play,
  Server,
  Database,
  Cloud,
  Layers,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SkeletonCard } from '@/components/ui/skeleton'
import { ProgressBar } from '@/components/ProgressBar'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'
import { translateError } from '@/utils/errorTranslator'

const SYNC_DIRECTIONS = [
  { value: 'authentik-to-ldap', label: 'Authentik → LDAP', description: 'Sync from Authentik to LDAP' },
  { value: 'ldap-to-authentik', label: 'LDAP → Authentik', description: 'Sync from LDAP to Authentik' },
  { value: 'bidirectional', label: 'Bidirectional', description: 'Sync both ways' },
]

export function SyncManager() {
  const [activeTab, setActiveTab] = useState('ldap')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const queryClient = useQueryClient()

  // Fetch groups based on selected source
  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['groups', activeTab, searchQuery],
    queryFn: () => apiClient.getGroups({ source: activeTab, search: searchQuery }),
  })

  // Build hierarchical tree from LDAP groups (grouped by OU)
  const ldapTree = useMemo(() => {
    if (activeTab !== 'ldap' || !groups.length) return []
    const tree = {}
    groups.forEach(group => {
      const ou = group.ou || 'ungrouped'
      if (!tree[ou]) tree[ou] = []
      tree[ou].push(group)
    })
    return Object.entries(tree).sort(([a], [b]) => a.localeCompare(b))
  }, [activeTab, groups])

  // Fetch LDAP groups for comparison tab
  const { data: ldapGroups = [], isLoading: loadingLdapGroups } = useQuery({
    queryKey: ['ldap-groups'],
    queryFn: () => apiClient.getGroups({ source: 'ldap' }),
    enabled: activeTab === 'comparison',
  })

  // Fetch Authentik groups for comparison tab
  const { data: authGroups = [], isLoading: loadingAuthGroups } = useQuery({
    queryKey: ['auth-groups'],
    queryFn: () => apiClient.getGroups({ source: 'authentik' }),
    enabled: activeTab === 'comparison',
  })

  // Preview sync mutation
  const previewMutation = useMutation({
    mutationFn: ({ direction, groupName }) =>
      apiClient.previewSync({ direction, group_name: groupName }),
    onSuccess: (data) => {
      setPreviewData(data)
      setIsPreviewLoading(false)
    },
    onError: (error) => {
      const translated = translateError(error)
      toast.error(translated.message)
      setIsPreviewLoading(false)
    },
  })

  // Run sync mutation
  const runSyncMutation = useMutation({
    mutationFn: ({ direction, groupName, force = false }) =>
      apiClient.runSync({ direction, group_name: groupName, force }),
    onSuccess: (data) => {
      toast.success(`Sync triggered: ${data.message}`)
      queryClient.invalidateQueries(['groups'])
    },
    onError: (error) => {
      const translated = translateError(error)
      toast.error(translated.message)
    },
  })

  // Sync now mutation (existing one)
  const syncNowMutation = useMutation({
    mutationFn: ({ direction, groupName }) =>
      apiClient.syncGroupNow({ direction, group_name: groupName }),
    onSuccess: (data) => {
      toast.success(`Sync complete: ${JSON.stringify(data.results)}`)
      queryClient.invalidateQueries(['groups'])
    },
    onError: (error) => {
      const translated = translateError(error)
      toast.error(translated.message)
    },
  })

  const handlePreview = (groupName, direction) => {
    setIsPreviewLoading(true)
    setPreviewData(null)
    previewMutation.mutate({ direction, groupName })
  }

  const handleSyncNow = (groupName, direction) => {
    syncNowMutation.mutate({ direction, groupName })
  }

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Comparison data
  const comparisonData = activeTab === 'comparison' ? (() => {
    const authMap = new Map(authGroups.map(g => [g.name, g]))
    const ldapMap = new Map(ldapGroups.map(g => [g.name, g]))

    const allGroupNames = new Set([
      ...authGroups.map(g => g.name),
      ...ldapGroups.map(g => g.name),
    ])

    return Array.from(allGroupNames).map(name => {
      const auth = authMap.get(name)
      const ldap = ldapMap.get(name)
      return {
        name,
        inAuthentik: !!auth,
        inLDAP: !!ldap,
        authId: auth?.id,
        ldapCn: ldap?.cn,
        authUserCount: auth?.userCount,
        ldapMemberCount: ldap?.memberCount,
        syncDirection: auth?.sync_config?.sync_direction || 'not_set',
      }
    })
  })() : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sync Manager</h1>
        <p className="text-muted-foreground mt-2">
          Fetch data from both sources, preview changes, and manage sync direction
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="authentik">
            <Server className="h-4 w-4 mr-2" />
            Authentik Groups
          </TabsTrigger>
          <TabsTrigger value="ldap">
            <Database className="h-4 w-4 mr-2" />
            LDAP Groups
          </TabsTrigger>
          <TabsTrigger value="comparison">
            <Layers className="h-4 w-4 mr-2" />
            Comparison View
          </TabsTrigger>
        </TabsList>

        {/* Authentik Groups Tab */}
        <TabsContent value="authentik" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Authentik Groups
                  </CardTitle>
                  <CardDescription>
                    Groups from Authentik. Check if they exist in LDAP.
                  </CardDescription>
                </div>
                <Badge variant="outline">{filteredGroups.length} groups</Badge>
              </div>
              <div className="px-6 pb-4">
                <Input
                  placeholder="Search groups..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingGroups ? (
                <div className="p-4 space-y-2">
                  <SkeletonCard />
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  {filteredGroups.map((group) => (
                    <div
                      key={group.id}
                      className={`p-4 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                        selectedGroup?.name === group.name ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{group.name}</p>
                          <p className="text-sm text-muted-foreground">{group.description || 'No description'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={group.ldapExists ? 'default' : 'secondary'}>
                              {group.ldapExists ? (
                                <>
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  In LDAP
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Not in LDAP
                                </>
                              )}
                            </Badge>
                            {group.userCount && (
                              <Badge variant="outline">{group.userCount} users</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Select
                            defaultValue={group.sync_config?.sync_direction || 'authentik-to-ldap'}
                            onValueChange={(direction) => {
                              apiClient.updateGroupSyncDirection(group.id, direction)
                                .then(() => {
                                  toast.success('Sync direction updated')
                                  queryClient.invalidateQueries(['groups'])
                                })
                                .catch(err => {
                                  const translated = translateError(err)
                                  toast.error(translated.message)
                                })
                            }}
                          >
                            <SelectTrigger className="w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SYNC_DIRECTIONS.map(dir => (
                                <SelectItem key={dir.value} value={dir.value}>
                                  {dir.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreview(group.name, group.sync_config?.sync_direction || 'authentik-to-ldap')}
                            disabled={previewMutation.isPending}
                          >
                            {previewMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSyncNow(group.name, group.sync_config?.sync_direction || 'authentik-to-ldap')}
                            disabled={syncNowMutation.isPending}
                          >
                            {syncNowMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LDAP Groups Tab */}
        <TabsContent value="ldap" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    LDAP Groups (Hierarchical)
                  </CardTitle>
                  <CardDescription>
                    Groups from LDAP, organized by Organizational Unit
                  </CardDescription>
                </div>
                <Badge variant="outline">{filteredGroups.length} groups</Badge>
              </div>
              <div className="px-6 pb-4">
                <Input
                  placeholder="Search groups..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingGroups ? (
                <div className="p-4 space-y-2">
                  <SkeletonCard />
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  {ldapTree.map(([ou, ouGroups]) => (
                    <div key={ou}>
                      <div className="px-4 py-2 bg-muted/50 border-b">
                        <span className="text-sm font-semibold text-muted-foreground">
                          ou={ou}
                        </span>
                      </div>
                      {ouGroups
                        .filter(group => 
                          group.name.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((group) => (
                          <div
                            key={group.id || group.cn}
                            className={`p-4 pl-8 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                              selectedGroup?.name === group.name ? 'bg-muted' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{group.name}</p>
                                <p className="text-sm text-muted-foreground">{group.description || 'No description'}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant={group.authentikExists ? 'default' : 'secondary'}>
                                    {group.authentikExists ? (
                                      <>
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        In Authentik
                                      </>
                                    ) : (
                                      <>
                                        <XCircle className="h-3 w-3 mr-1" />
                                        Not in Authentik
                                      </>
                                    )}
                                  </Badge>
                                  {group.memberCount !== undefined && (
                                    <Badge variant="outline">{group.memberCount} members</Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {group.authentikExists && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handlePreview(group.name, 'ldap-to-authentik')}
                                      disabled={previewMutation.isPending}
                                    >
                                      {previewMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => handleSyncNow(group.name, 'ldap-to-authentik')}
                                      disabled={syncNowMutation.isPending}
                                    >
                                      {syncNowMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Play className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comparison View Tab */}
        <TabsContent value="comparison" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Comparison View
              </CardTitle>
              <CardDescription>
                See all groups from both sources and their sync status
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAuthGroups || loadingLdapGroups ? (
                <div className="p-4 space-y-2">
                  <SkeletonCard />
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <th className="text-left p-3">Group</th>
                        <th className="text-center p-3">Authentik</th>
                        <th className="text-center p-3">LDAP</th>
                        <th className="text-left p-3">Sync Direction</th>
                        <th className="text-right p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonData.map((item) => (
                        <tr key={item.name} className="border-b hover:bg-muted/50">
                          <td className="p-3">
                            <p className="font-medium">{item.name}</p>
                          </td>
                          <td className="text-center p-3">
                            {item.inAuthentik ? (
                              <CheckCircle className="h-5 w-5 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-500 mx-auto" />
                            )}
                          </td>
                          <td className="text-center p-3">
                            {item.inLDAP ? (
                              <CheckCircle className="h-5 w-5 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-500 mx-auto" />
                            )}
                          </td>
                          <td className="p-3">
                            <Select
                              defaultValue={item.syncDirection}
                              onValueChange={(direction) => {
                                if (item.authId) {
                                  apiClient.updateGroupSyncDirection(item.authId, direction)
                                    .then(() => {
                                      toast.success('Sync direction updated')
                                      queryClient.invalidateQueries(['groups'])
                                    })
                                    .catch(err => {
                                      const translated = translateError(err)
                                      toast.error(translated.message)
                                    })
                                }
                              }}
                            >
                              <SelectTrigger className="w-[160px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SYNC_DIRECTIONS.map(dir => (
                                  <SelectItem key={dir.value} value={dir.value}>
                                    {dir.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="text-right p-3">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePreview(item.name, item.syncDirection)}
                                disabled={previewMutation.isPending}
                              >
                                {previewMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleSyncNow(item.name, item.syncDirection)}
                                disabled={syncNowMutation.isPending}
                              >
                                {syncNowMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
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
      </Tabs>

      {/* Preview Results */}
      {previewData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Preview: {previewData.direction || 'All'} Sync
            </CardTitle>
            <CardDescription>
              Review changes before applying
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewData.changes?.length > 0 ? (
              <div className="space-y-2">
                <div className="flex gap-4 mb-4">
                  <Badge variant="outline">To Create: {previewData.summary?.toCreate || 0}</Badge>
                  <Badge variant="outline">To Update: {previewData.summary?.toUpdate || 0}</Badge>
                  <Badge variant="destructive">To Delete: {previewData.summary?.toDelete || 0}</Badge>
                </div>
                {previewData.changes.map((change, index) => (
                  <div key={index} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <Badge
                          variant={
                            change.action.includes('create') ? 'default' :
                            change.action.includes('delete') ? 'destructive' : 'secondary'
                          }
                        >
                          {change.action}
                        </Badge>
                        <span className="ml-2 font-medium">{change.group || change.user}</span>
                      </div>
                      {change.members && (
                        <span className="text-sm text-muted-foreground">
                          {change.members.length} members
                        </span>
                      )}
                    </div>
                    {change.reason && (
                      <p className="text-sm text-muted-foreground mt-1">{change.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No changes detected. Systems are in sync.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Global Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Global Actions</CardTitle>
          <CardDescription>
            Run sync for all groups or preview all changes
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            onClick={() => {
              runSyncMutation.mutate({ force: true })
            }}
            disabled={runSyncMutation.isPending}
          >
            {runSyncMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync All (Force)
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              handlePreview(null, 'bidirectional')
            }}
            disabled={previewMutation.isPending}
          >
            {previewMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Eye className="h-4 w-4 mr-2" />
            )}
            Preview All
          </Button>
        </CardContent>
      </Card>

      {/* Progress Bar (if sync running) */}
      <div id="sync-progress">
        <ProgressBar />
      </div>
    </div>
  )
}
