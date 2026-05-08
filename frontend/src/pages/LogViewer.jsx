import { useState, useEffect, useMemo } from 'react'
import { Filter, Download, Trash2, Search, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/useAppStore'
import { wsService } from '@/services/websocket'
import { apiClient } from '@/services/api'
import { getTimezone } from '@/utils/timezone'

export function LogViewer() {
  const { logs, addLog, clearLogs, logFilters, setLogFilters } = useAppStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  // Fetch logs from API on mount
  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true)
      try {
        const cachedLogs = await apiClient.getLogs({ limit: 500 })
        cachedLogs.forEach(log => addLog(log))
      } catch (error) {
        console.error('Failed to fetch logs:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchLogs()
  }, [addLog])

  // Subscribe to real-time logs
  useEffect(() => {
    const unsubscribe = wsService.subscribeLogs((log) => {
      addLog(log)
    }, logFilters)

    return () => {
      unsubscribe?.()
    }
  }, [addLog, logFilters])

  const filteredLogs = useMemo(() => {
    return logs
      .filter(log => {
        // Filter by level
        if (logFilters.level !== 'all' && log.level !== logFilters.level) {
          return false
        }

        // Filter by search term
        if (searchTerm) {
          const searchLower = searchTerm.toLowerCase()
          const messageMatch = log.message.toLowerCase().includes(searchLower)
          const contextMatch = log.context && 
            JSON.stringify(log.context).toLowerCase().includes(searchLower)
          if (!messageMatch && !contextMatch) {
            return false
          }
        }

        return true
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) // Newest first
  }, [logs, logFilters, searchTerm])

  const handleExport = () => {
    const logText = filteredLogs
      .map(log => `[${new Date(log.timestamp).toLocaleString('en-US', { timeZone: getTimezone() })}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n')
    
    const blob = new Blob([logText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `alsm-logs-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getLevelStats = () => {
    return {
      all: logs.length,
      info: logs.filter(l => l.level === 'info').length,
      warn: logs.filter(l => l.level === 'warn').length,
      error: logs.filter(l => l.level === 'error').length,
    }
  }

  const stats = getLevelStats()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Logs</h1>
        <p className="text-muted-foreground mt-2">
          Real-time sync service logs with intelligent filtering
        </p>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Level Filters */}
            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={logFilters.level === 'all'}
                onClick={() => setLogFilters({ level: 'all' })}
                count={stats.all}
              >
                All
              </FilterButton>
              <FilterButton
                active={logFilters.level === 'info'}
                onClick={() => setLogFilters({ level: 'info' })}
                count={stats.info}
                variant="default"
              >
                Info
              </FilterButton>
              <FilterButton
                active={logFilters.level === 'warn'}
                onClick={() => setLogFilters({ level: 'warn' })}
                count={stats.warn}
                variant="warning"
              >
                Warning
              </FilterButton>
              <FilterButton
                active={logFilters.level === 'error'}
                onClick={() => setLogFilters({ level: 'error' })}
                count={stats.error}
                variant="error"
              >
                Error
              </FilterButton>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  clearLogs()
                  setIsLoading(true)
                  try {
                    const cachedLogs = await apiClient.getLogs({ limit: 500 })
                    cachedLogs.forEach(log => addLog(log))
                  } catch (error) {
                    console.error('Failed to fetch logs:', error)
                  } finally {
                    setIsLoading(false)
                  }
                }}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={filteredLogs.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearLogs}
                disabled={logs.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Display */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filteredLogs.length} {filteredLogs.length === 1 ? 'Log' : 'Logs'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading logs...
            </div>
          ) : filteredLogs.length > 0 ? (
            <div className="space-y-1 max-h-[600px] overflow-y-auto font-mono text-sm">
              {filteredLogs.map((log, index) => (
                <LogEntry key={`${log.timestamp}-${index}`} log={log} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No logs to display
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FilterButton({ children, active, onClick, count, variant = 'default' }) {
  const variantStyles = {
    default: '',
    warning: active ? 'border-yellow-500' : '',
    error: active ? 'border-red-500' : '',
  }

  return (
    <Button
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
      className={variantStyles[variant]}
    >
      {children}
      {count !== undefined && (
        <span className="ml-2 opacity-70">({count})</span>
      )}
    </Button>
  )
}

function LogEntry({ log }) {
  const [expanded, setExpanded] = useState(false)

  const getLevelColor = (level) => {
    switch (level) {
      case 'error':
        return 'text-red-600 dark:text-red-400'
      case 'warn':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'info':
        return 'text-blue-600 dark:text-blue-400'
      default:
        return 'text-muted-foreground'
    }
  }

  const getLevelBg = (level) => {
    switch (level) {
      case 'error':
        return 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
      case 'warn':
        return 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900'
      case 'info':
        return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900'
      default:
        return 'bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-900'
    }
  }

  // Clean the log message (remove container name, parse timestamp)
  const cleanMessage = (msg) => {
    // Remove container prefix like "ldap-sync  | "
    const cleaned = msg.replace(/^[\w-]+\s+\|\s+/, '')
    return cleaned
  }

  const hasDetails = log.context || log.stackTrace

  return (
    <div className={`p-3 rounded-sm border ${getLevelBg(log.level)}`}>
      <div className="flex items-start gap-3">
        {/* Timestamp */}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(log.timestamp).toLocaleTimeString('en-US', { timeZone: getTimezone(), hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>

        {/* Level Badge */}
        <Badge 
          variant={log.level === 'error' ? 'error' : log.level === 'warn' ? 'warning' : 'secondary'}
          className="shrink-0"
        >
          {log.level.toUpperCase()}
        </Badge>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <div className={`${getLevelColor(log.level)} break-words`}>
            {cleanMessage(log.message)}
          </div>

          {/* Context (if exists and expanded) */}
          {hasDetails && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary hover:underline mt-1"
            >
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          )}

          {expanded && log.context && (
            <div className="mt-2 p-2 bg-black/5 dark:bg-white/5 rounded text-xs overflow-auto">
              <pre>{JSON.stringify(log.context, null, 2)}</pre>
            </div>
          )}

          {expanded && log.stackTrace && (
            <div className="mt-2 p-2 bg-black/5 dark:bg-white/5 rounded text-xs overflow-auto">
              <pre>{log.stackTrace}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
