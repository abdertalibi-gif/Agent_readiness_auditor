"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/components/i18n-provider";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { FeedbackSummary } from "@/components/feedback/FeedbackSummary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { FeedbackMe } from "@/lib/types";

const DISMISS_KEY = "ara_feedback_dismissed";

function wasDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore storage failures
  }
}

/**
 * Dashboard card asking for feedback on the Agent-Readiness Auditor
 * application itself (never the audited website). Loads the current user's
 * feedback, lets them submit/update/delete it, and hides behind a "Maybe
 * later" dismissal without nagging.
 */
export function FeedbackCard() {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState<FeedbackMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [dismissed, setDismissed] = useState(() => wasDismissed());

  // Form state.
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getMyFeedback();
        if (!cancelled) {
          setFeedback(data);
          if (data.has_feedback) {
            setRating(data.rating ?? 0);
            setComment(data.comment ?? "");
          }
        }
      } catch {
        // Non-blocking: the card falls back to the empty form.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed) return null;

  async function submit() {
    if (rating < 1 || rating > 5) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.submitFeedback({ rating, comment: comment.trim() || null });
      setFeedback(saved);
      setEditing(false);
      toast.success(t("feedback.saved"));
    } catch {
      setError(t("feedback.errorSubmit"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteMyFeedback();
      setFeedback({ has_feedback: false, rating: null, comment: null });
      setRating(0);
      setComment("");
      setEditing(false);
      toast.success(t("feedback.deleted"));
    } catch {
      setError(t("feedback.errorDelete"));
    } finally {
      setBusy(false);
    }
  }

  function handleMaybeLater() {
    dismiss();
    setDismissed(true);
  }

  const hasFeedback = feedback?.has_feedback ?? false;

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-y-0 start-0 w-1 bg-primary" aria-hidden="true" />
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Heart className="h-4 w-4 text-primary" />
            {hasFeedback ? t("feedback.yourFeedback") : t("feedback.weValue")}
          </CardTitle>
          <CardDescription>{t("feedback.cardSubtitle")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : hasFeedback && !editing ? (
          <FeedbackSummary
            rating={feedback?.rating ?? 0}
            comment={feedback?.comment ?? null}
            updatedAt={feedback?.updated_at}
            onEdit={() => setEditing(true)}
            onDelete={remove}
            busy={busy}
          />
        ) : (
          <FeedbackForm
            rating={rating}
            onRatingChange={setRating}
            comment={comment}
            onCommentChange={setComment}
            onSubmit={submit}
            onMaybeLater={handleMaybeLater}
            busy={busy}
            error={error}
            submitLabel={t("feedback.submit")}
            busyLabel={t("feedback.submitting")}
            showCancel={hasFeedback}
            onCancel={() => setEditing(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}