"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

interface RatingWidgetProps {
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
};

const RATING_LABELS = ["", "reviews.rate1", "reviews.rate2", "reviews.rate3", "reviews.rate4", "reviews.rate5"];

export function RatingWidget({ value, onChange, disabled = false, size = "md", showLabel = true }: RatingWidgetProps) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(0);

  const active = hovered || value;

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn("flex items-center gap-1", disabled && "pointer-events-none opacity-70")}
        role="radiogroup"
        aria-label={t("reviews.ratingLabel")}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= active;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} ${t("reviews.stars", { count: star })}`}
              disabled={disabled}
              onClick={() => onChange(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className={cn(
                "transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                !disabled && "hover:scale-110 active:scale-95"
              )}
            >
              <Star
                className={cn(
                  SIZE_CLASSES[size],
                  filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                )}
              />
            </button>
          );
        })}
      </div>
      {showLabel && active > 0 && (
        <span className="text-sm font-medium text-muted-foreground">{t(RATING_LABELS[active])}</span>
      )}
    </div>
  );
}

export function Stars({ rating, size = "sm", className }: { rating: number; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(SIZE_CLASSES[size], star <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
        />
      ))}
    </span>
  );
}
