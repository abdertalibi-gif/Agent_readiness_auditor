"use client";

import { useEffect, useState } from "react";
import { MessageSquareQuote, Star } from "lucide-react";

import { useI18n } from "@/components/i18n-provider";
import { Stars } from "@/components/reviews/rating-widget";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { PublicReviewOut, ReviewStatsOut } from "@/lib/types";

export function PublicReviewsSection() {
  const { t, formatDate, formatNumber } = useI18n();
  const [reviews, setReviews] = useState<PublicReviewOut[]>([]);
  const [stats, setStats] = useState<ReviewStatsOut | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [list, stat] = await Promise.all([api.listPublicReviews(6, 0), api.reviewStats()]);
        if (!cancelled) {
          setReviews(list.items);
          setStats(stat);
        }
      } catch {
        // Non-blocking: the section hides itself when there is no data.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="border-y bg-muted/30 py-20">
        <div className="container">
          <Skeleton className="mx-auto h-8 w-64" />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if ((stats?.total_reviews ?? 0) === 0 && reviews.length === 0) {
    return (
      <section className="border-y bg-muted/30 py-20">
        <div className="container text-center">
          <MessageSquareQuote className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-center text-3xl font-bold tracking-tight">{t("marketing.landing.reviewsTitle")}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            {t("marketing.landing.reviewsEmpty")}
          </p>
          <div className="mt-8">
            <Button asChild>
              <a href="/register">{t("marketing.createFreeAccount")}</a>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const avg = stats?.average_rating ?? null;

  return (
    <section className="border-y bg-muted/30 py-20">
      <div className="container">
        <h2 className="text-center text-3xl font-bold tracking-tight">{t("marketing.landing.reviewsTitle")}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          {t("marketing.landing.reviewsSubtitle")}
        </p>

        {avg != null && stats && (
          <div className="mt-8 flex flex-col items-center justify-center gap-2 text-center sm:flex-row sm:gap-4">
            <Stars rating={Math.round(avg)} size="lg" />
            <div className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{avg.toFixed(1)}</span> {t("marketing.landing.reviewsOutOf")} ·{" "}
              {formatNumber(stats.total_reviews)} {t("marketing.landing.reviewsCount")}
            </div>
          </div>
        )}

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="space-y-3 p-6">
                <div className="flex items-center justify-between gap-2">
                  <Stars rating={review.rating} />
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {review.rating} / 5
                  </span>
                </div>
                {review.comment && (
                  <p className="line-clamp-4 text-sm text-muted-foreground">{review.comment}</p>
                )}
                <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{review.user_name ?? t("reviews.verifiedUser")}</span>
                  <span>{formatDate(review.created_at)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
