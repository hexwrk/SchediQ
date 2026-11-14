"use client";

import type { Datum } from "./charts";
import type { CsvCell } from "./report";

// Real PDF export for reports: builds the file in the browser with jsPDF +
// jspdf-autotable and saves it as a download (no print dialog, no server
// load, so it works the same on Vercel). Charts are drawn as vector shapes
// straight into the PDF rather than screenshotted, so they stay sharp and
// need no html2canvas.

export interface PdfChart {
  title: string;
  data: Datum[];
  unit?: string;
}

export interface PdfTable {
  title?: string;
  head: string[];
  rows: CsvCell[][];
  align?: ("l" | "r")[];
}

export interface PdfReport {
  filename: string;
  title: string;
  subtitle?: string;
  user: { name: string; email: string; username?: string } | null;
  period?: string;
  summary: [string, string | number][];
  charts?: PdfChart[];
  tables: PdfTable[];
  notes?: string[];
}

const PRIMARY: [number, number, number] = [52, 84, 209];
const MUTED: [number, number, number] = [100, 116, 139];
const TEXT: [number, number, number] = [15, 23, 42];
const BORDER: [number, number, number] = [226, 232, 240];
const PALETTE = ["#3454D1", "#0E9E7E", "#D98324", "#6B52E0", "#DC2626", "#0891B2", "#64748B"];

const PAGE_MARGIN = 40;

// jsPDF's built-in Helvetica only covers Latin-1. Anything outside it (emoji,
// CJK, smart quotes in pasted task titles) would print as garbage, so map the
// common punctuation and replace the rest with "?" instead.
function pdfText(value: CsvCell): string {
  const s = value === null || value === undefined ? "" : String(value);
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\t\n\r\u0020-\u00FF]/g, "?");
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : PRIMARY;
}

// Same "nice" axis maximum idea as the on-screen BarChart: 1, 2 or 5 x 10^n.
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

export async function downloadReportPdf(report: PdfReport): Promise<void> {
  // Loaded on click: keeps ~300 KB of PDF code out of every page's bundle.
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - PAGE_MARGIN * 2;
  const generated = new Date();
  let y = PAGE_MARGIN;

  // Start a new page when the next block would not fit.
  const ensure = (needed: number) => {
    if (y + needed > pageH - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };

  // ---- Header: title, generated date, who it is for ----
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...PRIMARY);
  doc.text("SCHEDIQ REPORT", PAGE_MARGIN, y);
  y += 20;
  doc.setFontSize(20).setTextColor(...TEXT);
  doc.text(pdfText(report.title), PAGE_MARGIN, y);
  y += 16;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
  if (report.subtitle) {
    doc.text(pdfText(report.subtitle), PAGE_MARGIN, y);
    y += 14;
  }
  if (report.period) {
    doc.setTextColor(...TEXT).text(`Period: ${pdfText(report.period)}`, PAGE_MARGIN, y);
    y += 14;
  }
  // Right-hand identity block, aligned with the title.
  const rightX = pageW - PAGE_MARGIN;
  const who = report.user
    ? [
        report.user.name,
        report.user.username ? `@${report.user.username}` : null,
        report.user.email,
      ].filter(Boolean)
    : [];
  doc.setFontSize(10);
  let ry = PAGE_MARGIN + 20;
  who.forEach((line, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal").setTextColor(...(i === 0 ? TEXT : MUTED));
    doc.text(pdfText(line), rightX, ry, { align: "right" });
    ry += 13;
  });
  doc.setFont("helvetica", "normal").setTextColor(...MUTED);
  doc.text(
    `Generated ${generated.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} ${generated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`,
    rightX,
    ry,
    { align: "right" }
  );
  y = Math.max(y, ry) + 12;
  doc.setDrawColor(...BORDER).setLineWidth(1).line(PAGE_MARGIN, y, pageW - PAGE_MARGIN, y);
  y += 18;

  // ---- Summary totals: a row of boxes ----
  if (report.summary.length > 0) {
    const cols = Math.min(4, report.summary.length);
    const gap = 8;
    const boxW = (contentW - gap * (cols - 1)) / cols;
    const boxH = 42;
    report.summary.forEach(([k, v], i) => {
      const col = i % cols;
      if (col === 0) ensure(boxH + gap);
      const x = PAGE_MARGIN + col * (boxW + gap);
      doc.setDrawColor(...BORDER).roundedRect(x, y, boxW, boxH, 4, 4, "S");
      doc.setFontSize(7.5).setTextColor(...MUTED).text(pdfText(k).toUpperCase(), x + 8, y + 14, { maxWidth: boxW - 16 });
      doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...TEXT).text(pdfText(v), x + 8, y + 33);
      doc.setFont("helvetica", "normal");
      if (col === cols - 1 || i === report.summary.length - 1) y += boxH + gap;
    });
    y += 10;
  }

  // ---- Charts: vector bar charts ----
  for (const chart of report.charts ?? []) {
    const chartH = 150;
    ensure(chartH + 50);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...TEXT).text(pdfText(chart.title), PAGE_MARGIN, y);
    doc.setFont("helvetica", "normal");
    y += 12;
    const data = chart.data;
    if (data.length === 0 || data.every((d) => d.value === 0)) {
      doc.setFontSize(9).setTextColor(...MUTED).text("No data in this range.", PAGE_MARGIN, y + 12);
      y += 30;
      continue;
    }
    const axisW = 30;
    const plotX = PAGE_MARGIN + axisW;
    const plotW = contentW - axisW;
    const top = y + 6;
    const max = niceMax(Math.max(...data.map((d) => d.value)));
    // Gridlines at 0, 50% and 100% with their values.
    doc.setFontSize(7).setTextColor(...MUTED).setDrawColor(...BORDER).setLineWidth(0.5);
    for (const f of [0, 0.5, 1]) {
      const gy = top + chartH * (1 - f);
      doc.line(plotX, gy, plotX + plotW, gy);
      doc.text(String(Math.round(max * f * 10) / 10), plotX - 4, gy + 2.5, { align: "right" });
    }
    const slot = plotW / data.length;
    const barW = Math.min(36, slot * 0.7);
    // Thin out labels when there are many bars so they never overlap.
    const every = Math.ceil(data.length / 14);
    data.forEach((d, i) => {
      const h = (d.value / max) * chartH;
      const x = plotX + i * slot + (slot - barW) / 2;
      doc.setFillColor(...hexToRgb(d.color ?? PALETTE[i % PALETTE.length]));
      if (h > 0) doc.rect(x, top + chartH - h, barW, h, "F");
      if (i % every === 0) {
        const label = pdfText(d.label);
        doc.setFontSize(7).setTextColor(...MUTED);
        doc.text(label.length > 14 ? `${label.slice(0, 13)}...` : label, x + barW / 2, top + chartH + 10, { align: "center" });
      }
    });
    y = top + chartH + 18;
    if (chart.unit) {
      doc.setFontSize(7).setTextColor(...MUTED).text(pdfText(chart.unit), plotX, y);
      y += 10;
    }
    y += 10;
  }

  // ---- Tables ----
  for (const table of report.tables) {
    ensure(60);
    if (table.title) {
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...TEXT).text(pdfText(table.title), PAGE_MARGIN, y);
      doc.setFont("helvetica", "normal");
      y += 8;
    }
    const columnStyles = Object.fromEntries(
      (table.align ?? []).map((a, i) => [i, { halign: a === "r" ? ("right" as const) : ("left" as const) }])
    );
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_MARGIN, bottom: PAGE_MARGIN + 10 },
      head: [table.head.map(pdfText)],
      body: table.rows.length > 0 ? table.rows.map((r) => r.map(pdfText)) : [[{ content: "No rows in this period.", colSpan: table.head.length }]],
      columnStyles,
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: TEXT, lineColor: BORDER },
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: "grid",
    });
    // autoTable records where it ended so the next block starts below it.
    y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 22;
  }

  for (const note of report.notes ?? []) {
    ensure(30);
    doc.setFontSize(9).setTextColor(...TEXT);
    const lines = doc.splitTextToSize(pdfText(note), contentW);
    doc.text(lines, PAGE_MARGIN, y);
    y += lines.length * 12 + 6;
  }

  // ---- Footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5).setTextColor(...MUTED);
    doc.text("Generated by SchediQ from live data.", PAGE_MARGIN, pageH - 20);
    doc.text(`Page ${p} of ${pages}`, pageW - PAGE_MARGIN, pageH - 20, { align: "right" });
  }

  doc.setProperties({ title: report.title, subject: report.subtitle ?? "", creator: "SchediQ" });
  // save() builds a Blob and clicks an <a download>: a real .pdf file download.
  doc.save(report.filename);
}
