"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, Trash2 } from "lucide-react";

import { api } from "@/lib/api";
import type { AuditOut } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditForm } from "@/components/landing/audit-form";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary" | "default"> = {
  COMPLETED: "success",
  PARTIAL: "warning",
  FAILED: "destructive",
  CANCELLED: "secondary",
  RUNNING: "default",
  QUEUED: "default",
};

/**
 * Dashboard of audits for the current visitor. Without authentication, audits
 * are tracked in this browser session (localStorage holds recent audit ids).
 */
export function UserDashboard() {
  const [audits, setAudits] = useState<AuditOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function load() {
      const ids = getRecentAuditIds();
      const results = await Promise.allSettled(ids.map((id) => api.getAudit(id)));
      setAudits(
        results
          .filter((r): r is PromiseFulfilledResult<AuditOut> => r.status === "fulfilled")
          .map((r) => r.value)
      );
      setLoading(false);
    }
    load();
  }, []);

  const filtered = audits.filter(
    (a) =>
      a.target_url.toLowerCase().includes(query.toLowerCase()) || a.id.toLowerCase().includes(query.toLowerCase())
  );

  function handleCreated(id: string) {
    const ids = getRecentAuditIds();
    if (!ids.includes(id)) {
      ids.unshift(id);
      localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 20)));
    }
  }

  function clearHistory() {
    localStorage.removeItem(KEY);
    setAudits([]);
  }

  return (
    <div className="container py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your audits</h1>
          <p className="text-sm text-muted-foreground">Recent audits from this browser.</p>
        </div>
        {audits.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearHistory}>
            <Trash2 className="h-4 w-4" /> Clear history
          </Button>
        )}
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Run a new audit</CardTitle>
          <CardDescription>Start an Agent Readiness audit for any public website.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditForm onCreated={handleCreated} />
        </CardContent>
      </Card>

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search audits…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No audits yet. Run your first audit above.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Website</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((audit) => (
                  <TableRow key={audit.id}>
                    <TableCell className="max-w-xs truncate">
                      <div className="font-medium">{new URL(audit.target_url).hostname}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{audit.target_url}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[audit.status] ?? "default"}>{audit.status}</Badge>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      {audit.score !== null ? audit.score.toFixed(0) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(audit.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/audit/${audit.id}/overview`}>
                          View <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const KEY = "ara_recent_audits";

function getRecentAuditIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
