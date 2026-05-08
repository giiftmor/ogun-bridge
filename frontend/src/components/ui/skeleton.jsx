import * as React from "react"
import { cn } from "@/lib/utils"

const Skeleton = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-[6px] bg-[linear-gradient(90deg,var(--tw-bg-subtle)_25%,hsl(var(--border))_50%,var(--tw-bg-subtle)_75%)] bg-[length:800px_100%]",
      "animate-[shimmer_1.4s_ease-in-out_infinite]",
      className,
    )}
    style={{ '--tw-bg-subtle': 'hsl(var(--bg-subtle))' }}
    {...props}
  />
))
Skeleton.displayName = "Skeleton"

function SkeletonCard() {
  return (
    <div className="rounded border border-border bg-surface p-4 space-y-3">
      <Skeleton className="h-[14px] w-1/3" />
      <Skeleton className="h-[13px] w-full" />
      <Skeleton className="h-[13px] w-2/3" />
    </div>
  )
}

function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="rounded border border-border bg-surface">
      <div className="border-b border-border p-4 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-[13px] flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="border-b border-border p-4 flex gap-4">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton key={colIdx} className="h-[13px] flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

function SkeletonList({ items = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border border-border rounded bg-surface">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-[13px] w-1/3" />
            <Skeleton className="h-[12px] w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonCard, SkeletonTable, SkeletonList }
