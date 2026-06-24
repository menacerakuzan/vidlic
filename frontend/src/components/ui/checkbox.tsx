import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode
}

// Diia checkbox — 4px radius element, navy fill when checked, clear check glyph
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, checked, ...props }, ref) => {
    return (
      <label className="inline-flex cursor-pointer items-center gap-2 select-none">
        <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            ref={ref}
            checked={checked}
            className="peer absolute inset-0 cursor-pointer appearance-none rounded border-[1.5px] border-border bg-card transition-colors duration-150 checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/25 disabled:opacity-40"
            {...props}
          />
          <Check className="pointer-events-none h-3.5 w-3.5 text-primary-foreground opacity-0 transition-opacity duration-150 peer-checked:opacity-100" strokeWidth={3} />
        </span>
        {label != null && <span className="text-sm text-foreground">{label}</span>}
      </label>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
