"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getSession } from "@/lib/auth";
import { useI18n } from "@/components/i18n-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProfileSettingsPage() {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const session = getSession();
    if (session) {
      const frame = requestAnimationFrame(() => {
        setName(session.user.name);
        setEmail(session.user.email);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    toast.success(t("settings.profileUpdated"));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.profile")}</h1>
        <p className="text-sm text-muted-foreground">{t("settingsProfile.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.personalInformation")}</CardTitle>
          <CardDescription>{t("settingsProfile.appearanceDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex items-center gap-4">
            <Avatar className="h-16 w-16 text-lg">
              <AvatarFallback>
                {name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{name || t("settingsProfile.yourName")}</p>
              <p className="text-sm text-muted-foreground">{email || t("settingsProfile.emailPlaceholder")}</p>
            </div>
          </div>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">{t("settings.name")}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("settings.email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button type="submit">{t("settings.saveChanges")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
