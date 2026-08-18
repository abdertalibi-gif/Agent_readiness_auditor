"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { useI18n } from "@/components/i18n-provider";

export function SiteFooter() {
  const { t } = useI18n();

  const COLUMNS = [
    {
      title: t("marketing.product"),
      links: [
        { label: t("marketing.features"), href: "/features" },
        { label: t("marketing.howItWorks"), href: "/how-it-works" },
        { label: t("marketing.security"), href: "/security" },
        { label: t("marketing.faqNav"), href: "/faq" },
      ],
    },
    {
      title: t("marketing.resources"),
      links: [
        { label: t("marketing.documentation"), href: "/docs" },
        { label: t("marketing.contact"), href: "/contact" },
        { label: t("marketing.helpCenter"), href: "/help" },
      ],
    },
    {
      title: t("marketing.company"),
      links: [
        { label: t("marketing.login"), href: "/login" },
        { label: t("marketing.createFreeAccount"), href: "/register" },
        { label: t("marketing.dashboard"), href: "/dashboard" },
      ],
    },
  ];

  return (
    <footer className="border-t bg-muted/20">
      <div className="container grid gap-10 py-12 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            {t("marketing.tagline")}
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold">{col.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="container flex flex-col items-center justify-between gap-3 py-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Agent Readiness Auditor. {t("marketing.allRightsReserved")}</span>
          <span>{t("marketing.engineTagline")}</span>
        </div>
      </div>
    </footer>
  );
}
