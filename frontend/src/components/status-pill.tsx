import type React from "react"
import { cn } from "@/lib/utils"

/**
 * Status Pill Component
 *
 * A versatile badge component for displaying status states.
 * - Supports multiple tones (neutral, good, warn, info, error).
 * - Optional pulsing animation for active states.
 * - Used for task statuses, agent states, and system health.
 */

export type StatusTone = "neutral" | "good" | "warn" | "info" | "error"

interface StatusPillProps {
  label: string
  tone?: StatusTone
  pulse?: boolean
  icon?: React.ReactNode
  className?: string
}

export function StatusPill({ label, tone = "neutral", pulse = false, icon, className }: StatusPillProps) {
  const showPulse = pulse || tone === "good"

  return (
    <span
      className={cn(
        "group relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all duration-200",
        "shadow-sm hover:shadow-md",
        "backdrop-blur-sm",
        // Neutral
        tone === "neutral" && ["bg-muted/80 text-muted-foreground", "border border-border/50", "hover:bg-muted"],
        // Good / Success
        tone === "good" && [
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          "border border-emerald-500/20",
          "shadow-emerald-500/5",
          "hover:bg-emerald-500/15 hover:border-emerald-500/30",
        ],
        // Warning
        tone === "warn" && [
          "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          "border border-amber-500/20",
          "shadow-amber-500/5",
          "hover:bg-amber-500/15 hover:border-amber-500/30",
        ],
        // Info
        tone === "info" && [
          "bg-sky-500/10 text-sky-600 dark:text-sky-400",
          "border border-sky-500/20",
          "shadow-sky-500/5",
          "hover:bg-sky-500/15 hover:border-sky-500/30",
        ],
        // Error
        tone === "error" && [
          "bg-rose-500/10 text-rose-600 dark:text-rose-400",
          "border border-rose-500/20",
          "shadow-rose-500/5",
          "hover:bg-rose-500/15 hover:border-rose-500/30",
        ],
        className,
      )}
    >
      {/* Animated dot indicator */}
      <span className="relative flex h-1.5 w-1.5">
        {showPulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              tone === "good" && "bg-emerald-500",
              tone === "warn" && "bg-amber-500",
              tone === "info" && "bg-sky-500",
              tone === "error" && "bg-rose-500",
              tone === "neutral" && "bg-muted-foreground",
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            tone === "good" && "bg-emerald-500",
            tone === "warn" && "bg-amber-500",
            tone === "info" && "bg-sky-500",
            tone === "error" && "bg-rose-500",
            tone === "neutral" && "bg-muted-foreground/60",
          )}
        />
      </span>

      {/* Optional icon */}
      {icon && <span className="flex items-center justify-center">{icon}</span>}

      {/* Label */}
      <span className="relative">{label}</span>

      {/* Subtle shine effect on hover */}
      <span
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100",
          "bg-gradient-to-r from-transparent via-white/10 to-transparent",
        )}
      />
    </span>
  )
}
