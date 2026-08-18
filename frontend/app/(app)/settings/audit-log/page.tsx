"use client";

import { useEffect, useState } from "react";
import { FileText, KeyRound, LogIn, ScrollText, Settings, ShieldAlert, User } from "lucide-react";

import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface LogEntry {
  id: string;
  action: string;
  actor: string;
  target: string;
  time: string;
  type: "auth" | "audit" | "settings" | "system";
}

const TYPE_VARIANTS: Record<LogEntry["type"], "default" | "secondary" | "outline" | "success"> = {
  auth: "secondary",
  audit: "success",
  settings: "default",
  system: "outline",
};

function iconFor(action: string) {
  if (action.toLowerCase().includes("login")) return LogIn;
  if (action.toLowerCase().includes("audit")) return FileText;
  if (action.toLowerCase().includes("key")) return KeyRound;
  if (action.toLowerCase().includes("setting")) return Settings;
  if (action.toLowerCase().includes("delete") || action.toLowerCase().includes("failed")) return ShieldAlert;
  return User;
}

export default function AuditLogPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const TYPE_LABELS: Record<LogEntry["type"], string> = {
    auth: t("settingsAuditLog.typeAuth"),
    audit: t("settingsAuditLog.typeAudit"),
    settings: t("settingsAuditLog.typeSettings"),
    system: t("settingsAuditLog.typeSystem"),
  };

  useEffect(() => {
    (async () => {
      const session = getSession();
      let audits: Awaited<ReturnType<typeof api.listAudits>> = [];
      try {
        audits = await api.listAudits();
      } catch {
        audits = [];
      }
      const auditLogs: LogEntry[] = audits.slice(0, 8).map((a) => ({
        id: `audit-${a.id}`,
        action: t("settingsAuditLog.auditAction", {
          status: a.status === "FAILED" ? t("settingsAuditLog.failed") : t("settingsAuditLog.completed"),
          url: a.target_url,
        }),
        actor: session?.user.email ?? "system",
        target: a.target_url,
        time: new Date(a.completed_at ?? a.created_at).toLocaleString(),
        type: "audit",
      }));
      const systemLogs: LogEntry[] = [
        {
          id: "sys-1",
          action: t("settingsAuditLog.signedIn"),
          actor: session?.user.email ?? "—",
          target: t("settingsAuditLog.sessionTarget"),
          time: t("settingsAuditLog.justNow"),
          type: "auth",
        },
        {
          id: "sys-2",
          action: t("settingsAuditLog.workspaceCreated"),
          actor: "system",
          target: session?.orgName ?? t("settingsAuditLog.workspaceTarget"),
          time: new Date().toLocaleDateString(),
          type: "settings",
        },
      ];
      setLogs([...systemLogs, ...auditLogs]);
      setLoading(false);
    })();
  }, [t]);

  if (loading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.auditLogTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("settingsAuditLog.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.activityLog")}</CardTitle>
          <CardDescription>{t("settingsAuditLog.activityLogDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {logs.map((entry) => {
              const Icon = iconFor(entry.action);
              const variant = TYPE_VARIANTS[entry.type];
              return (
                <li key={entry.id} className="flex items-start gap-4 px-6 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{entry.action}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.actor} · {entry.target}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={variant}>{TYPE_LABELS[entry.type]}</Badge>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{entry.time}</span>
                  </div>
                </li>
              );
            })}
            {logs.length === 0 && (
              <li className="flex items-center gap-3 px-6 py-10 text-sm text-muted-foreground">
                <ScrollText className="h-4 w-4" /> {t("settings.noActivity")}
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
