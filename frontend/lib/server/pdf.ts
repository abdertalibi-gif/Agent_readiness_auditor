import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Check, PageOut, Recommendation } from "@/lib/types";
import type { AuditRecord } from "./store";

function sanitizeAscii(text: string): string {
  // Standard PDF fonts (Helvetica) support WinAnsi; strip non-Latin characters cleanly so pdf-lib never throws.
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, " ");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = sanitizeAscii(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += " " + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function generateReportPdf(
  audit: AuditRecord,
  checks: Check[],
  recs: Recommendation[],
  pages: PageOut[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const drawText = (text: string, opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number }) => {
    const size = opts?.size ?? 10;
    const font = opts?.bold ? fontBold : fontRegular;
    const color = opts?.color ?? rgb(0.12, 0.14, 0.18);
    const indent = opts?.indent ?? 0;
    const maxChars = Math.max(25, Math.floor((contentWidth - indent) / (size * 0.52)));
    for (const line of wrapText(text, maxChars)) {
      ensureSpace(size + 5);
      page.drawText(line, { x: margin + indent, y, size, font, color });
      y -= size + 5;
    }
  };

  const drawSectionHeading = (title: string) => {
    y -= 8;
    ensureSpace(24);
    page.drawText(sanitizeAscii(title), {
      x: margin,
      y,
      size: 13,
      font: fontBold,
      color: rgb(0.08, 0.25, 0.55),
    });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.75,
      color: rgb(0.84, 0.87, 0.91),
    });
    y -= 14;
  };

  // Header
  drawText("AGENT READINESS AUDIT REPORT", { size: 18, bold: true, color: rgb(0.06, 0.14, 0.34) });
  drawText(`Target Website: ${audit.target_url}`, { size: 11, bold: true });
  drawText(`Audit ID: ${audit.id}   |   Status: ${audit.status}   |   Date: ${audit.completed_at ?? audit.created_at}`, {
    size: 9,
    color: rgb(0.4, 0.45, 0.52),
  });
  y -= 6;

  const summary = audit.summary_json;
  const scoreStr = audit.score !== null ? `${audit.score.toFixed(1)} / 100 (${summary?.rating_label ?? audit.rating ?? ""})` : "N/A";
  drawText(`Overall Agent Readiness Score: ${scoreStr}`, { size: 13, bold: true, color: rgb(0.08, 0.38, 0.25) });
  if (summary?.platform) {
    drawText(`Detected Platform: ${summary.platform}   |   Pages Crawled: ${summary.coverage?.pages ?? pages.length}`, { size: 10 });
  }

  // Category scores
  if (summary?.categories?.length) {
    drawSectionHeading("Category Breakdown");
    for (const cat of summary.categories) {
      drawText(
        `${cat.label}: ${cat.score.toFixed(1)}/100  (Passed: ${cat.checks_passed}, Warnings: ${cat.checks_warning}, Failed: ${cat.checks_failed})`,
        { size: 10 }
      );
    }
  }

  // Priority findings
  const priorityIssues = checks.filter((c) => c.status === "FAIL" || c.status === "WARNING");
  if (priorityIssues.length > 0) {
    drawSectionHeading(`Findings (${priorityIssues.length})`);
    for (const item of priorityIssues.slice(0, 30)) {
      drawText(`[${item.status} | ${item.severity}] ${item.name}`, { size: 10, bold: true });
      if (item.description) drawText(item.description, { size: 9, indent: 12, color: rgb(0.32, 0.36, 0.42) });
      if (item.recommendation) drawText(`Fix: ${item.recommendation}`, { size: 9, indent: 12, color: rgb(0.1, 0.3, 0.5) });
      y -= 2;
    }
  }

  // Recommendations
  if (recs.length > 0) {
    drawSectionHeading(`Recommendations Roadmap (${recs.length})`);
    for (const rec of recs.slice(0, 25)) {
      drawText(`[${rec.priority}] ${rec.title} (Effort: ${rec.effort ?? "Medium"}, Impact: ${rec.impact ?? "Medium"})`, {
        size: 10,
        bold: true,
      });
      if (rec.how_to_fix) drawText(rec.how_to_fix, { size: 9, indent: 12, color: rgb(0.32, 0.36, 0.42) });
      y -= 2;
    }
  }

  // Analyzed pages
  if (pages.length > 0) {
    drawSectionHeading(`Analyzed Pages (${pages.length})`);
    for (const p of pages.slice(0, 30)) {
      drawText(`${p.url}  [HTTP ${p.status_code ?? "-"} | ${p.response_time_ms ?? 0}ms | ${p.word_count} words]`, {
        size: 9,
      });
    }
  }

  return doc.save();
}
