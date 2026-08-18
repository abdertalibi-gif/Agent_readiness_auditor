"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { api } from "@/lib/api";
import type { AdminAuditLog } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

const ACTIONS = ["", "user.suspend", "user.unsuspend", "user.delete", "user.restore", "user.role", "workspace.member.role", "workspace.member.remove", "invitation.cancel"];

export default function AdminAuditLogsPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (action?: string) => {
    setLoading(true);
    try {
      setLogs((await api.adminAuditLogs(action || undefined)).items);
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const data = await api.adminAuditLogs();
        if (!cancelled) setLogs(data.items);
      } catch {
        // swallow
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t("admin.auditLogs.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.auditLogs.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ACTIONS.map((a) => (
          <Button
            key={a || "all"}
            size="sm"
            variant={filter === a ? "default" : "outline"}
            onClick={() => {
              setFilter(a);
              load(a || undefined);
            }}
          >
            {a || t("common.all")}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> {t("admin.auditLogs.entries", { count: logs.length })}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("admin.auditLogs.loading")}</div>
          ) : logs.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("admin.auditLogs.none")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-6 py-3 font-medium">{t("admin.auditLogs.timestamp")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.auditLogs.actor")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.auditLogs.action")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.auditLogs.target")}</th>
                    <th className="px-6 py-3 font-medium">{t("admin.auditLogs.ip")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/50">
                      <td className="whitespace-nowrap px-6 py-3 text-muted-foreground">{fmtDate(l.created_at)}</td>
                      <td className="px-6 py-3">{l.actor_email ?? l.actor_id ?? t("admin.auditLogs.system")}</td>
                      <td className="px-6 py-3">
                        <Badge variant="outline" className="font-mono">{l.action}</Badge>
                      </td>
                      <td className="px-6 py-3">
                        <div className="text-xs text-muted-foreground">
                          {l.target_user_id ? <>{t("admin.auditLogs.userTarget", { id: l.target_user_id.slice(0, 8) })}</> : null}
                          {l.target_workspace_id ? <>{l.target_user_id ? ", " : ""}{t("admin.auditLogs.workspaceTarget", { id: l.target_workspace_id.slice(0, 8) })}</> : null}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{l.ip_address ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
