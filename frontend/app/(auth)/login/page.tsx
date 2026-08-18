"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { LogIn } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("registered") === "1") {
      toast.success(t("auth.accountCreated"));
    }
    if (searchParams.get("reset") === "1") {
      toast.success(t("auth.resetSuccess"));
    }
    if (searchParams.get("suspended") === "1") {
      toast.error(t("auth.suspended"));
    }
  }, [searchParams, t]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      toast.error(t("auth.enterEmailPassword"));
      return;
    }

    setLoading(true);
    try {
      await login({ email, password });
      toast.success(t("auth.welcomeBackToast"));
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/") ? next : "/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.invalidCredentials"));
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("auth.loginTitle")}</CardTitle>
        <CardDescription>{t("auth.loginSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" name="email" type="email" placeholder={t("auth.emailPlaceholder")} autoComplete="email" required />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>
            <Input id="password" name="password" type="password" placeholder="••••••••" autoComplete="current-password" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            <LogIn className="h-4 w-4" />
            {loading ? t("auth.loginLoading") : t("auth.login")}
          </Button>
        </form>
        <div className="mt-4">
          <Button asChild variant="outline" className="w-full">
            <Link href="/register">{t("auth.createFreeAccount")}</Link>
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("auth.freeEarlyAccess")}
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}