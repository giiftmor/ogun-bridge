import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Activity, Users, AlertCircle, CheckCircle2, Clock, RefreshCw, Zap, Timer } from 'lucide-react'
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
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

export function Dashboard() {
  const { setDashboardStats, setSyncStatus, syncStatus } = useAppStore()
  const queryClient = useQueryClient()
  const [showForceConfirm, setShowForceConfirm] = useState(false)

  const syncMutation = useMutation({
    mutationFn: () => apiClient.runSync({}),
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
    mutationFn: () => apiClient.runSync({ force: true }),
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

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: apiClient.getDashboardStats.bind(apiClient),
    refetchInterval: false,
  })

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['system-health'],
    queryFn: apiClient.getSystemHealth.bind(apiClient),
    refetchInterval: 30000,
  })

  const { data: activity } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: apiClient.getRecentActivity.bind(apiClient),
    refetchInterval: false,
  })

  const { data: syncHistory = [] } = useQuery({
    queryKey: ['sync-history'],
    queryFn: () => fetch('/api/sync/history').then(r => r.json()),
    refetchInterval: 60000,
  })

  useEffect(() => {
    if (stats) {
      setDashboardStats(stats)
    }
  }, [stats, setDashboardStats])

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
        <div className="text-secondary text-[13px]">Loading dashboard...</div>
      </div>
    )
  }

  const getStatusVariant = (status) => {
    switch (status) {
      case 'success': return 'success'
      case 'warning': return 'default'
      case 'error': return 'danger'
      default: return 'neutral'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="h-4 w-4" />
      case 'warning': return <AlertCircle className="h-4 w-4" />
      case 'error': return <AlertCircle className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">Monitor your Authentik LDAP sync service</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-accent-tint">
                {getStatusIcon(stats?.syncStatus)}
              </div>
              <div>
                <div className="text-[13px] font-medium text-primary">System Status</div>
                <div className="text-[12px] text-secondary">
                  Last sync: {stats?.lastSyncTime
                    ? new Date(stats.lastSyncTime).toLocaleString()
                    : 'Never'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {syncStatus?.status === 'running' && (
                <Badge variant="default">Sync Running...</Badge>
              )}
              <Button variant="ghost" size="sm" onClick={() => refetchHealth()}>
                <Activity className={`h-4 w-4 mr-2 ${healthLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Health Check</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending || syncStatus?.status === 'running'}>
                <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sync Now</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForceConfirm(true)}
                disabled={forceSyncMutation.isPending || syncStatus?.status === 'running'}>
                <Zap className={`h-4 w-4 mr-2 ${forceSyncMutation.isPending ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Force Sync</span>
              </Button>
              <Badge variant={getStatusVariant(stats?.syncStatus)}>
                {stats?.syncStatus || 'Unknown'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {syncStatus?.status === 'running' && (
        <ProgressBar />
      )}

      {health && !healthLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {['authentik', 'ldap', 'database', 'smtp'].map(service => {
                const svc = health.services?.[service] || health.metrics
                const isUp = svc?.status === 'up' || svc?.status === 'healthy'
                return (
                  <ServiceIndicator key={service} name={service} status={svc?.status} latency={svc?.latency} isUp={isUp} />
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Authentik Users" value={stats?.authentikUsers || 0} icon={<Users className="h-4 w-4" />} description="Total users in Authentik" />
        <StatsCard title="LDAP Users" value={stats?.ldapUsers || 0} icon={<Users className="h-4 w-4" />} description="Total users in LDAP" />
        <StatsCard title="Pending Changes" value={stats?.pendingChanges || 0} icon={<Clock className="h-4 w-4" />}
          description="Awaiting approval" variant={stats?.pendingChanges > 0 ? 'warning' : 'default'}
          action={stats?.pendingChanges > 0 ? <Link to="/changes"><Button size="sm" variant="ghost" className="mt-2">Review</Button></Link> : null} />
        <StatsCard title="Failed Syncs" value={stats?.failedSyncs || 0} icon={<AlertCircle className="h-4 w-4" />}
          description="Errors in last 24h" variant={stats?.failedSyncs > 0 ? 'error' : 'default'} />
      </div>

      {((stats?.pendingChanges || 0) > 0 || (stats?.failedSyncs || 0) > 0 || (health?.metrics?.failedLogins24h || 0) > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[16px]">
              <AlertCircle className="h-4 w-4 text-[#b45309]" />
              Needs Attention
            </CardTitle>
            <CardDescription>Actionable items requiring your attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats?.pendingChanges > 0 && (
              <div className="flex items-center justify-between p-3 border border-border rounded-sm">
                <span className="text-[13px]">{stats.pendingChanges} pending changes from LDAP drift</span>
                <Button size="sm" variant="ghost" onClick={() => window.location.href = '/changes'}>Review</Button>
              </div>
            )}
            {stats?.failedSyncs > 0 && (
              <div className="flex items-center justify-between p-3 border border-border rounded-sm">
                <span className="text-[13px]">{stats.failedSyncs} failed syncs in last 24h</span>
                <Button size="sm" variant="ghost" onClick={() => window.location.href = '/logs'}>Investigate</Button>
              </div>
            )}
            {health?.metrics?.failedLogins24h > 0 && (
              <div className="flex items-center justify-between p-3 border border-border rounded-sm">
                <span className="text-[13px]">{health.metrics.failedLogins24h} failed logins (24h)</span>
                <Button size="sm" variant="ghost" onClick={() => window.location.href = '/audit'}>View</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {syncHistory.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[16px]">
                <Activity className="h-4 w-4" />
                Sync Success Rate (7 Days)
              </CardTitle>
              <CardDescription>Percentage of successful syncs over the past week</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={prepareSyncTrendData(syncHistory)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'hsl(var(--text-secondary))' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'hsl(var(--text-secondary))' }} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--bg-elevated))', border: '0.5px solid hsl(var(--border))', borderRadius: '12px', fontSize: '13px' }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="successRate" stroke="#C3125C" strokeWidth={2} name="Success Rate (%)" />
                  <Line type="monotone" dataKey="totalSyncs" stroke="hsl(var(--text-tertiary))" strokeWidth={2} name="Total Syncs" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[16px]">
                <AlertCircle className="h-4 w-4" />
                Error Distribution
              </CardTitle>
              <CardDescription>Breakdown of sync errors by category</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={prepareErrorDistribution(syncHistory)}
                    cx="50%" cy="50%" labelLine={false}
                    label={renderCustomLabel}
                    outerRadius={80} fill="#8884d8" dataKey="value"
                  >
                    {prepareErrorDistribution(syncHistory).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={ERROR_COLORS[index % ERROR_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--bg-elevated))', border: '0.5px solid hsl(var(--border))', borderRadius: '12px', fontSize: '13px' }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[16px]">
                <Timer className="h-4 w-4" />
                Response Time Trend
              </CardTitle>
              <CardDescription>API response time over the last 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={prepareResponseTimeData(syncHistory)}>
                  <defs>
                    <linearGradient id="colorResponse" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C3125C" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#C3125C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'hsl(var(--text-secondary))' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--text-secondary))' }} />
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <Tooltip contentStyle={{ background: 'hsl(var(--bg-elevated))', border: '0.5px solid hsl(var(--border))', borderRadius: '12px', fontSize: '13px' }} />
                  <Area type="monotone" dataKey="responseTime" stroke="#C3125C" fillOpacity={1} fill="url(#colorResponse)" name="Response Time (ms)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {showForceConfirm && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-danger-text" />
                <div>
                  <div className="text-[13px] font-medium text-primary">Force Sync Warning</div>
                  <div className="text-[12px] text-secondary">
                    This will sync ALL users from Authentik including those who have never logged in.
                    This may create LDAP accounts for inactive users.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowForceConfirm(false)}>
                  Cancel
                </Button>
                <Button variant="ghost" size="sm" onClick={() => forceSyncMutation.mutate()}>
                  <Zap className="h-4 w-4 mr-1" />Confirm
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[16px]">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activity && activity.length > 0 ? (
            <div className="space-y-3">
              {activity.map((item, index) => (
                <ActivityItem key={index} item={item} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-secondary text-[13px]">
              No recent activity
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatsCard({ title, value, icon, description, variant = 'default', action }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle className="text-[12px] text-secondary">{title}</CardTitle>
        <span className="text-tertiary">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-kpi text-primary">{value}</div>
        <p className="text-[12px] text-tertiary mt-1">{description}</p>
        {action}
      </CardContent>
    </Card>
  )
}

function ActivityItem({ item }) {
  const getActionColor = (action) => {
    switch (action) {
      case 'success': return 'success'
      case 'info': return 'neutral'
      case 'deleted': return 'danger'
      case 'failed': return 'danger'
      default: return 'neutral'
    }
  }

  return (
    <div className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
      <Badge variant={getActionColor(item.action)} className="mt-0.5">{item.action}</Badge>
      <div className="flex-1 space-y-0.5">
        <p className="text-[13px] font-medium text-primary leading-none">{item.message}</p>
        <p className="text-[12px] text-secondary">{new Date(item.timestamp).toLocaleString()}</p>
      </div>
    </div>
  )
}

function ServiceIndicator({ name, status, latency, isUp }) {
  return (
    <div className={`p-3 border border-border rounded-sm text-center ${isUp ? 'bg-success-bg' : 'bg-danger-bg'}`}>
      <div className={`text-lg font-medium ${isUp ? 'text-success-text' : 'text-danger-text'}`}>
        {isUp ? '\u2705' : '\u274c'}
      </div>
      <p className="text-[13px] font-medium text-primary capitalize mt-1">{name}</p>
      {latency && <p className="text-[12px] text-secondary">{latency}ms</p>}
    </div>
  )
}

const ERROR_COLORS = ['hsl(var(--accent))', '#b45309', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed']

function prepareSyncTrendData(history) {
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().split('T')[0]
  })
  return last7Days.map(date => {
    const daySyncs = history.filter(h => h.timestamp?.startsWith(date))
    const total = daySyncs.length
    const successful = daySyncs.filter(h => h.errors === 0).length
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0
    return { date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), successRate, totalSyncs: total }
  })
}

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

function prepareResponseTimeData(history) {
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().split('T')[0]
  })
  return last7Days.map(date => {
    const daySyncs = history.filter(h => h.timestamp?.startsWith(date))
    const avgResponse = daySyncs.length > 0
      ? Math.round(daySyncs.reduce((acc, h) => acc + (h.duration || 0), 0) / daySyncs.length)
      : 0
    return { date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), responseTime: avgResponse }
  })
}

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}
