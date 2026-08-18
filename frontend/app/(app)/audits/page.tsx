"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, PlusCircle, Search } from "lucide-react";

import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/api";
import type { AuditOut } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const PAGE_SIZE = 10;


export default function AuditsPage() {
  const { t, formatDate, ratingLabel, confidenceLabel, formatNumber, statusLabel } = useI18n();
  const [audits, setAudits] = useState<AuditOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function load() {
      try {
        setAudits(await api.listAudits());
      } catch {
        // keep empty list
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(
    () =>
      audits.filter((a) => {
        const q = query.toLowerCase();
        const matchesQ = a.target_url.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
        const matchesStatus = status === "ALL" || a.status === status;
        return matchesQ && matchesStatus;
      }),
    [audits, query, status]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("audits.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("audits.subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/audit/new">
            <PlusCircle className="h-4 w-4" /> {t("audits.newAudit")}
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("audits.searchPlaceholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetPage();
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            resetPage();
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("audits.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("audits.allStatuses")}</SelectItem>
            <SelectItem value="QUEUED">{t("audits.queued")}</SelectItem>
            <SelectItem value="RUNNING">{t("audits.running")}</SelectItem>
            <SelectItem value="COMPLETED">{t("audits.completed")}</SelectItem>
            <SelectItem value="PARTIAL">{t("audits.partial")}</SelectItem>
            <SelectItem value="FAILED">{t("audits.failed")}</SelectItem>
            <SelectItem value="CANCELLED">{t("audits.cancelled")}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{formatNumber(filtered.length)} {t("audits.results")}</span>
      </div>

      {loading ? (
        <Skeleton className="h-72" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="text-4xl">🔎</div>
            <div>
              <p className="font-medium">{t("audits.noAudits")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {audits.length === 0
                  ? t("auditsPage.noAuditsHint")
                  : t("auditsPage.adjustFilters")}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/audit/new">{t("audits.newAudit")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("audits.website")}</TableHead>
                    <TableHead>{t("audits.score")}</TableHead>
                    <TableHead>{t("audits.grade")}</TableHead>
                    <TableHead>{t("audits.status")}</TableHead>
                    <TableHead>{t("audits.coverage")}</TableHead>
                    <TableHead>{t("audits.confidence")}</TableHead>
                    <TableHead>{t("audits.date")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((audit) => (
                    <TableRow key={audit.id}>
                      <TableCell className="max-w-[200px] truncate">
                        <div className="truncate font-mono text-xs">{audit.target_url}</div>
                        <div className="truncate text-xs text-muted-foreground">{audit.id.slice(0, 12)}</div>
                      </TableCell>
                      <TableCell className="font-semibold tabular-nums">
                        {audit.score != null ? audit.score.toFixed(0) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {audit.score != null ? ratingLabel(audit.score) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[audit.status] ?? "default"}>{statusLabel(audit.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {audit.progress_json?.pages_crawled != null ? formatNumber(audit.progress_json.pages_crawled) : "—"} / {audit.progress_json?.pages_total != null ? formatNumber(audit.progress_json.pages_total) : "—"}
                      </TableCell>
                      <TableCell>{confidenceLabel(audit.progress_json?.pages_crawled)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(audit.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/audits/${audit.id}`}>
                            {t("common.view")} <ArrowRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  {t("audits.page")} {formatNumber(safePage)} {t("audits.of")} {formatNumber(totalPages)}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                    {t("common.previous")}
                  </Button>
                  <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                    {t("common.next")}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
