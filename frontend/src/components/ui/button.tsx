import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "gold" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          // Diia base: flat fill, no heavy shadow, calm 150ms motion, clear focus ring
          "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40",
          {
            // Primary — navy ОДА, white text
            "bg-primary text-primary-foreground hover:bg-primary/90": variant === "default",
            // Danger — burgundy ОДА
            "bg-destructive text-destructive-foreground hover:bg-destructive/90": variant === "destructive",
            // Secondary outline — navy border, fills with subtle tint on hover
            "border border-primary/40 bg-transparent text-primary hover:bg-primary/5": variant === "outline",
            // Secondary solid surface
            "bg-secondary text-secondary-foreground hover:bg-secondary/70": variant === "secondary",
            // Ghost — tertiary
            "bg-transparent text-foreground/70 hover:bg-secondary hover:text-foreground": variant === "ghost",
            // Gold CTA — reserved for key onboarding / highlight actions (ОДА gold)
            "bg-accent text-accent-foreground font-semibold hover:bg-accent/90": variant === "gold",
            // Link
            "text-primary underline-offset-4 hover:underline": variant === "link",
            "h-10 px-5 py-2": size === "default",
            "h-9 rounded-lg px-3 text-sm": size === "sm",
            "h-12 rounded-lg px-8 text-base": size === "lg",
            "h-10 w-10 p-0": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
