import crypto from "node:crypto";
import type { AuditStatus, Check, PageOut, Recommendation } from "@/lib/types";
import { runAnalyzers, type CrawlContext } from "./analyzers";
import { crawlWebsite, FetchError } from "./crawler";
import { scoreChecks } from "./scoring";
import { normalizeUrl, SecurityError, validatePublicUrl } from "./security";
import {
  getStore,
  nowIso,
  type AuditRecord,
  type WebsiteRecord,
} from "./store";

export const STEPS = [
  "Validating URL",
  "Fetching robots.txt",
  "Analyzing sitemap",
  "Crawling pages",
  "Analyzing structure",
  "Checking metadata",
  "Checking structured data",
  "Calculating score",
  "Generating recommendations",
];

const SEVERITY_PRIORITY: Record<string, string> = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INFO: "LOW",
};

function effortFor(severity: string): string {
  return ({ CRITICAL: "High", HIGH: "Medium", MEDIUM: "Medium", LOW: "Low", INFO: "Low" }[severity] ?? "Medium");
}

function impactFor(severity: string): string {
  return ({ CRITICAL: "High", HIGH: "High", MEDIUM: "Medium", LOW: "Low", INFO: "Low" }[severity] ?? "Medium");
}

function setProgress(
  audit: AuditRecord,
  stage: string,
  stepIndex: number | null,
  message: string,
  opts?: { percent?: number; pagesCrawled?: number }
) {
  const progress = { ...(audit.progress_json ?? { stage, steps: STEPS.map((label) => ({ label, done: false })), pages_crawled: 0, pages_total: audit.max_pages ?? 5 }) };
  const steps = (progress.steps ?? STEPS.map((label) => ({ label, done: false }))).map((s, i) => ({
    label: s.label,
    done: stepIndex !== null ? i < stepIndex : s.done,
  }));
  audit.progress_json = {
    stage,
    steps,
    pages_crawled: opts?.pagesCrawled ?? progress.pages_crawled ?? 0,
    pages_total: audit.max_pages ?? 5,
    percent: opts?.percent ?? progress.percent ?? 0,
    message,
  };
}

function failAudit(audit: AuditRecord, message: string) {
  audit.status = "FAILED";
  audit.error_message = message;
  audit.failed_step = audit._pipeline_step ?? "unknown";
  audit.completed_at = nowIso();
  setProgress(audit, "failed", null, message);
}

export function serializeAudit(audit: AuditRecord) {
  const store = getStore();
  const website = audit.website_id ? store.websites.get(audit.website_id) ?? null : null;
  return {
    id: audit.id,
    target_url: audit.target_url,
    status: audit.status,
    score: audit.score,
    rating: audit.rating,
    error_message: audit.error_message,
    failed_step: audit.failed_step,
    started_at: audit.started_at,
    completed_at: audit.completed_at,
    created_at: audit.created_at,
    progress_json: audit.progress_json,
    website: website
      ? {
          id: website.id,
          domain: website.domain,
          base_url: website.base_url,
          created_at: website.created_at,
        }
      : null,
  };
}

export function createAudit(userId: string | null, rawUrl: string, requestedMaxPages?: number | null): AuditRecord {
  const store = getStore();
  validatePublicUrl(rawUrl);
  const baseUrl = normalizeUrl(rawUrl);
  const domain = new URL(baseUrl).host.toLowerCase();

  const monetizationEnabled = process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === "true";
  const maxPages = monetizationEnabled ? Math.max(1, Math.min(requestedMaxPages ?? 15, 30)) : 5;

  let website: WebsiteRecord | undefined;
  for (const w of store.websites.values()) {
    if (w.domain === domain) {
      website = w;
      break;
    }
  }
  if (!website) {
    website = {
      id: crypto.randomUUID(),
      domain,
      base_url: baseUrl,
      owner_id: userId,
      created_at: nowIso(),
    };
    store.websites.set(website.id, website);
  } else if (website.owner_id === null && userId !== null) {
    website.owner_id = userId;
  }

  const audit: AuditRecord = {
    id: crypto.randomUUID(),
    website_id: website.id,
    user_id: userId,
    target_url: baseUrl,
    max_pages: maxPages,
    status: "QUEUED",
    score: null,
    rating: null,
    error_message: null,
    failed_step: null,
    started_at: null,
    completed_at: null,
    created_at: nowIso(),
    progress_json: {
      stage: "queued",
      steps: STEPS.map((s) => ({ label: s, done: s === "Validating URL" })),
      pages_crawled: 0,
      pages_total: maxPages,
      percent: 5,
      message: "Audit queued.",
    },
    summary_json: null,
  };

  store.audits.set(audit.id, audit);
  void runAuditJob(audit.id);
  return audit;
}

export function cancelAudit(auditId: string): AuditRecord | null {
  const store = getStore();
  const audit = store.audits.get(auditId);
  if (!audit) return null;
  if (audit.status === "QUEUED" || audit.status === "RUNNING") {
    audit.status = "CANCELLED";
    audit.completed_at = nowIso();
    audit.failed_step = audit._pipeline_step ?? "unknown";
    audit.error_message = "Audit cancelled by user.";
    audit.progress_json = {
      ...(audit.progress_json ?? { stage: "cancelled", steps: [], pages_crawled: 0, pages_total: audit.max_pages ?? 5 }),
      stage: "cancelled",
      message: "Audit cancelled.",
    };
  }
  return audit;
}

async function runAuditJob(auditId: string): Promise<void> {
  const store = getStore();
  const audit = store.audits.get(auditId);
  if (!audit || audit.status === "CANCELLED") return;

  audit.status = "RUNNING";
  audit.started_at = nowIso();
  audit._pipeline_step = "validating_url";
  setProgress(audit, "running", 1, "Validating URL", { percent: 5 });

  const pageLimit = audit.max_pages ?? 5;

  const isAuditCancelled = () => (audit.status as AuditStatus) === "CANCELLED";

  try {
    const crawl = await crawlWebsite(audit.target_url, pageLimit, {
      isCancelled: isAuditCancelled,
      onStage: (stage, info) => {
        if (isAuditCancelled()) return;
        if (stage === "robots") {
          audit._pipeline_step = "fetching_robots";
          const ok = Boolean(info?.ok ?? true);
          setProgress(audit, "running", 2, ok ? "robots.txt fetched" : "robots.txt unavailable — continuing", { percent: 15 });
        } else if (stage === "sitemap") {
          audit._pipeline_step = "analyzing_sitemap";
          const ok = Boolean(info?.ok ?? true);
          const count = Number(info?.count ?? 0);
          let msg = ok ? "sitemap analyzed" : "sitemap unavailable — continuing";
          if (ok && count > 0) msg += ` (${count} URLs)`;
          setProgress(audit, "running", 3, msg, { percent: 25 });
        } else if (stage === "crawling") {
          audit._pipeline_step = "crawling_pages";
          setProgress(audit, "crawling", 4, "Crawling pages", { percent: 40 });
        }
      },
      onPage: (crawled, total) => {
        if (isAuditCancelled()) return;
        audit._pipeline_step = "crawling_pages";
        const pct = 40 + Math.floor((20 * crawled) / Math.max(total, 1));
        setProgress(audit, "crawling", 4, `Crawling ${crawled}/${total} pages`, { percent: pct, pagesCrawled: crawled });
      },
    });

    if (isAuditCancelled()) return;

    if (crawl.pages.length === 0) {
      const firstErr = crawl.crawl_errors[0]?.error;
      failAudit(audit, firstErr || "Unable to access this website.");
      return;
    }

    setProgress(audit, "crawling", 4, `Crawled ${crawl.pages.length} page(s)`, {
      percent: 60,
      pagesCrawled: crawl.pages.length,
    });

    audit._pipeline_step = "analyzing_structure";
    const ctx: CrawlContext = { baseUrl: crawl.base_url, crawl, extra: {} };
    const checkResults = runAnalyzers(ctx);
    setProgress(audit, "analyzing", 7, "Analyzing structure and metadata", { percent: 80 });

    audit._pipeline_step = "calculating_score";
    const scoreResult = scoreChecks(checkResults);
    setProgress(audit, "scoring", 8, "Calculating score", { percent: 90 });

    const crawledAt = nowIso();
    const pageRows: PageOut[] = crawl.pages.map((p) => ({
      id: store.nextPageId++,
      url: p.url,
      final_url: p.final_url,
      status_code: p.status_code,
      depth: p.depth,
      is_same_domain: true,
      content_type: p.content_type,
      response_time_ms: p.response_time_ms,
      title: p.title,
      meta_description: p.meta_description,
      canonical: p.canonical,
      robots_meta: p.robots_meta,
      headings: p.headings,
      links_count: p.links.length,
      broken_links: p.broken_links_for_page,
      images: p.images.slice(0, 50),
      structured_data: p.structured_data.slice(0, 25),
      open_graph: p.open_graph,
      text_preview: p.text ? p.text.slice(0, 500) : null,
      word_count: p.word_count,
      lang: p.lang,
      has_forms: p.has_forms,
      has_buttons: p.has_buttons,
      js_dependency_count: p.js_scripts,
      crawled_at: crawledAt,
    }));
    store.pagesByAudit.set(audit.id, pageRows);

    const checkRows: Check[] = checkResults.map((c) => ({
      id: store.nextCheckId++,
      check_id: c.check_id,
      category: c.category,
      name: c.name,
      description: c.description,
      status: c.status,
      severity: c.severity,
      score: c.score,
      weight: c.weight,
      evidence: c.evidence,
      recommendation: c.recommendation,
      why_matters: c.why_matters,
      ai_explanation: c.ai_explanation,
    }));
    store.checksByAudit.set(audit.id, checkRows);

    const recRows: Recommendation[] = checkResults
      .filter((c) => (c.status === "FAIL" || c.status === "WARNING") && Boolean(c.recommendation))
      .map((c) => ({
        id: store.nextRecId++,
        check_id: c.check_id,
        priority: SEVERITY_PRIORITY[c.severity] ?? "MEDIUM",
        title: c.name,
        description: c.description,
        how_to_fix: c.recommendation,
        effort: effortFor(c.severity),
        impact: impactFor(c.severity),
        source: "engine",
      }));
    store.recsByAudit.set(audit.id, recRows);

    const finalStatus = crawl.truncated || crawl.pages.length < pageLimit ? "PARTIAL" : "COMPLETED";

    audit.status = finalStatus;
    audit.score = scoreResult.overall;
    audit.rating = scoreResult.rating;
    audit.completed_at = nowIso();
    audit.error_message = null;
    audit.failed_step = null;
    audit.summary_json = {
      categories: scoreResult.categories,
      counts: scoreResult.counts,
      coverage: {
        pages: crawl.pages.length,
        sitemap_urls: crawl.sitemap_urls.length,
        crawl_errors: crawl.crawl_errors.length,
        truncated: crawl.truncated,
      },
      ai_summary: null,
      rating_label: scoreResult.rating_label,
      platform: String(ctx.extra.platform ?? "Unknown"),
    };

    setProgress(
      audit,
      "completed",
      9,
      finalStatus === "PARTIAL" ? "Audit complete with limited coverage." : "Audit complete.",
      { percent: 100, pagesCrawled: crawl.pages.length }
    );
  } catch (err) {
    if (isAuditCancelled()) return;
    if (err instanceof SecurityError) {
      failAudit(audit, "This URL could not be validated as a public website address.");
      return;
    }
    if (err instanceof FetchError) {
      failAudit(audit, err.message);
      return;
    }
    failAudit(audit, err instanceof Error ? err.message : "The audit failed to complete.");
  }
}
