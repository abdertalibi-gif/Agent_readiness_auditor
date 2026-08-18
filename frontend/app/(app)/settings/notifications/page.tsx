"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function NotificationsSettingsPage() {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState({
    auditComplete: true,
    auditFailed: true,
    weeklyDigest: false,
    productUpdates: true,
  });

  function toggle(key: keyof typeof prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.notifications")}</h1>
        <p className="text-sm text-muted-foreground">{t("settingsNotifications.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.auditNotifications")}</CardTitle>
          <CardDescription>{t("settingsNotifications.auditNotificationsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{t("settings.auditCompleted")}</p>
              <p className="text-sm text-muted-foreground">{t("settingsNotifications.auditCompletedDescription")}</p>
            </div>
            <Switch checked={prefs.auditComplete} onCheckedChange={() => toggle("auditComplete")} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{t("settings.auditFailed")}</p>
              <p className="text-sm text-muted-foreground">{t("settingsNotifications.auditFailedDescription")}</p>
            </div>
            <Switch checked={prefs.auditFailed} onCheckedChange={() => toggle("auditFailed")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.emailPreferences")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{t("settings.weeklyDigest")}</p>
              <p className="text-sm text-muted-foreground">{t("settingsNotifications.weeklyDigestDescription")}</p>
            </div>
            <Switch checked={prefs.weeklyDigest} onCheckedChange={() => toggle("weeklyDigest")} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{t("settings.productUpdates")}</p>
              <p className="text-sm text-muted-foreground">{t("settingsNotifications.productUpdatesDescription")}</p>
            </div>
            <Switch checked={prefs.productUpdates} onCheckedChange={() => toggle("productUpdates")} />
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={() => toast.success(t("settingsNotifications.saved"))}>{t("settings.savePreferences")}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border p-4">
        <Label className="text-xs text-muted-foreground">{t("settingsNotifications.emailLabel")}</Label>
        <p className="mt-1 text-sm">{t("settingsNotifications.emailHint")}</p>
      </div>
    </div>
  );
}
