import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Activity, Users, AlertCircle, CheckCircle2, Clock, RefreshCw, Zap, Server, Shield, KeyRound, Timer } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/services/api'
import { useAppStore } from '@/store/useAppStore'
import { useEffect, useState } from 'react'
import { wsService } from '@/services/websocket'
import { toast } from 'react-hot-toast'
import { ProgressBar } from '@/components/ProgressBar'
import { translateError } from '@/utils/errorTranslator'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

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
    onError: (error) => {
      const translated = translateError(error)
      toast.error(translated.message)
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
    onError: (error) => {
      const translated = translateError(error)
      toast.error(translated.message)
    }
  })

  // Fetch dashboard stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: apiClient.getDashboardStats.bind(apiClient),
    refetchInterval: false,
  })

  // Fetch system health
  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['system-health'],
    queryFn: apiClient.getSystemHealth.bind(apiClient),
    refetchInterval: 30000,
  })

  // Fetch recent activity
  const { data: activity } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: apiClient.getRecentActivity.bind(apiClient),
    refetchInterval: false,
  })

  // Fetch sync history for charts
  const { data: syncHistory = [] } = useQuery({
    queryKey: ['sync-history'],
    queryFn: () => fetch('/api/sync/history', {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
    }).then(r => r.json()),
    refetchInterval: 60000, // Refresh every minute
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
                onClick={() => refetchHealth()}
              >
                <Activity className={`h-4 w-4 mr-2 ${healthLoading ? 'animate-spin' : ''}`} />
                Health Check
              </Button>
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
      )}

      {/* Progress Bar - Show when sync is running */}
      {syncStatus?.status === 'running' && (
        <div className="mt-6">
          <ProgressBar />
        </div>
      )}

      {/* System Health Grid */}
      {health && !healthLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['authentik', 'ldap', 'database', 'smtp'].map(service => {
                const svc = health.services?.[service] || health.metrics
                const isUp = svc?.status === 'up' || svc?.status === 'healthy'
                return (
                  <ServiceIndicator
                    key={service}
                    name={service}
                    status={svc?.status}
                    latency={svc?.latency}
                    isUp={isUp}
                  />
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid - 8 cards */}
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
                  Review
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
        <StatsCard
          title="Active Sessions"
          value={health?.metrics?.activeSessions || 0}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
          description="Current active sessions"
        />
        <StatsCard
          title="Failed Logins (24h)"
          value={health?.metrics?.failedLogins24h || 0}
          icon={<Shield className="h-4 w-4 text-muted-foreground" />}
          description="Failed login attempts"
          variant={(health?.metrics?.failedLogins24h || 0) > 0 ? 'error' : 'default'}
        />
        <StatsCard
          title="Response Time"
          value={health?.responseTime ? `${health.responseTime}ms` : '-'}
          icon={<Timer className="h-4 w-4 text-muted-foreground" />}
          description="API response time"
          variant={health?.responseTime > 1000 ? 'warning' : 'default'}
        />
        <StatsCard
          title="Last Sync Duration"
          value={stats?.lastSyncDuration ? `${stats.lastSyncDuration}ms` : '-'}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          description="Time for last sync"
        />
      </div>

      {/* Needs Attention Section */}
      {((stats?.pendingChanges || 0) > 0 || (stats?.failedSyncs || 0) > 0 || (health?.metrics?.failedLogins24h || 0) > 0) && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Needs Attention
            </CardTitle>
            <CardDescription>
              Actionable items requiring your attention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats?.pendingChanges > 0 && (
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span>📊 {stats.pendingChanges} pending changes from LDAP drift</span>
                <Button size="sm" variant="outline" onClick={() => window.location.href = '/changes'}>Review</Button>
              </div>
            )}
            {stats?.failedSyncs > 0 && (
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span>🔴 {stats.failedSyncs} failed syncs in last 24h</span>
                <Button size="sm" variant="outline" onClick={() => window.location.href = '/logs'}>Investigate</Button>
              </div>
            )}
            {health?.metrics?.failedLogins24h > 0 && (
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <span>🔐 {health.metrics.failedLogins24h} failed logins (24h)</span>
                <Button size="sm" variant="outline" onClick={() => window.location.href = '/audit'}>View</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Charts Section */}
      {syncHistory.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Sync Success Rate - 7 Day Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Sync Success Rate (7 Days)
              </CardTitle>
              <CardDescription>
                Percentage of successful syncs over the past week
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={prepareSyncTrendData(syncHistory)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="successRate"
                    stroke="#22c55e"
                    strokeWidth={2}
                    name="Success Rate (%)"
                  />
                  <Line
                    type="monotone"
                    dataKey="totalSyncs"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Total Syncs"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Error Distribution Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Error Distribution
              </CardTitle>
              <CardDescription>
                Breakdown of sync errors by category
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={prepareErrorDistribution(syncHistory)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomLabel}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {prepareErrorDistribution(syncHistory).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={ERROR_COLORS[index % ERROR_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Response Time Trend */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5" />
                Response Time Trend
              </CardTitle>
              <CardDescription>
                API response time over the last 7 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={prepareResponseTimeData(syncHistory)}>
                  <defs>
                    <linearGradient id="colorResponse" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <CartesianGrid strokeDasharray="3 3" />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="responseTime"
                    stroke="#8884d8"
                    fillOpacity={1}
                    fill="url(#colorResponse)"
                    name="Response Time (ms)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

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

function ServiceIndicator({ name, status, latency, isUp }) {
  return (
    <div className={`p-3 border rounded-lg text-center ${isUp ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20' : 'border-red-500/50 bg-red-50 dark:bg-red-950/20'}`}>
      <div className={`text-lg ${isUp ? 'text-green-600' : 'text-red-600'}`}>
        {isUp ? '✅' : '❌'}
      </div>
      <p className="font-medium capitalize mt-1">{name}</p>
      {latency && <p className="text-xs text-muted-foreground">{latency}ms</p>}
    </div>
  )
}

// Chart colors for error distribution
const ERROR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6']

// Prepare 7-day sync success rate trend data
function prepareSyncTrendData(history) {
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toISOString().split('T')[0]
  })

  return last7Days.map(date => {
    const daySyncs = history.filter(h => h.timestamp?.startsWith(date))
    const total = daySyncs.length
    const successful = daySyncs.filter(h => h.errors === 0).length
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0

    return {
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      successRate,
      totalSyncs: total,
    }
  })
}

// Prepare error distribution data for pie chart
function prepareErrorDistribution(history) {
  const errorTypes = {}

  history.forEach(h => {
    if (h.errors > 0) {
      const key = h.errorType || 'Unknown'
      errorTypes[key] = (errorTypes[key] || 0) + 1
    }
  })

  return Object.entries(errorTypes).map(([name, value]) => ({ name, value }))
}

// Prepare response time trend data
function prepareResponseTimeData(history) {
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toISOString().split('T')[0]
  })

  return last7Days.map(date => {
    const daySyncs = history.filter(h => h.timestamp?.startsWith(date))
    const avgResponse = daySyncs.length > 0
      ? Math.round(daySyncs.reduce((acc, h) => acc + (h.duration || 0), 0) / daySyncs.length)
      : 0

    return {
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      responseTime: avgResponse,
    }
  })
}

// Custom label for pie chart
function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}
