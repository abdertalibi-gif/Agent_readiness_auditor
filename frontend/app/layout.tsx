import type { Metadata } from "next";
import { Toaster } from "sonner";

import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/components/i18n-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Agent Readiness Auditor — Is your website ready for AI agents?",
    template: "%s · Agent Readiness Auditor",
  },
  description:
    "AI Agent Discoverability & Technical Audit. Analyze your website's discoverability, structure, content and technical accessibility for AI-powered agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col">
        <AuthProvider>
          <I18nProvider>{children}</I18nProvider>
        </AuthProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
