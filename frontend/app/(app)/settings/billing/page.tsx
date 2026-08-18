"use client";

import { CreditCard, Sparkles, Crown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isMonetizationEnabled } from "@/lib/config";

export default function BillingSettingsPage() {
  const { t } = useI18n();
  const PERIOD = t("settingsBilling.perMonth");
  if (!isMonetizationEnabled()) {
    const FREE_PLAN = {
      name: t("settingsBilling.freePlanName"),
      price: "$0",
      period: PERIOD,
      features: [
        t("settingsBilling.freeFeatureUnlimitedAudits"),
        t("settingsBilling.freeFeatureCompleteReports"),
        t("settingsBilling.freeFeatureShopifyAnalysis"),
        t("settingsBilling.freeFeatureAiAnalysis"),
        t("settingsBilling.freeFeaturePdfExport"),
        t("settingsBilling.freeFeatureAuditHistory"),
        t("settingsBilling.freeFeatureAllRecommendations"),
        t("settingsBilling.freeFeatureAllScores"),
        t("settingsBilling.freeFeatureTechnicalAnalysis"),
      ],
    };

    const FUTURE_PLANS = [
      {
        name: "Pro",
        price: "$49",
        period: PERIOD,
        features: [
          t("settingsBilling.proFeatureTeam"),
          t("settingsBilling.proFeaturePrioritySupport"),
          t("settingsBilling.proFeatureBranding"),
          t("settingsBilling.proFeatureAdvancedApi"),
        ],
      },
      {
        name: t("settingsBilling.businessPlanName"),
        price: t("settingsBilling.customPrice"),
        period: "",
        features: [
          t("settingsBilling.bizFeatureSso"),
          t("settingsBilling.bizFeatureManager"),
          t("settingsBilling.bizFeatureAuditLogExport"),
          t("settingsBilling.bizFeatureContracts"),
        ],
      },
    ];

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("settings.billing")}</h1>
          <p className="text-sm text-muted-foreground">{t("settingsBilling.disabledSubtitle")}</p>
        </div>

        <Card className="border-success bg-success/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-success" />
              <CardTitle className="text-base text-success">{t("settingsBilling.freeEarlyAccess")}</CardTitle>
            </div>
            <CardDescription>{t("settingsBilling.allFreeDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm text-muted-foreground">
              {FREE_PLAN.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="h-4 w-4 text-success">✓</span> {f}
                </li>
              ))}
            </ul>
            <p className="text-sm text-success font-medium">
              {t("settingsBilling.feedbackPrompt")}
            </p>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Crown className="h-4 w-4 text-muted-foreground" /> {t("settingsBilling.futurePlans")}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {FUTURE_PLANS.map((plan) => (
              <Card key={plan.name} className="border-muted bg-muted/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                  </div>
                  <div className="text-2xl font-bold">
                    {plan.price}
                    <span className="text-sm font-normal text-muted-foreground">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <span className="h-4 w-4 text-muted-foreground">→</span> {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Monetization enabled - show full billing page with plans
  const PLANS = [
    {
      name: t("settingsBilling.starterPlanName"),
      price: "$0",
      period: PERIOD,
      current: true,
      features: [
        t("settingsBilling.starterFeatureAudits"),
        t("settingsBilling.starterFeatureWorkspace"),
        t("settingsBilling.starterFeatureReports"),
        t("settingsBilling.starterFeatureHistory"),
      ],
    },
    {
      name: t("settingsBilling.growthPlanName"),
      price: "$49",
      period: PERIOD,
      features: [
        t("settingsBilling.growthFeatureAudits"),
        t("settingsBilling.growthFeatureWorkspaces"),
        t("settingsBilling.growthFeaturePrioritySupport"),
        t("settingsBilling.growthFeatureBranding"),
      ],
    },
    {
      name: t("settingsBilling.enterprisePlanName"),
      price: t("settingsBilling.customPrice"),
      period: "",
      features: [
        t("settingsBilling.entFeatureUnlimited"),
        t("settingsBilling.entFeatureSso"),
        t("settingsBilling.entFeatureManager"),
        t("settingsBilling.entFeatureAuditLogExport"),
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.billing")}</h1>
        <p className="text-sm text-muted-foreground">{t("settingsBilling.enabledSubtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <Card key={plan.name} className={plan.current ? "border-primary ring-1 ring-primary" : ""}>
            <CardHeader>
              <div className="flex items-center gap-2">
                {plan.current ? (
                  <Sparkles className="h-4 w-4 text-primary" />
                ) : (
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                )}
                <CardTitle className="text-base">{plan.name}</CardTitle>
              </div>
              <div className="text-2xl font-bold">
                {plan.price}
                <span className="text-sm font-normal text-muted-foreground">{plan.period}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm text-muted-foreground">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="h-4 w-4 text-success">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Button className="w-full" variant={plan.current ? "outline" : "default"} disabled={plan.current}>
                {plan.current ? t("settingsBilling.currentPlan") : t("settingsBilling.choosePlan", { name: plan.name })}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
