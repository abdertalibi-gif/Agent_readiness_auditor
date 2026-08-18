"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/components/i18n-provider";
import { Stars } from "@/components/reviews/rating-widget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { AdminFeedback, FeedbackStats } from "@/lib/types";

const PAGE_SIZE = 20;

type SortKey = "newest" | "highest" | "lowest";

const RATING_FILTERS = [
  { value: "ALL", label: "all" },
  { value: "5", label: "5" },
  { value: "4", label: "4" },
  { value: "3", label: "3" },
  { value: "2", label: "2" },
  { value: "1", label: "1" },
];

export default function AdminFeedbackPage() {
  const { t, formatDate } = useI18n();
  const [items, setItems] = useState<AdminFeedback[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState<FeedbackStats | null>(null);

  const fetchPage = useCallback(async () => {
    return api.adminFeedback({
      rating: ratingFilter === "ALL" ? undefined : Number(ratingFilter),
      search: search || undefined,
      sort,
      limit: PAGE_SIZE,
      offset,
    });
  }, [ratingFilter, search, sort, offset]);

  useEffect(() => {
    let active = true;
    fetchPage()
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err instanceof Error ? err.message : t("admin.feedback.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchPage, t]);

  useEffect(() => {
    api
      .adminFeedbackStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageIndex = Math.floor(offset / PAGE_SIZE);

  function applySearch() {
    setLoading(true);
    setOffset(0);
    setSearch(searchInput.trim());
  }

  function changeRatingFilter(next: string) {
    setLoading(true);
    setRatingFilter(next);
    setOffset(0);
  }

  function changeSort(next: SortKey) {
    setLoading(true);
    setSort(next);
    setOffset(0);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("admin.feedback.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.feedback.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label={t("admin.feedback.averageRating")}
          value={stats?.average_rating != null ? `${stats.average_rating.toFixed(1)} / 5` : "—"}
        />
        <SummaryCard label={t("admin.feedback.totalRatings")} value={stats ? String(stats.total_ratings) : "—"} />
        <SummaryCard label={t("admin.feedback.satisfactionRate")} value={stats ? `${stats.satisfaction_rate}%` : "—"} />
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">{t("admin.feedback.distribution")}</div>
            {stats ? (
              <div className="mt-2 space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const pct =
                    stats.total_ratings > 0
                      ? {
                          "5": stats.five_star_percentage,
                          "4": stats.four_star_percentage,
                          "3": stats.three_star_percentage,
                          "2": stats.two_star_percentage,
                          "1": stats.one_star_percentage,
                        }[String(star)]
                      : 0;
                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">{star}★</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-2 text-xs text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-56 pl-9"
            placeholder={t("admin.feedback.searchPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
          />
        </div>
        <Button variant="outline" size="sm" onClick={applySearch} disabled={search === searchInput && !search}>
          {t("admin.feedback.search")}
        </Button>
        <Select value={ratingFilter} onValueChange={changeRatingFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RATING_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.value === "ALL" ? t("admin.feedback.all") : `${f.label} ★`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => changeSort(v as SortKey)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t("admin.feedback.sortNewest")}</SelectItem>
            <SelectItem value="highest">{t("admin.feedback.sortHighest")}</SelectItem>
            <SelectItem value="lowest">{t("admin.feedback.sortLowest")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">
          {t("admin.feedback.shown", { count: items.length, total })}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("admin.feedback.loading")}</div>
          ) : items.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("admin.feedback.none")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-6 py-3 font-medium">{t("admin.feedback.user")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.feedback.rating")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.feedback.comment")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.feedback.created")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.feedback.updated")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/50">
                      <td className="max-w-[220px] px-6 py-3">
                        <div className="truncate font-medium">{item.user_name ?? "—"}</div>
                        <div className="truncate text-xs text-muted-foreground">{item.user_email}</div>
                      </td>
                      <td className="px-6 py-3">
                        <Stars rating={item.rating} />
                      </td>
                      <td className="max-w-[280px] px-6 py-3">
                        <span className="line-clamp-2 text-muted-foreground">{item.comment ?? "—"}</span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-xs text-muted-foreground">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-xs text-muted-foreground">
                        {formatDate(item.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {t("admin.feedback.page", { current: pageIndex + 1, total: pageCount })}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label={t("common.previous")}
              disabled={offset === 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Badge variant="secondary" className="tabular-nums">
              {pageIndex + 1} / {pageCount}
            </Badge>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("common.next")}
              disabled={offset + PAGE_SIZE >= total || loading}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}