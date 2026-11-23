import * as cheerio from "cheerio";
import { normalizeUrl, SecurityError, validateUrlIsPublic } from "./security";

export interface FetchResult {
  url: string;
  final_url: string;
  status_code: number;
  content_type: string | null;
  elapsed_ms: number;
  headers: Record<string, string>;
  redirect_chain: string[];
  body: Buffer;
}

export interface LinkInfo {
  href: string;
  text: string;
  is_internal: boolean;
}

export interface ImageInfo {
  src: string;
  alt: string;
}

export interface PageData {
  url: string;
  final_url: string;
  status_code: number;
  content_type: string | null;
  response_time_ms: number;
  depth: number;
  is_html: boolean;
  broken_links: Set<string>;
  broken_links_for_page: { href: string; text: string }[];
  title: string | null;
  meta_description: string | null;
  meta_generator: string | null;
  canonical: string | null;
  robots_meta: { noindex?: boolean; nofollow?: boolean; noarchive?: boolean; content?: string };
  headings: Record<string, string[]>;
  links: LinkInfo[];
  images: ImageInfo[];
  structured_data: Record<string, unknown>[];
  open_graph: Record<string, string>;
  text: string;
  word_count: number;
  lang: string | null;
  has_forms: boolean;
  form_fields: number;
  has_buttons: boolean;
  has_header: boolean;
  has_nav: boolean;
  has_main: boolean;
  has_footer: boolean;
  has_article: boolean;
  js_scripts: number;
  viewport: string | null;
  http_equiv_refresh: boolean;
  hreflang_count: number;
  response_headers: Record<string, string>;
  redirect_chain: string[];
}

export interface RobotsTxt {
  url: string;
  fetched: boolean;
  rules: { agent: string; allow: string[]; disallow: string[] }[];
  sitemaps: string[];
  raw: string;
}

export interface CrawlResult {
  base_url: string;
  robots: RobotsTxt;
  sitemap_urls: string[];
  pages: PageData[];
  crawl_errors: { url: string; error: string }[];
  broken_urls: Set<string>;
  truncated: boolean;
}

export class FetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchError";
  }
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BROKEN_LINK_CHECKS = 8;

const ASSET_RE =
  /\.(pdf|jpg|jpeg|png|gif|webp|avif|svg|mp4|mp3|mov|avi|wmv|flv|webm|zip|tar|gz|js|css|json|xml|txt|ico|woff2?|ttf|eot|wasm)(\?|$|#)/i;

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": "AgentReadinessAuditor/1.0 (+https://agentreadinessauditor.com)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function sameOrigin(a: string, b: string): boolean {
  try {
    const pa = new URL(a);
    const pb = new URL(b);
    return pa.host.toLowerCase() === pb.host.toLowerCase();
  } catch {
    return false;
  }
}

function sameOriginWithScheme(a: string, b: string): boolean {
  try {
    const pa = new URL(a);
    const pb = new URL(b);
    return pa.protocol.toLowerCase() === pb.protocol.toLowerCase() && pa.host.toLowerCase() === pb.host.toLowerCase();
  } catch {
    return false;
  }
}

function isCrawlable(href: string): boolean {
  const h = href.trim().toLowerCase();
  if (h.startsWith("#") || h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("javascript:") || h.startsWith("data:") || h.startsWith("ftp:")) {
    return false;
  }
  try {
    const u = new URL(href);
    return !ASSET_RE.test(u.pathname);
  } catch {
    return false;
  }
}

export async function fetchUrl(
  rawUrl: string,
  options?: { maxRedirects?: number; timeoutMs?: number; cache?: Map<string, FetchResult> }
): Promise<FetchResult> {
  const maxRedirects = options?.maxRedirects ?? 5;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cache = options?.cache;

  const validated = await validateUrlIsPublic(rawUrl);
  const cached = cache?.get(validated);
  if (cached) return cached;

  let current = validated;
  const chain: string[] = [];
  const start = Date.now();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        headers: DEFAULT_HEADERS,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new FetchError("The website took too long to respond.");
      }
      throw new FetchError("Could not connect to the website.");
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        // Consume body quietly and return
        await res.arrayBuffer().catch(() => undefined);
        const headersObj: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          headersObj[k.toLowerCase()] = v;
        });
        return {
          url: rawUrl,
          final_url: current,
          status_code: res.status,
          content_type: res.headers.get("content-type"),
          elapsed_ms: Date.now() - start,
          headers: headersObj,
          redirect_chain: chain,
          body: Buffer.alloc(0),
        };
      }
      let nextUrl: string;
      try {
        nextUrl = new URL(location, current).toString();
      } catch {
        throw new FetchError("Website returned an invalid redirect.");
      }
      await validateUrlIsPublic(nextUrl);
      chain.push(nextUrl);
      current = nextUrl;
      continue;
    }

    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf.slice(0, MAX_RESPONSE_BYTES));
    const headersObj: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });

    const result: FetchResult = {
      url: rawUrl,
      final_url: current,
      status_code: res.status,
      content_type: res.headers.get("content-type"),
      elapsed_ms: Date.now() - start,
      headers: headersObj,
      redirect_chain: chain,
      body: buf,
    };
    cache?.set(validated, result);
    return result;
  }

  throw new FetchError("Too many redirects while fetching the page.");
}

function looksLikeHtml(body: Buffer): boolean {
  const head = body.subarray(0, 2048).toString("utf8").trimStart().toLowerCase();
  return head.includes("<html") || head.includes("<!doctype") || head.includes("<head");
}

export function parsePage(result: FetchResult, baseUrl: string): PageData {
  const ct = (result.content_type || "").toLowerCase();
  const isHtml = ct.includes("html") || (!ct && looksLikeHtml(result.body));

  const page: PageData = {
    url: result.url,
    final_url: result.final_url,
    status_code: result.status_code,
    content_type: result.content_type,
    response_time_ms: result.elapsed_ms,
    depth: 0,
    is_html: isHtml,
    broken_links: new Set(),
    broken_links_for_page: [],
    title: null,
    meta_description: null,
    meta_generator: null,
    canonical: null,
    robots_meta: {},
    headings: {},
    links: [],
    images: [],
    structured_data: [],
    open_graph: {},
    text: "",
    word_count: 0,
    lang: null,
    has_forms: false,
    form_fields: 0,
    has_buttons: false,
    has_header: false,
    has_nav: false,
    has_main: false,
    has_footer: false,
    has_article: false,
    js_scripts: 0,
    viewport: null,
    http_equiv_refresh: false,
    hreflang_count: 0,
    response_headers: result.headers,
    redirect_chain: result.redirect_chain,
  };

  const rawText = result.body.toString("utf8");
  if (!isHtml) {
    page.text = rawText.slice(0, 5000);
    return page;
  }

  const $ = cheerio.load(rawText);

  const titleText = $("title").first().text().trim();
  page.title = titleText || null;

  const desc = $('meta[name="description" i]').first().attr("content")?.trim();
  page.meta_description = desc || null;

  const gen = $('meta[name="generator" i]').first().attr("content")?.trim();
  page.meta_generator = gen || null;

  const canon = $('link[rel="canonical" i]').first().attr("href")?.trim();
  page.canonical = canon || null;

  const robotsMetaContent = $('meta[name="robots" i]').first().attr("content");
  if (robotsMetaContent) {
    const lower = robotsMetaContent.toLowerCase();
    page.robots_meta = {
      noindex: lower.includes("noindex"),
      nofollow: lower.includes("nofollow"),
      noarchive: lower.includes("noarchive"),
      content: robotsMetaContent,
    };
  }

  for (const level of ["h1", "h2", "h3", "h4", "h5", "h6"] as const) {
    const items: string[] = [];
    $(level).each((_, el) => {
      const txt = $(el).text().replace(/\s+/g, " ").trim();
      if (txt) items.push(txt);
    });
    if (items.length > 0) page.headings[level] = items;
  }

  const htmlLang = $("html").attr("lang")?.trim();
  page.lang = htmlLang || null;

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) return;
    try {
      const abs = new URL(href, baseUrl).toString();
      const text = $(el).text().replace(/\s+/g, " ").trim().slice(0, 120);
      page.links.push({ href: abs, text, is_internal: sameOrigin(baseUrl, abs) });
    } catch {
      // skip malformed href
    }
  });

  $("img").each((_, el) => {
    const src = $(el).attr("src")?.trim();
    if (!src) return;
    try {
      const abs = new URL(src, baseUrl).toString();
      const alt = ($(el).attr("alt") || "").trim();
      page.images.push({ src: abs, alt });
    } catch {
      // skip malformed src
    }
  });

  $('script[type*="application/ld+json" i]').each((_, el) => {
    const raw = $(el).html() || "";
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === "object") {
          page.structured_data.push(item as Record<string, unknown>);
        }
      }
    } catch {
      // skip invalid JSON-LD
    }
  });

  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property");
    if (prop) {
      page.open_graph[prop] = $(el).attr("content") || "";
    }
  });

  page.has_forms = $("form").length > 0;
  page.form_fields = $("input, select, textarea").length;
  page.has_buttons = $("button").length > 0;

  page.has_header = $("header").length > 0;
  page.has_nav = $("nav").length > 0;
  page.has_main = $("main").length > 0;
  page.has_footer = $("footer").length > 0;
  page.has_article = $("article").length > 0;

  page.js_scripts = $("script").length;

  const vp = $('meta[name="viewport" i]').first().attr("content");
  page.viewport = vp || null;

  page.http_equiv_refresh = $('meta[http-equiv="refresh" i]').length > 0;
  page.hreflang_count = $('link[rel="alternate" i][hreflang]').length;

  // Strip boilerplate tags before computing readable plain text
  $("script, style, noscript, template, svg, nav, header, footer, aside").remove();
  page.text = $("body").text().replace(/\s+/g, " ").trim() || $.root().text().replace(/\s+/g, " ").trim();
  page.word_count = page.text ? page.text.split(/\s+/).filter(Boolean).length : 0;

  return page;
}

async function fetchRobots(baseUrl: string, cache: Map<string, FetchResult>): Promise<RobotsTxt> {
  const robotsUrl = new URL("/robots.txt", baseUrl).toString();
  const empty: RobotsTxt = { url: robotsUrl, fetched: false, rules: [], sitemaps: [], raw: "" };
  try {
    const res = await fetchUrl(robotsUrl, { maxRedirects: 3, timeoutMs: 7000, cache });
    if (res.status_code >= 400) return empty;
    const text = res.body.toString("utf8");
    const rules: { agent: string; allow: string[]; disallow: string[] }[] = [];
    const sitemaps: string[] = [];
    let currentAgent: { agent: string; allow: string[]; disallow: string[] } | null = null;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.split("#")[0].trim();
      if (!line) continue;
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (key === "user-agent") {
        currentAgent = { agent: val, allow: [], disallow: [] };
        rules.push(currentAgent);
      } else if (key === "allow" && currentAgent) {
        currentAgent.allow.push(val);
      } else if (key === "disallow" && currentAgent) {
        currentAgent.disallow.push(val);
      } else if (key === "sitemap" && val) {
        sitemaps.push(val);
      }
    }

    return {
      url: robotsUrl,
      fetched: true,
      rules,
      sitemaps: Array.from(new Set(sitemaps)),
      raw: text.slice(0, 20_000),
    };
  } catch {
    return empty;
  }
}

async function fetchSitemaps(
  baseUrl: string,
  declaredSitemaps: string[],
  cache: Map<string, FetchResult>
): Promise<string[]> {
  const candidates = Array.from(
    new Set([
      ...declaredSitemaps,
      new URL("/sitemap.xml", baseUrl).toString(),
      new URL("/sitemap_index.xml", baseUrl).toString(),
    ])
  ).slice(0, 5);

  const collected: string[] = [];
  const seen = new Set<string>();

  for (const smUrl of candidates) {
    if (collected.length >= 100) break;
    try {
      const res = await fetchUrl(smUrl, { maxRedirects: 3, timeoutMs: 7000, cache });
      if (res.status_code >= 400) continue;
      const xml = res.body.toString("utf8");
      const $ = cheerio.load(xml, { xmlMode: true });
      $("url > loc, loc").each((_, el) => {
        if (collected.length >= 100) return;
        const loc = $(el).text().trim();
        if (loc && sameOrigin(baseUrl, loc) && !seen.has(loc) && !loc.endsWith(".xml")) {
          seen.add(loc);
          collected.push(loc);
        }
      });
    } catch {
      // ignore missing/broken sitemap candidate
    }
  }
  return collected;
}

export async function crawlWebsite(
  rawUrl: string,
  maxPages = 5,
  callbacks?: {
    onStage?: (stage: string, info?: Record<string, unknown>) => Promise<void> | void;
    onPage?: (crawled: number, total: number) => Promise<void> | void;
    isCancelled?: () => boolean;
  }
): Promise<CrawlResult> {
  const validated = await validateUrlIsPublic(rawUrl);
  const baseUrl = normalizeUrl(validated);
  const pageLimit = Math.max(1, Math.min(maxPages, 30));
  const cache = new Map<string, FetchResult>();

  await callbacks?.onStage?.("robots");
  const robots = await fetchRobots(baseUrl, cache);
  await callbacks?.onStage?.("robots", { ok: robots.fetched });
  if (callbacks?.isCancelled?.()) {
    return { base_url: baseUrl, robots, sitemap_urls: [], pages: [], crawl_errors: [], broken_urls: new Set(), truncated: false };
  }

  await callbacks?.onStage?.("sitemap");
  const sitemapUrls = await fetchSitemaps(baseUrl, robots.sitemaps, cache);
  await callbacks?.onStage?.("sitemap", { ok: sitemapUrls.length > 0, count: sitemapUrls.length });
  if (callbacks?.isCancelled?.()) {
    return { base_url: baseUrl, robots, sitemap_urls: sitemapUrls, pages: [], crawl_errors: [], broken_urls: new Set(), truncated: false };
  }

  await callbacks?.onStage?.("crawling");

  const frontier: { url: string; depth: number }[] = [];
  const seen = new Set<string>();
  const enqueue = (u: string, depth: number) => {
    try {
      const n = normalizeUrl(u);
      if (seen.has(n)) return;
      seen.add(n);
      frontier.push({ url: n, depth });
    } catch {
      // ignore malformed URL
    }
  };

  enqueue(baseUrl, 0);
  for (const su of sitemapUrls) {
    if (seen.size >= pageLimit * 3) break;
    enqueue(su, 0);
  }

  const pages: PageData[] = [];
  const crawlErrors: { url: string; error: string }[] = [];
  const brokenUrls = new Set<string>();
  let truncated = false;
  const concurrency = 3;

  while (frontier.length > 0 && pages.length < pageLimit) {
    if (callbacks?.isCancelled?.()) break;
    const batch = frontier.splice(0, Math.min(concurrency, pageLimit - pages.length + 1));

    const results = await Promise.all(
      batch.map(async ({ url, depth }) => {
        try {
          const res = await fetchUrl(url, { maxRedirects: 5, timeoutMs: DEFAULT_TIMEOUT_MS, cache });
          const page = parsePage(res, baseUrl);
          page.url = url;
          page.depth = depth;
          if (!sameOriginWithScheme(baseUrl, page.final_url || url)) {
            // allow http->https upgrade on same host
            if (!sameOrigin(baseUrl, page.final_url || url)) {
              crawlErrors.push({ url, error: "redirect left the allowed origin" });
              return null;
            }
          }
          return page;
        } catch (err) {
          if (err instanceof FetchError || err instanceof SecurityError) {
            crawlErrors.push({ url, error: err.message });
          } else {
            crawlErrors.push({ url, error: "Failed to fetch or parse page." });
          }
          return null;
        }
      })
    );

    for (let i = 0; i < batch.length; i++) {
      const { url, depth } = batch[i];
      const page = results[i];
      if (!page) continue;
      if (page.status_code >= 400) {
        brokenUrls.add(url);
        crawlErrors.push({ url, error: `HTTP ${page.status_code}` });
        continue;
      }
      pages.push(page);
      await callbacks?.onPage?.(pages.length, pageLimit);
      if (pages.length >= pageLimit) {
        truncated = true;
        break;
      }
      if (depth < 2) {
        for (const link of page.links) {
          if (link.is_internal && isCrawlable(link.href)) {
            if (seen.size >= pageLimit * 3) break;
            enqueue(link.href, depth + 1);
          }
        }
      }
    }
  }

  if (frontier.length > 0 && pages.length >= pageLimit) {
    truncated = true;
  }

  // Best-effort broken link check on sampled unvisited internal links
  const visited = new Set(pages.map((p) => {
    try { return normalizeUrl(p.url); } catch { return p.url; }
  }));
  const candidates: string[] = [];
  for (const page of pages) {
    for (const link of page.links) {
      if (!link.is_internal || !isCrawlable(link.href)) continue;
      try {
        const norm = normalizeUrl(link.href);
        if (!visited.has(norm) && !candidates.includes(norm)) {
          candidates.push(norm);
          if (candidates.length >= MAX_BROKEN_LINK_CHECKS) break;
        }
      } catch {
        // skip
      }
    }
    if (candidates.length >= MAX_BROKEN_LINK_CHECKS) break;
  }

  await Promise.all(
    candidates.map(async (u) => {
      try {
        const res = await fetchUrl(u, { maxRedirects: 3, timeoutMs: 6000, cache });
        if (res.status_code >= 400) brokenUrls.add(u);
      } catch {
        brokenUrls.add(u);
      }
    })
  );

  for (const page of pages) {
    page.broken_links = brokenUrls;
    page.broken_links_for_page = page.links
      .filter((l) => l.is_internal && brokenUrls.has(l.href))
      .map((l) => ({ href: l.href, text: l.text }));
  }

  return {
    base_url: baseUrl,
    robots,
    sitemap_urls: sitemapUrls,
    pages,
    crawl_errors: crawlErrors,
    broken_urls: brokenUrls,
    truncated,
  };
}
