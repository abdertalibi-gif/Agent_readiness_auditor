"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send, ShieldCheck } from "lucide-react";

import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/i18n-provider";


export default function ContactPage() {
  const { t } = useI18n();
  return (
    <div>
      <PageHero
        badge={t("marketing.contact")}
        title={t("marketing.contactPage.heroTitle")}
        description={t("marketing.contactPage.heroDescription")}
      />
      <section className="py-16">
        <div className="container grid gap-10 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ContactForm />
          </div>
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("marketing.contactPage.salesTitle")}</CardTitle>
                <CardDescription>
                  {t("marketing.contactPage.salesDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                sales@agent-readiness.dev
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("marketing.contactPage.supportTitle")}</CardTitle>
                <CardDescription>{t("marketing.contactPage.supportDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                support@agent-readiness.dev
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-success" /> {t("marketing.security")}
                </CardTitle>
                <CardDescription>{t("marketing.contactPage.securityDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                security@agent-readiness.dev
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContactForm() {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      toast.success(t("marketing.contactPage.messageSent"), {
        description: t("marketing.contactPage.messageSentDesc"),
      });
      (e.target as HTMLFormElement).reset();
    }, 800);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("marketing.contactPage.sendMessage")}</CardTitle>
        <CardDescription>
          {t("marketing.contactPage.formDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("marketing.contactPage.name")}</Label>
            <Input id="name" name="name" placeholder={t("marketing.contactPage.namePlaceholder")} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">{t("marketing.contactPage.company")}</Label>
            <Input id="company" name="company" placeholder={t("marketing.contactPage.companyPlaceholder")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="email">{t("marketing.contactPage.businessEmail")}</Label>
            <Input id="email" name="email" type="email" placeholder={t("marketing.contactPage.emailPlaceholder")} required />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="subject">{t("marketing.contactPage.subject")}</Label>
            <Select>
              <SelectTrigger id="subject" className="w-full">
                <SelectValue placeholder={t("marketing.contactPage.subjectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">{t("marketing.contactPage.subjectSales")}</SelectItem>
                <SelectItem value="enterprise">{t("marketing.enterprise")}</SelectItem>
                <SelectItem value="support">{t("marketing.contactPage.subjectSupport")}</SelectItem>
                <SelectItem value="security">{t("marketing.security")}</SelectItem>
                <SelectItem value="other">{t("marketing.contactPage.subjectOther")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="message">{t("marketing.contactPage.message")}</Label>
            <Textarea id="message" name="message" rows={5} placeholder={t("marketing.contactPage.messagePlaceholder")} required />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
              <Send className="h-4 w-4" />
              {submitting ? t("common.loading") : t("marketing.contactPage.sendMessage")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
