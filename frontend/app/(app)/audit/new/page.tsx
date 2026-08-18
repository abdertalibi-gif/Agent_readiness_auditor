"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/api";
import { isFreeMode } from "@/lib/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SCOPES = [
  {
    id: "quick",
    pages: 5,
    recommended: false,
  },
  {
    id: "standard",
    pages: 15,
    recommended: true,
  },
  {
    id: "deep",
    pages: 30,
    recommended: false,
  },
];

const SCOPE_LABEL: Record<string, string> = {
  quick: "audit.quick",
  standard: "audit.standard",
  deep: "audit.deepScan",
};

const SCOPE_DESC: Record<string, string> = {
  quick: "audit.quickDesc",
  standard: "audit.standardDesc",
  deep: "audit.deepScanDesc",
};

const SCOPE_TAGLINE: Record<string, string> = {
  quick: "auditNew.quickTagline",
  standard: "auditNew.standardTagline",
  deep: "auditNew.deepTagline",
};


export default function NewAuditPage() {
  const router = useRouter();
  const { t } = useI18n();
  const freeMode = isFreeMode();
  // In FREE MODE every audit is capped to 5 pages — only the QUICK scope applies.
  const scopes = freeMode ? SCOPES.filter((s) => s.id === "quick") : SCOPES;
  const [url, setUrl] = useState("");
  const [scope, setScope] = useState(freeMode ? "quick" : "standard");
  const [loading, setLoading] = useState(false);

  const selected = scopes.find((s) => s.id === scope) ?? scopes[0];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error(t("auditNew.enterUrl"));
      return;
    }
    setLoading(true);
    try {
      const audit = await api.createAudit(trimmed, selected.pages);
      toast.success(t("audit.startedToast"), { description: t("audit.crawlingToast", { pages: selected.pages }) });
      router.push(`/audits/${audit.id}/progress`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auditNew.startFailed"));
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">{t("audit.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("auditNew.analyzeSubtitle")}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("audit.websiteUrl")}</CardTitle>
            <CardDescription>{t("auditNew.anyWebsite")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="url" className="sr-only">
              {t("audit.websiteUrl")}
            </Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("auditNew.urlPlaceholder")}
              className="h-11 text-base"
              required
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("auditNew.scopeTitle")}</CardTitle>
            <CardDescription>
              {t("auditNew.scopeDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {scopes.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setScope(s.id)}
                  className={cn(
                    "relative rounded-xl border p-4 text-left transition-colors",
                    scope === s.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:border-muted-foreground/40"
                  )}
                >
                  {s.recommended && (
                    <Badge variant="success" className="absolute -top-2.5 right-3">{t("audit.recommended")}</Badge>
                  )}
                  <div className="text-xs font-bold tracking-wide">{t(SCOPE_LABEL[s.id])}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {s.pages} <span className="text-sm font-normal text-muted-foreground">{t("auditNew.pages")}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium">{t(SCOPE_TAGLINE[s.id])}</div>
                  <p className="mt-2 text-xs text-muted-foreground">{t(SCOPE_DESC[s.id])}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button type="submit" size="lg" disabled={loading} className="sm:w-auto">
            <Zap className="h-4 w-4" />
            {loading ? t("audit.startingAudit") : t("audit.runFreeAudit")}
          </Button>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
            {t("audit.note")}
          </p>
        </div>
      </form>
    </div>
  );
}