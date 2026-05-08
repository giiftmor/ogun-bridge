import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Server, Plus, Trash2,  Loader2, CheckCircle, Users,
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

const SERVICE_TYPES = [
  { value: 'web', label: 'Web Application' },
  { value: 'vpn', label: 'VPN' },
  { value: 'api', label: 'API' },
  { value: 'database', label: 'Database' },
]

export function ServiceManager() {
  const [selectedService, setSelectedService] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddService, setShowAddService] = useState(false)
  const [showAssignGroup, setShowAssignGroup] = useState(false)
  const [selectedGroupToAssign, setSelectedGroupToAssign] = useState('')
  const queryClient = useQueryClient()

  const { data: allServices = [], isLoading: loadingServices } = useQuery({
    queryKey: ['services-list'],
    queryFn: () => apiClient.getServicesList(),
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: () => apiClient.getGroups(),
  })

  const addServiceMutation = useMutation({
    mutationFn: ({ groupId, service }) =>
      apiClient.addGroupService(groupId, service),
    onSuccess: () => {
      toast.success('Service added')
      setShowAddService(false)
      queryClient.invalidateQueries(['services-list'])
    },
    onError: (error) => toast.error(error.message),
  })

  const assignGroupMutation = useMutation({
    mutationFn: ({ serviceName, groupId }) =>
      apiClient.assignServiceToGroup(serviceName, groupId),
    onSuccess: (data) => {
      toast.success(data.message)
      setShowAssignGroup(false)
      setSelectedGroupToAssign('')
      queryClient.invalidateQueries(['services-list'])
    },
    onError: (error) => toast.error(error.message),
  })

  const unassignGroupMutation = useMutation({
    mutationFn: ({ serviceName, groupName }) =>
      apiClient.unassignServiceFromGroup(serviceName, groupName),
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries(['services-list'])
    },
    onError: (error) => toast.error(error.message),
  })

  const filteredServices = allServices.filter(s =>
    s.service_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedServiceDetail = selectedService
    ? allServices.find(s => s.service_name === selectedService.service_name)
    : null

  const assignedGroupNames = selectedServiceDetail?.groups || []
  const availableGroups = groups.filter(g => !assignedGroupNames.includes(g.name))

  const handleAddService = (service) => {
    const firstGroup = groups[0]
    if (!firstGroup) {
      toast.error('No groups available. Create a group first.')
      return
    }
    addServiceMutation.mutate({ groupId: firstGroup.id, service })
  }

  const handleAssignGroup = () => {
    if (!selectedGroupToAssign || !selectedServiceDetail) return
    const group = groups.find(g => g.id === selectedGroupToAssign)
    if (!group) { toast.error('Group not found'); return }
    assignGroupMutation.mutate({
      serviceName: selectedServiceDetail.service_name,
      groupId: selectedGroupToAssign,
    })
  }

  const handleUnassignGroup = (groupName) => {
    if (!selectedServiceDetail) return
    unassignGroupMutation.mutate({
      serviceName: selectedServiceDetail.service_name,
      groupName,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Services</h1>
          <p className="text-muted-foreground mt-2">Manage services and their group assignments</p>
        </div>
        <Button onClick={() => setShowAddService(true)}>
          <Plus className="h-4 w-4 mr-2" />Add Service
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left Panel - Service List */}
        <Card className="md:col-span-1">
          <CardContent className="p-0">
            <div className="px-4 pb-4">
              <Input
                placeholder="Search services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mt-2"
              />
            </div>
            {loadingServices ? (
              <div className="p-4 space-y-2"><SkeletonCard /></div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto">
                {filteredServices.map((svc) => (
                  <button
                    key={svc.service_name}
                    onClick={() => setSelectedService(svc)}
                    className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                      selectedService?.service_name === svc.service_name ? 'bg-muted' : ''
                    }`}
                  >
                    <p className="font-medium text-sm">{svc.service_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="neutral" className="text-xs">{svc.service_type}</Badge>
                      <span className="text-xs text-muted-foreground">{svc.groups?.length || 0} groups</span>
                    </div>
                  </button>
                ))}
                {filteredServices.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">No services found</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Panel - Service Details */}
        <div className="md:col-span-3 space-y-6">
          {!selectedService ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Server className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Select a service from the list to view details</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        {selectedServiceDetail?.service_name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {selectedServiceDetail?.description || 'No description'}
                      </CardDescription>
                    </div>
                    <Badge variant="ghost">{selectedServiceDetail?.service_type}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <DetailRow label="URL" value={selectedServiceDetail?.service_url || 'N/A'} />
                    <DetailRow label="Type" value={selectedServiceDetail?.service_type} />
                    <DetailRow label="Show in invites" value={selectedServiceDetail?.is_public ? 'Yes' : 'No'} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Group Assignments
                      </CardTitle>
                      <CardDescription>LDAP groups that have access to this service</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => setShowAssignGroup(true)} disabled={availableGroups.length === 0}>
                      <Plus className="h-4 w-4 mr-2" />Assign Group
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {assignedGroupNames.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No groups assigned</p>
                      <p className="text-sm">Assign a group to grant access to this service</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {assignedGroupNames.map((groupName) => (
                        <div key={groupName} className="flex items-center justify-between p-3 border rounded-sm">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="font-medium">{groupName}</span>
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => handleUnassignGroup(groupName)}
                            disabled={unassignGroupMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {showAssignGroup && (
                <Card>
                  <CardHeader>
                    <CardTitle>Assign Group to Service</CardTitle>
                    <CardDescription>Select a group to grant access to {selectedServiceDetail?.service_name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Select value={selectedGroupToAssign} onValueChange={setSelectedGroupToAssign}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a group..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableGroups.map(g => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                          {availableGroups.length === 0 && (
                            <SelectItem value="__none__" disabled>All groups already assigned</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleAssignGroup}
                          disabled={!selectedGroupToAssign || assignGroupMutation.isPending}
                        >
                          {assignGroupMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Assign
                        </Button>
                        <Button variant="ghost" onClick={() => { setShowAssignGroup(false); setSelectedGroupToAssign('') }}>
                          Cancel
                        </Button>
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
    if (!serviceName.trim()) { toast.error('Service name is required'); return }
    onAdd({
      service_name: serviceName.trim(),
      service_url: serviceUrl.trim(),
      service_type: serviceType,
      description: description.trim(),
      icon,
      is_public: isPublic,
    })
    setServiceName(''); setServiceUrl(''); setServiceType('web')
    setDescription(''); setIcon('default'); setIsPublic(false)
  }

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Service</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="serviceName">Service Name *</Label>
              <Input id="serviceName" value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="e.g., Webmail, Nextcloud, VPN" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceUrl">URL</Label>
              <Input id="serviceUrl" value={serviceUrl} onChange={(e) => setServiceUrl(e.target.value)} placeholder="https://example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceType">Service Type</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icon">Icon</Label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Checkbox id="isPublic" checked={isPublic} onCheckedChange={(checked) => setIsPublic(checked === true)} />
              <Label htmlFor="isPublic" className="text-sm font-normal">Show in invite emails</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Adding...' : 'Add Service'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-start py-1">
      <span className="text-sm text-muted-foreground">{label}:</span>
      <span className="text-sm font-medium text-right">{value || 'N/A'}</span>
    </div>
  )
}
