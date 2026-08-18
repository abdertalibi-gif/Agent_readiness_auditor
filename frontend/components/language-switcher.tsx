"use client";

import { Check, Languages } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

const FLAGS: Record<Locale, string> = {
  en: "🇬🇧",
  fr: "🇫🇷",
  ar: "🇸🇦",
  es: "🇪🇸",
};

const NATIVE: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
  es: "Español",
};

function CurrentLabel({ locale }: { locale: Locale }) {
  // Show the native label of the current language ("العربية" reads correctly
  // regardless of the active UI direction).
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{FLAGS[locale]}</span>
      <span className="hidden sm:inline">{NATIVE[locale]}</span>
    </span>
  );
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={LOCALE_LABELS[locale]}>
          <Languages className="h-4 w-4" />
          <CurrentLabel locale={locale} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{LOCALE_LABELS[locale]}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LOCALES.map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => setLocale(code)}
            className="cursor-pointer"
          >
            <span className="mr-2">{FLAGS[code]}</span>
            <span className="min-w-0 flex-1">{NATIVE[code]}</span>
            {locale === code && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
