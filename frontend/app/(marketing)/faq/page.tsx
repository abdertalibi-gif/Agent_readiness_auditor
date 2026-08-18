"use client";

import Link from "next/link";

import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";

export default function FaqPage() {
  const { t } = useI18n();

  const FAQS = [
    {
      q: t("marketing.faq.item1q"),
      a: t("marketing.faq.item1a"),
    },
    {
      q: t("marketing.faq.item2q"),
      a: t("marketing.faq.item2a"),
    },
    {
      q: t("marketing.faq.item3q"),
      a: t("marketing.faq.item3a"),
    },
    {
      q: t("marketing.faq.item4q"),
      a: t("marketing.faq.item4a"),
    },
    {
      q: t("marketing.faq.item5q"),
      a: t("marketing.faq.item5a"),
    },
    {
      q: t("marketing.faq.item6q"),
      a: t("marketing.faq.item6a"),
    },
    {
      q: t("marketing.faq.item7q"),
      a: t("marketing.faq.item7a"),
    },
    {
      q: t("marketing.faq.item8q"),
      a: t("marketing.faq.item8a"),
    },
    {
      q: t("marketing.faq.item9q"),
      a: t("marketing.faq.item9a"),
    },
    {
      q: t("marketing.faq.item10q"),
      a: t("marketing.faq.item10a"),
    },
    {
      q: t("marketing.faq.item11q"),
      a: t("marketing.faq.item11a"),
    },
    {
      q: t("marketing.faq.item12q"),
      a: t("marketing.faq.item12a"),
    },
  ];

  return (
    <div>
      <PageHero
        badge={t("marketing.faqBadge")}
        title={t("marketing.faqPage.heroTitle")}
        description={t("marketing.faqPage.heroDescription")}
      />
      <section className="py-16">
        <div className="container max-w-3xl">
          <Accordion type="single" collapsible>
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`}>
                <AccordionTrigger className="text-base">{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <Card className="mt-10">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-medium">{t("marketing.faqPage.stillQuestions")}</p>
              <p className="text-sm text-muted-foreground">{t("marketing.faqPage.teamHappy")}</p>
              <Link href="/contact" className="text-sm font-semibold text-primary hover:underline">
                {t("marketing.faqPage.contactUs")} →
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
      <CtaBand />
    </div>
  );
}
