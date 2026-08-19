"use client";

import { useEffect, useState } from "react";
import { useAuditStatus } from "@/hooks/use-audit";
import { api } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import type { Recommendation } from "@/lib/types";
import { AuditNav } from "@/components/audit/audit-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PRIORITY_COLORS: Record<string, "destructive" | "warning" | "secondary" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "warning",
  MEDIUM: "secondary",
  LOW: "outline",
};

export function AuditRecommendations({ auditId }: { auditId: string }) {
  const { t, priorityLabel, checkText } = useI18n();
  const { audit } = useAuditStatus(auditId, 6000);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        setRecs(await api.getRecommendations(auditId));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [auditId]);

  const status = audit?.status;

  return (
    <div className="space-y-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{t("auditDetail.recommendations")}</h1>
      <AuditNav auditId={auditId} status={status} />

      {loading ? (
        <Skeleton className="h-64" />
      ) : recs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("auditRecs.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {recs.map((rec, i) => (
            <Card key={rec.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {checkText(rec.title)}
                  </CardTitle>
                  <div className="flex shrink-0 gap-2">
                    <Badge variant={PRIORITY_COLORS[rec.priority] ?? "secondary"}>{priorityLabel(rec.priority)}</Badge>
                    {rec.effort && <Badge variant="outline">{rec.effort} {t("auditDetail.effort")}</Badge>}
                    {rec.impact && <Badge variant="outline">{rec.impact} {t("auditDetail.impact")}</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {rec.description && <p className="text-muted-foreground">{checkText(rec.description)}</p>}
                {rec.how_to_fix && (
                  <div className="rounded-md bg-muted/60 p-3">
                    <span className="font-semibold">{t("auditDetail.howToFix")} </span>
                    <span className="text-muted-foreground">{checkText(rec.how_to_fix)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
