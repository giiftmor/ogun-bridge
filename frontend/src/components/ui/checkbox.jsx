import { cn } from '@/utils/cn'

export function Checkbox({ className, checked, onCheckedChange, ...props }) {
  return (
    <input
      type="checkbox"
      className={cn(
        'h-4 w-4 rounded-sm border border-border bg-subtle text-accent',
        'transition-[border-color,background] duration-150 ease',
        'hover:border-border-strong',
        'focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_hsl(var(--accent-tint)),0_0_0_1px_hsl(var(--accent))]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'accent-accent',
        className,
      )}
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...props}
    />
  )
}
