import { cn } from "@/lib/utils";
import { type ReactNode, type HTMLAttributes } from "react";

type Elevation = "low" | "mid" | "high" | "glass";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevation?: Elevation;
  pulse?: boolean;
}

const elevationStyles: Record<Elevation, string> = {
  low: "bg-surface-low",
  mid: "bg-surface-mid",
  high: "bg-surface-high",
  glass: "glass",
};

/**
 * Surface card following Stitch "No-Line Rule".
 * No 1px borders for sectioning — tonal shifts only.
 */
export function GlassCard({
  children,
  elevation = "mid",
  pulse = false,
  className,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-stitch p-stitch-6",
        elevationStyles[elevation],
        pulse && "animate-node-pulse",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
