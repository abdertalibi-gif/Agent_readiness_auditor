"use client";

import en from "@/messages/en.json";

export type Locale = "en" | "fr" | "ar" | "es";

export const SUPPORTED_LOCALES: Locale[] = ["en", "fr", "ar", "es"];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
  es: "Español",
};

export const IS_RTL: Record<Locale, boolean> = {
  en: false,
  fr: false,
  ar: true,
  es: false,
};

export const LOCALE_DATE: Record<Locale, string> = {
  en: "en-US",
  fr: "fr-FR",
  ar: "ar",
  es: "es-ES",
};

export type MessageValue = string | { [key: string]: MessageValue };
export type MessageDict = { [key: string]: MessageValue };

// Only the active locale plus English (the universal fallback) are ever kept in
// memory. The remaining locales are fetched on demand and cached, so the shared
// client bundle no longer carries ~280 KB of translation JSON for languages the
// user never selects.
const loadedMessages: Partial<Record<Locale, MessageDict>> = { en };

const localeLoaders: Record<Locale, () => Promise<MessageDict>> = {
  en: () => Promise.resolve(en),
  fr: () => import("@/messages/fr.json").then((m) => m.default),
  ar: () => import("@/messages/ar.json").then((m) => m.default),
  es: () => import("@/messages/es.json").then((m) => m.default),
};

/**
 * Ensure the messages for `locale` are available. Resolves with `true` when the
 * dictionary is present (already loaded or freshly fetched), `false` otherwise.
 * Safe to call repeatedly and from anywhere (provider, effects).
 */
export async function loadLocaleMessages(locale: Locale): Promise<boolean> {
  if (loadedMessages[locale]) return true;
  try {
    loadedMessages[locale] = await localeLoaders[locale]();
    return true;
  } catch {
    // Network/build hiccup: fall back to English for this render cycle.
    return false;
  }
}

export function isLocaleLoaded(locale: Locale): boolean {
  return Boolean(loadedMessages[locale]);
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (SUPPORTED_LOCALES as string[]).includes(value);
}

export function normalizeLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/* ------------------------------------------------------------------ */
/* Message lookup                                                      */
/* ------------------------------------------------------------------ */

function lookup(
  dict: MessageDict,
  path: string
): string | undefined {
  let node: MessageValue | undefined = dict;
  for (const part of path.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Type-safe interpolation of `{key}` placeholders in a message template.
 */
export function interpolate(
  template: string,
  values?: Record<string, string | number>
): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match
  );
}

export function translate(
  locale: Locale,
  path: string,
  values?: Record<string, string | number>
): string {
  const dict = loadedMessages[locale];
  if (dict) {
    const found = lookup(dict, path);
    if (found !== undefined) return interpolate(found, values);
  }
  const fallback = lookup(loadedMessages[DEFAULT_LOCALE] ?? en, path);
  if (fallback !== undefined) return interpolate(fallback, values);
  return path;
}

/**
 * Translate an English string produced by the backend (check names,
 * descriptions, recommendations). The lookup key is the full English string,
 * so it must NOT go through the dot-path lookup in `translate()` (many strings
 * contain periods). Unmatched strings fall back to the English source.
 */
export function translateText(locale: Locale, english: string): string {
  if (!english) return english;
  const dict = loadedMessages[locale];
  const node = dict?.checkText;
  if (node && typeof node === "object" && typeof node[english] === "string") {
    return node[english];
  }
  return english;
}
