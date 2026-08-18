"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

export function CtaBand() {
  const { t } = useI18n();
  return (
    <section className="border-t bg-primary py-16 text-primary-foreground">
      <div className="container text-center">
        <h2 className="text-3xl font-bold tracking-tight">{t("marketing.ctaBand.title")}</h2>
        <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80">
          {t("marketing.ctaBand.subtitle")}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" variant="secondary" className="bg-background text-foreground hover:bg-background/90">
            <Link href="/register">
              {t("marketing.createFreeAccount")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
            <Link href="/login">{t("marketing.login")}</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-primary-foreground/70">{t("marketing.ctaBand.freeNote")}</p>
      </div>
    </section>
  );
}
