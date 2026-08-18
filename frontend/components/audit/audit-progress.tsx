"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { useAuditStatus } from "@/hooks/use-audit";
import { api } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const STEP_KEYS: Record<string, string> = {
  validating_url: "progress.validatingUrl",
  fetching_robots: "progress.fetchingRobotsTxt",
  analyzing_sitemap: "progress.analyzingSitemap",
  crawling_pages: "progress.crawlingPages",
  analyzing_structure: "progress.analyzingStructure",
  checking_metadata: "progress.checkingMetadata",
  checking_structured_data: "progress.checkingStructuredData",
  calculating_score: "progress.calculatingScore",
  generating_recommendations: "progress.generatingRecommendations",
};

export function AuditProgress({ auditId }: { auditId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { audit, error } = useAuditStatus(auditId, 1200);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (audit && ["COMPLETED", "PARTIAL"].includes(audit.status)) {
      const t = window.setTimeout(() => {
        router.replace(`/audits/${auditId}`);
      }, 900);
      return () => window.clearTimeout(t);
    }
  }, [audit, auditId, router]);

  async function cancel() {
    setCancelling(true);
    try {
      await api.cancel(auditId);
      window.location.reload();
    } finally {
      setCancelling(false);
    }
  }

  async function retry() {
    if (!audit?.target_url || retrying) return;
    setRetrying(true);
    try {
      const fresh = await api.createAudit(audit.target_url);
      router.push(`/audits/${fresh.id}/progress`);
      router.refresh();
    } finally {
      setRetrying(false);
    }
  }

  const steps = audit?.progress_json?.steps ?? [];
  const doneSteps = steps.filter((s) => s.done).length;
  const pagesTotal = audit?.progress_json?.pages_total ?? 50;
  const pagesCrawled = audit?.progress_json?.pages_crawled ?? 0;
  const percent =
    audit?.progress_json?.percent ??
    (steps.length ? Math.round((doneSteps / steps.length) * 100) : 0);
  const stageMessage = audit?.progress_json?.message;

  const isTerminal = audit && ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(audit.status);
  const isFailed = audit?.status === "FAILED";
  const failedStepLabel =
    audit?.failed_step && (STEP_KEYS[audit.failed_step] ? t(STEP_KEYS[audit.failed_step]) : audit.failed_step);

  return (
    <div className="container max-w-2xl py-16">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isFailed ? (
              <AlertCircle className="h-5 w-5 text-destructive" />
            ) : isTerminal ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {t("auditDetail.auditInProgress")}
          </CardTitle>        </CardHeader>
        <CardContent>
          <p className="mb-4 truncate text-sm text-muted-foreground">{audit?.target_url ?? auditId}</p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>{t("auditDetail.connectionIssue")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!isTerminal && (
            <>
              <Progress value={percent} className="mb-2" />
              <p className="mb-1 text-xs text-muted-foreground">
                {t("auditDetail.crawling", { crawled: Math.min(pagesCrawled, pagesTotal), total: pagesTotal })}
              </p>
              {stageMessage && (
                <p className="mb-5 truncate text-xs text-muted-foreground/80">{stageMessage}</p>
              )}
            </>
          )}

          {isFailed && (audit?.error_message || failedStepLabel) && (
            <Alert variant="destructive" className="mb-6">
              <AlertTitle>
                {t("auditDetail.auditFailedAt")}{failedStepLabel ? ` “${failedStepLabel}”` : ""}
              </AlertTitle>
              <AlertDescription>
                {audit?.error_message ?? t("auditProgress.couldNotComplete")}
              </AlertDescription>
            </Alert>
          )}

          <ul className="space-y-2">
            {steps.map((step) => (
              <li
                key={step.label}
                className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm"
              >
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/30" />
                )}
                <span className={step.done ? "" : "text-muted-foreground"}>
                  {step.label}
                  {step.label === "Crawling pages" && pagesCrawled > 0
                    ? ` (${Math.min(pagesCrawled, pagesTotal)}/${pagesTotal})`
                    : ""}
                </span>
                {isFailed && step.label === "Crawling pages" && step.done ? (
                  <AlertCircle className="ml-auto h-3.5 w-3.5 text-destructive" />
                ) : !step.done && !isTerminal ? (
                  <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  !step.done && <span className="ml-auto h-3.5 w-3.5 rounded-full border border-muted" />
                )}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={cancel} disabled={cancelling || !!isTerminal}>
              {cancelling ? t("auditProgress.cancelling") : t("auditDetail.cancelAudit")}
            </Button>
            <div className="flex gap-2">
              {isTerminal && !isFailed && (
                <Button asChild size="sm">
                  <Link href={`/audits/${auditId}`}>{t("auditDetail.viewResults")} →</Link>
                </Button>
              )}
              {isFailed && (
                <>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/audit/new">{t("auditDetail.newAudit")}</Link>
                  </Button>
                  <Button
                    size="sm"
                    onClick={retry}
                    disabled={retrying || !audit?.target_url}
                    type="button"
                  >
                    {retrying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("auditProgress.retrying")}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t("auditDetail.tryAgain")}
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
