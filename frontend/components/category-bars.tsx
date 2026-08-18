import type { CategoryScore } from "@/lib/types";
import { cn } from "@/lib/utils";

function barColor(score: number): string {
  if (score >= 75) return "bg-success";
  if (score >= 55) return "bg-amber-500";
  return "bg-destructive";
}

export function CategoryBars({ categories }: { categories: CategoryScore[] }) {
  return (
    <div className="space-y-3">
      {categories.map((cat) => (
        <div key={cat.category}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">{cat.label}</span>
            <span className="text-muted-foreground tabular-nums">{cat.score.toFixed(0)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full transition-all", barColor(cat.score))}
              style={{ width: `${cat.score}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
