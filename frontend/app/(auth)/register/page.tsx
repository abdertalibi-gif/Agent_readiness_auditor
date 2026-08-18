"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitedEmail = searchParams.get("email") ?? "";
  const invitedToken = searchParams.get("token") ?? "";
  const { register } = useAuth();
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("fullName") ?? "").trim();
    const company = String(form.get("company") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (!name) {
      toast.error(t("auth.enterName"));
      return;
    }
    if (password.length < 8) {
      toast.error(t("auth.passwordMin"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      await register({
        name,
        email,
        password,
        company_name: company || undefined,
        preferred_language: locale,
      });
      // Invited users are auto-connected to the pending invitation on the
      // server, so land them on the team page after login.
      router.push(invitedToken ? "/login?registered=1&next=/team" : "/login?registered=1");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.registerLoading"));
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("auth.registerTitle")}</CardTitle>
        <CardDescription>
          {invitedToken
            ? t("auth.registerInvite")
            : invitedEmail
              ? t("auth.registerInvitedEmail", { email: invitedEmail })
              : t("auth.registerSubtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">{t("auth.fullName")}</Label>
            <Input id="fullName" name="fullName" placeholder={t("auth.fullNamePlaceholder")} autoComplete="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">{t("auth.company")}</Label>
            <Input id="company" name="company" placeholder={t("auth.companyPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={t("auth.emailPlaceholder")}
              autoComplete="email"
              defaultValue={invitedEmail}
              required
              readOnly={Boolean(invitedEmail)}
            />
            {invitedEmail && (
              <p className="text-xs text-muted-foreground">
                {t("auth.fromInvitation")}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" name="password" type="password" placeholder={t("auth.newPasswordPlaceholder")} autoComplete="new-password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
              <Input id="confirm" name="confirm" type="password" placeholder={t("auth.confirmPasswordPlaceholder")} autoComplete="new-password" required />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            <UserPlus className="h-4 w-4" />
              {loading ? t("auth.registerLoading") : t("auth.createFreeAccount")}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("auth.freeEarlyAccess")}
        </p>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("auth.alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t("auth.login")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}