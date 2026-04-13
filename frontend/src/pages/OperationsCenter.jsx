import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { 
  Activity, Server, Database, Mail, RefreshCw, CheckCircle, XCircle, 
  AlertTriangle, Search, Filter, Download, Play, Shield, User, Lock,
  LogIn, Send, Clock, Zap, RotateCw
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/services/api'
import { getTimezone } from '@/utils/timezone'

const CATEGORIES = {
  ALL: 'all',
  AUTH: 'auth',
  PASSWORD: 'password',
  USER: 'user',
  SYNC: 'sync',
  MAIL: 'mail',
  SYSTEM: 'system',
  SECURITY: 'security',
}

const SERVICE_ICONS = {
  authentik: '🔐',
  ldap: '🔗',
  database: '🗄️',
  smtp: '📧',
}

function ServiceCard({ name, status, latency, error, onTest, isTesting }) {
  const getStatusColor = () => {
    if (status === 'up' || status === 'healthy') return 'bg-green-500'
    if (status === 'degraded') return 'bg-yellow-500'
    if (status === 'down' || status === 'not_configured') return 'bg-red-500'
    return 'bg-gray-400'
  }

  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-3 h-3 ${getStatusColor()} rounded-bl-lg`} />
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{SERVICE_ICONS[name] || '⚙️'}</span>
            <div>
              <p className="font-semibold capitalize">{name}</p>
              <p className="text-xs text-muted-foreground">
                {status === 'up' ? `${latency}ms` : error || status}
              </p>
            </div>
          </div>
          <Button 
            size="sm" 
            variant="outline"
            onClick={onTest}
            disabled={isTesting}
          >
            {isTesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function MetricTile({ icon: Icon, label, value, variant = 'default' }) {
  const variants = {
    default: 'border-l-blue-500',
    success: 'border-l-green-500',
    warning: 'border-l-yellow-500',
    error: 'border-l-red-500',
  }

  return (
    <Card className={`border-l-4 ${variants[variant]}`}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value ?? '-'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LogEntry({ log }) {
  const [expanded, setExpanded] = useState(false)

  const getLevelStyle = (level) => {
    switch (level) {
      case 'error': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20'
      case 'warn': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/20'
      case 'info': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20'
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950/20'
    }
  }

  const getCategoryBadge = (category) => {
    const styles = {
      AUTH: 'bg-purple-100 text-purple-800',
      PASSWORD: 'bg-orange-100 text-orange-800',
      USER: 'bg-blue-100 text-blue-800',
      SYNC: 'bg-green-100 text-green-800',
      MAIL: 'bg-pink-100 text-pink-800',
      SYSTEM: 'bg-gray-100 text-gray-800',
      SECURITY: 'bg-red-100 text-red-800',
    }
    return styles[category] || 'bg-gray-100 text-gray-800'
  }

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      timeZone: getTimezone(),
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div 
      className={`p-2 rounded-md border text-sm cursor-pointer hover:bg-muted/50 ${getLevelStyle(log.level)}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground font-mono">{formatTime(log.timestamp)}</span>
        <Badge className={getCategoryBadge(log.category)}>{log.category}</Badge>
        <Badge variant={log.level === 'error' ? 'error' : log.level === 'warn' ? 'warning' : 'secondary'}>
          {log.level.toUpperCase()}
        </Badge>
        <span className="truncate flex-1">{log.message}</span>
      </div>
      {expanded && log.metadata && (
        <pre className="mt-2 p-2 bg-black/10 dark:bg-white/10 rounded text-xs overflow-auto">
          {JSON.stringify(log.metadata, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function OperationsCenter() {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [testService, setTestService] = useState(null)

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['health'],
    queryFn: apiClient.getSystemHealth,
    refetchInterval: 30000,
  })

  const testMutation = useMutation({
    mutationFn: (service) => apiClient.testService(service),
    onSuccess: () => refetchHealth(),
  })

  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['operations-logs', selectedCategory],
    queryFn: () => apiClient.getOperationsLogs({ 
      category: selectedCategory === 'all' ? 'all' : selectedCategory,
      limit: 200 
    }),
    refetchInterval: 5000,
  })

  const filteredLogs = useMemo(() => {
    if (!searchTerm) return logs
    const search = searchTerm.toLowerCase()
    return logs.filter(log => 
      log.message?.toLowerCase().includes(search) ||
      log.category?.toLowerCase().includes(search)
    )
  }, [logs, searchTerm])

  const handleTestAll = async () => {
    const services = ['authentik', 'ldap', 'database', 'smtp']
    for (const service of services) {
      await testMutation.mutateAsync(service)
    }
  }

  const services = [
    { name: 'authentik', ...health?.services?.authentik },
    { name: 'ldap', ...health?.services?.ldap },
    { name: 'database', ...health?.services?.database },
    { name: 'smtp', ...health?.services?.smtp },
  ]

  const getServiceStatus = (svc) => {
    if (svc?.status === 'up' || svc?.connected) return 'up'
    if (svc?.status === 'not_configured') return 'not_configured'
    if (svc?.status === 'down') return 'down'
    return 'unknown'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operations Center</h1>
          <p className="text-muted-foreground">
            Real-time system monitoring and operations logging
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTestAll}>
            <Zap className="h-4 w-4 mr-2" />
            Test All Services
          </Button>
          <Button variant="outline" onClick={() => { refetchHealth(); refetchLogs(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Service Health Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {services.map(svc => (
          <ServiceCard
            key={svc.name}
            name={svc.name}
            status={getServiceStatus(svc)}
            latency={svc.latency}
            error={svc.error}
            onTest={() => testMutation.mutate(svc.name)}
            isTesting={testMutation.isPending && testService === svc.name}
          />
        ))}
      </div>

      {/* Metrics Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricTile 
          icon={User} 
          label="Total Users" 
          value={health?.metrics?.totalUsers}
          variant="default"
        />
        <MetricTile 
          icon={Activity} 
          label="Active Sessions" 
          value={health?.metrics?.activeSessions}
          variant="success"
        />
        <MetricTile 
          icon={XCircle} 
          label="Failed Logins (24h)" 
          value={health?.metrics?.failedLogins24h}
          variant={health?.metrics?.failedLogins24h > 0 ? 'error' : 'success'}
        />
        <MetricTile 
          icon={RotateCw} 
          label="Last Sync" 
          value={health?.metrics?.lastSync ? new Date(health.metrics.lastSync).toLocaleTimeString() : 'Never'}
          variant="default"
        />
        <MetricTile 
          icon={Server} 
          label="Response Time" 
          value={health?.responseTime ? `${health.responseTime}ms` : '-'}
          variant={health?.responseTime > 1000 ? 'warning' : 'success'}
        />
      </div>

      {/* Log Stream */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Live Operations Log</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Category Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(CATEGORIES).map(([key, value]) => (
              <Button
                key={key}
                size="sm"
                variant={selectedCategory === value ? 'default' : 'outline'}
                onClick={() => setSelectedCategory(value)}
              >
                {key === 'ALL' ? 'All' : key}
              </Button>
            ))}
          </div>

          {/* Log Stream */}
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {logsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading logs...
              </div>
            ) : filteredLogs.length > 0 ? (
              filteredLogs.slice(0, 100).map((log, idx) => (
                <LogEntry key={log.id || idx} log={log} />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No logs to display
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}