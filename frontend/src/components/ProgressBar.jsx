import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/useAppStore'
import { wsService } from '@/services/websocket'

/**
 * ProgressBar component for bidirectional sync operations
 * Shows separate progress for Authentik → LDAP and LDAP → Authentik
 */
export function ProgressBar() {
  const { syncStatus } = useAppStore()
  const [authToLdap, setAuthToLdap] = useState(null)
  const [ldapToAuth, setLdapToAuth] = useState(null)

  useEffect(() => {
    // Subscribe to detailed sync progress via WebSocket
    wsService.subscribe('sync-progress', (data) => {
      if (data.direction === 'authentik-to-ldap') {
        setAuthToLdap(data)
      } else if (data.direction === 'ldap-to-authentik') {
        setLdapToAuth(data)
      }
    })

    return () => {
      wsService.unsubscribe('sync-progress')
    }
  }, [])

  if (!syncStatus?.status === 'running' && !authToLdap && !ldapToAuth) {
    return null
  }

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Sync in Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Authentik → LDAP */}
        <SyncDirectionProgress
          title="Authentik → LDAP"
          description="Syncing users from Authentik to LDAP"
          progress={authToLdap}
          colorClass="border-blue-500 bg-blue-50 dark:bg-blue-950/20"
          iconColor="text-blue-600"
        />

        {/* LDAP → Authentik */}
        <SyncDirectionProgress
          title="LDAP → Authentik"
          description="Syncing users from LDAP to Authentik"
          progress={ldapToAuth}
          colorClass="border-green-500 bg-green-50 dark:bg-green-950/20"
          iconColor="text-green-600"
        />

        {syncStatus?.currentOperation && (
          <p className="text-sm text-muted-foreground italic">
            Current: {syncStatus.currentOperation}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function SyncDirectionProgress({ title, description, progress, colorClass, iconColor }) {
  if (!progress) {
    return (
      <div className={`border rounded-lg p-4 ${colorClass} opacity-50`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ArrowRight className={`h-4 w-4 ${iconColor}`} />
            <span className="font-medium text-sm">{title}</span>
          </div>
          <Badge variant="outline">Waiting...</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    )
  }

  const isComplete = progress.status === 'completed'
  const hasError = progress.status === 'error'
  const percentage = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <div className={`border rounded-lg p-4 ${colorClass}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {hasError ? (
            <XCircle className="h-4 w-4 text-red-600" />
          ) : isComplete ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <Loader2 className={`h-4 w-4 animate-spin ${iconColor}`} />
          )}
          <span className="font-medium text-sm">{title}</span>
        </div>
        <Badge
          variant={hasError ? 'destructive' : isComplete ? 'outline' : 'default'}
        >
          {hasError ? 'Failed' : isComplete ? 'Done' : `${percentage}%`}
        </Badge>
      </div>

      {/* Progress Bar */}
      {!isComplete && !hasError && (
        <div className="w-full bg-muted rounded-full h-2 mb-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              iconColor.includes('blue') ? 'bg-blue-600' : 'bg-green-600'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{description}</span>
        {progress.current && progress.total && (
          <span>{progress.current} / {progress.total}</span>
        )}
      </div>

      {progress.currentItem && (
        <p className="text-xs text-muted-foreground mt-1 italic">
          Processing: {progress.currentItem}
        </p>
      )}

      {hasError && progress.error && (
        <p className="text-xs text-red-600 mt-1">
          Error: {progress.error}
        </p>
      )}
    </div>
  )
}

/**
 * Compact progress indicator for use in status bars or banners
 */
export function CompactProgress({ label, percentage, status = 'running' }) {
  const isComplete = status === 'completed'
  const hasError = status === 'error'

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex-1 max-w-[200px]">
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              hasError ? 'bg-red-600' : isComplete ? 'bg-green-600' : 'bg-blue-600'
            }`}
            style={{ width: `${isComplete ? 100 : percentage}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        {hasError ? 'Failed' : isComplete ? 'Done' : `${percentage}%`}
      </span>
    </div>
  )
}
