"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { useAuditStatus } from "@/hooks/use-audit";
import { useAuditSummary } from "@/hooks/use-summary";
import { api } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import type { Check } from "@/lib/types";
import { AuditNav } from "@/components/audit/audit-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusVariant(status: string): "success" | "warning" | "destructive" | "outline" {
  switch (status) {
    case "PASS":
      return "success";
    case "WARNING":
      return "warning";
    case "FAIL":
      return "destructive";
    default:
      return "outline";
  }
}

export function AuditChecks({ auditId }: { auditId: string }) {
  const { t, categoryLabel, statusLabel, severityLabel, confidenceLabel, formatNumber } = useI18n();
  const { audit } = useAuditStatus(auditId, 6000);
  const { summary } = useAuditSummary(auditId, true);
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await api.getIssues(auditId);
        setChecks(data.items);
      } catch {
        setChecks([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [auditId]);

  const status = audit?.status;
  const isTerminal = status ? ["COMPLETED", "PARTIAL", "FAILED"].includes(status) : false;
  const pagesCrawled = summary?.coverage?.pages ?? 0;
  const noPages = isTerminal && pagesCrawled === 0;

  const rows = [...checks].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("auditDetail.technicalChecksTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("auditDetail.checksDeterministic")}
          </p>
        </div>
      </div>
      <AuditNav auditId={auditId} status={status} />

      {!isTerminal && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {t("auditDetail.checksAfterCrawl")}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/audits/${auditId}/progress`}>{t("auditDetail.viewLiveProgress")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {isTerminal && loading && <Skeleton className="h-72" />}

      {isTerminal && !loading && (
        <>
          {noPages && (
            <Card>
              <CardContent className="flex items-start gap-3 py-6 text-sm">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-semibold">{t("auditDetail.auditCoverage", { pages: formatNumber(pagesCrawled) })}</p>
                  <p className="mt-1 text-muted-foreground">
                    {t("auditDetail.confidenceNotVerified", { confidence: confidenceLabel(pagesCrawled), notVerified: statusLabel("NOT_VERIFIED") })}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                          {t("auditDetail.noChecksRecorded")}
                        </TableCell>
                      </TableRow>
                    )}
                    {rows.map((check) => {
                      const notScored = check.status === "NOT_APPLICABLE" || noPages;
                      const displayStatus = noPages ? statusLabel("NOT_VERIFIED") : check.status === "NOT_APPLICABLE" ? t("auditDetail.notApplicable") : statusLabel(check.status);
                      return (
                        <TableRow key={check.id}>
                          <TableCell className="max-w-[300px]">
                            <div className="font-medium">{check.name}</div>
                            {check.description && (
                              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {check.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{categoryLabel(check.category)}</TableCell>
                          <TableCell>
                            <Badge variant={notScored ? "outline" : statusVariant(check.status)}>
                              {displayStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {notScored ? "—" : check.score.toFixed(0)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                check.severity === "CRITICAL"
                                  ? "destructive"
                                  : check.severity === "HIGH"
                                    ? "warning"
                                    : check.severity === "MEDIUM"
                                      ? "secondary"
                                      : "outline"
                              }
                            >
                              {severityLabel(check.severity)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
