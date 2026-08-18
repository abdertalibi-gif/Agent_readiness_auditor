"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { RatingWidget, Stars } from "@/components/reviews/rating-widget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { MyReviewOut } from "@/lib/types";

const REVIEWABLE_STATUSES = new Set(["COMPLETED", "PARTIAL"]);

export function ReviewPanel({ auditId, status }: { auditId: string; status: string }) {
  const { t, formatDate } = useI18n();
  const { user, loading: authLoading } = useAuth();

  const [existing, setExisting] = useState<MyReviewOut | null>(null);
  const [checking, setChecking] = useState(true);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const reviewable = REVIEWABLE_STATUSES.has(status);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!reviewable) return;
      if (!user) {
        if (!cancelled) setChecking(false);
        return;
      }
      try {
        const data = await api.listMyReviews(50, 0);
        if (!cancelled) {
          const mine = data.items.find((r) => r.audit_id === auditId) ?? null;
          setExisting(mine);
          if (mine) {
            setRating(mine.rating);
            setComment(mine.comment ?? "");
          }
        }
      } catch {
        // Non-blocking: the panel falls back to the empty form.
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [auditId, reviewable, user]);

  if (!reviewable) return null;

  async function submit() {
    if (rating < 1 || rating > 5) return;
    setBusy(true);
    try {
      const created = await api.createReview({ audit_id: auditId, rating, comment: comment || null });
      setExisting(created);
      setEditing(false);
      toast.success(t("reviews.submitted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reviews.errorSubmit"));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!existing || rating < 1) return;
    setBusy(true);
    try {
      const updated = await api.updateReview(existing.id, { rating, comment: comment || null });
      setExisting(updated);
      setEditing(false);
      toast.success(t("reviews.updated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reviews.errorUpdate"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      await api.deleteReview(existing.id);
      setExisting(null);
      setRating(0);
      setComment("");
      toast.success(t("reviews.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reviews.errorDelete"));
    } finally {
      setBusy(false);
    }
  }

  if (checking || authLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reviews.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  // Logged-out visitors see a short prompt with a sign-in link.
  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reviews.title")}</CardTitle>
          <CardDescription>{t("reviews.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("reviews.loginRequired")}</p>
          <div className="mt-4">
            <Button asChild size="sm">
              <Link href="/login">{t("reviews.login")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusText = existing ? t(`reviews.status.${existing.status}`) : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("reviews.title")}</CardTitle>
        <CardDescription>{t("reviews.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {existing && !editing ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Stars rating={existing.rating} size="md" />
              <Badge variant={existing.status === "APPROVED" ? "success" : "secondary"}>{statusText}</Badge>
              <span className="text-xs text-muted-foreground">{formatDate(existing.updated_at)}</span>
            </div>
            {existing.comment && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{existing.comment}</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={busy}>
                <Pencil className="h-3.5 w-3.5" /> {t("reviews.update")}
              </Button>
              <Button variant="outline" size="sm" onClick={remove} disabled={busy}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" /> {t("reviews.delete")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <RatingWidget value={rating} onChange={setRating} />
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("reviews.commentPlaceholder")}
              maxLength={1000}
              rows={3}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{t("reviews.commentHint")}</p>
              <div className="flex gap-2">
                {editing && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                    {t("common.cancel")}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={editing ? saveEdit : submit}
                  disabled={busy || rating < 1}
                >
                  {busy
                    ? t(editing ? "reviews.updating" : "reviews.submitting")
                    : t(editing ? "reviews.update" : "reviews.submit")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
