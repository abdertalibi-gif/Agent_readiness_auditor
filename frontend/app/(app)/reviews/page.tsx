"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Star } from "lucide-react";

import { useI18n } from "@/components/i18n-provider";
import { Stars } from "@/components/reviews/rating-widget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { MyReviewOut } from "@/lib/types";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function MyReviewsPage() {
  const { t, formatDate } = useI18n();
  const [reviews, setReviews] = useState<MyReviewOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.listMyReviews(100, 0);
        if (!cancelled) setReviews(data.items);
      } catch {
        // Non-blocking: the page falls back to the empty state.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-3.5 w-3.5" /> {t("reviews.backToDashboard")}
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("reviews.myReviewsTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("reviews.myReviewsSubtitle")}</p>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Star className="h-8 w-8 text-muted-foreground/50" />
            <p className="max-w-md text-sm text-muted-foreground">{t("reviews.myReviewsEmpty")}</p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/audits">{t("dashboard.viewAll")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id}>
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      <Link href={`/audits/${review.audit_id}`} className="hover:underline">
                        {review.audit_url ? hostnameOf(review.audit_url) : t("reviews.title")}
                      </Link>
                    </CardTitle>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={review.status === "APPROVED" ? "success" : "secondary"}>
                        {t(`reviews.status.${review.status}`)}
                      </Badge>
                      <span>{formatDate(review.updated_at)}</span>
                    </p>
                  </div>
                  <Stars rating={review.rating} size="md" className="shrink-0" />
                </CardHeader>
                {review.comment && (
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{review.comment}</p>
                  </CardContent>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
