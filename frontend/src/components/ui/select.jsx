import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const Select = React.forwardRef(({ className, children, value, onValueChange, ...props }, ref) => {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          "flex h-9 w-full items-center rounded-sm bg-subtle border border-border px-3 py-2 pr-8",
          "text-[13px] text-primary placeholder:text-tertiary",
          "appearance-none",
          "transition-[border-color,background] duration-150 ease",
          "hover:border-border-strong",
          "focus:outline-none focus:border-border-strong focus:shadow-[0_0_0_3px_hsl(var(--accent-tint)),0_0_0_1px_hsl(var(--accent))]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tertiary pointer-events-none" />
    </div>
  )
})
Select.displayName = "Select"

const SelectTrigger = ({ className, children, value, onValueChange, ...props }) => (
  <Select value={value} onValueChange={onValueChange} className={className} {...props}>
    {children}
  </Select>
)

const SelectContent = ({ className, children, ...props }) => (
  <div className={cn(className)} {...props}>
    {children}
  </div>
)

const SelectItem = React.forwardRef(({ className, children, value, ...props }, ref) => (
  <option
    ref={ref}
    value={value}
    className={cn(
      "py-[5px] px-2 text-[13px] cursor-pointer",
      className,
    )}
    {...props}
  >
    {children}
  </option>
))
SelectItem.displayName = "SelectItem"

const SelectValue = ({ placeholder }) => (
  <span className="text-tertiary text-[13px]">{placeholder || "Select..."}</span>
)

export {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
}
