"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, PlusCircle } from "lucide-react";
import { notFound } from "next/navigation";

import { api } from "@/lib/api";
import type { AuditOut } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";
import { LineChart } from "@/components/app/charts";
import { Badge } from "@/components/ui/badge";
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

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary" | "default"> = {
  COMPLETED: "success",
  PARTIAL: "warning",
  FAILED: "destructive",
  CANCELLED: "secondary",
  RUNNING: "default",
  QUEUED: "default",
};

export default function WebsiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <ResolvedHostname params={params} />;
}

function ResolvedHostname({ params }: { params: Promise<{ id: string }> }) {
  const { t, confidenceLabel, formatDate, ratingLabel, statusLabel, formatNumber } = useI18n();
  const [audits, setAudits] = useState<AuditOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [hostname, setHostname] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => setHostname(decodeURIComponent(id)));
  }, [params]);

  useEffect(() => {
    if (!hostname) return;
    (async () => {
      let all: AuditOut[] = [];
      try {
        all = await api.listAudits();
      } catch {
        all = [];
      }
      setAudits(
        all.filter((a) => {
          try {
            return new URL(a.target_url).hostname === hostname;
          } catch {
            return a.target_url === hostname;
          }
        })
      );
      setLoading(false);
    })();
  }, [hostname]);

  const sorted = useMemo(() => [...audits].sort((a, b) => b.created_at.localeCompare(a.created_at)), [audits]);
  const trend = useMemo(() => {
    const scored = sorted.filter((a) => a.score != null).reverse();
    return scored.map((a) => ({
      label: formatDate(a.created_at),
      value: a.score ?? 0,
    }));
  }, [sorted, formatDate]);
  const latest = sorted[0];

  if (loading) return <Skeleton className="h-96" />;
  if (!hostname || !latest) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link href="/websites">
          <ArrowLeft className="h-4 w-4" /> {t("websites.backToWebsites")}
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{hostname}</h1>
          <p className="text-sm text-muted-foreground">
            {t("websiteDetail.auditCountLast", { count: formatNumber(audits.length), date: formatDate(latest.created_at) })}
          </p>
        </div>
        <Button asChild>
          <Link href="/audit/new">
            <PlusCircle className="h-4 w-4" /> {t("websites.runNewAudit")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">{t("websites.currentScore")}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">
              {latest.score != null ? latest.score.toFixed(0) : "—"}
            </div>
            <div className="mt-1 text-sm">{latest.score != null ? ratingLabel(latest.score) : latest.status}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">{t("websites.audits")}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{formatNumber(audits.length)}</div>
            <div className="mt-1 text-sm text-muted-foreground">{t("websiteDetail.totalRun")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">{t("websiteDetail.confidence")}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{confidenceLabel(latest.progress_json?.pages_crawled ?? 0)}</div>
            <div className="mt-1 text-sm text-muted-foreground">{t("websiteDetail.basedOnCoverage")}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("websites.scoreHistory")}</CardTitle>
          <CardDescription>{t("websiteDetail.scoreHistoryDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {trend.length > 1 ? (
            <LineChart points={trend} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("websiteDetail.noScoreHistory")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("websites.auditHistory")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("audits.score")}</TableHead>
                <TableHead>{t("audits.grade")}</TableHead>
                <TableHead>{t("audits.status")}</TableHead>
                <TableHead>{t("audits.coverage")}</TableHead>
                <TableHead>{t("audits.date")}</TableHead>
                <TableHead className="text-right">{t("websites.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((audit) => (
                <TableRow key={audit.id}>
                  <TableCell className="font-semibold tabular-nums">
                    {audit.score != null ? audit.score.toFixed(0) : "—"}
                  </TableCell>
                  <TableCell>{audit.score != null ? ratingLabel(audit.score) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[audit.status] ?? "default"}>{statusLabel(audit.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {audit.progress_json?.pages_crawled != null
                      ? t("audit.coverage.pagesCount", { count: formatNumber(audit.progress_json.pages_crawled) })
                      : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(audit.created_at)}</TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/audits/${audit.id}`}>
                        {t("common.view")} <History className="h-3 w-3" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
