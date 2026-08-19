"use client";

import { useEffect, useState } from "react";
import { useAuditStatus } from "@/hooks/use-audit";
import { api } from "@/lib/api";
import { formatScore } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import type { Check } from "@/lib/types";
import { AuditNav } from "@/components/audit/audit-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const SEVERITY_COLORS: Record<string, "destructive" | "warning" | "secondary" | "outline" | "success"> = {
  CRITICAL: "destructive",
  HIGH: "warning",
  MEDIUM: "secondary",
  LOW: "outline",
  INFO: "outline",
};

const STATUS_COLORS: Record<string, "success" | "warning" | "destructive" | "outline"> = {
  PASS: "success",
  WARNING: "warning",
  FAIL: "destructive",
  NOT_APPLICABLE: "outline",
};

export function AuditIssues({ auditId }: { auditId: string }) {
  const { t, severityLabel } = useI18n();
  const { audit } = useAuditStatus(auditId, 6000);
  const [issues, setIssues] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await api.getIssues(auditId, {
          status: statusFilter === "ALL" ? undefined : statusFilter,
          severity: severityFilter === "ALL" ? undefined : severityFilter,
        });
        setIssues(data.items);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [auditId, statusFilter, severityFilter]);

  const status = audit?.status;

  return (
    <div className="space-y-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{t("auditDetail.issuesAndChecks")}</h1>
      <AuditNav auditId={auditId} status={status} />

      <div className="mb-6 flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="FAIL">{t("auditDetail.failed")}</SelectItem>
            <SelectItem value="WARNING">{t("auditDetail.warnings")}</SelectItem>
            <SelectItem value="PASS">{t("auditDetail.passed")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
<SelectContent>
              <SelectItem value="ALL">All severities</SelectItem>
              <SelectItem value="CRITICAL">{t("issues.critical")}</SelectItem>
              <SelectItem value="HIGH">{severityLabel("HIGH")}</SelectItem>
              <SelectItem value="MEDIUM">{severityLabel("MEDIUM")}</SelectItem>
              <SelectItem value="LOW">{severityLabel("LOW")}</SelectItem>
            </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground">
          {loading ? "Loading…" : `${issues.length} result${issues.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : issues.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No checks match the current filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueCard({ issue }: { issue: Check }) {
  const { t, statusLabel, checkText } = useI18n();
  const [expanded, setExpanded] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="text-base">{checkText(issue.name)}</CardTitle>
          <div className="flex shrink-0 gap-2">
            <Badge variant={SEVERITY_COLORS[issue.severity] ?? "secondary"}>{t(`severity.${issue.severity}`)}</Badge>
            <Badge variant={STATUS_COLORS[issue.status] ?? "outline"}>{statusLabel(issue.status)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {issue.description && <p className="text-sm text-muted-foreground">{checkText(issue.description)}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span>
            {t("auditDetail.category")}: <span className="font-medium text-foreground">{issue.category}</span>
          </span>
          <span>
            {t("audit.table.score")}: <span className="font-medium text-foreground">{formatScore(issue.score)}</span>
          </span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setExpanded(!expanded)}>
            {expanded ? t("auditDetail.hideDetails") : t("auditDetail.showDetails")}
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 text-sm">
            {issue.why_matters && (
              <div className="rounded-md bg-muted/60 p-3">
                <div className="font-semibold">{t("auditDetail.whyItMatters")}</div>
                <p className="mt-1 text-muted-foreground">{checkText(issue.why_matters)}</p>
              </div>
            )}
            {issue.recommendation && (
              <div className="rounded-md bg-muted/60 p-3">
                <div className="font-semibold">{t("auditDetail.recommendedFix")}</div>
                <p className="mt-1 text-muted-foreground">{checkText(issue.recommendation)}</p>
              </div>
            )}
            {issue.ai_explanation && (
              <div className="rounded-md border p-3">
                <div className="font-semibold">{t("auditDetail.aiExplanation")}</div>
                <p className="mt-1 text-muted-foreground">{issue.ai_explanation}</p>
              </div>
            )}
            {issue.evidence && Object.keys(issue.evidence).length > 0 && (
              <div className="rounded-md border p-3">
                <div className="font-semibold">{t("auditDetail.evidence")}</div>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">
                  {JSON.stringify(issue.evidence, null, 2)}
                </pre>
              </div>
            )}
            <Separator />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
