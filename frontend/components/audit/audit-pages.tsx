"use client";

import { useEffect, useState } from "react";
import { useAuditStatus } from "@/hooks/use-audit";
import { api } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import type { PageOut } from "@/lib/types";
import { AuditNav } from "@/components/audit/audit-nav";
import { Badge } from "@/components/ui/badge";
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

export function AuditPages({ auditId }: { auditId: string }) {
  const { t, formatNumber } = useI18n();
  const { audit } = useAuditStatus(auditId, 6000);
  const [pages, setPages] = useState<PageOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected] = useState<PageOut | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        setPages(await api.getPages(auditId));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [auditId]);

  const filtered = pages.filter((p) => {
    const matchesQuery =
      p.url.toLowerCase().includes(query.toLowerCase()) || (p.title ?? "").toLowerCase().includes(query.toLowerCase());
    if (!matchesQuery) return false;
    switch (statusFilter) {
      case "SUCCESS":
        return p.status_code !== null && p.status_code < 400;
      case "FAILED":
        return p.status_code !== null && p.status_code >= 400;
      case "BLOCKED":
        return p.status_code === null || p.status_code === 403;
      case "REDIRECTED":
        return !!p.final_url && p.final_url !== p.url;
      default:
        return true;
    }
  });

  const status = audit?.status;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("auditDetail.analyzedPagesTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("auditPages.subtitle")}</p>
        </div>
      </div>
      <AuditNav auditId={auditId} status={status} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Input
            placeholder={t("auditDetail.searchPages")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("audits.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("common.all")}</SelectItem>
            <SelectItem value="SUCCESS">{t("auditDetail.successful")}</SelectItem>
            <SelectItem value="FAILED">{t("auditDetail.failed")}</SelectItem>
            <SelectItem value="BLOCKED">{t("auditDetail.blocked")}</SelectItem>
            <SelectItem value="REDIRECTED">{t("auditDetail.redirected")}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{t("auditPages.pageCount", { count: formatNumber(filtered.length) })}</span>
      </div>

      {loading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("audit.table.url")}</TableHead>
                    <TableHead>{t("audit.table.status")}</TableHead>
                    <TableHead>{t("audit.table.time")}</TableHead>
                    <TableHead>{t("audit.table.words")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((page) => (
                    <TableRow key={page.id} className="cursor-pointer" onClick={() => setSelected(page)}>
                      <TableCell className="max-w-xs truncate font-mono text-xs">{page.url}</TableCell>
                      <TableCell>
                        <Badge
                          variant={page.status_code !== null && page.status_code < 400 ? "success" : "destructive"}
                        >
                          {page.status_code ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">{page.response_time_ms != null ? t("auditPages.ms", { ms: formatNumber(page.response_time_ms) }) : "—"}</TableCell>
                      <TableCell className="tabular-nums text-xs">{page.word_count != null ? formatNumber(page.word_count) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              {selected ? (
                <div className="space-y-3 text-sm">
                  <h3 className="font-semibold">{t("auditDetail.pageDetails")}</h3>
                  <p className="break-all font-mono text-xs text-muted-foreground">{selected.url}</p>
                  {selected.title && (
                    <p>
                      <span className="text-muted-foreground">{t("auditDetail.title")}: </span>
                      {selected.title}
                    </p>
                  )}
                  {selected.meta_description && (
                    <p className="text-muted-foreground">{selected.meta_description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">{t("auditDetail.h1")}: </span>
                      {formatNumber(selected.headings?.h1?.length ?? 0)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("auditDetail.links")}: </span>
                      {formatNumber(selected.links_count)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("auditDetail.images")}: </span>
                      {formatNumber(selected.images?.length ?? 0)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("auditDetail.scripts")}: </span>
                      {formatNumber(selected.js_dependency_count)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("auditDetail.forms")}: </span>
                      {selected.has_forms ? t("auditPages.yes") : t("auditPages.no")}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("auditDetail.lang")}: </span>
                      {selected.lang ?? "—"}
                    </div>
                  </div>
                  {selected.broken_links && selected.broken_links.length > 0 && (
                    <div className="rounded-md border border-destructive/50 p-2 text-xs">
                      <div className="font-semibold text-destructive">
                        {selected.broken_links.length} {t("auditDetail.brokenLinks")}
                      </div>
                      <ul className="mt-1 space-y-1">
                        {selected.broken_links.slice(0, 5).map((b, i) => (
                          <li key={i} className="break-all font-mono text-muted-foreground">
                            {b.href}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selected.structured_data && selected.structured_data.length > 0 && (
                    <div className="rounded-md border p-2 text-xs">
                      <div className="font-semibold">{t("auditDetail.structuredData")}</div>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(selected.structured_data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("auditDetail.selectPage")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
