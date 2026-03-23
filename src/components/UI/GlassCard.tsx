import { cn } from "@/lib/utils";
import { type ReactNode, type HTMLAttributes } from "react";

type Elevation = "low" | "mid" | "high" | "glass";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevation?: Elevation;
  pulse?: boolean;
}

const elevationStyles: Record<Elevation, string> = {
  low: "bg-surface-low border border-[var(--outline-variant)]",
  mid: "bg-surface-mid border border-[var(--outline-variant)]",
  high: "bg-surface-high border border-[var(--outline-variant)]",
  glass: "glass",
};

/**
 * Surface card with subtle border for visual separation.
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
        "rounded-xl p-5 lg:p-6",
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
