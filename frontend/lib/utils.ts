import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "—";
  return score.toFixed(0);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ratingLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) return "Pending";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Moderate";
  if (score >= 40) return "Poor";
  return "Critical";
}

export function confidenceLabel(pages?: number | null): string {
  if (pages === undefined || pages === null) return "—";
  if (pages === 0) return "VERY LOW";
  if (pages < 3) return "LOW";
  if (pages < 10) return "MEDIUM";
  if (pages < 30) return "HIGH";
  return "HIGH";
}

export function gradeFromScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "—";
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case "Excellent":
      return "text-green-600";
    case "Good":
      return "text-green-600";
    case "Moderate":
      return "text-amber-500";
    case "Poor":
      return "text-orange-500";
    case "Critical":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}
