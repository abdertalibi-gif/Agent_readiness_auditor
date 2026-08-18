"use client";

import { CheckCircle2, Globe, ListChecks, ScanSearch, ShieldCheck, BarChart3, Lightbulb, FileText, Workflow } from "lucide-react";

import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";

export default function HowItWorksPage() {
  const { t } = useI18n();

  const TIMELINE = [
    { icon: Globe, title: t("marketing.howItWorksPage.enterUrl"), text: t("marketing.howItWorksPage.enterUrlText") },
    { icon: ShieldCheck, title: t("marketing.howItWorksPage.securityValidation"), text: t("marketing.howItWorksPage.securityValidationText") },
    { icon: ScanSearch, title: t("marketing.howItWorksPage.crawlDiscovery"), text: t("marketing.howItWorksPage.crawlDiscoveryText") },
    { icon: Workflow, title: t("marketing.howItWorksPage.pageAnalysis"), text: t("marketing.howItWorksPage.pageAnalysisText") },
    { icon: ListChecks, title: t("marketing.howItWorksPage.checks"), text: t("marketing.howItWorksPage.checksText") },
    { icon: BarChart3, title: t("marketing.howItWorksPage.scoreCalc"), text: t("marketing.howItWorksPage.scoreCalcText") },
    { icon: Lightbulb, title: t("marketing.howItWorksPage.recommendations"), text: t("marketing.howItWorksPage.recommendationsText") },
    { icon: FileText, title: t("marketing.howItWorksPage.report"), text: t("marketing.howItWorksPage.reportText") },
  ];

  return (
    <div>
      <PageHero
        badge={t("marketing.howItWorks")}
        title={t("marketing.howItWorksPage.heroTitle")}
        description={t("marketing.howItWorksPage.heroDescription")}
      />

      <section className="py-16">
        <div className="container">
          <div className="mx-auto max-w-3xl">
            {TIMELINE.map((step, i) => (
              <div key={step.title} className="relative flex gap-5 pb-10 last:pb-0">
                <div className="flex flex-col items-center">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-card text-primary shadow-sm">
                    <step.icon className="h-5 w-5" />
                  </span>
                  {i < TIMELINE.length - 1 && <span className="mt-2 w-px flex-1 bg-border" />}
                </div>
                <div className="pb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-primary">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="container">
          <Card>
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-success" /> {t("marketing.howItWorksPage.realProgress")}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-success" /> {t("marketing.howItWorksPage.realEvidence")}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-success" /> {t("marketing.howItWorksPage.neverFabricated")}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-success" /> {t("marketing.howItWorksPage.robotsRespected")}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <CtaBand />
    </div>
  );
}
