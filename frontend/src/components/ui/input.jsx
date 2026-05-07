import { cn } from '@/utils/cn'

export function Input({ className, type = 'text', ...props }) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-sm bg-subtle border border-border px-3 py-2',
        'text-[13px] text-primary placeholder:text-tertiary',
        'transition-[border-color,background] duration-150 ease',
        'hover:border-border-strong',
        'focus-visible:outline-none focus-visible:border-border-strong focus-visible:shadow-[0_0_0_3px_hsl(var(--accent-tint)),0_0_0_1px_hsl(var(--accent))]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-[13px] file:font-medium',
        className,
      )}
      {...props}
    />
  )
}
