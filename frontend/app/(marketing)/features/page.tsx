"use client";

import {
  Braces,
  Code2,
  FileSearch,
  Fingerprint,
  Globe,
  LayoutTemplate,
  Link2,
  Search,
  Zap,
} from "lucide-react";

import { PageHero } from "@/components/marketing/page-hero";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

export default function FeaturesPage() {
  const { t } = useI18n();

  const SECTIONS = [
    {
      icon: Search,
      title: t("marketing.featuresPage.discoveryTitle"),
      text: t("marketing.featuresPage.discoveryText"),
      signals: [t("marketing.featuresPage.discoverySig1"), t("marketing.featuresPage.discoverySig2"), t("marketing.featuresPage.discoverySig3"), t("marketing.featuresPage.discoverySig4")],
    },
    {
      icon: Globe,
      title: t("marketing.featuresPage.crawlabilityTitle"),
      text: t("marketing.featuresPage.crawlabilityText"),
      signals: [t("marketing.featuresPage.crawlabilitySig1"), t("marketing.featuresPage.crawlabilitySig2"), t("marketing.featuresPage.crawlabilitySig3"), t("marketing.featuresPage.crawlabilitySig4")],
    },
    {
      icon: LayoutTemplate,
      title: t("marketing.featuresPage.semanticStructureTitle"),
      text: t("marketing.featuresPage.semanticStructureText"),
      signals: [t("marketing.featuresPage.semanticStructureSig1"), t("marketing.featuresPage.semanticStructureSig2"), t("marketing.featuresPage.semanticStructureSig3"), t("marketing.featuresPage.semanticStructureSig4")],
    },
    {
      icon: Braces,
      title: t("marketing.featuresPage.structuredDataTitle"),
      text: t("marketing.featuresPage.structuredDataText"),
      signals: [t("marketing.featuresPage.structuredDataSig1"), t("marketing.featuresPage.structuredDataSig2"), t("marketing.featuresPage.structuredDataSig3"), t("marketing.featuresPage.structuredDataSig4")],
    },
    {
      icon: Code2,
      title: t("marketing.featuresPage.contentAccessTitle"),
      text: t("marketing.featuresPage.contentAccessText"),
      signals: [t("marketing.featuresPage.contentAccessSig1"), t("marketing.featuresPage.contentAccessSig2"), t("marketing.featuresPage.contentAccessSig3"), t("marketing.featuresPage.contentAccessSig4")],
    },
    {
      icon: Link2,
      title: t("marketing.featuresPage.navigationTitle"),
      text: t("marketing.featuresPage.navigationText"),
      signals: [t("marketing.featuresPage.navigationSig1"), t("marketing.featuresPage.navigationSig2"), t("marketing.featuresPage.navigationSig3"), t("marketing.featuresPage.navigationSig4")],
    },
    {
      icon: Zap,
      title: t("marketing.featuresPage.actionabilityTitle"),
      text: t("marketing.featuresPage.actionabilityText"),
      signals: [t("marketing.featuresPage.actionabilitySig1"), t("marketing.featuresPage.actionabilitySig2"), t("marketing.featuresPage.actionabilitySig3"), t("marketing.featuresPage.actionabilitySig4")],
    },
    {
      icon: Fingerprint,
      title: t("marketing.featuresPage.securityTechnicalTitle"),
      text: t("marketing.featuresPage.securityTechnicalText"),
      signals: [t("marketing.featuresPage.securityTechnicalSig1"), t("marketing.featuresPage.securityTechnicalSig2"), t("marketing.featuresPage.securityTechnicalSig3"), t("marketing.featuresPage.securityTechnicalSig4")],
    },
    {
      icon: FileSearch,
      title: t("marketing.featuresPage.reportingTitle"),
      text: t("marketing.featuresPage.reportingText"),
      signals: [t("marketing.featuresPage.reportingSig1"), t("marketing.featuresPage.reportingSig2"), t("marketing.featuresPage.reportingSig3"), t("marketing.featuresPage.reportingSig4")],
    },
  ];

  return (
    <div>
      <PageHero
        badge={t("marketing.features")}
        title={t("marketing.featuresPage.heroTitle")}
        description={t("marketing.featuresPage.heroDescription")}
      />
      <section className="py-16">
        <div className="container grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Card key={s.title} className="flex flex-col">
              <CardHeader>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </span>
                <CardTitle className="mt-4 text-lg">{s.title}</CardTitle>
                <CardDescription className="text-sm">{s.text}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <div className="flex flex-wrap gap-2">
                  {s.signals.map((sig) => (
                    <span
                      key={sig}
                      className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                    >
                      {sig}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section className="pb-20">
        <div className="container flex flex-col items-center gap-4 text-center">
          <h2 className="text-2xl font-bold tracking-tight">{t("marketing.featuresPage.scoreInAction")}</h2>
          <Button asChild size="lg">
            <Link href="/register">{t("marketing.featuresPage.createAccount")}</Link>
          </Button>
          <p className="text-xs text-muted-foreground">{t("marketing.featuresPage.freeNote")}</p>
        </div>
      </section>
    </div>
  );
}
