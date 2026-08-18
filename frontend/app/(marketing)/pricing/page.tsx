"use client";

import Link from "next/link";
import { Check } from "lucide-react";

import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";

export default function PricingPage() {
  const { t } = useI18n();

  const INCLUDED = [
    t("marketing.pricing.included1"),
    t("marketing.pricing.included2"),
    t("marketing.pricing.included3"),
    t("marketing.pricing.included4"),
    t("marketing.pricing.included5"),
    t("marketing.pricing.included6"),
    t("marketing.pricing.included7"),
    t("marketing.pricing.included8"),
  ];

  return (
    <div>
      <PageHero
        badge={t("marketing.pricing.freeBadge")}
        title={t("marketing.pricing.heroTitle")}
        description={t("marketing.pricing.heroDescription")}
      />

      <section className="py-16">
        <div className="container">
          <div className="mx-auto max-w-lg">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{t("marketing.pricing.earlyAccess")}</CardTitle>
                </div>
                <div className="mt-2 text-4xl font-bold">
                  $0
                  <span className="ml-1 text-sm font-normal text-muted-foreground">{t("marketing.pricing.duringEarlyAccess")}</span>
                </div>
                <CardDescription>{t("marketing.pricing.everythingIncluded")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <ul className="space-y-2.5 text-sm">
                  {INCLUDED.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-auto w-full">
                  <Link href="/register">{t("marketing.createFreeAccount")}</Link>
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {t("marketing.pricing.noCardHaveAccount")}{" "}
                  <Link href="/login" className="font-medium text-primary hover:underline">
                    {t("marketing.pricing.logIn")}
                  </Link>
                </p>
              </CardContent>
            </Card>
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {t("marketing.pricing.allAuditsInclude")}
          </p>
        </div>
      </section>
    </div>
  );
}