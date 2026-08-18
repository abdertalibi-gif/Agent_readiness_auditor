"use client";

import Link from "next/link";
import {
  Bot,
  Boxes,
  Braces,
  Code2,
  FileSearch,
  Fingerprint,
  Globe,
  LayoutTemplate,
  Link2,
  Lock,
  Radar,
  Search,
  Server,
  Shield,
  ShieldCheck,
  Network,
  Zap,
} from "lucide-react";

import { HeroDashboard } from "@/components/landing/hero-dashboard";
import { PublicReviewsSection } from "@/components/reviews/public-reviews-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";

export default function LandingPage() {
  const { t, categoryLabel } = useI18n();

  const PROBLEM = [
    {
      icon: Search,
      title: t("marketing.landing.problem.discoverTitle"),
      text: t("marketing.landing.problem.discoverText"),
    },
    {
      icon: Bot,
      title: t("marketing.landing.problem.understandTitle"),
      text: t("marketing.landing.problem.understandText"),
    },
    {
      icon: Zap,
      title: t("marketing.landing.problem.actTitle"),
      text: t("marketing.landing.problem.actText"),
    },
  ];

  const STEPS = [
    t("marketing.landing.steps.enter"),
    t("marketing.landing.steps.crawl"),
    t("marketing.landing.steps.signals"),
    t("marketing.landing.steps.score"),
    t("marketing.landing.steps.recommendations"),
  ];

  const CATEGORY_SCORES = [
    { label: categoryLabel("discoverability"), score: 88 },
    { label: categoryLabel("crawlability"), score: 92 },
    { label: categoryLabel("semantic_structure"), score: 76 },
    { label: categoryLabel("structured_data"), score: 81 },
    { label: categoryLabel("content_accessibility"), score: 85 },
    { label: categoryLabel("navigation_linking"), score: 79 },
    { label: categoryLabel("technical_quality"), score: 94 },
    { label: categoryLabel("performance_accessibility"), score: 77 },
  ];

  const FEATURES = [
    { icon: Bot, title: t("marketing.landing.features.aiCrawlerTitle"), text: t("marketing.landing.features.aiCrawlerText") },
    { icon: Network, title: t("marketing.landing.features.sitemapTitle"), text: t("marketing.landing.features.sitemapText") },
    { icon: Braces, title: t("marketing.landing.features.schemaTitle"), text: t("marketing.landing.features.schemaText") },
    { icon: LayoutTemplate, title: t("marketing.landing.features.semanticHtmlTitle"), text: t("marketing.landing.features.semanticHtmlText") },
    { icon: FileSearch, title: t("marketing.landing.features.openGraphTitle"), text: t("marketing.landing.features.openGraphText") },
    { icon: Code2, title: t("marketing.landing.features.machineReadableTitle"), text: t("marketing.landing.features.machineReadableText") },
    { icon: Link2, title: t("marketing.landing.features.internalLinkingTitle"), text: t("marketing.landing.features.internalLinkingText") },
    { icon: Globe, title: t("marketing.landing.features.jsAccessTitle"), text: t("marketing.landing.features.jsAccessText") },
    { icon: Zap, title: t("marketing.landing.features.performanceTitle"), text: t("marketing.landing.features.performanceText") },
    { icon: Search, title: t("marketing.landing.features.urlStructureTitle"), text: t("marketing.landing.features.urlStructureText") },
    { icon: Fingerprint, title: t("marketing.landing.features.actionabilityTitle"), text: t("marketing.landing.features.actionabilityText") },
    { icon: Shield, title: t("marketing.landing.features.securityHeadersTitle"), text: t("marketing.landing.features.securityHeadersText") },
  ];

  const SECURITY_ITEMS = [
    { icon: ShieldCheck, title: t("marketing.landing.security.ssrfTitle"), text: t("marketing.landing.security.ssrfText") },
    { icon: Lock, title: t("marketing.landing.security.httpsTitle"), text: t("marketing.landing.security.httpsText") },
    { icon: Server, title: t("marketing.landing.security.rateTitle"), text: t("marketing.landing.security.rateText") },
    { icon: Zap, title: t("marketing.landing.security.timeoutTitle"), text: t("marketing.landing.security.timeoutText") },
    { icon: Boxes, title: t("marketing.landing.security.privateNetTitle"), text: t("marketing.landing.security.privateNetText") },
    { icon: Link2, title: t("marketing.landing.security.redirectTitle"), text: t("marketing.landing.security.redirectText") },
  ];

  const TRUST_NAMES = [
    t("marketing.landing.trust.name1"),
    t("marketing.landing.trust.name2"),
    t("marketing.landing.trust.name3"),
    t("marketing.landing.trust.name4"),
    t("marketing.landing.trust.name5"),
    t("marketing.landing.trust.name6"),
    t("marketing.landing.trust.name7"),
    t("marketing.landing.trust.name8"),
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/[0.07] via-primary/[0.02] to-background">
        <div className="container grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <Badge variant="secondary" className="mb-6">
              <Radar className="mr-1 h-3.5 w-3.5" />
              {t("marketing.landing.heroBadge")}
            </Badge>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              {t("marketing.landing.heroTitle")}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              {t("marketing.landing.heroSubtitle")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <Link href="/audit/new">
                  <Radar className="mr-1.5 h-4 w-4" />
                  {t("marketing.landing.runFreeAudit")}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/register">{t("marketing.createFreeAccount")}</Link>
              </Button>
            </div>
            <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                {t("marketing.landing.freeEarlyAccess")}
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-success" />
                {t("marketing.landing.noCreditCard")}
              </span>
            </div>
          </div>
          <HeroDashboard />
        </div>
      </section>

      {/* Trust */}
      <section className="border-b py-10">
        <div className="container">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t("marketing.landing.trustTitle")}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {TRUST_NAMES.map((name) => (
              <div
                key={name}
                className="flex h-10 items-center justify-center rounded-md border bg-muted/30 px-4 text-sm font-semibold text-muted-foreground"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="py-20">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {t("marketing.landing.problemTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            {t("marketing.landing.problemSubtitle")}
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PROBLEM.map((item) => (
              <Card key={item.title}>
                <CardHeader>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <CardTitle className="mt-4 text-xl">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">{item.text}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y bg-muted/30 py-20">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight">{t("marketing.howItWorks")}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            {t("marketing.landing.howItWorksSubtitle")}
          </p>
          <div className="mx-auto mt-12 grid max-w-3xl gap-4">
            {STEPS.map((step, i) => (
              <div
                key={step}
                className="flex items-center gap-4 rounded-xl border bg-card px-5 py-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-medium">{step}</span>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button asChild size="lg">
              <Link href="/register">{t("marketing.landing.createYourAccount")}</Link>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("marketing.landing.freeNoCard")}
            </p>
          </div>
        </div>
      </section>

      {/* Score section */}
      <section className="py-20">
        <div className="container grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Badge variant="secondary" className="mb-4">{t("marketing.landing.transparentScoring")}</Badge>
            <h2 className="text-3xl font-bold tracking-tight">{t("marketing.landing.scoreTitle")}</h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              {t("marketing.landing.scoreText")}
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["82 / 100", t("marketing.landing.agentReadinessLabel")],
                ["GOOD", t("dashboard.grade")],
                ["93%", t("marketing.landing.auditCoverageLabel")],
                ["HIGH", t("dashboard.confidence")],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border bg-card p-4 text-center">
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("marketing.landing.categoryScores")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {CATEGORY_SCORES.map((cat) => (
                <div key={cat.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{cat.label}</span>
                    <span className="tabular-nums text-muted-foreground">{cat.score}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${cat.score >= 75 ? "bg-success" : cat.score >= 55 ? "bg-amber-500" : "bg-destructive"}`}
                      style={{ width: `${cat.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Features */}
      <section className="border-y bg-muted/30 py-20">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight">{t("marketing.landing.featuresTitle")}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            {t("marketing.landing.featuresSubtitle")}
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <CardHeader>
                  <f.icon className="h-6 w-6 text-primary" />
                  <CardTitle className="mt-3 text-base">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">{f.text}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button asChild variant="outline">
              <Link href="/features">{t("marketing.landing.exploreAllFeatures")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-20">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            {t("marketing.landing.securityTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            {t("marketing.landing.securitySubtitle")}
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY_ITEMS.map((item) => (
              <Card key={item.title}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
                      <item.icon className="h-5 w-5" />
                    </span>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">{item.text}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button asChild variant="outline">
              <Link href="/security">{t("marketing.landing.learnAboutSecurity")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Customer reviews */}
      <PublicReviewsSection />

      {/* Early access */}
      <section className="border-y bg-muted/30 py-20">
        <div className="container text-center">
          <Badge variant="secondary" className="mb-4">{t("marketing.landing.freeEarlyAccess")}</Badge>
          <h2 className="text-center text-3xl font-bold tracking-tight">{t("marketing.landing.earlyAccessTitle")}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            {t("marketing.landing.earlyAccessText")}
          </p>
          <div className="mx-auto mt-8 flex max-w-md flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">{t("marketing.createFreeAccount")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">{t("marketing.login")}</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{t("marketing.landing.noCreditCard")}</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-primary py-20 text-primary-foreground">
        <div className="container text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {t("marketing.landing.finalCtaTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80">
            {t("marketing.landing.finalCtaText")}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" variant="secondary" className="bg-background text-foreground hover:bg-background/90">
              <Link href="/register">{t("marketing.createFreeAccount")}</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
              <Link href="/login">{t("marketing.login")}</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-primary-foreground/70">
            {t("marketing.landing.finalCtaNote")}
          </p>
        </div>
      </section>
    </div>
  );
}
