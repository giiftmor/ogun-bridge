import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const Select = React.forwardRef(({ className, children, value, onValueChange, ...props }, ref) => {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none",
          className
        )}
        ref={ref}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
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
      "py-1.5 px-2 text-sm cursor-pointer hover:bg-accent",
      className
    )}
    {...props}
  >
    {children}
  </option>
))
SelectItem.displayName = "SelectItem"

const SelectValue = ({ placeholder }) => (
  <span className="text-muted-foreground">{placeholder || "Select..."}</span>
)

export {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
}