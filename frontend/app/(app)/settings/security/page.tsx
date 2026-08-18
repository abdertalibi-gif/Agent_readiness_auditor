"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export default function SecuritySettingsPage() {
  const { t } = useI18n();
  const [mfa, setMfa] = useState(false);
  const [sessionAlerts, setSessionAlerts] = useState(true);

  function changePassword(e: React.FormEvent) {
    e.preventDefault();
    toast.success(t("settingsSecurity.passwordUpdated"));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.security")}</h1>
        <p className="text-sm text-muted-foreground">{t("settingsSecurity.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.changePassword")}</CardTitle>
          <CardDescription>{t("settingsSecurity.passwordHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current">{t("settingsSecurity.currentPassword")}</Label>
              <Input id="current" type="password" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new">{t("settingsSecurity.newPassword")}</Label>
                <Input id="new" type="password" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">{t("settingsSecurity.confirmNewPassword")}</Label>
                <Input id="confirm" type="password" required />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit">{t("settingsSecurity.updatePassword")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.twoFactor")}</CardTitle>
          <CardDescription>{t("settingsSecurity.twoFactorDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{t("settings.authenticatorApp")}</p>
              <p className="text-sm text-muted-foreground">{t("settingsSecurity.authenticatorDescription")}</p>
            </div>
            <Switch checked={mfa} onCheckedChange={setMfa} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{t("settings.loginAlerts")}</p>
              <p className="text-sm text-muted-foreground">{t("settingsSecurity.loginAlertsDescription")}</p>
            </div>
            <Switch checked={sessionAlerts} onCheckedChange={setSessionAlerts} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">{t("settings.dangerZone")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("settingsSecurity.dangerZoneDescription")}
          </p>
          <Separator />
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => toast.info(t("settingsSecurity.signedOutSessions"))}>
              {t("settings.signOutSessions")}
            </Button>
            <Button variant="destructive" onClick={() => toast.info(t("settingsSecurity.deleteAccountInfo"))}>
              {t("settings.deleteAccount")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
