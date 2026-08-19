"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText, Eye } from "lucide-react";
import { toast } from "sonner";

import { api, downloadReport } from "@/lib/api";
import type { AuditOut } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ReportsPage() {
  const { t, ratingLabel, confidenceLabel, formatDate, formatNumber, locale } = useI18n();
  const [audits, setAudits] = useState<AuditOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const all = await api.listAudits();
        setAudits(all.filter((a) => a.status === "COMPLETED" || a.status === "PARTIAL"));
      } catch {
        // keep empty list
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("reports.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("reports.subtitle")}</p>
      </div>

      {loading ? (
        <Skeleton className="h-80" />
      ) : audits.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{t("reports.noReports")}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {t("reports.emptyHint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.savedReports")}</CardTitle>
            <CardDescription>{t("reports.countSummary", { count: formatNumber(audits.length) })}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("audits.website")}</TableHead>
                  <TableHead className="text-right">{t("audits.score")}</TableHead>
                  <TableHead>{t("audits.grade")}</TableHead>
                  <TableHead>{t("audits.coverage")}</TableHead>
                  <TableHead>{t("audits.confidence")}</TableHead>
                  <TableHead>{t("audits.date")}</TableHead>
                  <TableHead className="text-right">{t("websites.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.map((audit) => (
                  <TableRow key={audit.id}>
                    <TableCell className="max-w-[240px] truncate">
                      <span className="font-medium">{websiteLabel(audit.target_url)}</span>
                      <div className="truncate font-mono text-xs text-muted-foreground">{audit.target_url}</div>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {audit.score != null ? audit.score.toFixed(0) : "—"}
                    </TableCell>
                    <TableCell>{audit.score != null ? ratingLabel(audit.score) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {audit.progress_json?.pages_crawled != null
                        ? t("audit.coverage.pagesCount", { count: formatNumber(audit.progress_json.pages_crawled) })
                        : "—"}
                    </TableCell>
                    <TableCell>{confidenceLabel(audit.progress_json?.pages_crawled)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(audit.completed_at ?? audit.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/audits/${audit.id}/report`}>
                            <Eye className="h-3 w-3" /> {t("common.view")}
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            downloadReport(audit.id, locale).catch(() => {
                              toast.error(t("reports.downloadError"));
                            });
                          }}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
