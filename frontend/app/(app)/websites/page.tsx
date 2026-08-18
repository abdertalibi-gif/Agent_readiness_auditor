"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, PlusCircle, Trash2, ArrowRight, Search } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { groupAuditsByWebsite, type WebsiteRow } from "@/lib/history";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function WebsitesPage() {
  const { t, ratingLabel, formatDate, formatNumber, statusLabel } = useI18n();
  const [rows, setRows] = useState<WebsiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  async function refresh() {
    try {
      const audits = await api.listAudits();
      setRows(groupAuditsByWebsite(audits));
    } catch {
      setRows([]);
    }
  }

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  async function removeWebsite() {
    toast.success(t("websites.cannotDelete"));
    await refresh();
  }

  const filtered = rows.filter((r) => r.hostname.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("websites.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("websites.subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/audit/new">
            <PlusCircle className="h-4 w-4" /> {t("websites.newAudit")}
          </Link>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("websites.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <Skeleton className="h-80" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Globe className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{rows.length === 0 ? t("websites.noWebsites") : t("websites.noMatches")}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {rows.length === 0
                ? t("websites.noWebsitesHint")
                : t("websites.noMatchesHint")}
            </p>
            {rows.length === 0 && (
              <Button asChild size="sm" className="mt-4">
                <Link href="/audit/new">{t("websites.startAudit")}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("websites.allWebsites")}</CardTitle>
            <CardDescription>{t("websites.countSummary", { count: formatNumber(filtered.length) })}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("audits.website")}</TableHead>
                  <TableHead className="text-right">{t("websites.audits")}</TableHead>
                  <TableHead className="text-right">{t("websites.latestScore")}</TableHead>
                  <TableHead>{t("audits.grade")}</TableHead>
                  <TableHead>{t("websites.lastAudited")}</TableHead>
                  <TableHead className="text-right">{t("websites.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.hostname}>
                    <TableCell>
                      <Link href={`/websites/${encodeURIComponent(row.hostname)}`} className="flex items-center gap-2 font-medium hover:underline">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="max-w-[240px] truncate">{row.hostname}</span>
                      </Link>
                      <div className="max-w-[260px] truncate font-mono text-xs text-muted-foreground">{row.baseUrl}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.count)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {row.latestScore != null ? row.latestScore.toFixed(0) : "—"}
                    </TableCell>
                    <TableCell>{row.latestScore != null ? ratingLabel(row.latestScore) : (row.latestStatus ? statusLabel(row.latestStatus) : "—")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(row.lastAuditAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/websites/${encodeURIComponent(row.hostname)}`}>
                            {t("common.view")} <ArrowRight className="h-3 w-3" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeWebsite()}
                          aria-label={t("websites.removeAria", { name: row.hostname })}
                        >
                          <Trash2 className="h-4 w-4" />
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
