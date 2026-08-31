import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Toaster } from "sonner";

import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { SafePerformance } from "@/components/safe-performance";
import type { Locale } from "@/lib/i18n";
import "./globals.css";

const SUPPORTED_LOCALES = ["en", "fr", "ar", "es"] as const;

function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export const metadata: Metadata = {
  title: {
    default: "Agent Readiness Auditor — Is your website ready for AI agents?",
    template: "%s · Agent Readiness Auditor",
  },
  description:
    "AI Agent Discoverability & Technical Audit. Analyze your website's discoverability, structure, content and technical accessibility for AI-powered agents.",
};

async function getServerLocale(): Promise<Locale | undefined> {
  const cookieStore = await cookies();
  const value = cookieStore.get("ara_locale")?.value;
  return isLocale(value) ? (value as Locale) : undefined;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const serverLocale = await getServerLocale();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col">
        <SafePerformance />
        <AuthProvider>
          <I18nProvider initialLocale={serverLocale}>{children}</I18nProvider>
        </AuthProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
