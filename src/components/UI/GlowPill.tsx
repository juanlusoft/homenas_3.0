import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Status = "healthy" | "warning" | "error" | "info";

interface GlowPillProps extends HTMLAttributes<HTMLSpanElement> {
  status: Status;
  label: string;
}

const statusStyles: Record<Status, string> = {
  healthy: "glow-pill--healthy",
  warning: "glow-pill--warning",
  error: "glow-pill--error",
  info: "text-info bg-[rgba(100,181,246,0.15)] shadow-[0_0_4px_#64b5f6]",
};

/**
 * Glow-Pill status indicator.
 * Per Stitch rules: no simple dots — use luminous pills instead.
 */
export function GlowPill({ status, label, className, ...props }: GlowPillProps) {
  return (
    <span
      className={cn("glow-pill", statusStyles[status], className)}
      {...props}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-glow-breathe" />
      {label}
    </span>
  );
}
