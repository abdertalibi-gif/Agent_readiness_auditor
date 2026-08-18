import { describe, expect, it } from "vitest";
import { cn, formatScore, ratingLabel, formatDate } from "@/lib/utils";

describe("formatScore", () => {
  it("formats scores to integers", () => {
    expect(formatScore(87.4)).toBe("87");
    expect(formatScore(0)).toBe("0");
    expect(formatScore(100)).toBe("100");
  });

  it("renders a placeholder for missing scores", () => {
    expect(formatScore(null)).toBe("—");
    expect(formatScore(undefined)).toBe("—");
  });
});

describe("ratingLabel", () => {
  it("maps scores to bands", () => {
    expect(ratingLabel(95)).toBe("Excellent");
    expect(ratingLabel(80)).toBe("Good");
    expect(ratingLabel(65)).toBe("Moderate");
    expect(ratingLabel(45)).toBe("Poor");
    expect(ratingLabel(20)).toBe("Critical");
  });

  it("handles missing scores", () => {
    expect(ratingLabel(null)).toBe("Pending");
  });
});

describe("formatDate", () => {
  it("renders a readable date", () => {
    const out = formatDate("2026-01-15T10:00:00Z");
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/Jan/);
  });

  it("falls back for invalid input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("cn", () => {
  it("merges tailwind classes and drops falsy values", () => {
    expect(cn("px-2", "py-1", false && "hidden", null, undefined)).toBe("px-2 py-1");
  });

  it("dedupes conflicting tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
