import type { Category, CheckStatus, Severity } from "@/lib/types";
import type { CrawlResult, PageData } from "./crawler";

export interface CheckResult {
  check_id: string;
  category: Category;
  name: string;
  description: string;
  status: CheckStatus;
  severity: Severity;
  score: number;
  weight: number;
  evidence: Record<string, unknown> | null;
  recommendation: string | null;
  why_matters: string | null;
  ai_explanation: string | null;
}

export interface CrawlContext {
  baseUrl: string;
  crawl: CrawlResult;
  extra: Record<string, unknown>;
}

function homePage(ctx: CrawlContext): PageData | undefined {
  return ctx.crawl.pages.find((p) => p.is_html) ?? ctx.crawl.pages[0];
}

function pass(p: {
  check_id: string;
  category: Category;
  name: string;
  description: string;
  weight?: number;
  evidence?: Record<string, unknown>;
  recommendation?: string;
  why_matters?: string;
}): CheckResult {
  return {
    check_id: p.check_id,
    category: p.category,
    name: p.name,
    description: p.description,
    status: "PASS",
    severity: "INFO",
    score: 100,
    weight: p.weight ?? 1.0,
    evidence: p.evidence ?? null,
    recommendation: p.recommendation ?? null,
    why_matters: p.why_matters ?? null,
    ai_explanation: null,
  };
}

function warn(p: {
  check_id: string;
  category: Category;
  name: string;
  description: string;
  weight?: number;
  severity?: Severity;
  evidence?: Record<string, unknown>;
  recommendation?: string;
  why_matters?: string;
}): CheckResult {
  return {
    check_id: p.check_id,
    category: p.category,
    name: p.name,
    description: p.description,
    status: "WARNING",
    severity: p.severity ?? "MEDIUM",
    score: 50,
    weight: p.weight ?? 1.0,
    evidence: p.evidence ?? null,
    recommendation: p.recommendation ?? null,
    why_matters: p.why_matters ?? null,
    ai_explanation: null,
  };
}

function fail(p: {
  check_id: string;
  category: Category;
  name: string;
  description: string;
  weight?: number;
  severity?: Severity;
  evidence?: Record<string, unknown>;
  recommendation?: string;
  why_matters?: string;
}): CheckResult {
  return {
    check_id: p.check_id,
    category: p.category,
    name: p.name,
    description: p.description,
    status: "FAIL",
    severity: p.severity ?? "HIGH",
    score: 0,
    weight: p.weight ?? 1.0,
    evidence: p.evidence ?? null,
    recommendation: p.recommendation ?? null,
    why_matters: p.why_matters ?? null,
    ai_explanation: null,
  };
}

function na(
  check_id: string,
  category: Category,
  name: string,
  description: string,
  weight = 1.0,
  evidence?: Record<string, unknown>
): CheckResult {
  return {
    check_id,
    category,
    name,
    description,
    status: "NOT_APPLICABLE",
    severity: "INFO",
    score: 0,
    weight,
    evidence: evidence ?? null,
    recommendation: null,
    why_matters: null,
    ai_explanation: null,
  };
}

function analyzeRobots(ctx: CrawlContext): CheckResult[] {
  const checks: CheckResult[] = [];
  const robots = ctx.crawl.robots;

  if (robots.fetched) {
    checks.push(
      pass({
        check_id: "robots_txt_exists",
        category: "crawlability",
        name: "robots.txt is available",
        description: "The site exposes a robots.txt file at /robots.txt.",
        weight: 1.0,
        evidence: { url: robots.url },
        recommendation: "Keep robots.txt present and up to date.",
        why_matters: "AI agents and crawlers consult robots.txt first to learn what they may fetch.",
      })
    );
    if (robots.rules.length > 0) {
      checks.push(
        pass({
          check_id: "robots_txt_rules",
          category: "crawlability",
          name: "robots.txt defines crawl rules",
          description: "robots.txt contains Allow/Disallow rules for user agents.",
          weight: 1.0,
          evidence: { rule_count: robots.rules.length },
        })
      );
    } else {
      checks.push(
        warn({
          check_id: "robots_txt_rules",
          category: "crawlability",
          name: "robots.txt defines no crawl rules",
          description: "robots.txt exists but does not define any Allow/Disallow rules.",
          weight: 1.0,
          evidence: { rule_count: 0 },
          recommendation: "Add explicit Allow/Disallow rules so agents know what is crawlable.",
        })
      );
    }
  } else {
    checks.push(
      fail({
        check_id: "robots_txt_exists",
        category: "crawlability",
        name: "robots.txt is missing or unreachable",
        description: "No robots.txt was found (or it could not be fetched).",
        weight: 1.5,
        severity: "MEDIUM",
        evidence: { robots_url: `${ctx.baseUrl.replace(/\/$/, "")}/robots.txt` },
        recommendation: "Add a robots.txt file describing which paths agents may crawl.",
        why_matters: "Without robots.txt, agents must guess crawl boundaries and may miss key pages.",
      })
    );
  }

  if (robots.sitemaps.length > 0) {
    checks.push(
      pass({
        check_id: "robots_sitemap_declared",
        category: "discoverability",
        name: "Sitemap declared in robots.txt",
        description: "robots.txt references one or more sitemaps.",
        weight: 1.0,
        evidence: { sitemaps: robots.sitemaps.slice(0, 5) },
        recommendation: "Keep the Sitemap directive in robots.txt current.",
        why_matters: "Sitemap references in robots.txt are the canonical way agents discover all pages.",
      })
    );
  } else {
    checks.push(
      warn({
        check_id: "robots_sitemap_declared",
        category: "discoverability",
        name: "No sitemap declared in robots.txt",
        description: "robots.txt does not reference any sitemap.",
        weight: 1.0,
        evidence: { sitemaps: [] },
        recommendation: "Add a 'Sitemap:' line to robots.txt pointing to your sitemap.xml.",
        why_matters: "A declared sitemap dramatically improves discovery of deep or new pages.",
      })
    );
  }

  return checks;
}

function analyzeSitemap(ctx: CrawlContext): CheckResult[] {
  const checks: CheckResult[] = [];
  const urls = ctx.crawl.sitemap_urls;
  const pageUrls = new Set(ctx.crawl.pages.map((p) => p.url));

  if (urls.length > 0) {
    checks.push(
      pass({
        check_id: "sitemap_present",
        category: "crawlability",
        name: "Sitemap is present",
        description: "The site provides an XML sitemap with page URLs.",
        weight: 1.5,
        evidence: { sitemap_url_count: urls.length, sample: urls.slice(0, 5) },
        recommendation: "Keep the sitemap current and register it in Search Console tools.",
        why_matters: "Sitemaps give agents a complete, structured index of your important pages.",
      })
    );
    const overlap = urls.filter((u) => pageUrls.has(u)).length;
    const ratio = overlap / urls.length;
    if (ratio >= 0.7) {
      checks.push(
        pass({
          check_id: "sitemap_consistent",
          category: "crawlability",
          name: "Sitemap URLs are reachable",
          description: "Most URLs in the sitemap were successfully crawled.",
          weight: 1.0,
          evidence: { overlap, total: urls.length, ratio: Number(ratio.toFixed(2)) },
        })
      );
    } else {
      checks.push(
        warn({
          check_id: "sitemap_consistent",
          category: "crawlability",
          name: "Many sitemap URLs are unreachable",
          description: "A significant share of sitemap URLs could not be fetched.",
          weight: 1.0,
          evidence: { overlap, total: urls.length, ratio: Number(ratio.toFixed(2)) },
          recommendation: "Remove stale URLs from the sitemap and fix the failing ones.",
        })
      );
    }
  } else {
    checks.push(
      fail({
        check_id: "sitemap_present",
        category: "crawlability",
        name: "No sitemap found",
        description: "No XML sitemap was found (declared or at common locations).",
        weight: 1.5,
        severity: "MEDIUM",
        evidence: { checked: ["/sitemap.xml", "/sitemap_index.xml", "robots.txt Sitemap directive"] },
        recommendation: "Create an XML sitemap listing all important pages and reference it in robots.txt.",
        why_matters: "Without a sitemap, agents must discover everything through links alone.",
      })
    );
  }

  return checks;
}

function analyzeMetadata(ctx: CrawlContext): CheckResult[] {
  const checks: CheckResult[] = [];
  const pages = ctx.crawl.pages.filter((p) => p.is_html);
  const home = homePage(ctx);
  const sampled = pages.slice(0, 10);
  const withTitle = sampled.filter((p) => Boolean(p.title));
  const withDesc = sampled.filter((p) => Boolean(p.meta_description));
  const withCanonical = sampled.filter((p) => Boolean(p.canonical));

  if (home?.title) {
    checks.push(
      pass({
        check_id: "home_title",
        category: "discoverability",
        name: "Homepage has a title",
        description: "The homepage defines a <title> element.",
        weight: 1.5,
        evidence: { title: home.title },
      })
    );
  } else {
    checks.push(
      fail({
        check_id: "home_title",
        category: "discoverability",
        name: "Homepage is missing a title",
        description: "No <title> element was found on the homepage.",
        weight: 1.5,
        severity: "CRITICAL",
        evidence: { page: ctx.baseUrl },
        recommendation: "Add a concise, descriptive <title> to the homepage.",
        why_matters: "The title is the primary identifier agents use to understand a page's purpose.",
      })
    );
  }

  const titleLen = home?.title?.length ?? 0;
  if (titleLen >= 10 && titleLen <= 70) {
    checks.push(
      pass({
        check_id: "title_length",
        category: "discoverability",
        name: "Title length is appropriate",
        description: "The homepage title is within a reasonable length.",
        weight: 1.0,
        evidence: { length: titleLen, title: home?.title ?? null },
      })
    );
  } else if (titleLen > 0) {
    checks.push(
      warn({
        check_id: "title_length",
        category: "discoverability",
        name: "Title length could be optimized",
        description: "The homepage title is too long or too short for clear identification.",
        weight: 1.0,
        evidence: { length: titleLen, title: home?.title ?? null },
        recommendation: "Aim for 30-60 characters describing page purpose.",
      })
    );
  }

  if (home?.meta_description) {
    checks.push(
      pass({
        check_id: "meta_description",
        category: "discoverability",
        name: "Homepage has a meta description",
        description: "A meta description is present on the homepage.",
        weight: 1.0,
        evidence: { description: home.meta_description.slice(0, 200) },
      })
    );
  } else {
    checks.push(
      fail({
        check_id: "meta_description",
        category: "discoverability",
        name: "Homepage is missing a meta description",
        description: "No meta description was found on the homepage.",
        weight: 1.0,
        severity: "MEDIUM",
        evidence: { page: ctx.baseUrl },
        recommendation: "Add a meta description summarizing the site's purpose.",
        why_matters: "Descriptions help agents understand what a page is about without reading everything.",
      })
    );
  }

  if (home?.canonical) {
    checks.push(
      pass({
        check_id: "canonical_present",
        category: "discoverability",
        name: "Homepage declares a canonical URL",
        description: "The homepage uses a rel=canonical link.",
        weight: 1.0,
        evidence: { canonical: home.canonical },
      })
    );
  } else {
    checks.push(
      warn({
        check_id: "canonical_present",
        category: "discoverability",
        name: "No canonical URL declared",
        description: "The homepage does not declare a canonical URL.",
        weight: 1.0,
        evidence: { page: ctx.baseUrl },
        recommendation: "Add rel=canonical links to avoid duplicate-content confusion.",
      })
    );
  }

  if (sampled.length > 0) {
    if (withTitle.length > 0) {
      checks.push(
        pass({
          check_id: "pages_have_titles",
          category: "discoverability",
          name: "Pages have titles",
          description: "Most crawled pages define <title> elements.",
          weight: 1.0,
          evidence: { pages_checked: sampled.length, with_title: withTitle.length },
        })
      );
    } else {
      checks.push(
        fail({
          check_id: "pages_have_titles",
          category: "discoverability",
          name: "Pages are missing titles",
          description: "None of the sampled pages define <title> elements.",
          weight: 1.0,
          evidence: { pages_checked: sampled.length, with_title: 0 },
          recommendation: "Ensure every page has a unique, descriptive title.",
        })
      );
    }

    if (withDesc.length / sampled.length >= 0.7) {
      checks.push(
        pass({
          check_id: "pages_have_descriptions",
          category: "discoverability",
          name: "Pages have meta descriptions",
          description: "Most sampled pages include meta descriptions.",
          weight: 0.5,
          evidence: { pages_checked: sampled.length, with_description: withDesc.length },
        })
      );
    } else {
      checks.push(
        warn({
          check_id: "pages_have_descriptions",
          category: "discoverability",
          name: "Many pages lack meta descriptions",
          description: "A large share of sampled pages have no meta description.",
          weight: 0.5,
          evidence: { pages_checked: sampled.length, with_description: withDesc.length },
          recommendation: "Add unique meta descriptions to key pages.",
        })
      );
    }

    if (withCanonical.length / sampled.length >= 0.7) {
      checks.push(
        pass({
          check_id: "pages_have_canonical",
          category: "discoverability",
          name: "Pages declare canonical URLs",
          description: "Most sampled pages include canonical links.",
          weight: 0.5,
          evidence: { pages_checked: sampled.length, with_canonical: withCanonical.length },
        })
      );
    } else {
      checks.push(
        warn({
          check_id: "pages_have_canonical",
          category: "discoverability",
          name: "Many pages lack canonical URLs",
          description: "A large share of sampled pages have no canonical URL.",
          weight: 0.5,
          evidence: { pages_checked: sampled.length, with_canonical: withCanonical.length },
          recommendation: "Add canonical URLs to prevent duplicate content confusion.",
        })
      );
    }
  }

  return checks;
}

function analyzeSemantic(ctx: CrawlContext): CheckResult[] {
  const checks: CheckResult[] = [];
  const pages = ctx.crawl.pages.filter((p) => p.is_html);
  const home = homePage(ctx);

  if (home) {
    const h1s = home.headings.h1 ?? [];
    if (h1s.length === 1) {
      checks.push(
        pass({
          check_id: "home_h1",
          category: "semantic_structure",
          name: "Homepage has a single H1",
          description: "The homepage uses exactly one H1 heading.",
          weight: 1.5,
          evidence: { h1: h1s[0] },
        })
      );
    } else if (h1s.length === 0) {
      checks.push(
        fail({
          check_id: "home_h1",
          category: "semantic_structure",
          name: "Homepage has no H1",
          description: "No H1 heading was found on the homepage.",
          weight: 1.5,
          severity: "HIGH",
          evidence: { headings: home.headings },
          recommendation: "Add a single descriptive H1 summarizing the page purpose.",
          why_matters: "H1 gives agents a machine-readable summary of a page's main topic.",
        })
      );
    } else {
      checks.push(
        warn({
          check_id: "home_h1",
          category: "semantic_structure",
          name: "Homepage has multiple H1s",
          description: "More than one H1 was found on the homepage.",
          weight: 1.5,
          evidence: { h1_count: h1s.length, h1s: h1s.slice(0, 5) },
          recommendation: "Use a single H1 per page and reserve H2-H6 for sub-sections.",
        })
      );
    }
  }

  const pagesWithHeadings = pages.slice(0, 10).filter((p) => Object.keys(p.headings).length > 0).length;
  if ((home?.headings.h1?.length ?? 0) > 0 || pagesWithHeadings > 0) {
    checks.push(
      pass({
        check_id: "heading_hierarchy",
        category: "semantic_structure",
        name: "Heading hierarchy is used",
        description: "Pages use H1-H6 headings to structure content.",
        weight: 1.0,
        evidence: { pages_with_headings: pagesWithHeadings },
      })
    );
  } else {
    checks.push(
      fail({
        check_id: "heading_hierarchy",
        category: "semantic_structure",
        name: "No heading structure detected",
        description: "Pages do not appear to use semantic headings.",
        weight: 1.0,
        severity: "MEDIUM",
        evidence: { pages_with_headings: 0 },
        recommendation: "Structure content with heading levels H1-H6.",
      })
    );
  }

  if (home?.lang) {
    checks.push(
      pass({
        check_id: "html_lang",
        category: "semantic_structure",
        name: "Language is declared",
        description: "The homepage declares a language via the lang attribute.",
        weight: 1.0,
        evidence: { lang: home.lang },
      })
    );
  } else {
    checks.push(
      warn({
        check_id: "html_lang",
        category: "semantic_structure",
        name: "Language is not declared",
        description: "No lang attribute was found on the homepage.",
        weight: 1.0,
        evidence: { page: ctx.baseUrl },
        recommendation: 'Add lang="<code>" to the <html> element.',
      })
    );
  }

  const landmarks = { header: 0, nav: 0, main: 0, footer: 0, article: 0 };
  for (const p of pages.slice(0, 10)) {
    if (p.has_header) landmarks.header++;
    if (p.has_nav) landmarks.nav++;
    if (p.has_main) landmarks.main++;
    if (p.has_footer) landmarks.footer++;
    if (p.has_article) landmarks.article++;
  }
  const found = (Object.keys(landmarks) as (keyof typeof landmarks)[]).filter((k) => landmarks[k] > 0);
  if (found.length >= 3) {
    checks.push(
      pass({
        check_id: "semantic_landmarks",
        category: "semantic_structure",
        name: "Semantic landmarks detected",
        description: "Pages use semantic landmarks such as header, nav, main and footer.",
        weight: 1.0,
        evidence: { landmarks_found: found },
      })
    );
  } else {
    checks.push(
      warn({
        check_id: "semantic_landmarks",
        category: "semantic_structure",
        name: "Few semantic landmarks detected",
        description: "Pages use few semantic landmark elements (header, nav, main, footer, article).",
        weight: 1.0,
        evidence: { landmarks_found: found },
        recommendation: "Use <header>, <nav>, <main> and <footer> to expose page structure.",
        why_matters: "Agents use landmarks to locate navigation and primary content regions.",
      })
    );
  }

  const wordy = pages.filter((p) => p.word_count >= 300);
  if (wordy.length > 0) {
    checks.push(
      pass({
        check_id: "content_depth",
        category: "semantic_structure",
        name: "Pages have substantive content",
        description: "Most crawled pages contain a meaningful amount of text.",
        weight: 1.0,
        evidence: { pages_with_content: wordy.length, total_pages: pages.length },
      })
    );
  } else {
    checks.push(
      warn({
        check_id: "content_depth",
        category: "semantic_structure",
        name: "Pages have thin content",
        description: "Few pages contain 300+ words of readable text.",
        weight: 1.0,
        evidence: { pages_with_content: 0, total_pages: pages.length },
        recommendation: "Ensure key pages contain descriptive, readable content.",
      })
    );
  }

  return checks;
}

function extractTypes(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const t = (data as Record<string, unknown>)["@type"];
  if (typeof t === "string" && t) return [t];
  if (Array.isArray(t)) return t.filter((v): v is string => typeof v === "string" && Boolean(v));
  return [];
}

function extractTypeNames(payloads: Record<string, unknown>[]): string[] {
  const names: string[] = [];
  for (const p of payloads) {
    names.push(...extractTypes(p));
    const graph = p["@graph"];
    if (Array.isArray(graph)) {
      for (const node of graph) names.push(...extractTypes(node));
    }
  }
  return names.filter(Boolean);
}

function analyzeStructuredData(ctx: CrawlContext): CheckResult[] {
  const checks: CheckResult[] = [];
  const home = homePage(ctx);
  const pages = ctx.crawl.pages.filter((p) => p.is_html);

  const homeData = home?.structured_data ?? [];
  const homeTypes = extractTypeNames(homeData);
  const pagesWithData = pages.filter((p) => p.structured_data.length > 0);

  if (homeTypes.length > 0) {
    checks.push(
      pass({
        check_id: "schema_present",
        category: "structured_data",
        name: "Structured data detected",
        description: "The homepage exposes structured data (JSON-LD).",
        weight: 1.5,
        evidence: { types: homeTypes },
      })
    );
  } else {
    checks.push(
      fail({
        check_id: "schema_present",
        category: "structured_data",
        name: "No structured data on homepage",
        description: "No Schema.org structured data was found on the homepage.",
        weight: 1.5,
        severity: "HIGH",
        evidence: { page: ctx.baseUrl },
        recommendation: "Add JSON-LD structured data describing your organization and content.",
        why_matters: "Structured data lets agents extract entities (organization, products, contacts) reliably.",
      })
    );
  }

  const entityChecks: [string, string[]][] = [
    ["organization", ["Organization"]],
    ["website", ["WebSite"]],
    ["contact", ["ContactPage", "ContactPoint"]],
    ["breadcrumb", ["BreadcrumbList"]],
    ["product", ["Product", "Service"]],
  ];
  for (const [id, targets] of entityChecks) {
    const found = homeTypes.filter((t) => targets.includes(t));
    if (found.length > 0) {
      checks.push(
        pass({
          check_id: `schema_${id}`,
          category: "structured_data",
          name: `${targets[0]} schema present`,
          description: `The site declares the ${found.join(", ")} structured data type.`,
          weight: 1.0,
          evidence: { types: found },
        })
      );
    } else {
      const label = targets.join(" / ");
      checks.push(
        warn({
          check_id: `schema_${id}`,
          category: "structured_data",
          name: `${label} schema not detected`,
          description: `Could not detect ${label} structured data.`,
          weight: 0.75,
          evidence: { page: ctx.baseUrl },
          recommendation: `Consider adding ${label} structured data to help agents identify this information.`,
        })
      );
    }
  }

  if (home && Object.keys(home.open_graph).length > 0) {
    const ogRequired = ["og:title", "og:type", "og:url"];
    const missing = ogRequired.filter((k) => !(k in home.open_graph));
    if (missing.length === 0) {
      checks.push(
        pass({
          check_id: "open_graph",
          category: "structured_data",
          name: "Open Graph tags present",
          description: "The homepage includes core Open Graph tags.",
          weight: 1.0,
          evidence: { tags: Object.keys(home.open_graph).sort().slice(0, 10) },
        })
      );
    } else {
      checks.push(
        warn({
          check_id: "open_graph",
          category: "structured_data",
          name: "Open Graph tags incomplete",
          description: "Some core Open Graph tags are missing.",
          weight: 1.0,
          evidence: { missing, present: Object.keys(home.open_graph).sort().slice(0, 10) },
          recommendation: `Add missing Open Graph tags: ${missing.join(", ")}.`,
        })
      );
    }
  } else {
    checks.push(
      warn({
        check_id: "open_graph",
        category: "structured_data",
        name: "No Open Graph tags",
        description: "No Open Graph tags were found on the homepage.",
        weight: 1.0,
        evidence: { page: ctx.baseUrl },
        recommendation: "Add Open Graph tags (og:title, og:type, og:url, og:image) to the homepage.",
      })
    );
  }

  const coverage = pages.length > 0 ? pagesWithData.length / pages.length : 0;
  if (coverage >= 0.6) {
    checks.push(
      pass({
        check_id: "structured_data_coverage",
        category: "structured_data",
        name: "Good structured data coverage",
        description: "Most crawled pages include structured data.",
        weight: 1.0,
        evidence: { pages_with_data: pagesWithData.length, total: pages.length, coverage: Number(coverage.toFixed(2)) },
      })
    );
  } else if (coverage > 0) {
    checks.push(
      warn({
        check_id: "structured_data_coverage",
        category: "structured_data",
        name: "Partial structured data coverage",
        description: "Only some crawled pages include structured data.",
        weight: 1.0,
        evidence: { pages_with_data: pagesWithData.length, total: pages.length, coverage: Number(coverage.toFixed(2)) },
        recommendation: "Add structured data to your most important pages first.",
      })
    );
  } else {
    checks.push(
      fail({
        check_id: "structured_data_coverage",
        category: "structured_data",
        name: "No structured data coverage",
        description: "None of the crawled pages include structured data.",
        weight: 1.0,
        severity: "MEDIUM",
        evidence: { pages_with_data: 0, total: pages.length },
        recommendation: "Introduce JSON-LD structured data across your site.",
      })
    );
  }

  return checks;
}

function analyzeLinks(ctx: CrawlContext): CheckResult[] {
  const checks: CheckResult[] = [];
  const pages = ctx.crawl.pages.filter((p) => p.is_html);
  const home = homePage(ctx);

  if (pages.length > 0) {
    const totalInternal = pages.reduce((acc, p) => acc + p.links.filter((l) => l.is_internal).length, 0);
    checks.push(
      pass({
        check_id: "internal_links",
        category: "navigation_linking",
        name: "Internal links are present",
        description: "Crawled pages expose internal links between pages.",
        weight: 1.5,
        evidence: { total_internal_links: totalInternal, pages: pages.length },
      })
    );
  } else {
    checks.push(
      fail({
        check_id: "internal_links",
        category: "navigation_linking",
        name: "No internal links found",
        description: "No internal links were discovered during the crawl.",
        weight: 1.5,
        severity: "HIGH",
        evidence: { pages: 0 },
        recommendation: "Link your important pages to each other so agents can traverse the site.",
        why_matters: "Agents discover pages by following internal links.",
      })
    );
  }

  if (home?.has_nav) {
    checks.push(
      pass({
        check_id: "navigation_element",
        category: "navigation_linking",
        name: "Navigation element present",
        description: "The homepage uses a <nav> element.",
        weight: 1.0,
        evidence: { page: ctx.baseUrl },
      })
    );
  } else {
    checks.push(
      warn({
        check_id: "navigation_element",
        category: "navigation_linking",
        name: "No <nav> element on homepage",
        description: "The homepage does not use a semantic <nav> element.",
        weight: 1.0,
        evidence: { page: ctx.baseUrl },
        recommendation: "Wrap primary navigation links in a <nav> element.",
      })
    );
  }

  const brokenSet = new Set<string>();
  for (const p of pages) {
    for (const b of p.broken_links_for_page) brokenSet.add(b.href);
  }
  if (brokenSet.size > 0) {
    checks.push(
      fail({
        check_id: "broken_links",
        category: "navigation_linking",
        name: "Broken internal links detected",
        description: "Some internal links return errors (4xx/5xx) or fail to load.",
        weight: 1.5,
        severity: "HIGH",
        evidence: { broken_count: brokenSet.size, examples: Array.from(brokenSet).sort().slice(0, 5) },
        recommendation: "Fix or remove the broken internal links listed in the evidence.",
        why_matters: "Broken links break agent traversal and signal poor maintenance.",
      })
    );
  } else {
    checks.push(
      pass({
        check_id: "broken_links",
        category: "navigation_linking",
        name: "No broken internal links detected",
        description: "Checked internal links resolved without errors.",
        weight: 1.0,
        evidence: { checked: "sampled internal links" },
      })
    );
  }

  if (pages.length >= 5) {
    checks.push(
      pass({
        check_id: "multiple_pages",
        category: "navigation_linking",
        name: "Multiple pages discoverable",
        description: "The crawler discovered several pages via links.",
        weight: 1.0,
        evidence: { pages: pages.length },
      })
    );
  } else {
    checks.push(
      warn({
        check_id: "multiple_pages",
        category: "navigation_linking",
        name: "Very few pages discovered",
        description: "Fewer than five pages were discoverable from the homepage.",
        weight: 1.0,
        evidence: { pages: pages.length },
        recommendation: "Ensure important pages are linked from the homepage or navigation.",
      })
    );
  }

  return checks;
}

function analyzeContent(ctx: CrawlContext): CheckResult[] {
  const checks: CheckResult[] = [];
  const home = homePage(ctx);
  const pages = ctx.crawl.pages.filter((p) => p.is_html);
  if (pages.length === 0) return checks;

  const homeText = home?.text ?? "";

  if (home && home.word_count >= 100) {
    checks.push(
      pass({
        check_id: "homepage_content",
        category: "content_accessibility",
        name: "Homepage has readable content",
        description: "The homepage contains enough plain text for an agent to understand its purpose.",
        weight: 1.5,
        evidence: { word_count: home.word_count },
      })
    );
  } else {
    checks.push(
      fail({
        check_id: "homepage_content",
        category: "content_accessibility",
        name: "Homepage content is minimal",
        description: "The homepage has very little text content in the raw HTML.",
        weight: 1.5,
        severity: "HIGH",
        evidence: { word_count: home?.word_count ?? 0 },
        recommendation: "Put descriptive text in the HTML (not only rendered via JavaScript).",
        why_matters: "Agents that do not execute JavaScript only see what is in the raw HTML.",
      })
    );
  }

  const contactPatterns = ["contact", "mailto:", "@", "phone", "tel:"];
  if (contactPatterns.some((p) => homeText.toLowerCase().includes(p))) {
    checks.push(
      pass({
        check_id: "contact_visible",
        category: "content_accessibility",
        name: "Contact information visible",
        description: "Contact signals (email/phone/link) appear in the page text.",
        weight: 1.0,
        evidence: { page: ctx.baseUrl },
      })
    );
  } else {
    checks.push(
      warn({
        check_id: "contact_visible",
        category: "content_accessibility",
        name: "Contact information not clearly visible",
        description: "No clear contact signals were found in the raw page text.",
        weight: 1.0,
        evidence: { page: ctx.baseUrl },
        recommendation: "Ensure email, phone or a contact link is present in the HTML.",
        why_matters: "Agents need explicit contact details to complete their tasks.",
      })
    );
  }

  const hints = ["we ", "our ", "provides", "offers", "platform", "service", "product", "solutions", "company"];
  const lowered = homeText.toLowerCase();
  const hintCount = hints.filter((h) => lowered.includes(h)).length;
  if (hintCount >= 2) {
    checks.push(
      pass({
        check_id: "business_purpose",
        category: "content_accessibility",
        name: "Business purpose is understandable",
        description: "The homepage text clearly communicates what the company does.",
        weight: 1.5,
        evidence: { preview: homeText.trim().slice(0, 300) },
      })
    );
  } else {
    checks.push(
      warn({
        check_id: "business_purpose",
        category: "content_accessibility",
        name: "Business purpose is not immediately clear",
        description: "The raw text does not make the company's purpose obvious.",
        weight: 1.5,
        evidence: { preview: homeText.trim().slice(0, 300) },
        recommendation: "Open with a one-sentence value proposition in plain text.",
        why_matters: "Agents infer what a company does from visible text; vague pages produce vague understanding.",
      })
    );
  }

  const jsHeavy = pages.filter((p) => p.js_scripts >= 15);
  const textEmpty = pages.filter((p) => p.is_html && p.word_count === 0 && p.js_scripts > 0);
  if (textEmpty.length > 0) {
    checks.push(
      fail({
        check_id: "js_barrier",
        category: "content_accessibility",
        name: "Content appears JavaScript-dependent",
        description: "Pages have scripts but almost no raw text, suggesting content renders only via JavaScript.",
        weight: 2.0,
        severity: "HIGH",
        evidence: { pages_with_no_raw_text: textEmpty.length, examples: textEmpty.slice(0, 5).map((p) => p.url) },
        recommendation: "Serve essential content in the initial HTML (server-side rendering / SSR).",
        why_matters: "Agents that do not run JavaScript cannot read JavaScript-rendered content.",
      })
    );
  } else if (jsHeavy.length > 0) {
    checks.push(
      warn({
        check_id: "js_barrier",
        category: "content_accessibility",
        name: "Heavy JavaScript dependency",
        description: "Several pages load many scripts; verify content is available without execution.",
        weight: 1.0,
        evidence: { js_heavy_pages: jsHeavy.length, max_scripts: Math.max(...pages.map((p) => p.js_scripts)) },
        recommendation: "Keep critical content in the HTML and progressively enhance with JavaScript.",
      })
    );
  } else {
    checks.push(
      pass({
        check_id: "js_barrier",
        category: "content_accessibility",
        name: "Content available without JavaScript",
        description: "Crawled pages contain readable content in the raw HTML.",
        weight: 1.0,
        evidence: { pages: pages.length },
      })
    );
  }

  return checks;
}

function analyzeTechnical(ctx: CrawlContext): CheckResult[] {
  const checks: CheckResult[] = [];
  const home = homePage(ctx);

  if (ctx.baseUrl.startsWith("https://")) {
    checks.push(
      pass({
        check_id: "https",
        category: "technical_quality",
        name: "Site is served over HTTPS",
        description: "The website is accessible over HTTPS.",
        weight: 1.5,
        evidence: { url: ctx.baseUrl },
        why_matters: "Agents prefer and trust secure endpoints.",
      })
    );
  } else {
    checks.push(
      fail({
        check_id: "https",
        category: "technical_quality",
        name: "Site is not served over HTTPS",
        description: "The website does not use HTTPS.",
        weight: 1.5,
        severity: "CRITICAL",
        evidence: { url: ctx.baseUrl },
        recommendation: "Serve your site over HTTPS with a valid TLS certificate.",
        why_matters: "Without HTTPS, agents and browsers may refuse to access the site.",
      })
    );
  }

  if (!home) {
    checks.push(
      warn({
        check_id: "home_status",
        category: "technical_quality",
        name: "Homepage status unknown",
        description: "The homepage could not be fetched for a status check.",
        weight: 0.5,
        evidence: { pages: ctx.crawl.pages.length },
      })
    );
  } else if (home.status_code >= 200 && home.status_code < 300) {
    checks.push(
      pass({
        check_id: "home_status",
        category: "technical_quality",
        name: "Homepage responds with a healthy status",
        description: `The homepage returned HTTP ${home.status_code}.`,
        weight: 1.0,
        evidence: { status_code: home.status_code },
      })
    );
  } else {
    checks.push(
      fail({
        check_id: "home_status",
        category: "technical_quality",
        name: "Homepage returns an error status",
        description: `The homepage returned HTTP ${home.status_code}.`,
        weight: 1.0,
        severity: "CRITICAL",
        evidence: { status_code: home.status_code },
        recommendation: "Fix the homepage so it returns HTTP 200.",
      })
    );
  }

  if (home?.robots_meta?.noindex) {
    checks.push(
      fail({
        check_id: "noindex",
        category: "technical_quality",
        name: "Homepage blocks indexing",
        description: "The homepage contains a robots noindex directive.",
        weight: 1.5,
        severity: "CRITICAL",
        evidence: { robots: home.robots_meta.content ?? "noindex" },
        recommendation: "Remove noindex from the homepage if it should be discoverable.",
        why_matters: "A noindex homepage tells agents and crawlers to ignore the site entirely.",
      })
    );
  } else {
    checks.push(
      pass({
        check_id: "noindex",
        category: "technical_quality",
        name: "Homepage is indexable",
        description: home?.robots_meta?.content
          ? "The homepage does not block indexing."
          : "No blocking robots directive was found.",
        weight: 1.0,
        evidence: { robots: home?.robots_meta?.content ?? null },
      })
    );
  }

  if (!home) {
    checks.push(
      na("security_headers", "technical_quality", "Security headers not measured", "The homepage was not available to inspect response headers.", 0.5)
    );
  } else {
    const relevant = [
      "content-security-policy",
      "strict-transport-security",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
    ];
    const present = relevant.filter((k) => Boolean(home.response_headers[k]));
    if (present.length > 0) {
      checks.push(
        pass({
          check_id: "security_headers",
          category: "technical_quality",
          name: "Basic security headers present",
          description: "Some basic security headers were detected.",
          weight: 1.0,
          evidence: { headers: present.sort() },
        })
      );
    } else {
      checks.push(
        warn({
          check_id: "security_headers",
          category: "technical_quality",
          name: "Basic security headers missing",
          description: "No common security headers were detected on the homepage response.",
          weight: 1.0,
          evidence: { headers: [] },
          recommendation: "Add security headers such as Strict-Transport-Security and X-Content-Type-Options.",
        })
      );
    }
  }

  if (!home || home.redirect_chain.length === 0) {
    checks.push(
      na("redirect_chain", "technical_quality", "No redirect chain", "The homepage was fetched without redirects.", 0.5)
    );
  } else if (home.redirect_chain.length <= 1) {
    checks.push(
      pass({
        check_id: "redirect_chain",
        category: "technical_quality",
        name: "Redirects are minimal",
        description: "The homepage resolves with at most one redirect.",
        weight: 0.75,
        evidence: { chain: home.redirect_chain },
      })
    );
  } else {
    checks.push(
      warn({
        check_id: "redirect_chain",
        category: "technical_quality",
        name: "Long redirect chain",
        description: "The homepage requires several redirects to resolve.",
        weight: 0.75,
        evidence: { chain: home.redirect_chain },
        recommendation: "Reduce redirect hops; each hop slows agents and can drop metadata.",
      })
    );
  }

  return checks;
}

function analyzePerformance(ctx: CrawlContext): CheckResult[] {
  const checks: CheckResult[] = [];
  const home = homePage(ctx);
  const pages = ctx.crawl.pages.filter((p) => p.is_html);

  if (home) {
    const ms = home.response_time_ms;
    if (ms <= 800) {
      checks.push(
        pass({
          check_id: "homepage_response_time",
          category: "performance_accessibility",
          name: "Homepage responds quickly",
          description: `Homepage response time was ${ms}ms.`,
          weight: 1.5,
          evidence: { response_time_ms: ms },
        })
      );
    } else if (ms <= 2500) {
      checks.push(
        warn({
          check_id: "homepage_response_time",
          category: "performance_accessibility",
          name: "Homepage response time is elevated",
          description: `Homepage response time was ${ms}ms.`,
          weight: 1.5,
          evidence: { response_time_ms: ms },
          recommendation: "Improve server response time (caching, CDN, faster origin).",
        })
      );
    } else {
      checks.push(
        fail({
          check_id: "homepage_response_time",
          category: "performance_accessibility",
          name: "Homepage is slow to respond",
          description: `Homepage response time was ${ms}ms.`,
          weight: 1.5,
          severity: "MEDIUM",
          evidence: { response_time_ms: ms },
          recommendation: "Investigate slow server responses; agents may time out.",
          why_matters: "Slow sites cause agent timeouts and skipped pages.",
        })
      );
    }
  } else {
    checks.push(
      na("homepage_response_time", "performance_accessibility", "Homepage response time unavailable", "The homepage response time could not be measured.", 1.0)
    );
  }

  if (home?.viewport) {
    checks.push(
      pass({
        check_id: "mobile_viewport",
        category: "performance_accessibility",
        name: "Mobile viewport configured",
        description: "The homepage defines a viewport meta tag.",
        weight: 1.0,
        evidence: { viewport: home.viewport },
      })
    );
  } else {
    checks.push(
      warn({
        check_id: "mobile_viewport",
        category: "performance_accessibility",
        name: "Mobile viewport not configured",
        description: "No viewport meta tag was found on the homepage.",
        weight: 1.0,
        evidence: { page: ctx.baseUrl },
        recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
        why_matters: "A missing viewport signals poor mobile friendliness.",
      })
    );
  }

  const allImages = pages.flatMap((p) => p.images);
  if (allImages.length > 0) {
    const noAlt = allImages.filter((img) => !img.alt);
    const coverage = 1 - noAlt.length / allImages.length;
    if (coverage >= 0.9) {
      checks.push(
        pass({
          check_id: "image_alt",
          category: "performance_accessibility",
          name: "Images have alt text",
          description: "Most images include alt text.",
          weight: 1.0,
          evidence: { images: allImages.length, missing_alt: noAlt.length, coverage: Number(coverage.toFixed(2)) },
        })
      );
    } else {
      checks.push(
        warn({
          check_id: "image_alt",
          category: "performance_accessibility",
          name: "Many images lack alt text",
          description: `${noAlt.length} of ${allImages.length} images have no alt text.`,
          weight: 1.0,
          evidence: { images: allImages.length, missing_alt: noAlt.length, examples: noAlt.slice(0, 5).map((i) => i.src) },
          recommendation: "Add descriptive alt text to images.",
        })
      );
    }
  } else {
    checks.push(
      na("image_alt", "performance_accessibility", "No images to evaluate", "No images were found on the crawled pages.", 0.5)
    );
  }

  if (ctx.crawl.crawl_errors.length > 0 && pages.length === 0) {
    checks.push(
      fail({
        check_id: "availability",
        category: "performance_accessibility",
        name: "Website is not reachable",
        description: "No pages could be fetched from this website.",
        weight: 2.0,
        severity: "CRITICAL",
        evidence: { errors: ctx.crawl.crawl_errors.slice(0, 5) },
        recommendation: "Confirm the site is online and accessible from the public internet.",
        why_matters: "An unreachable website cannot be used by agents at all.",
      })
    );
  } else {
    checks.push(
      pass({
        check_id: "availability",
        category: "performance_accessibility",
        name: "Website is reachable",
        description: `Crawled ${pages.length} page(s) successfully.`,
        weight: 1.0,
        evidence: { pages: pages.length, crawl_errors: ctx.crawl.crawl_errors.length },
      })
    );
  }

  return checks;
}

function analyzeShopify(ctx: CrawlContext): CheckResult[] {
  const checks: CheckResult[] = [];
  const signals: Record<string, string>[] = [];

  for (const page of ctx.crawl.pages) {
    if (page.meta_generator && /shopify/i.test(page.meta_generator)) {
      signals.push({ page: page.url, signal: "generator_meta", value: page.meta_generator });
    }
    if (page.response_headers["x-shopid"]) {
      signals.push({ page: page.url, signal: "x-shopid" });
    }
    for (const link of page.links) {
      try {
        const u = new URL(link.href);
        if (/cdn\.shopify\.com/i.test(u.hostname) || /^\/cdn\/shop\//i.test(u.pathname)) {
          signals.push({ page: page.url, signal: "cdn", value: link.href });
          break;
        }
      } catch {
        // skip
      }
    }
  }

  if (signals.length === 0) {
    ctx.extra.platform = "Unknown";
    checks.push(
      na(
        "shopify_platform",
        "technical_quality",
        "Shopify platform",
        "This site is not built on Shopify (or the platform could not be identified). Shopify-specific checks are skipped.",
        0.25,
        { platform: "Unknown" }
      )
    );
    for (const [id, cat, name, desc, weight] of [
      ["shopify_product_schema", "structured_data", "Product schema on product pages", "Shopify product pages expose Product/Offer structured data.", 1.5],
      ["shopify_product_meta", "content_accessibility", "Product page metadata", "Shopify product pages define titles and meta descriptions.", 1.0],
      ["shopify_collection_navigation", "navigation_linking", "Collection pages linked", "Shopify collections are reachable through internal links.", 0.75],
      ["shopify_offer_details", "structured_data", "Offer details in product schema", "Shopify product schema includes price and availability.", 1.0],
    ] as [string, Category, string, string, number][]) {
      checks.push(na(id, cat, name, desc, weight, { platform: "Unknown" }));
    }
    return checks;
  }

  ctx.extra.platform = "Shopify";
  checks.push(
    pass({
      check_id: "shopify_platform",
      category: "technical_quality",
      name: "Shopify store detected",
      description: "The store is built on Shopify, so Shopify-specific checks were run.",
      weight: 0.25,
      evidence: { platform: "Shopify", signals: signals.slice(0, 10) },
    })
  );

  const htmlPages = ctx.crawl.pages.filter((p) => p.is_html);
  const productPages = htmlPages.filter((p) => {
    try { return new URL(p.url).pathname.startsWith("/products/"); } catch { return false; }
  });

  if (productPages.length > 0) {
    const withSchema = productPages.filter((p) =>
      p.structured_data.some((d) => extractTypes(d).some((t) => t === "Product" || t === "Service"))
    );
    if (withSchema.length > 0) {
      checks.push(
        pass({
          check_id: "shopify_product_schema",
          category: "structured_data",
          name: "Product schema on product pages",
          description: "Crawled Shopify product pages expose Product structured data.",
          weight: 1.5,
          evidence: { product_pages: productPages.length, with_schema: withSchema.length },
        })
      );
    } else {
      checks.push(
        fail({
          check_id: "shopify_product_schema",
          category: "structured_data",
          name: "Missing Product schema on product pages",
          description: "No Product/Service structured data was found on Shopify product pages.",
          weight: 1.5,
          severity: "HIGH",
          evidence: { product_pages: productPages.length, with_schema: 0 },
          recommendation: "Enable Shopify's built-in JSON-LD so every /products/ page emits Product + Offer structured data.",
        })
      );
    }
  } else {
    checks.push(
      warn({
        check_id: "shopify_product_schema",
        category: "structured_data",
        name: "No product pages crawled",
        description: "No /products/ URLs were found during the crawl, so product schema could not be verified.",
        weight: 1.5,
        evidence: { product_pages: 0 },
        recommendation: "Ensure product pages are reachable from the storefront so the crawler can inspect them.",
      })
    );
  }

  return checks;
}

export function runAnalyzers(ctx: CrawlContext): CheckResult[] {
  return [
    ...analyzeRobots(ctx),
    ...analyzeSitemap(ctx),
    ...analyzeMetadata(ctx),
    ...analyzeSemantic(ctx),
    ...analyzeStructuredData(ctx),
    ...analyzeLinks(ctx),
    ...analyzeContent(ctx),
    ...analyzeTechnical(ctx),
    ...analyzePerformance(ctx),
    ...analyzeShopify(ctx),
  ];
}
