import { useEffect } from 'react'
import { cn } from '@/utils/cn'
import { X } from 'lucide-react'

export function Dialog({ open, onClose, children, className }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && open) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-50 w-full max-w-md bg-elevated border border-border rounded',
          className,
        )}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-secondary hover:text-primary transition-colors duration-150"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  )
}

export function DialogHeader({ className, ...props }) {
  return (
    <div className={cn('px-5 pt-5 pb-0', className)} {...props} />
  )
}

export function DialogTitle({ className, ...props }) {
  return (
    <h2 className={cn('text-[16px] font-medium text-primary', className)} {...props} />
  )
}

export function DialogDescription({ className, ...props }) {
  return (
    <p className={cn('text-[13px] text-secondary mt-1', className)} {...props} />
  )
}

export function DialogContent({ className, ...props }) {
  return (
    <div className={cn('px-5 py-4', className)} {...props} />
  )
}

export function DialogFooter({ className, ...props }) {
  return (
    <div className={cn('px-5 pb-5 pt-0 flex justify-end gap-2', className)} {...props} />
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  loading = false,
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <DialogFooter>
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 text-[13px] font-medium text-secondary bg-transparent border border-border rounded-sm hover:bg-subtle hover:text-primary transition-colors duration-150 disabled:opacity-50"
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={cn(
            'px-4 py-2 text-[13px] font-medium text-white rounded-pill transition-colors duration-150 disabled:opacity-50',
            variant === 'danger'
              ? 'bg-danger-text hover:opacity-90'
              : 'bg-accent hover:bg-accent-hover',
          )}
        >
          {loading ? 'Loading\u2026' : confirmText}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
