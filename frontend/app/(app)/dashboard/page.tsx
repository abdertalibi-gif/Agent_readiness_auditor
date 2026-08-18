"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Award, PlusCircle, Sparkles } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { FeedbackCard } from "@/components/feedback/FeedbackCard";
import { api } from "@/lib/api";
import { Stars } from "@/components/reviews/rating-widget";
import { groupAuditsByWebsite } from "@/lib/history";
import type { AuditOut, Check, MyReviewOut, Recommendation } from "@/lib/types";
import { LineChart, BarChart, DonutChart } from "@/components/app/charts";
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

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#f97316",
  MEDIUM: "#f59e0b",
  LOW: "#3b82f6",
  INFO: "#94a3b8",
};

const PRIORITY_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary" | "default"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, formatDate, ratingLabel, confidenceLabel, formatNumber } = useI18n();
  const [audits, setAudits] = useState<AuditOut[]>([]);
  const [issues, setIssues] = useState<Check[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [reviews, setReviews] = useState<MyReviewOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      let list: AuditOut[] = [];
      let latest: AuditOut | null = null;
      try {
        list = await api.listAudits();
        setAudits(list);
        latest =
          [...list]
            .filter((a) => a.status === "COMPLETED" || a.status === "PARTIAL")
            .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))[0] ?? null;
        if (latest) {
          try {
            const [issueData, recData, myReviews] = await Promise.all([
              api.getIssues(latest.id),
              api.getRecommendations(latest.id),
              api.listMyReviews(5, 0),
            ]);
            setIssues(issueData.items);
            setRecommendations(recData);
            setReviews(myReviews.items);
          } catch {
            // keep empty
          }
        } else {
          try {
            setReviews((await api.listMyReviews(5, 0)).items);
          } catch {
            // keep empty
          }
        }
      } catch {
        // API unreachable; show empty dashboard
      }
      setLoading(false);
    }
    load();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("dashboard.greetingMorning") : hour < 18 ? t("dashboard.greetingAfternoon") : t("dashboard.greetingEvening");
  const userName = user?.name || user?.email?.split("@")[0] || "there";

  const websites = useMemo(() => groupAuditsByWebsite(audits), [audits]);
  const latest = useMemo(
    () =>
      [...audits]
        .filter((a) => a.status === "COMPLETED" || a.status === "PARTIAL")
        .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))[0] ?? null,
    [audits]
  );
  const critical = issues.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH").length;

  const trend = useMemo(
    () =>
      [...audits]
        .filter((a) => a.score != null)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((a) => ({ label: new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: a.score ?? 0 })),
    [audits]
  );

  const auditsOverTime = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of audits) {
      const key = new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([label, value]) => ({ label, value }));
  }, [audits]);

  const severitySegments = useMemo(
    () =>
      ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((sev) => ({
        label: sev,
        value: issues.filter((i) => i.severity === sev).length,
        color: SEVERITY_COLORS[sev],
      })),
    [issues]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting}, {userName.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/audit/new">
            <PlusCircle className="h-4 w-4" /> {t("dashboard.runNewAudit")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("dashboard.websites")} value={websites.length} sub={websites.length ? `${formatNumber(websites.length)} tracked` : "from your audits"} />
        <StatCard label={t("dashboard.audits")} value={audits.length} sub={audits.length ? t("common.all") : t("dashboard.noAudits")} />
        <StatCard
          label={t("dashboard.score")}
          value={latest?.score != null ? String(latest.score.toFixed(0)) : "—"}
          sub={latest?.score != null ? ratingLabel(latest.score) : "run an audit to score"}
        />
        <StatCard label={t("dashboard.criticalIssues")} value={issues.length ? String(critical) : "—"} sub={issues.length ? "in latest audit" : "none recorded"} destructive={critical > 0} />
      </div>

      <FeedbackCard />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.agentReadinessOverTime")}</CardTitle>
            <CardDescription>Scores from your recorded audits.</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length > 1 ? (
              <LineChart points={trend} />
            ) : (
              <EmptyState text={t("dashboard.noAudits")} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.auditsOverTime")}</CardTitle>
            <CardDescription>Audits created per day.</CardDescription>
          </CardHeader>
          <CardContent>
            {auditsOverTime.length ? (
              <BarChart data={auditsOverTime} />
            ) : (
              <EmptyState text={t("dashboard.noAudits")} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.issuesBySeverity")}</CardTitle>
            <CardDescription>Latest completed audit.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {issues.length ? (
              <>
                <DonutChart segments={severitySegments} />
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  {severitySegments.map((s) => (
                    <span key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                      {s.label} · {s.value}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState text="Complete an audit to see its issue mix." />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">{t("dashboard.previousAudits")}</CardTitle>
              <CardDescription>Your latest recorded audits.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/audits">
                {t("dashboard.viewAll")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {audits.length === 0 ? (
              <EmptyState text="No audits yet. Run your first audit to get a score." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("dashboard.website")}</TableHead>
                      <TableHead>{t("dashboard.score")}</TableHead>
                      <TableHead>{t("dashboard.grade")}</TableHead>
                      <TableHead>{t("dashboard.coverage")}</TableHead>
                      <TableHead>{t("dashboard.confidence")}</TableHead>
                      <TableHead>{t("dashboard.date")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audits.slice(0, 8).map((audit) => (
                      <TableRow key={audit.id}>
                        <TableCell className="max-w-[180px] truncate">
                          <Link href={`/audits/${audit.id}`} className="font-medium hover:underline">
                            {hostnameOf(audit.target_url)}
                          </Link>
                          <div className="truncate font-mono text-xs text-muted-foreground">{audit.target_url}</div>
                        </TableCell>
                        <TableCell className="font-semibold tabular-nums">{audit.score != null ? audit.score.toFixed(0) : "—"}</TableCell>
                        <TableCell>{audit.score != null ? ratingLabel(audit.score) : <Badge variant={STATUS_VARIANT[audit.status] ?? "default"}>{audit.status}</Badge>}</TableCell>
                        <TableCell className="text-muted-foreground">{audit.progress_json?.pages_total != null ? `${formatNumber(audit.progress_json.pages_total)} pages` : "—"}</TableCell>
                        <TableCell>{confidenceLabel(audit.progress_json?.pages_crawled)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(audit.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {latest && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Award className="h-4 w-4 text-primary" /> {t("dashboard.latestAudit")}
                </CardTitle>
                <CardDescription>
                  {hostnameOf(latest.target_url)} · {formatDate(latest.completed_at ?? latest.created_at)}
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/audits/${latest.id}`}>
                  {t("dashboard.openReport")} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-4xl font-bold tabular-nums text-primary">{latest.score != null ? latest.score.toFixed(0) : "—"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">/ 100</div>
                </div>
                <div className="flex-1">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${(latest.score ?? 0) >= 75 ? "bg-success" : (latest.score ?? 0) >= 55 ? "bg-amber-500" : "bg-destructive"}`}
                      style={{ width: `${latest.score ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant={latest.score != null && latest.score >= 75 ? "success" : latest.score != null && latest.score >= 55 ? "warning" : "destructive"}>
                      {ratingLabel(latest.score ?? 0)}
                    </Badge>
                    <span>{latest.progress_json?.pages_crawled != null ? `${formatNumber(latest.progress_json.pages_crawled)} pages crawled` : "—"}</span>
                    <span>{confidenceLabel(latest.progress_json?.pages_crawled)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> {t("dashboard.recommendations")}
              </CardTitle>
              <CardDescription>Prioritized fixes from the latest audit.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {recommendations.length === 0 ? (
              <EmptyState text="Complete an audit to see prioritized recommendations." />
            ) : (
              <ul className="divide-y">
                {recommendations.slice(0, 5).map((rec) => (
                  <li key={rec.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <Badge variant={PRIORITY_VARIANT[rec.priority] ?? "secondary"} className="mt-0.5 shrink-0">
                      {rec.priority}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{rec.title}</p>
                      {rec.how_to_fix && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{rec.how_to_fix}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> {t("dashboard.myReviews")}
              </CardTitle>
              <CardDescription>{t("dashboard.myReviewsSubtitle")}</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/reviews">
                {t("dashboard.viewAll")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {reviews.length === 0 ? (
              <EmptyState text={t("dashboard.noReviews")} />
            ) : (
              <ul className="divide-y">
                {reviews.slice(0, 5).map((review) => (
                  <li key={review.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <Stars rating={review.rating} size="sm" className="mt-1 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {review.audit_url ? hostnameOf(review.audit_url) : "—"}
                      </div>
                      {review.comment && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{review.comment}</p>}
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={review.status === "APPROVED" ? "success" : "secondary"}>{t(`reviews.status.${review.status}`)}</Badge>
                        <span>{formatDate(review.updated_at)}</span>
                      </div>
                    </div>
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

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function StatCard({ label, value, sub, destructive = false }: { label: string; value: string | number; sub: string; destructive?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <div className={`mt-1 text-3xl font-bold tabular-nums ${destructive ? "text-destructive" : ""}`}>{value}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}