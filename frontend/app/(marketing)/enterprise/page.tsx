"use client";

import Link from "next/link";
import {
  Building2,
  FileClock,
  KeyRound,
  LayoutDashboard,
  ServerCog,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";

import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";

export default function EnterprisePage() {
  const { t } = useI18n();

  const FEATURES = [
    { icon: Building2, title: t("marketing.enterprisePage.multiTenantTitle"), text: t("marketing.enterprisePage.multiTenantText") },
    { icon: KeyRound, title: t("marketing.enterprisePage.ssoTitle"), text: t("marketing.enterprisePage.ssoText") },
    { icon: UserCog, title: t("marketing.enterprisePage.rbacTitle"), text: t("marketing.enterprisePage.rbacText") },
    { icon: Users, title: t("marketing.enterprisePage.teamTitle"), text: t("marketing.enterprisePage.teamText") },
    { icon: FileClock, title: t("marketing.enterprisePage.auditLogsTitle"), text: t("marketing.enterprisePage.auditLogsText") },
    { icon: ServerCog, title: t("marketing.enterprisePage.apiTitle"), text: t("marketing.enterprisePage.apiText") },
    { icon: LayoutDashboard, title: t("marketing.enterprisePage.crawlLimitsTitle"), text: t("marketing.enterprisePage.crawlLimitsText") },
    { icon: ShieldCheck, title: t("marketing.enterprisePage.securityTitle"), text: t("marketing.enterprisePage.securityText") },
  ];

  return (
    <div>
      <PageHero
        badge={t("marketing.enterprise")}
        title={t("marketing.enterprisePage.heroTitle")}
        description={t("marketing.enterprisePage.heroDescription")}
      />

      <section className="py-16">
        <div className="container grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <item.icon className="h-6 w-6 text-primary" />
                <CardTitle className="mt-3 text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">{item.text}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Enterprise workflow */}
      <section className="border-y bg-muted/30 py-16">
        <div className="container">
          <h2 className="text-center text-2xl font-bold tracking-tight">{t("marketing.enterprisePage.howTeamsTitle")}</h2>
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
            {[
              ["1", t("marketing.enterprisePage.step1Title"), t("marketing.enterprisePage.step1Text")],
              ["2", t("marketing.enterprisePage.step2Title"), t("marketing.enterprisePage.step2Text")],
              ["3", t("marketing.enterprisePage.step3Title"), t("marketing.enterprisePage.step3Text")],
            ].map(([num, title, text]) => (
              <div key={num} className="rounded-xl border bg-card p-6">
                <div className="text-sm font-bold text-primary">{t("marketing.enterprisePage.step")} {num}</div>
                <h3 className="mt-2 font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight">{t("marketing.enterprisePage.readyTitle")}</h2>
          <p className="mt-3 text-muted-foreground">
            {t("marketing.enterprisePage.readyText")}
          </p>
          <div className="mt-6">
            <Button asChild size="lg">
              <Link href="/contact">{t("marketing.enterprisePage.contactSales")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <CtaBand />
    </div>
  );
}
