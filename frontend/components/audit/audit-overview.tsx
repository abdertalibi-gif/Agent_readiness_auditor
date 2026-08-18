"use client";

import Link from "next/link";
import { Download, Globe, RefreshCw } from "lucide-react";

import { AuditNav } from "@/components/audit/audit-nav";
import { RadarChart } from "@/components/radar-chart";
import { ScoreRing } from "@/components/score-ring";
import { CategoryBars } from "@/components/category-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ReviewPanel } from "@/components/reviews/review-panel";
import { useAuditStatus } from "@/hooks/use-audit";
import { useAuditSummary } from "@/hooks/use-summary";
import { downloadReport } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import type { AuditStatus } from "@/lib/types";

const STATUS_BADGE: Record<string, "default" | "success" | "destructive" | "secondary" | "warning"> = {
  COMPLETED: "success",
  PARTIAL: "warning",
  FAILED: "destructive",
  CANCELLED: "secondary",
  RUNNING: "secondary",
  QUEUED: "secondary",
};

export function AuditOverview({ auditId }: { auditId: string }) {
  const { t, formatDate, formatNumber, statusLabel } = useI18n();
  const { audit } = useAuditStatus(auditId, 5000);
  const { summary, loading, error, refresh } = useAuditSummary(auditId, true);

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="container max-w-2xl py-16">
        <Alert variant="destructive">
          <AlertTitle>{t("auditDetail.unableToLoad")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const status = audit?.status ?? summary?.status ?? ("QUEUED" as AuditStatus);
  const counts = summary?.counts ?? {};

  return (
    <div className="space-y-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("auditDetail.title")}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="h-4 w-4" />
            <span className="max-w-md truncate">{summary?.target_url ?? audit?.target_url}</span>
            <Badge variant={STATUS_BADGE[status] ?? "secondary"}>{statusLabel(status)}</Badge>
          </div>
          {summary?.completed_at && (
            <p className="mt-1 text-xs text-muted-foreground">{t("auditDetail.auditedOn", { date: formatDate(summary.completed_at) })}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4" /> {t("auditDetail.refresh")}
          </Button>
          <Button size="sm" onClick={() => downloadReport(auditId)} disabled={!summary}>
            <Download className="h-4 w-4" /> {t("auditDetail.pdfReport")}
          </Button>
        </div>
      </div>

      <AuditNav auditId={auditId} status={status} />

      {summary?.status === "FAILED" && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>{t("auditDetail.auditFailed")}</AlertTitle>
          <AlertDescription>{audit?.error_message ?? t("auditDetail.auditCouldNotComplete")}</AlertDescription>
        </Alert>
      )}

      {summary?.coverage?.truncated && (
        <Alert className="mb-6">
          <AlertTitle>{t("auditDetail.limitedCoverage")}</AlertTitle>
          <AlertDescription>
            {t("audit.coverage.limited", { pages: formatNumber(summary.coverage.pages ?? 0) })}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("auditDetail.agentReadiness")}</CardTitle>
              <CardDescription>{t("auditDetail.scoreSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <ScoreRing score={summary?.score ?? null} size={220} />
              {summary?.platform && (
                <div className="mt-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                  {t("audit.platform.label")}: {platformName(summary.platform, t)}
                </div>
              )}
              <div className="mt-4 grid w-full grid-cols-4 gap-2 text-center text-sm">
                <div>
                  <div className="font-bold text-success">{counts.PASS ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{t("auditDetail.passed")}</div>
                </div>
                <div>
                  <div className="font-bold text-amber-500">{counts.WARNING ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{t("auditDetail.warnings")}</div>
                </div>
                <div>
                  <div className="font-bold text-destructive">{counts.FAIL ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{t("auditDetail.failed")}</div>
                </div>
                <div>
                  <div className="font-bold text-muted-foreground">{counts.NOT_APPLICABLE ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{t("auditDetail.notApplicable")}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-3">
          {summary?.ai_summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("auditDetail.executiveSummary")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{summary.ai_summary}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("auditDetail.categoryScores")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryBars categories={summary?.categories ?? []} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("auditDetail.scoreProfile")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RadarChart categories={summary?.categories ?? []} />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <Button asChild variant="outline">
          <Link href={`/audits/${auditId}/issues`}>{t("auditDetail.reviewIssues")} →</Link>
        </Button>
      </div>

      <ReviewPanel auditId={auditId} status={status} />
    </div>
  );
}

function platformName(platform: string, t: (k: string) => string): string {
  const key = platform.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "unknown") return t("audit.platform.unknown");
  if (key === "wordpress") return "WordPress";
  if (key === "shopify") return "Shopify";
  if (key === "squarespace") return "Squarespace";
  if (key === "wix") return "Wix";
  return platform;
}
