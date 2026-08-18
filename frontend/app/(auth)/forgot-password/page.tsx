"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Mail } from "lucide-react";

import { api } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    if (!email) {
      toast.error(t("auth.enterEmailPassword"));
      return;
    }

    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.loading"));
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("auth.forgotPasswordTitle")}</CardTitle>
        <CardDescription>
          {t("auth.forgotPasswordSubtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="rounded-md bg-success/10 p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">{t("auth.checkInbox")}</p>
            <p className="mt-1">
              {t("auth.checkInboxSubtitle")}
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <div className="relative">
                <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" name="email" type="email" placeholder={t("auth.emailPlaceholder")} className="ps-9" required />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.forgotPasswordLoading") : t("auth.forgotPasswordButton")}
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t("auth.backToLogin")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
