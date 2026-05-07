import { cn } from '@/utils/cn'

export function Button({
  className,
  variant = 'accent',
  size = 'default',
  type = 'button',
  ...props
}) {
  const variants = {
    accent:
      'bg-accent text-white hover:bg-accent-hover active:bg-accent-hover',
    dark: 'bg-primary text-surface hover:opacity-90 active:opacity-80',
    ghost:
      'bg-transparent text-secondary border border-border hover:bg-subtle hover:text-primary active:bg-subtle',
    'icon-only':
      'bg-transparent text-secondary border border-border hover:bg-subtle active:bg-subtle',
  }

  const sizes = {
    default: 'h-9 px-5 text-[13px]',
    sm: 'h-8 px-3 text-[12px]',
    lg: 'h-10 px-7 text-[14px]',
    icon: 'h-9 w-9 p-[7px]',
  }

  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium leading-none cursor-pointer select-none',
        'transition-[background,color,border-color,opacity] duration-150 ease',
        'focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_hsl(var(--accent-tint)),0_0_0_1px_hsl(var(--accent))]',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'default' || size === 'sm' || size === 'lg'
          ? variant === 'ghost'
            ? 'rounded-sm'
            : 'rounded-pill'
          : 'rounded-sm',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
