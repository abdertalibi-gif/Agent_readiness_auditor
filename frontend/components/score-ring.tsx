"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

interface ScoreRingProps {
  score: number | null;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function scoreColor(score: number | null): string {
  if (score === null) return "#94a3b8";
  if (score >= 90) return "#16a34a";
  if (score >= 75) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  if (score >= 40) return "#f97316";
  return "#dc2626";
}

export function ScoreRing({ score, size = 180, strokeWidth = 14, className }: ScoreRingProps) {
  const { t, ratingLabel } = useI18n();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = score ?? 0;
  const offset = circumference - (value / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums">{score === null ? "—" : score.toFixed(0)}</span>
        <span className="text-xs text-muted-foreground">{t("scoreRing.outOf100")}</span>
        <span className="mt-1 text-xs font-medium" style={{ color }}>
          {ratingLabel(score)}
        </span>
      </div>
    </div>
  );
}
