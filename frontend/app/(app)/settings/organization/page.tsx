"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getSession } from "@/lib/auth";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function OrganizationSettingsPage() {
  const { t } = useI18n();
  const [orgName, setOrgName] = useState("");
  const [domain, setDomain] = useState("");

  useEffect(() => {
    const session = getSession();
    if (session) {
      const frame = requestAnimationFrame(() => setOrgName(session.orgName));
      return () => cancelAnimationFrame(frame);
    }
  }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    toast.success(t("settingsOrg.saved"));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.organizationTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("settingsOrg.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.workspaceInformation")}</CardTitle>
          <CardDescription>{t("settingsOrg.workspaceInfoDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="org">{t("settings.organizationName")}</Label>
              <Input id="org" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="domain">{t("settings.verifiedDomain")}</Label>
              <Input id="domain" placeholder={t("settingsOrg.domainPlaceholder")} value={domain} onChange={(e) => setDomain(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                {t("settingsOrg.domainHint")}
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="submit">{t("settings.saveChanges")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.dataPrivacy")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("settingsOrg.dataPrivacyDescription")}
          </p>
          <Separator />
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => toast.success(t("settingsOrg.exportStarted"))}>
              {t("settings.exportData")}
            </Button>
            <Button variant="destructive" onClick={() => toast.info(t("settingsOrg.workspaceDeletionInfo"))}>
              {t("settings.deleteWorkspace")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
