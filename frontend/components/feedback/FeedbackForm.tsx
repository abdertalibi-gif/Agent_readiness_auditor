"use client";

import { Star } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/feedback/StarRating";

interface FeedbackFormProps {
  rating: number;
  onRatingChange: (rating: number) => void;
  comment: string;
  onCommentChange: (comment: string) => void;
  onSubmit: () => void;
  onMaybeLater?: () => void;
  busy?: boolean;
  error?: string | null;
  submitLabel: string;
  busyLabel: string;
  showCancel?: boolean;
  onCancel?: () => void;
}

/**
 * The feedback input form: interactive star rating, optional comment and a
 * primary submit CTA. Focuses on the Agent-Readiness Auditor application
 * itself (never the audited website).
 */
export function FeedbackForm({
  rating,
  onRatingChange,
  comment,
  onCommentChange,
  onSubmit,
  onMaybeLater,
  busy = false,
  error = null,
  submitLabel,
  busyLabel,
  showCancel = false,
  onCancel,
}: FeedbackFormProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{t("feedback.question")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("feedback.appNotWebsite")}</p>
        <div className="mt-3">
          <StarRating value={rating} onChange={onRatingChange} disabled={busy} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="feedback-comment"
          className="flex items-center gap-1 text-sm font-medium"
        >
          <Star className="h-3.5 w-3.5 text-muted-foreground" />
          {t("feedback.commentLabel")}
        </label>
        <Textarea
          id="feedback-comment"
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder={t("feedback.commentPlaceholder")}
          maxLength={1000}
          rows={3}
          disabled={busy}
        />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSubmit} disabled={busy || rating < 1 || rating > 5}>
          {busy ? busyLabel : submitLabel}
        </Button>
        {showCancel && (
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </Button>
        )}
        {onMaybeLater && (
          <Button variant="ghost" onClick={onMaybeLater} disabled={busy}>
            {t("feedback.maybeLater")}
          </Button>
        )}
      </div>
    </div>
  );
}