import { AlertCircle, CheckCircle, XCircle, Info, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { getErrorAlertProps } from '@/utils/errorTranslator'

const variantStyles = {
  danger: 'bg-danger-bg border-danger-text/20 text-danger-text',
  warning: 'bg-amber-50 dark:bg-amber-950/20 border-amber-300/40 dark:border-amber-700/40 text-amber-800 dark:text-amber-200',
  success: 'bg-success-bg border-success-text/20 text-success-text',
  info: 'bg-accent-tint border-accent-tint-border text-primary',
}

const iconMap = {
  danger: XCircle,
  warning: AlertCircle,
  success: CheckCircle,
  info: Info,
}

export function ErrorAlert({ code, message, onClose }) {
  const info = getErrorAlertProps(code)
  const variant = info.variant
  const Icon = iconMap[variant] || AlertCircle

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-sm border px-4 py-3 text-[13px]',
        variantStyles[variant] || variantStyles.danger,
      )}
      role="alert"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="font-medium leading-tight">{info.title}</p>
        {message && (
          <p className="opacity-80 leading-tight">{message}</p>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-auto shrink-0 flex items-center justify-center w-5 h-5 rounded-sm hover:opacity-70 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
