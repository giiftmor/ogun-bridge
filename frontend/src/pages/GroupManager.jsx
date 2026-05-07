import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Users, 
  Shield, 
  Settings, 
  Plus, 
  Trash2,
  ExternalLink,
  Server,
  Globe,
  Lock,
  RefreshCw,
  ArrowLeftRight,
  Loader2,
  CheckCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { SkeletonCard } from '@/components/ui/skeleton'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'

const SYNC_DIRECTIONS = [
  { value: 'authentik-to-ldap', label: 'Authentik → LDAP', description: 'Authentik is source of truth' },
  { value: 'ldap-to-authentik', label: 'LDAP → Authentik', description: 'LDAP is source of truth' },
  { value: 'bidirectional', label: 'Bidirectional', description: 'Sync both ways' },
]

const SERVICE_TYPES = [
  { value: 'web', label: 'Web Application' },
  { value: 'vpn', label: 'VPN' },
  { value: 'api', label: 'API' },
  { value: 'database', label: 'Database' },
]

export function GroupManager() {
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddService, setShowAddService] = useState(false)
  const [showSyncDialog, setShowSyncDialog] = useState(false)
  const [syncDirection, setSyncDirection] = useState('authentik-to-ldap')
  const queryClient = useQueryClient()

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => apiClient.getGroups(),
  })

  const { data: groupDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ['group-details', selectedGroup?.id],
    queryFn: () => apiClient.getGroup(selectedGroup.id),
    enabled: !!selectedGroup?.id,
  })

  const { data: groupComparison } = useQuery({
    queryKey: ['group-comparison', selectedGroup?.id],
    queryFn: () => apiClient.getGroupComparison(selectedGroup.id),
    enabled: !!selectedGroup?.id,
  })

  const { data: groupMembers } = useQuery({
    queryKey: ['group-members', selectedGroup?.id],
    queryFn: () => apiClient.getGroupMembers(selectedGroup.id),
    enabled: !!selectedGroup?.id,
  })

  const { data: syncConfigs = [] } = useQuery({
    queryKey: ['group-sync-configs'],
    queryFn: () => apiClient.getGroupSyncConfigs(),
  })

  const updateSyncDirectionMutation = useMutation({
    mutationFn: ({ groupId, direction }) => 
      apiClient.updateGroupSyncDirection(groupId, direction),
    onSuccess: () => {
      toast.success('Sync direction updated')
      queryClient.invalidateQueries(['group-details', selectedGroup.id])
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const addServiceMutation = useMutation({
    mutationFn: ({ groupId, service }) => 
      apiClient.addGroupService(groupId, service),
    onSuccess: () => {
      toast.success('Service added')
      setShowAddService(false)
      queryClient.invalidateQueries(['group-details', selectedGroup.id])
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const removeServiceMutation = useMutation({
    mutationFn: ({ groupId, serviceId }) => 
      apiClient.removeGroupService(groupId, serviceId),
    onSuccess: () => {
      toast.success('Service removed')
      queryClient.invalidateQueries(['group-details', selectedGroup.id])
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const triggerSyncMutation = useMutation({
    mutationFn: (groupName) => apiClient.triggerGroupSync({ group_name: groupName }),
    onSuccess: (data) => {
      toast.success(`Sync complete: ${data.total} changes detected`)
      queryClient.invalidateQueries(['groups'])
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const syncNowMutation = useMutation({
    mutationFn: ({ direction, groupName }) => 
      apiClient.syncGroupNow({ direction, group_name: groupName }),
    onSuccess: (data) => {
      toast.success(`Sync complete: A→L: ${data.results?.authentikToAuthentik || 0}, L→A: ${data.results?.ldapToAuthentik || 0}`)
      queryClient.invalidateQueries(['groups'])
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleAddService = (service) => {
    addServiceMutation.mutate({ groupId: selectedGroup.id, service })
  }

  const handleRemoveService = (serviceId) => {
    removeServiceMutation.mutate({ groupId: selectedGroup.id, serviceId })
  }

  const handleSyncDirectionChange = (direction) => {
    updateSyncDirectionMutation.mutate({ groupId: selectedGroup.id, direction })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Group Manager</h1>
        <p className="text-muted-foreground mt-2">
          Manage groups, sync settings, and service access (RBAC)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Group List */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Groups</span>
              <Badge variant="outline">{groups.length}</Badge>
            </CardTitle>
            <CardDescription>Select a group to manage</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-4">
              <Input 
                placeholder="Search groups..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mt-2"
              />
            </div>
            {loadingGroups ? (
              <div className="p-4 space-y-2">
                <SkeletonCard />
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                {filteredGroups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroup(group)}
                    className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                      selectedGroup?.id === group.id ? 'bg-muted' : ''
                    }`}
                  >
                    <p className="font-medium text-sm">{group.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge 
                        variant={group.syncStatus === 'synced' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {group.syncStatus}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Group Details */}
        <div className="md:col-span-3 space-y-6">
          {!selectedGroup && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Select a group from the list to view details</p>
              </CardContent>
            </Card>
          )}

          {selectedGroup && loadingDetails && (
            <SkeletonCard />
          )}

          {selectedGroup && groupDetails && (
            <>
              {/* Group Header */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        {groupDetails.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {groupDetails.description || 'No description'}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Select 
                        defaultValue={groupDetails.sync_config?.sync_direction || 'authentik-to-ldap'}
                        onValueChange={(direction) => syncNowMutation.mutate({ direction, groupName: groupDetails.name })}
                      >
                        <SelectTrigger className="w-[160px]" disabled={syncNowMutation.isPending}>
                          <SelectValue placeholder="Sync Direction" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="authentik-to-ldap">
                            <div className="flex items-center gap-2">
                              <RefreshCw className="h-4 w-4" />
                              Authentik → LDAP
                            </div>
                          </SelectItem>
                          <SelectItem value="ldap-to-authentik">
                            <div className="flex items-center gap-2">
                              <RefreshCw className="h-4 w-4" />
                              LDAP → Authentik
                            </div>
                          </SelectItem>
                          <SelectItem value="bidirectional">
                            <div className="flex items-center gap-2">
                              <ArrowLeftRight className="h-4 w-4" />
                              Bidirectional
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {syncNowMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Sync Direction */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowLeftRight className="h-5 w-5" />
                    Sync Direction
                  </CardTitle>
                  <CardDescription>
                    Configure which system is the source of truth for this group
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Select 
                    value={groupDetails.sync_config?.sync_direction || 'authentik-to-ldap'}
                    onValueChange={handleSyncDirectionChange}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYNC_DIRECTIONS.map((dir) => (
                        <SelectItem key={dir.value} value={dir.value}>
                          <div>
                            <p className="font-medium">{dir.label}</p>
                            <p className="text-xs text-muted-foreground">{dir.description}</p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Services */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        Services & Access
                      </CardTitle>
                      <CardDescription>
                        Applications and services this group can access
                      </CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setShowAddService(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Service
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {groupDetails.services?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No services configured</p>
                      <p className="text-sm">Add services to control access to applications</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {groupDetails.services?.map((service) => (
                        <div 
                          key={service.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            {service.service_type === 'vpn' ? (
                              <Lock className="h-5 w-5 text-blue-500" />
                            ) : service.service_type === 'web' ? (
                              <Globe className="h-5 w-5 text-green-500" />
                            ) : (
                              <Server className="h-5 w-5 text-gray-500" />
                            )}
                            <div>
                              <p className="font-medium">{service.service_name}</p>
                              {service.service_url && (
                                <a 
                                  href={service.service_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                                >
                                  {service.service_url}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              {service.description && (
                                <p className="text-xs text-muted-foreground">{service.description}</p>
                              )}
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleRemoveService(service.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Member Comparison */}
              {groupMembers && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Member Comparison
                    </CardTitle>
                    <CardDescription>
                      Compare members between Authentik and LDAP
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Authentik
                          <Badge variant="outline">
                            {groupMembers.summary?.authentik_count || 0}
                          </Badge>
                        </h4>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {groupMembers.authentik?.map((member) => (
                            <div key={member.username || member} className="text-sm flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              {member.username || member}
                            </div>
                          ))}
                          {(!groupMembers.authentik || groupMembers.authentik.length === 0) && (
                            <p className="text-sm text-muted-foreground">No members</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <Server className="h-4 w-4" />
                          LDAP
                          <Badge variant="outline">
                            {groupMembers.summary?.ldap_count || 0}
                          </Badge>
                        </h4>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {groupMembers.ldap?.map((member) => (
                            <div key={member} className="text-sm flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-blue-500" />
                              {member}
                            </div>
                          ))}
                          {(!groupMembers.ldap || groupMembers.ldap.length === 0) && (
                            <p className="text-sm text-muted-foreground">No members</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Service Dialog */}
      <AddServiceDialog 
        open={showAddService}
        onOpenChange={setShowAddService}
        onAdd={handleAddService}
        isLoading={addServiceMutation.isPending}
      />
    </div>
  )
}

function AddServiceDialog({ open, onOpenChange, onAdd, isLoading }) {
  const [serviceName, setServiceName] = useState('')
  const [serviceUrl, setServiceUrl] = useState('')
  const [serviceType, setServiceType] = useState('web')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('default')
  const [isPublic, setIsPublic] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!serviceName.trim()) {
      toast.error('Service name is required')
      return
    }
    onAdd({
      service_name: serviceName.trim(),
      service_url: serviceUrl.trim(),
      service_type: serviceType,
      description: description.trim(),
      icon: icon,
      is_public: isPublic,
    })
    setServiceName('')
    setServiceUrl('')
    setServiceType('web')
    setDescription('')
    setIcon('default')
    setIsPublic(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Service</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="serviceName">Service Name *</Label>
              <Input
                id="serviceName"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="e.g., Webmail, Nextcloud, VPN"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceUrl">URL</Label>
              <Input
                id="serviceUrl"
                value={serviceUrl}
                onChange={(e) => setServiceUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceType">Service Type</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this service"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icon">Icon</Label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="mail">Mail</SelectItem>
                  <SelectItem value="vpn">VPN/Security</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="cloud">Cloud</SelectItem>
                  <SelectItem value="authentik">Identity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isPublic"
                checked={isPublic}
                onCheckedChange={(checked) => setIsPublic(checked === true)}
              />
              <Label htmlFor="isPublic" className="text-sm font-normal">
                Show in invite emails
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Enable "Show in invite emails" to display this service in welcome emails for new users.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Service
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}