import {
  LOCALE_DATE,
  type Locale,
} from "@/lib/i18n";
// Re-exported translations for labels used in the score/confidence/rating
// helpers so callers can keep using a single import.
import { translate } from "@/lib/i18n";

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const numberFormatterCache = new Map<string, Intl.NumberFormat>();

function dateFormatter(locale: Locale): Intl.DateTimeFormat {
  const key = LOCALE_DATE[locale];
  let f = dateFormatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(key, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    dateFormatterCache.set(key, f);
  }
  return f;
}

function numberFormatter(locale: Locale): Intl.NumberFormat {
  const key = LOCALE_DATE[locale];
  let f = numberFormatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(key);
    numberFormatterCache.set(key, f);
  }
  return f;
}

/** Locale-aware, e.g. en: "Aug 15, 2026", fr: "15 août 2026", ar: "١٥ أغسطس ٢٠٢٦". */
export function formatDateLocale(
  iso: string | null | undefined,
  locale: Locale
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFormatter(locale).format(d);
}

/** Locale-aware number formatting (e.g. Arabic-Indic digits). */
export function formatNumberLocale(value: number, locale: Locale): string {
  return numberFormatter(locale).format(value);
}

export function ratingLabelLocale(
  score: number | null | undefined,
  locale: Locale
): string {
  if (score === null || score === undefined) return translate(locale, "ratings.pending");
  if (score >= 90) return translate(locale, "ratings.excellent");
  if (score >= 75) return translate(locale, "ratings.good");
  if (score >= 60) return translate(locale, "ratings.moderate");
  if (score >= 40) return translate(locale, "ratings.poor");
  return translate(locale, "ratings.critical");
}

export function confidenceLabelLocale(
  pages: number | null | undefined,
  locale: Locale
): string {
  if (pages === undefined || pages === null) return "—";
  if (pages === 0) return translate(locale, "confidence.veryLow");
  if (pages < 3) return translate(locale, "confidence.low");
  if (pages < 10) return translate(locale, "confidence.medium");
  return translate(locale, "confidence.high");
}

export function statusLabelLocale(status: string, locale: Locale): string {
  const t = translate(locale, `statuses.${status}`);
  return t.startsWith("statuses.") ? status : t;
}

export function severityLabelLocale(severity: string, locale: Locale): string {
  const t = translate(locale, `severity.${severity}`);
  return t.startsWith("severity.") ? severity : t;
}

export function priorityLabelLocale(priority: string, locale: Locale): string {
  const t = translate(locale, `priority.${priority}`);
  return t.startsWith("priority.") ? priority : t;
}

export function categoryLabelLocale(key: string, locale: Locale): string {
  const t = translate(locale, `categories.${key}`);
  return t.startsWith("categories.") ? key.replace(/_/g, " ") : t;
}
