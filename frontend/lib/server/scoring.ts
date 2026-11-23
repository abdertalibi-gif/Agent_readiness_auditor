import type { Category } from "@/lib/types";
import type { CheckResult } from "./analyzers";
import type { AuditSummaryCategory } from "./store";

export const CATEGORY_LABELS: Record<Category, string> = {
  discoverability: "Discoverability",
  crawlability: "Crawlability",
  semantic_structure: "Semantic Structure",
  structured_data: "Structured Data",
  content_accessibility: "Content Accessibility",
  navigation_linking: "Navigation & Linking",
  technical_quality: "Technical Quality",
  performance_accessibility: "Performance & Accessibility",
};

export const CATEGORY_WEIGHTS: Record<Category, number> = {
  discoverability: 0.15,
  crawlability: 0.15,
  semantic_structure: 0.15,
  structured_data: 0.15,
  content_accessibility: 0.15,
  navigation_linking: 0.1,
  technical_quality: 0.1,
  performance_accessibility: 0.05,
};

export const CATEGORIES: Category[] = Object.keys(CATEGORY_WEIGHTS) as Category[];

export function ratingFor(score: number): { rating: string; label: string } {
  if (score >= 90) return { rating: "EXCELLENT", label: "Excellent" };
  if (score >= 75) return { rating: "GOOD", label: "Good" };
  if (score >= 60) return { rating: "MODERATE", label: "Moderate" };
  if (score >= 40) return { rating: "POOR", label: "Poor" };
  return { rating: "CRITICAL", label: "Critical" };
}

function statusFor(score: number): string {
  if (score >= 75) return "good";
  if (score >= 55) return "warning";
  return "critical";
}

export interface ScoreResult {
  overall: number;
  rating: string;
  rating_label: string;
  categories: AuditSummaryCategory[];
  counts: Record<string, number>;
}

export function scoreChecks(checks: CheckResult[]): ScoreResult {
  const byCategory = new Map<Category, CheckResult[]>();
  for (const cat of CATEGORIES) byCategory.set(cat, []);
  for (const c of checks) {
    const list = byCategory.get(c.category);
    if (list) list.push(c);
  }

  const counts: Record<string, number> = { PASS: 0, WARNING: 0, FAIL: 0, NOT_APPLICABLE: 0 };
  const categories: AuditSummaryCategory[] = [];

  for (const category of CATEGORIES) {
    const items = byCategory.get(category) ?? [];
    for (const c of items) {
      counts[c.status] = (counts[c.status] ?? 0) + 1;
    }
    const scorable = items.filter((c) => c.status !== "NOT_APPLICABLE");
    if (scorable.length === 0) {
      categories.push({
        category,
        label: CATEGORY_LABELS[category],
        score: 0,
        weight: CATEGORY_WEIGHTS[category],
        status: "not_measured",
        checks_total: items.length,
        checks_passed: 0,
        checks_failed: 0,
        checks_warning: 0,
      });
      continue;
    }

    const weightTotal = scorable.reduce((acc, c) => acc + c.weight, 0) || 1;
    const rawScore = scorable.reduce((acc, c) => acc + c.score * c.weight, 0) / weightTotal;
    const rounded = Math.round(rawScore * 10) / 10;

    categories.push({
      category,
      label: CATEGORY_LABELS[category],
      score: rounded,
      weight: CATEGORY_WEIGHTS[category],
      status: statusFor(rawScore),
      checks_total: items.length,
      checks_passed: scorable.filter((c) => c.status === "PASS").length,
      checks_failed: scorable.filter((c) => c.status === "FAIL").length,
      checks_warning: scorable.filter((c) => c.status === "WARNING").length,
    });
  }

  const overallRaw = categories.reduce((acc, cat) => acc + cat.score * CATEGORY_WEIGHTS[cat.category], 0);
  const overall = Math.round(overallRaw * 10) / 10;
  const { rating, label } = ratingFor(overall);

  return { overall, rating, rating_label: label, categories, counts };
}
