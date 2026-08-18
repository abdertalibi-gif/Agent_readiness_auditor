"use client";

import { api } from "@/lib/api";
import type { AuditOut } from "@/lib/types";

const KEY = "ara_recent_audits";

export function getRecentAuditIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function rememberAudit(id: string) {
  if (typeof window === "undefined") return;
  const ids = getRecentAuditIds();
  if (!ids.includes(id)) {
    ids.unshift(id);
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 50)));
  }
}

export function forgetAudit(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(getRecentAuditIds().filter((x) => x !== id)));
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export async function loadRecentAudits(): Promise<AuditOut[]> {
  const ids = getRecentAuditIds();
  const results = await Promise.allSettled(ids.map((id) => api.getAudit(id)));
  return results
    .filter((r): r is PromiseFulfilledResult<AuditOut> => r.status === "fulfilled")
    .map((r) => r.value);
}

export interface WebsiteRow {
  hostname: string;
  baseUrl: string;
  audits: AuditOut[];
  latestScore: number | null;
  latestStatus: string | null;
  lastAuditAt: string | null;
  count: number;
}

export function groupAuditsByWebsite(audits: AuditOut[]): WebsiteRow[] {
  const map = new Map<string, WebsiteRow>();
  for (const audit of audits) {
    let hostname = "";
    try {
      hostname = new URL(audit.target_url).hostname;
    } catch {
      hostname = audit.target_url;
    }
    const key = hostname;
    const existing = map.get(key);
    if (existing) {
      existing.audits.push(audit);
      existing.count += 1;
      if (!existing.latestScore && audit.score != null) existing.latestScore = audit.score;
      if (!existing.latestStatus && audit.status) existing.latestStatus = audit.status;
      if (!existing.lastAuditAt && audit.completed_at) existing.lastAuditAt = audit.completed_at;
    } else {
      map.set(key, {
        hostname,
        baseUrl: audit.target_url,
        audits: [audit],
        latestScore: audit.score ?? null,
        latestStatus: audit.status ?? null,
        lastAuditAt: audit.completed_at ?? null,
        count: 1,
      });
    }
  }
  return Array.from(map.values());
}

export function avgScore(audits: AuditOut[]): number | null {
  const scored = audits.filter((a) => a.score != null);
  if (!scored.length) return null;
  return Math.round(scored.reduce((sum, a) => sum + (a.score ?? 0), 0) / scored.length);
}
