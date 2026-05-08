import { cn } from '@/utils/cn'

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded p-4',
        'transition-[border-color] duration-150 ease hover:border-border-strong',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col gap-1 mb-3', className)}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn(
        'text-[13px] font-medium text-primary leading-[1.2]',
        className,
      )}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }) {
  return (
    <p
      className={cn('text-[12px] text-secondary', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }) {
  return <div className={cn('', className)} {...props} />
}

export function CardFooter({ className, ...props }) {
  return (
    <div
      className={cn('flex items-center gap-2 mt-4 pt-3 border-t border-border', className)}
      {...props}
    />
  )
}
