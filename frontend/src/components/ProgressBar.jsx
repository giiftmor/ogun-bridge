import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/useAppStore'
import { wsService } from '@/services/websocket'

export function ProgressBar() {
  const { syncStatus } = useAppStore()
  const [authToLdap, setAuthToLdap] = useState(null)
  const [ldapToAuth, setLdapToAuth] = useState(null)

  useEffect(() => {
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

  if (syncStatus?.status !== 'running' && !authToLdap && !ldapToAuth) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[16px]">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Sync in Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SyncDirectionProgress
          title="Authentik \u2192 LDAP"
          description="Syncing users from Authentik to LDAP"
          progress={authToLdap}
          iconColor="text-accent"
          barColor="bg-accent"
        />

        <SyncDirectionProgress
          title="LDAP \u2192 Authentik"
          description="Syncing users from LDAP to Authentik"
          progress={ldapToAuth}
          iconColor="text-success-text"
          barColor="bg-success-text"
        />

        {syncStatus?.currentOperation && (
          <p className="text-[13px] text-secondary italic">
            Current: {syncStatus.currentOperation}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function SyncDirectionProgress({ title, description, progress, iconColor, barColor }) {
  if (!progress) {
    return (
      <div className="border border-border rounded-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-secondary" />
            <span className="font-medium text-[13px] text-primary">{title}</span>
          </div>
          <Badge variant="neutral">Waiting...</Badge>
        </div>
        <p className="text-[12px] text-secondary">{description}</p>
      </div>
    )
  }

  const isComplete = progress.status === 'completed'
  const hasError = progress.status === 'error'
  const percentage = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <div className="border border-border rounded-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {hasError ? (
            <XCircle className="h-4 w-4 text-danger-text" />
          ) : isComplete ? (
            <CheckCircle2 className="h-4 w-4 text-success-text" />
          ) : (
            <Loader2 className={`h-4 w-4 animate-spin ${iconColor}`} />
          )}
          <span className="font-medium text-[13px] text-primary">{title}</span>
        </div>
        <Badge
          variant={hasError ? 'danger' : isComplete ? 'success' : 'default'}
        >
          {hasError ? 'Failed' : isComplete ? 'Done' : `${percentage}%`}
        </Badge>
      </div>

      {!isComplete && !hasError && (
        <div className="w-full bg-subtle rounded-full h-[4px] mb-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      <div className="flex justify-between text-[12px] text-secondary">
        <span>{description}</span>
        {progress.current && progress.total && (
          <span>{progress.current} / {progress.total}</span>
        )}
      </div>

      {progress.currentItem && (
        <p className="text-[12px] text-secondary mt-1 italic">
          Processing: {progress.currentItem}
        </p>
      )}

      {hasError && progress.error && (
        <p className="text-[12px] text-danger-text mt-1">
          Error: {progress.error}
        </p>
      )}
    </div>
  )
}

export function CompactProgress({ label, percentage, status = 'running' }) {
  const isComplete = status === 'completed'
  const hasError = status === 'error'

  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] font-medium text-primary">{label}</span>
      <div className="flex-1 max-w-[200px]">
        <div className="w-full bg-subtle rounded-full h-[4px] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              hasError ? 'bg-danger-text' : isComplete ? 'bg-success-text' : 'bg-accent'
            }`}
            style={{ width: `${isComplete ? 100 : percentage}%` }}
          />
        </div>
      </div>
      <span className="text-[12px] text-secondary">
        {hasError ? 'Failed' : isComplete ? 'Done' : `${percentage}%`}
      </span>
    </div>
  )
}
