"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

import { api } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const token = searchParams.get("token") ?? "";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (password.length < 8) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordsDoNotMatch"));
      return;
    }
    if (!token) {
      toast.error(t("auth.invalidResetLink"));
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password);
      toast.success(t("auth.resetSuccess"));
      router.push("/login?reset=1");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.resetPassword"));
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("auth.invalidLink")}</CardTitle>
          <CardDescription>
            {t("auth.invalidLinkSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/forgot-password">{t("auth.requestNewLink")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("auth.resetPasswordTitle")}</CardTitle>
        <CardDescription>{t("auth.resetPasswordSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("auth.newPasswordLabel")}</Label>
            <div className="relative">
              <KeyRound className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="password" name="password" type="password" placeholder={t("auth.newPasswordPlaceholder")} className="ps-9" autoComplete="new-password" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
            <Input id="confirm" name="confirm" type="password" placeholder={t("auth.confirmPasswordPlaceholder")} autoComplete="new-password" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.resetPasswordLoading") : t("auth.resetPasswordButton")}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t("auth.backToLogin")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
