"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Printer } from "lucide-react";

import { useAuditStatus } from "@/hooks/use-audit";
import { useAuditSummary } from "@/hooks/use-summary";
import { api, downloadReport } from "@/lib/api";
import type { AuditSummary, Check, Recommendation, PageOut } from "@/lib/types";
import { AuditNav } from "@/components/audit/audit-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { gradeFromScore } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
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

function CheckStatusBadge({ status }: { status: string }) {
  const variant =
    status === "PASS" ? "success" : status === "WARNING" ? "warning" : status === "FAIL" ? "destructive" : "outline";
  const { statusLabel } = useI18n();
  return (
    <Badge variant={variant as "success" | "warning" | "destructive" | "outline"}>{statusLabel(status)}</Badge>
  );
}

export function AuditReport({ auditId }: { auditId: string }) {
  const { t, locale } = useI18n();
  const { audit } = useAuditStatus(auditId, 6000);
  const { summary, loading } = useAuditSummary(auditId, true);
  const [checks, setChecks] = useState<Check[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [pages, setPages] = useState<PageOut[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [issues, recsData, pagesData] = await Promise.all([
          api.getIssues(auditId),
          api.getRecommendations(auditId),
          api.getPages(auditId),
        ]);
        setChecks(issues.items);
        setRecs(recsData);
        setPages(pagesData);
      } catch {
        /* report body degrades gracefully */
      }
    }
    load();
  }, [auditId]);

  const status = audit?.status;
  const isReady = summary?.completed_at != null && (status === "COMPLETED" || status === "PARTIAL" || status === "FAILED");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("auditDetail.report")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("auditDetail.reportSubtitle")}
          </p>
        </div>
      </div>
      <AuditNav auditId={auditId} status={status} />

      {loading && <Skeleton className="h-72" />}

      {!loading && !isReady && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("auditDetail.reportAfterCompletion")}
          </CardContent>
        </Card>
      )}

      {!loading && isReady && summary && (
        <>
          <div className="no-print flex flex-wrap gap-3">
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> {t("auditDetail.printSavePdf")}
            </Button>
            <Button variant="outline" onClick={async () => { try { await downloadReport(auditId, locale); } catch { toast.error(t("reports.downloadError")); } }}>
              <Download className="h-4 w-4" /> {t("auditDetail.downloadPdf")}
            </Button>
          </div>

          <div className="print-report rounded-xl border bg-white text-slate-900 shadow-sm print:rounded-none print:border-0 print:shadow-none">
            <ReportBody auditId={auditId} summary={summary} checks={checks} recs={recs} pages={pages} />
          </div>
        </>
      )}
    </div>
  );
}

function ReportBody({
  auditId,
  summary,
  checks,
  recs,
  pages,
}: {
  auditId: string;
  summary: AuditSummary;
  checks: Check[];
  recs: Recommendation[];
  pages: PageOut[];
}) {
  const { t, formatDate, formatNumber, confidenceLabel, categoryLabel, severityLabel, priorityLabel, checkText } = useI18n();
  const score = summary.score;
  const pagesCrawled = summary.coverage?.pages ?? 0;
  const sortedChecks = [...checks].sort((a, b) => a.score - b.score);
  const failed = checks.filter((c) => c.status === "FAIL");
  const critical = failed.filter((c) => c.severity === "CRITICAL");
  const high = failed.filter((c) => c.severity === "HIGH");

  return (
    <div className="space-y-8 p-6 md:p-10 print:space-y-6 print:p-0">
      {/* Cover header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6 print:pb-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t("auditDetail.agentReadiness")}</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">{t("auditDetail.report")}</h2>
          <p className="mt-1 font-mono text-xs text-slate-500">{summary.target_url}</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>{t("auditDetail.reportId")}: {auditId}</div>
          <div>{t("auditDetail.generated")}: {formatDate(new Date().toISOString())}</div>
          <div>{t("auditDetail.auditDate")}: {formatDate(summary.completed_at)}</div>
        </div>
      </div>

      {/* Executive summary */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-slate-400">{t("auditDetail.executiveSummary")}</h3>
        <p className="text-sm leading-relaxed text-slate-700">
          {summary.ai_summary ||
            t("auditDetail.executiveSummaryFallback", { url: summary.target_url, count: formatNumber(pagesCrawled) })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge className="bg-primary text-primary-foreground">{t("audit.table.score")}: {score != null ? score.toFixed(0) : "—"}/100</Badge>
          <Badge variant="outline">{t("audit.table.grade")}: {gradeFromScore(score)}</Badge>
          <Badge variant="outline">{t("audit.table.coverage")}: {t("audit.coverage.pagesCount", { count: formatNumber(pagesCrawled) })}</Badge>
          <Badge variant="outline">{t("audit.table.confidence")}: {confidenceLabel(pagesCrawled)}</Badge>
          {summary.platform && <Badge variant="outline">{t("audit.platform.label")}: {platformName(summary.platform, t)}</Badge>}
        </div>
      </section>

      {/* Category scores */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">{t("auditDetail.categoryScores")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {summary.categories.map((cat) => (
            <div key={cat.category} className="rounded-lg border p-3">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{categoryLabel(cat.category)}</span>
                <span className="font-semibold tabular-nums">{cat.score.toFixed(0)}</span>
              </div>
              <ScoreBar score={cat.score} />
              <p className="mt-1.5 text-xs text-slate-500">
                {t("audit.coverage.checksPassed", { passed: formatNumber(cat.checks_passed), total: formatNumber(cat.checks_total) })} · {t("audit.coverage.warningsCount", { count: formatNumber(cat.checks_warning) })}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Top issues */}
      {(critical.length > 0 || high.length > 0) && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
            {t("auditDetail.priorityFindings")} ({critical.length} {t("issues.nCritical")}, {high.length} {t("issues.nHigh")})
          </h3>
          <div className="space-y-2">
            {[...critical, ...high].map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                <div>
                  <div className="font-medium">{checkText(c.name)}</div>
                  <div className="text-xs text-slate-500">{typeof c.evidence === "string" ? c.evidence : (checkText(c.description ?? "") ?? "")}</div>
                </div>
                <Badge variant={c.severity === "CRITICAL" ? "destructive" : "warning"}>{severityLabel(c.severity)}</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Checks table */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">{t("auditDetail.technicalChecks")}</h3>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("audit.table.check")}</TableHead>
                <TableHead>{t("audit.table.category")}</TableHead>
                <TableHead>{t("audit.table.status")}</TableHead>
                <TableHead className="text-right">{t("audit.table.score")}</TableHead>
                <TableHead>{t("audit.table.severity")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedChecks.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-[240px]">
                    <div className="font-medium">{checkText(c.name)}</div>
                    {typeof c.evidence === "string" && <div className="text-xs text-slate-500">{c.evidence}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{categoryLabel(c.category)}</TableCell>
                  <TableCell>
                    <CheckStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{c.score.toFixed(0)}</TableCell>
                  <TableCell className="text-xs">{severityLabel(c.severity)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Recommendations + roadmap */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">{t("auditDetail.recommendationsRoadmap")}</h3>
        {recs.length === 0 ? (
          <p className="text-sm text-slate-500">{t("audit.table.noRecommendations")}</p>
        ) : (
          <div className="space-y-2">
            {recs.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {priorityLabel(r.priority)} — {checkText(r.title)}
                  </span>
                  <Badge variant={r.priority === "HIGH" ? "destructive" : r.priority === "MEDIUM" ? "warning" : "secondary"}>
                    {priorityLabel(r.priority)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-600">{checkText(r.description ?? "")}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Appendix */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
          {t("auditDetail.appendix")} — {t("auditDetail.analyzedPages")} ({pages.length})
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("audit.table.url")}</TableHead>
                <TableHead className="text-right">{t("audit.table.status")}</TableHead>
                <TableHead className="text-right">{t("audit.table.time")}</TableHead>
                <TableHead className="text-right">{t("audit.table.words")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-[300px] truncate font-mono text-xs">{p.url}</TableCell>
                  <TableCell className="text-right">{p.status_code ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.response_time_ms ?? 0)}ms</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.word_count ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Footer */}
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 print:pb-4">
        <span>{t("audit.table.generatedBy")}</span>
        <span>
          {t("audit.table.pageOf")} — <Link href={`/audits/${auditId}/report`}>{t("auditDetail.viewOnline")}</Link>
        </span>
      </div>
    </div>
  );
}
