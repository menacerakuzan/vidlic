'use client'

import * as React from "react"
import { cn } from "@/lib/utils"

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  className?: string
}

// Diia tooltip — dark surface, white text, small radius, appears on hover/focus.
// Lightweight CSS-only implementation (no portal) for inline hints and help text.
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const positions: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 hidden whitespace-nowrap rounded bg-slate-900 px-2.5 py-1.5 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:block group-hover:opacity-100 group-focus-within:block group-focus-within:opacity-100 dark:bg-slate-700",
          positions[side],
          className
        )}
      >
        {content}
      </span>
    </span>
  )
}
