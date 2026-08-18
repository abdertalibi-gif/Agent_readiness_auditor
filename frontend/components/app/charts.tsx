"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

interface Point {
  label: string;
  value: number;
}

export function LineChart({ points, className }: { points: Point[]; className?: string }) {
  const { t } = useI18n();
  const w = 600;
  const h = 220;
  const pad = 32;
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const range = Math.max(max - min, 1);

  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(points.length - 1, 1);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={t("charts.lineChart")}>
        {[0, 25, 50, 75, 100].map((grid) => (
          <g key={grid}>
            <line x1={pad} x2={w - pad} y1={y(grid)} y2={y(grid)} stroke="hsl(var(--border))" strokeDasharray="4 4" />
            <text x={pad - 6} y={y(grid) + 3} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">
              {grid}
            </text>
          </g>
        ))}
        <path d={area} fill="hsl(var(--primary) / 0.08)" />
        <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={`${p.label}-${i}`}>
            <circle cx={x(i)} cy={y(p.value)} r="4" fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth="2" />
            <text x={x(i)} y={h - 12} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function BarChart({ data, className }: { data: Point[]; className?: string }) {
  const { t } = useI18n();
  const w = 600;
  const h = 200;
  const pad = 32;
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const bw = (w - pad * 2) / data.length;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={t("charts.barChart")}>
        {[0, 0.5, 1].map((t) => {
          const y = h - pad - t * (h - pad * 2);
          return (
            <g key={t}>
              <line x1={pad} x2={w - pad} y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <text x={pad - 6} y={y + 3} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">
                {Math.round(t * max)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const bh = ((d.value / max) * (h - pad * 2)) || 2;
          return (
            <g key={`${d.label}-${i}`}>
              <rect
                x={pad + i * bw + bw * 0.2}
                y={h - pad - bh}
                width={bw * 0.6}
                height={bh}
                rx="4"
                fill="hsl(var(--primary))"
              />
              <text x={pad + i * bw + bw / 2} y={h - 8} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ segments, className, size = 180 }: { segments: Segment[]; className?: string; size?: number }) {
  const { t } = useI18n();
  const total = segments.reduce((s, x) => s + x.value, 0);
  const radius = size / 2 - 16;
  const c = 2 * Math.PI * radius;

  // Each segment's dash offset accumulates the previous segments' dash
  // lengths. Computed immutably so nothing is reassigned during render.
  const circles = segments.reduce<Array<Segment & { dash: number; offset: number }>>(
    (acc, seg) => {
      const frac = total > 0 ? seg.value / total : 0;
      const dash = frac * c;
      const last = acc[acc.length - 1];
      const offset = last ? last.offset - last.dash : c;
      return [...acc, { ...seg, dash, offset }];
    },
    []
  );

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={t("charts.donutChart")}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="18" />
        {circles.map((seg) =>
          seg.dash > 0 ? (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="18"
              strokeDasharray={`${seg.dash} ${c}`}
              strokeDashoffset={seg.offset}
              strokeLinecap="round"
            />
          ) : null
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{total}</span>
        <span className="text-xs text-muted-foreground">{t("charts.total")}</span>
      </div>
    </div>
  );
}
