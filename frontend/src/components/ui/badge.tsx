import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "error" | "gold" | "neutral"
}

// Diia tag/badge — pill shape, subtle tinted background, functional color coding
const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium leading-none",
          {
            "bg-primary/10 text-primary": variant === "default",
            "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300": variant === "success",
            "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300": variant === "warning",
            "bg-destructive/10 text-destructive": variant === "error",
            "bg-accent/15 text-accent-foreground dark:text-accent": variant === "gold",
            "bg-muted text-muted-foreground": variant === "neutral",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge }
