import { cn } from '@/utils/cn'

export function Badge({ className, variant = 'default', ...props }) {
  const variants = {
    default:
      'bg-accent-tint text-accent',
    success:
      'bg-success-bg text-success-text',
    danger:
      'bg-danger-bg text-danger-text',
    neutral:
      'bg-subtle text-secondary border border-border',
    outline:
      'bg-transparent text-secondary border border-border',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-[3px] rounded-pill px-2 py-[1px]',
        'text-[11px] font-medium leading-none',
        'transition-[background,color] duration-150 ease',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
