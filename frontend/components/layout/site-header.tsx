"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";

export function SiteHeader() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const NAV = [
    { label: t("marketing.product"), children: [
      { label: t("marketing.features"), href: "/features" },
      { label: t("marketing.howItWorks"), href: "/how-it-works" },
      { label: t("marketing.security"), href: "/security" },
      { label: t("marketing.enterprise"), href: "/enterprise" },
    ]},
    { label: t("marketing.faqNav"), href: "/faq" },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-1 text-sm text-muted-foreground lg:flex">
          {NAV.map((item) =>
            item.children ? (
              <DropdownMenu key={item.label}>
                <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-md px-3 py-2 font-medium outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  {item.label}
                  <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {item.children.map((c) => (
                    <DropdownMenuItem key={c.href} asChild>
                      <Link href={c.href}>{c.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                key={item.label}
                href={item.href!}
                className="rounded-md px-3 py-2 font-medium transition-colors hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </Link>
            )
          )}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <LanguageSwitcher />
          <Button asChild variant="ghost" size="sm">
          <Link href="/login">{t("marketing.login")}</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/register">{t("marketing.createFreeAccount")}</Link>
        </Button>
      </div>

        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(!open)} aria-label={t("marketing.toggleMenu")}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {open && (
        <div className="border-t bg-background lg:hidden">
          <div className="container flex flex-col gap-1 py-4">
            {NAV.map((item) =>
              item.children ? (
                <div key={item.label} className="flex flex-col gap-1">
                  <span className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </span>
                  {item.children.map((c) => (
                    <Link
                      key={c.href}
                      href={c.href}
                      onClick={() => setOpen(false)}
                      className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link
                  key={item.label}
                  href={item.href!}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </Link>
              )
            )}
            <div className="mt-2 flex flex-col gap-2 border-t pt-4">
              <LanguageSwitcher />
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link href="/login">{t("marketing.login")}</Link>
                </Button>
                <Button asChild size="sm" className="flex-1">
                  <Link href="/register">{t("marketing.createFreeAccount")}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
