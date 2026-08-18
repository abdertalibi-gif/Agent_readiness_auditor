"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";

export default function DocsPage() {
  const { t } = useI18n();

  const DOC_SECTIONS = [
    {
      title: t("marketing.docsPage.gettingStarted"),
      href: "/audit",
      text: t("marketing.docsPage.gettingStartedText"),
    },
    {
      title: t("marketing.docsPage.score"),
      href: "/docs/scoring",
      text: t("marketing.docsPage.scoreText"),
    },
    {
      title: t("marketing.docsPage.findings"),
      href: "/docs/findings",
      text: t("marketing.docsPage.findingsText"),
    },
    {
      title: t("marketing.docsPage.api"),
      href: "/docs/api",
      text: t("marketing.docsPage.apiText"),
    },
  ];

  return (
    <div className="container max-w-4xl py-12">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{t("marketing.documentation")}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{t("marketing.docsPage.subtitle")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {DOC_SECTIONS.map((doc) => (
          <Card key={doc.href}>
            <CardHeader>
              <CardTitle className="text-base">{doc.title}</CardTitle>
              <CardDescription>{doc.text}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <Link href={doc.href}>
                  {t("common.view")} <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
