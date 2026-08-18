import type { CategoryScore } from "@/lib/types";

interface RadarChartProps {
  categories: CategoryScore[];
  size?: number;
}

const CENTER_LABELS: Record<string, string> = {
  discoverability: "Disc",
  crawlability: "Crawl",
  semantic_structure: "Semantics",
  structured_data: "Data",
  content_accessibility: "Content",
  navigation_linking: "Nav",
  technical_quality: "Tech",
  performance_accessibility: "Perf",
};

export function RadarChart({ categories, size = 340 }: RadarChartProps) {
  const n = categories.length;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 46;
  const angleStep = (Math.PI * 2) / n;

  const point = (i: number, value: number) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const r = (value / 100) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  const grid = [25, 50, 75, 100].map((level) => {
    const pts = categories.map((_, i) => point(i, level).join(",")).join(" ");
    return <polygon key={level} points={pts} fill="none" stroke="hsl(var(--border))" strokeWidth={1} />;
  });

  const dataPolygon = categories.map((c, i) => point(i, c.score).join(",")).join(" ");
  const dots = categories.map((c, i) => {
    const [x, y] = point(i, c.score);
    return <circle key={c.category} cx={x} cy={y} r={3} fill="hsl(var(--primary))" />;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {grid}
      <polygon points={dataPolygon} fill="hsl(var(--primary) / 0.15)" stroke="hsl(var(--primary))" strokeWidth={2} />
      {dots}
      {categories.map((c, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        const labelRadius = radius + 22;
        const x = cx + labelRadius * Math.cos(angle);
        const y = cy + labelRadius * Math.sin(angle);
        const anchor = Math.abs(Math.cos(angle)) < 0.3 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
        return (
          <text
            key={c.category}
            x={x}
            y={y}
            fontSize={11}
            fill="hsl(var(--muted-foreground))"
            textAnchor={anchor}
            dominantBaseline="middle"
          >
            {CENTER_LABELS[c.category] ?? c.label}
          </text>
        );
      })}
    </svg>
  );
}
