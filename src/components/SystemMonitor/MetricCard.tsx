import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/UI/GlassCard";
import type { ReactNode } from "react";

type Trend = "up" | "down" | "stable";

interface MetricCardProps {
  /** Metric label (e.g. "CPU", "Memory") */
  title: string;
  /** Formatted value (e.g. "45%", "6.2 GB") */
  value: string;
  /** Unit suffix shown after the value */
  unit?: string;
  /** Optional icon element rendered before the title */
  icon?: ReactNode;
  /** Directional trend indicator */
  trend?: Trend;
  className?: string;
}

const trendIcons: Record<Trend, string> = {
  up: "↑",
  down: "↓",
  stable: "→",
};

const trendColors: Record<Trend, string> = {
  up: "text-red-400",
  down: "text-emerald-400",
  stable: "text-gray-400",
};

/**
 * Displays a single system metric inside a GlassCard.
 * Shows title, large value, optional unit, and a directional trend arrow.
 */
export function MetricCard({
  title,
  value,
  unit,
  icon,
  trend = "stable",
  className,
}: MetricCardProps) {
  return (
    <GlassCard elevation="mid" className={cn("min-w-[140px]", className)}>
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-lg">{icon}</span>}
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
          {title}
        </span>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white tabular-nums">
          {value}
        </span>
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
        <span className={cn("ml-auto text-sm font-medium", trendColors[trend])}>
          {trendIcons[trend]}
        </span>
      </div>
    </GlassCard>
  );
}
