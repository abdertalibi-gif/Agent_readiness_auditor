"use client";

import Link from "next/link";
import {
  Boxes,
  FileClock,
  KeyRound,
  Link2,
  Lock,
  Server,
  ShieldCheck,
  Timer,
  Users,
  Zap,
} from "lucide-react";

import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

export default function SecurityPage() {
  const { t } = useI18n();

  const ITEMS = [
    { icon: ShieldCheck, title: t("marketing.securityPage.ssrfTitle"), text: t("marketing.securityPage.ssrfText") },
    { icon: Server, title: t("marketing.securityPage.isolationTitle"), text: t("marketing.securityPage.isolationText") },
    { icon: Lock, title: t("marketing.securityPage.httpsTitle"), text: t("marketing.securityPage.httpsText") },
    { icon: Timer, title: t("marketing.securityPage.rateLimitsTitle"), text: t("marketing.securityPage.rateLimitsText") },
    { icon: Zap, title: t("marketing.securityPage.timeoutsTitle"), text: t("marketing.securityPage.timeoutsText") },
    { icon: Boxes, title: t("marketing.securityPage.privateIpTitle"), text: t("marketing.securityPage.privateIpText") },
    { icon: Link2, title: t("marketing.securityPage.redirectTitle"), text: t("marketing.securityPage.redirectText") },
    { icon: KeyRound, title: t("marketing.securityPage.dataIsolationTitle"), text: t("marketing.securityPage.dataIsolationText") },
    { icon: Users, title: t("marketing.securityPage.authTitle"), text: t("marketing.securityPage.authText") },
    { icon: FileClock, title: t("marketing.securityPage.auditLogsTitle"), text: t("marketing.securityPage.auditLogsText") },
  ];

  return (
    <div>
      <PageHero
        badge={t("marketing.security")}
        title={t("marketing.securityPage.heroTitle")}
        description={t("marketing.securityPage.heroDescription")}
      />

      <section className="py-16">
        <div className="container grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
                  <item.icon className="h-5 w-5" />
                </span>
                <CardTitle className="mt-4 text-lg">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">{item.text}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Architecture visual */}
      <section className="border-y bg-muted/30 py-16">
        <div className="container">
          <h2 className="text-center text-2xl font-bold tracking-tight">{t("marketing.securityPage.architectureTitle")}</h2>
          <div className="mx-auto mt-10 max-w-3xl rounded-2xl border bg-card p-6">
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium">
              <span className="rounded-lg border bg-background px-4 py-2.5">{t("marketing.securityPage.archUrl")}</span>
              <Arrow />
              <span className="rounded-lg border bg-background px-4 py-2.5">{t("marketing.securityPage.archSsrf")}</span>
              <Arrow />
              <span className="rounded-lg border bg-background px-4 py-2.5">{t("marketing.securityPage.archDns")}</span>
              <Arrow />
              <span className="rounded-lg border bg-background px-4 py-2.5">{t("marketing.securityPage.archIsolated")}</span>
              <Arrow />
              <span className="rounded-lg border bg-background px-4 py-2.5">{t("marketing.securityPage.archRateLimit")}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              {[t("marketing.securityPage.archTagTls"), t("marketing.securityPage.archTagTimeouts"), t("marketing.securityPage.archTagRedirect"), t("marketing.securityPage.archTagNoAuthBypass"), t("marketing.securityPage.archTagNoCaptchaBypass")].map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-3 py-1">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container text-center">
          <h2 className="text-2xl font-bold tracking-tight">{t("marketing.securityPage.questionsTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            {t("marketing.securityPage.questionsText")}
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/contact">{t("marketing.securityPage.contactSecurity")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/docs">{t("marketing.securityPage.readDocs")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <CtaBand />
    </div>
  );
}

function Arrow() {
  return <span className="text-muted-foreground">→</span>;
}
