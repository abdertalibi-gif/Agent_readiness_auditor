"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import {
  IS_RTL,
  loadLocaleMessages,
  normalizeLocale,
  translate,
  translateText,
  type Locale,
} from "@/lib/i18n";
import {
  categoryLabelLocale,
  confidenceLabelLocale,
  formatDateLocale,
  formatNumberLocale,
  priorityLabelLocale,
  ratingLabelLocale,
  severityLabelLocale,
  statusLabelLocale,
} from "@/lib/utils-locale";

const STORAGE_KEY = "ara_locale";
const COOKIE_KEY = "ara_locale";

function readLocale(preferred?: string | null): Locale {
  if (typeof window === "undefined") return normalizeLocale(preferred);
  return normalizeLocale(
    preferred ?? localStorage.getItem(STORAGE_KEY) ?? readLocaleCookie()
  );
}

function readLocaleCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_KEY}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

export function setLocaleCookie(locale: Locale) {
  if (typeof document === "undefined") return;
  // 70 days = 10 weeks; long-lived so the preference survives refresh/login.
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(locale)}; Path=/; Max-Age=${70 * 86400}; SameSite=Lax`;
}

export interface I18nValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (key: string, values?: Record<string, string | number>) => string;
  formatDate: (iso?: string | null) => string;
  formatNumber: (value: number) => string;
  ratingLabel: (score?: number | null) => string;
  confidenceLabel: (pages?: number | null) => string;
  categoryLabel: (key: string) => string;
  statusLabel: (status: string) => string;
  severityLabel: (severity: string) => string;
  priorityLabel: (priority: string) => string;
  checkText: (english: string) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(() => readLocale());

  // Locale JSON files are loaded on demand (only English is bundled eagerly).
  // Kick off the load for the current locale as soon as the provider mounts so
  // the very first paint uses the correct language, and re-render once the
  // messages actually arrive (translate() falls back to English meanwhile).
  const [, setLoadedTick] = useState(0);
  useEffect(() => {
    let active = true;
    loadLocaleMessages(locale).then((loaded) => {
      if (active && loaded) setLoadedTick((t) => t + 1);
    });
    return () => {
      active = false;
    };
  }, [locale]);

  // Register the current server-provided preferred_locale the first time the
  // authenticated user is available, unless a client-side choice already exists.
  // The update is scheduled so it never runs synchronously inside the effect.
  useEffect(() => {
    const stored = readLocaleCookie() ?? localStorage.getItem(STORAGE_KEY);
    if (user?.preferred_language && !stored) {
      const frame = requestAnimationFrame(() => {
        setLocaleState(normalizeLocale(user.preferred_language));
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [user]);

  const applyLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
      document.documentElement.dir = IS_RTL[next] ? "rtl" : "ltr";
      localStorage.setItem(STORAGE_KEY, next);
      setLocaleCookie(next);
    }
  }, []);

  // Sync <html> lang/dir on mount + whenever the locale changes.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
      document.documentElement.dir = IS_RTL[locale] ? "rtl" : "ltr";
    }
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      applyLocale(next);
      // Persist to the backend profile when logged in.
      if (user) {
        api.updatePreferences({ preferred_language: next }).catch(() => {
          // Non-blocking: local persistence still applies.
        });
      }
    },
    [applyLocale, user]
  );

  const t = useCallback(
    (key: string, values?: Record<string, string | number>) =>
      translate(locale, key, values),
    [locale]
  );

  const checkText = useCallback(
    (english: string) => translateText(locale, english),
    [locale]
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: IS_RTL[locale] ? "rtl" : "ltr",
      t,
      formatDate: (iso?: string | null) => formatDateLocale(iso, locale),
      formatNumber: (n: number) => formatNumberLocale(n, locale),
      ratingLabel: (score?: number | null) => ratingLabelLocale(score, locale),
      confidenceLabel: (pages?: number | null) => confidenceLabelLocale(pages, locale),
      categoryLabel: (key: string) => categoryLabelLocale(key, locale),
      statusLabel: (status: string) => statusLabelLocale(status, locale),
      severityLabel: (severity: string) => severityLabelLocale(severity, locale),
      priorityLabel: (priority: string) => priorityLabelLocale(priority, locale),
      checkText,
      setLocale,
    }),
    [locale, t, checkText, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
}
