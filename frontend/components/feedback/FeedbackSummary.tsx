"use client";

import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Stars } from "@/components/reviews/rating-widget";
import { Button } from "@/components/ui/button";

interface FeedbackSummaryProps {
  rating: number;
  comment: string | null;
  updatedAt?: string | null;
  onEdit: () => void;
  onDelete?: () => void;
  busy?: boolean;
}

/**
 * The "thank you" state shown after feedback was submitted: current rating,
 * the optional comment and an edit (and optional delete) action.
 */
export function FeedbackSummary({
  rating,
  comment,
  updatedAt,
  onEdit,
  onDelete,
  busy = false,
}: FeedbackSummaryProps) {
  const { t, formatDate } = useI18n();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Stars rating={rating} size="md" />
        <span className="text-sm font-medium text-muted-foreground">
          {rating} / 5
        </span>
      </div>

      {comment && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          “{comment}”
        </p>
      )}

      <div className="flex items-center gap-2 text-sm font-medium text-success">
        <CheckCircle2 className="h-4 w-4" />
        {t("feedback.thanks")}
      </div>
      {updatedAt && (
        <p className="text-xs text-muted-foreground">
          {t("feedback.updatedAt", { date: formatDate(updatedAt) })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
          <Pencil className="h-3.5 w-3.5" /> {t("feedback.edit")}
        </Button>
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={busy}
            aria-label={t("feedback.delete")}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" /> {t("feedback.delete")}
          </Button>
        )}
      </div>
    </div>
  );
}