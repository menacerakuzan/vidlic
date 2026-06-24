import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        aria-invalid={error || undefined}
        className={cn(
          // Diia input: 1.5px visible border, 8px radius, calm focus with accent ring
          "flex h-11 w-full rounded-lg border-[1.5px] bg-card px-4 py-2 text-sm text-foreground transition-colors duration-150",
          "placeholder:text-muted-foreground/60 file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/25 focus-visible:border-accent",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
          error
            ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20"
            : "border-border hover:border-border/80",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
