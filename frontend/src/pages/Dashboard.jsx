import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Activity, Users, AlertCircle, CheckCircle2, Clock, RefreshCw, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/services/api'
import { useAppStore } from '@/store/useAppStore'
import { useEffect, useState } from 'react'
import { wsService } from '@/services/websocket'
import { toast } from 'react-hot-toast'

export function Dashboard() {
  const { setDashboardStats, setSyncStatus, syncStatus } = useAppStore()
  const queryClient = useQueryClient()
  const [showForceConfirm, setShowForceConfirm] = useState(false)

  const syncMutation = useMutation({
    mutationFn: () => fetch('/api/sync/run', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
    }).then(r => r.json()),
    onSuccess: () => {
      toast.success('Sync started')
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
    onError: () => {
      toast.error('Sync failed or already running')
    }
  })

  const forceSyncMutation = useMutation({
    mutationFn: () => fetch('/api/sync/run?force=true', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
    }).then(r => r.json()),
    onSuccess: () => {
      setShowForceConfirm(false)
      toast.success('Force sync started - syncing all users')
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
    onError: () => {
      toast.error('Sync failed or already running')
    }
  })

  // Fetch dashboard stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: apiClient.getDashboardStats.bind(apiClient),
    refetchInterval: false, // Poll every 5 seconds
  })

  // Fetch recent activity
  const { data: activity } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: apiClient.getRecentActivity.bind(apiClient),
    refetchInterval: false,
  })

  useEffect(() => {
    if (stats) {
      setDashboardStats(stats)
    }
  }, [stats, setDashboardStats])

  // Subscribe to real-time sync status
  useEffect(() => {
    wsService.subscribeSyncStatus((status) => {
      setSyncStatus(status)
    })

    return () => {
      wsService.unsubscribe('sync-status')
    }
  }, [setSyncStatus])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    )
  }

  const getStatusVariant = (status) => {
    switch (status) {
      case 'success':
        return 'success'
      case 'warning':
        return 'warning'
      case 'error':
        return 'error'
      default:
        return 'secondary'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5" />
      case 'warning':
        return <AlertCircle className="h-5 w-5" />
      case 'error':
        return <AlertCircle className="h-5 w-5" />
      default:
        return <Clock className="h-5 w-5" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Monitor your Authentik LDAP sync service
        </p>
      </div>

      {/* Status Banner */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {getStatusIcon(stats?.syncStatus)}
              <div>
                <div className="font-semibold">System Status</div>
                <div className="text-sm text-muted-foreground">
                  Last sync: {stats?.lastSyncTime
                    ? new Date(stats.lastSyncTime).toLocaleString()
                    : 'Never'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {syncStatus?.status === 'running' && (
                <Badge variant="warning">Sync Running...</Badge>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending || syncStatus?.status === 'running'}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                Sync Now
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowForceConfirm(true)}
                disabled={forceSyncMutation.isPending || syncStatus?.status === 'running'}
              >
                <Zap className={`h-4 w-4 mr-2 ${forceSyncMutation.isPending ? 'animate-spin' : ''}`} />
                Force Sync
              </Button>
              <Badge variant={getStatusVariant(stats?.syncStatus)}>
                {stats?.syncStatus || 'Unknown'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Force Sync Confirmation */}
      {showForceConfirm && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-red-500" />
                <div>
                  <div className="font-semibold">Force Sync Warning</div>
                  <div className="text-sm text-muted-foreground">
                    This will sync ALL users from Authentik including those who have never logged in.
                    This may create LDAP accounts for inactive users.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowForceConfirm(false)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => forceSyncMutation.mutate()}
                >
                  Confirm Force Sync
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Authentik Users"
          value={stats?.authentikUsers || 0}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          description="Total users in Authentik"
        />
        <StatsCard
          title="LDAP Users"
          value={stats?.ldapUsers || 0}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          description="Total users in LDAP"
        />
        <StatsCard
          title="Pending Changes"
          value={stats?.pendingChanges || 0}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          description="Awaiting approval"
          variant={stats?.pendingChanges > 0 ? 'warning' : 'default'}
          action={
            stats?.pendingChanges > 0 ? (
              <Link to="/changes">
                <Button size="sm" variant="outline" className="mt-2">
                  View
                </Button>
              </Link>
            ) : null
          }
        />
        <StatsCard
          title="Failed Syncs"
          value={stats?.failedSyncs || 0}
          icon={<AlertCircle className="h-4 w-4 text-muted-foreground" />}
          description="Errors in last 24h"
          variant={stats?.failedSyncs > 0 ? 'error' : 'default'}
        />
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activity && activity.length > 0 ? (
            <div className="space-y-4">
              {activity.map((item, index) => (
                <ActivityItem key={index} item={item} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No recent activity
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatsCard({ title, value, icon, description, variant = 'default', action }) {
  const variantStyles = {
    default: '',
    warning: 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20',
    error: 'border-red-500/50 bg-red-50 dark:bg-red-950/20',
  }

  return (
    <Card className={variantStyles[variant]}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
        {action}
      </CardContent>
    </Card>
  )
}

function ActivityItem({ item }) {
  const getActionColor = (action) => {
    switch (action) {
      case 'success':
        return 'success'
      case 'info':
        return 'info'
      case 'deleted':
        return 'error'
      case 'failed':
        return 'error'
      default:
        return 'secondary'
    }
  }

  return (
    <div className="flex items-start gap-4 pb-4 border-b last:border-0 last:pb-0">
      <Badge variant={getActionColor(item.action)} className="mt-0.5">
        {item.action}
      </Badge>
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium leading-none">{item.message}</p>
        <p className="text-sm text-muted-foreground">
          {new Date(item.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  )
}
