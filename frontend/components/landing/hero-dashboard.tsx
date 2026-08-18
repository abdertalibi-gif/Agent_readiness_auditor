"use client";

import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/score-ring";
import { useI18n } from "@/components/i18n-provider";

function barColor(score: number) {
  if (score >= 75) return "bg-success";
  if (score >= 55) return "bg-amber-500";
  return "bg-destructive";
}

export function HeroDashboard() {
  const { t, categoryLabel, ratingLabel, confidenceLabel } = useI18n();

  const CATEGORIES = [
    { key: "discoverability", score: 88 },
    { key: "semantic_structure", score: 79 },
    { key: "structured_data", score: 91 },
    { key: "content_accessibility", score: 72 },
  ];

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-primary/20 via-transparent to-transparent blur-2xl" />
      <div className="relative rounded-2xl border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("marketing.heroDashboard.agentReadiness")}
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">acme.com</div>
          </div>
          <Badge variant="success">{ratingLabel(82)}</Badge>
        </div>

        <div className="mt-4 flex flex-col items-center">
          <ScoreRing score={82} size={150} strokeWidth={11} />
        </div>

        <div className="mt-6 space-y-3">
          {CATEGORIES.map((cat) => (
            <div key={cat.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{categoryLabel(cat.key)}</span>
                <span className="font-semibold tabular-nums">{cat.score}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full ${barColor(cat.score)}`}
                  style={{ width: `${cat.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 border-t pt-4">
          <div className="rounded-md bg-muted/50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("dashboard.coverage")}</div>
            <div className="text-sm font-bold">93%</div>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("dashboard.confidence")}</div>
            <div className="text-sm font-bold text-success">{confidenceLabel(50)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
