"use client";

import { Star } from "lucide-react";
import { useCallback, useState } from "react";

import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const SIZE_CLASSES = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
} as const;

const RATING_LABELS = [
  "",
  "feedback.labels.one",
  "feedback.labels.two",
  "feedback.labels.three",
  "feedback.labels.four",
  "feedback.labels.five",
];

/**
 * Interactive 1-5 star rating with hover preview, click-to-select, clear
 * button and full keyboard support (arrow keys, Home/End, Enter/Space).
 */
export function StarRating({
  value,
  onChange,
  disabled = false,
  size = "md",
  showLabel = true,
}: StarRatingProps) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(0);

  const active = hovered || value;

  const select = useCallback(
    (star: number) => {
      if (disabled) return;
      // Clicking the currently selected star clears the selection.
      onChange(value === star ? 0 : star);
    },
    [disabled, onChange, value]
  );

  function handleKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    let next = active;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(active + 1, 5);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(active - 1, 0);
    else if (event.key === "Home") next = 1;
    else if (event.key === "End") next = 5;
    else if (event.key === "Backspace" || event.key === "Delete") next = 0;
    else return;
    event.preventDefault();
    setHovered(0);
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className={cn("flex items-center gap-1", disabled && "pointer-events-none opacity-70")}
        role="radiogroup"
        aria-label={t("feedback.ratingLabel")}
        onKeyDown={handleKeyDown}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= active;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} ${t("feedback.stars", { count: star })}`}
              disabled={disabled}
              onClick={() => select(star)}
              onMouseEnter={() => !disabled && setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onFocus={() => !disabled && setHovered(star)}
              onBlur={() => setHovered(0)}
              className={cn(
                "transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                !disabled && "hover:scale-110 active:scale-95"
              )}
            >
              <Star
                className={cn(
                  SIZE_CLASSES[size],
                  "transition-colors",
                  filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                )}
              />
            </button>
          );
        })}
      </div>

      {showLabel && (
        <span className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {active > 0 ? t(RATING_LABELS[active]) : t("feedback.noRating")}
        </span>
      )}
    </div>
  );
}