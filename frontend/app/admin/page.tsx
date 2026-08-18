"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, HeartHandshake, ShieldCheck, Star, UserCheck, UserX, Users, Workflow } from "lucide-react";

import { api } from "@/lib/api";
import type { AdminDashboard, FeedbackStats, ReviewStatsOut } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";
import { Stars } from "@/components/reviews/rating-widget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function AdminDashboardPage() {
  const { t, formatNumber } = useI18n();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<ReviewStatsOut | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [appStats, setAppStats] = useState<FeedbackStats | null>(null);

  useEffect(() => {
    api
      .adminDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t("admin.dashboard.loadFailed")));

    api
      .reviewStats()
      .then(setStats)
      .catch(() => setStats(null));
    api
      .adminReviews("PENDING")
      .then((res) => setPendingCount(res.total))
      .catch(() => setPendingCount(0));
    api
      .adminFeedbackStats()
      .then(setAppStats)
      .catch(() => setAppStats(null));
  }, [t]);

  if (error) {
    return <div className="rounded-lg border border-destructive/40 p-6 text-destructive">{error}</div>;
  }

  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>
    );
  }

  const statsCards = [
    { label: t("admin.dashboard.totalUsers"), value: data.total_users, icon: Users },
    { label: t("admin.dashboard.activeUsers"), value: data.active_users, icon: UserCheck },
    { label: t("admin.dashboard.suspendedUsers"), value: data.suspended_users, icon: UserX },
    { label: t("admin.dashboard.totalWorkspaces"), value: data.total_workspaces, icon: Workflow },
  ];

  const totalReviews = stats?.total_reviews ?? 0;
  const avg = stats?.average_rating ?? null;
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: stats?.rating_counts?.[String(star)] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("admin.dashboard.overview")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.dashboard.overviewSubtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent">
                <s.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4 text-amber-400" /> {t("admin.dashboard.reviews")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("admin.dashboard.reviewsSubtitle")}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/reviews">{t("admin.dashboard.manageReviews")}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {totalReviews === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.dashboard.noReviews")}</p>
          ) : (
            <div className="grid gap-8 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground">{t("admin.dashboard.averageRating")}</div>
                  <div className="mt-1 flex items-center gap-3">
                    <Stars rating={avg != null ? Math.round(avg) : 0} size="lg" />
                    <span className="text-2xl font-bold">
                      {avg != null ? avg.toFixed(1) : "—"}
                      <span className="text-sm font-normal text-muted-foreground"> / 5</span>
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="secondary">
                    {t("admin.dashboard.totalReviews")}: {formatNumber(totalReviews)}
                  </Badge>
                  {pendingCount > 0 && (
                    <Badge variant="warning">
                      {t("admin.dashboard.pendingReviews")}: {formatNumber(pendingCount)}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">{t("admin.dashboard.reviewDistribution")}</div>
                {distribution.map(({ star, count }) => (
                  <div key={star} className="flex items-center gap-3">
                    <span className="w-8 shrink-0 text-sm tabular-nums text-muted-foreground">
                      {star}★
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${totalReviews > 0 ? (count / totalReviews) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                      {formatNumber(count)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartHandshake className="h-4 w-4 text-primary" /> {t("admin.dashboard.appFeedback")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t("admin.dashboard.appFeedbackSubtitle")}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/feedback">{t("admin.dashboard.manageFeedback")}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!appStats || appStats.total_ratings === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.dashboard.noFeedback")}</p>
          ) : (
            <div className="grid gap-8 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground">{t("admin.dashboard.averageRating")}</div>
                  <div className="mt-1 flex items-center gap-3">
                    <Stars rating={Math.round(appStats.average_rating ?? 0)} size="lg" />
                    <span className="text-2xl font-bold">
                      {appStats.average_rating != null ? appStats.average_rating.toFixed(1) : "—"}
                      <span className="text-sm font-normal text-muted-foreground"> / 5</span>
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Badge variant="secondary">
                    {t("admin.dashboard.totalResponses")}: {formatNumber(appStats.total_ratings)}
                  </Badge>
                  <Badge variant="success">
                    {t("admin.dashboard.satisfaction")}: {appStats.satisfaction_rate}%
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">{t("admin.dashboard.reviewDistribution")}</div>
                {[5, 4, 3, 2, 1].map((star) => {
                  const pct = {
                    5: appStats.five_star_percentage,
                    4: appStats.four_star_percentage,
                    3: appStats.three_star_percentage,
                    2: appStats.two_star_percentage,
                    1: appStats.one_star_percentage,
                  }[star];
                  return (
                    <div key={star} className="flex items-center gap-3">
                      <span className="w-8 shrink-0 text-sm tabular-nums text-muted-foreground">{star}★</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> {t("admin.dashboard.recentRegistrations")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.recent_registrations.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">{t("admin.dashboard.noRecentRegistrations")}</p>
            ) : (
              <ul className="divide-y">
                {data.recent_registrations.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 px-6 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.name ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(u.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> {t("admin.dashboard.recentSecurityActions")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.recent_actions.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                {t("admin.dashboard.noAdminActions")}
              </p>
            ) : (
              <ul className="divide-y">
                {data.recent_actions.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-6 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-mono">{a.action}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t("admin.dashboard.by", { actor: a.actor_email ?? a.actor_id ?? t("admin.auditLogs.system") })}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(a.created_at)}</span>
                    <Link href="/admin/audit-logs" className="shrink-0 text-xs text-primary hover:underline">
                      {t("common.view")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
