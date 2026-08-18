"use client";

import Link from "next/link";

import { Logo } from "@/components/logo";
import { useI18n } from "@/components/i18n-provider";

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="relative flex min-h-screen flex-col bg-muted/20">
      <header className="flex h-16 items-center border-b bg-background">
        <div className="container">
          <Logo />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="py-6 text-center text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          {t("invite.backToHome")}
        </Link>
        <span className="mx-2">·</span>
        © {new Date().getFullYear()} Agent Readiness Auditor
      </footer>
    </div>
  );
}
