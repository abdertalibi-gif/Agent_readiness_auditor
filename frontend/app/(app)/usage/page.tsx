"use client";

import { useEffect, useState } from "react";
import { Activity, FileCheck2, Globe, Zap } from "lucide-react";

import { api } from "@/lib/api";
import type { AuditOut } from "@/lib/types";
import { useI18n } from "@/components/i18n-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Zap; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 pt-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function UsagePage() {
  const { t, formatNumber } = useI18n();
  const [audits, setAudits] = useState<AuditOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setAudits(await api.listAudits());
      } catch {
        setAudits([]);
      }
      setLoading(false);
    })();
  }, []);

  const completed = audits.filter((a) => a.status === "COMPLETED" || a.status === "PARTIAL");
  const pages = audits.reduce((sum, a) => sum + (a.progress_json?.pages_crawled ?? 0), 0);
  const successRate = audits.length ? Math.round((completed.length / audits.length) * 100) : null;

  const websites = new Set(
    audits.map((a) => {
      try {
        return new URL(a.target_url).hostname;
      } catch {
        return a.target_url;
      }
    })
  ).size;

  if (loading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("usage.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("usage.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Activity} label={t("usage.audits")} value={formatNumber(completed.length)} sub={t("usage.completedOrPartial")} />
        <Stat icon={Globe} label={t("usage.websites")} value={formatNumber(websites)} sub={t("usage.uniqueDomains")} />
        <Stat icon={FileCheck2} label={t("usage.pagesAnalyzed")} value={formatNumber(pages)} sub={t("usage.acrossAllAudits")} />
        <Stat icon={Zap} label={t("usage.plan")} value={t("usage.free")} sub={t("usage.unlimitedEarlyAccess")} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("usage.earlyAccess")}</CardTitle>
          <CardDescription>{t("usage.everythingFree")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {audits.length === 0
              ? t("usage.firstAuditHint")
              : t("usage.successRate", { rate: successRate != null ? formatNumber(successRate) : "—" })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
