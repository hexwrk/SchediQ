"use client";

import Link from "next/link";
import { useAuth } from "./auth-context";

// Shared chrome for every printable report: title, generated date, the person
// it is for, and Print / CSV actions. The app shell (sidebar, top bar) is
// hidden in print via print:hidden in the (app) layout, so "Print / Save as
// PDF" produces a clean single-column document.

export type CsvCell = string | number | null | undefined;

// CSV-escape one cell. Also neutralises spreadsheet formula injection: a cell
// starting with = + - @ (or tab/CR) is prefixed with ' so Excel/Sheets treat it
// as text. Task titles are user input, so this matters on export.
function csvCell(value: CsvCell): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, header: string[], rows: CsvCell[][]) {
  // Pad short rows to the header width so every line has the same number of
  // columns (spreadsheets and CSV validators expect a rectangular table).
  const width = Math.max(header.length, ...rows.map((r) => r.length));
  const pad = (r: CsvCell[]) => [...r, ...Array(Math.max(0, width - r.length)).fill("")];
  const lines = [header, ...rows].map((r) => pad(r).map(csvCell).join(","));
  // BOM so Excel opens UTF-8 (names with accents) correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function slugDate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface Range {
  from: string; // YYYY-MM-DD or "" (open)
  to: string;
}

function rangeLabel({ from, to }: Range): string {
  const f = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  if (from && to) return `${f(from)} to ${f(to)}`;
  if (from) return `From ${f(from)}`;
  if (to) return `Up to ${f(to)}`;
  return "All dates";
}

export function ReportFrame({
  title,
  subtitle,
  onCsv,
  range,
  onRange,
  rangeHint,
  children,
}: {
  title: string;
  subtitle: string;
  onCsv: () => void;
  // Optional date-range filter. The inputs are screen-only; the chosen
  // period is printed in the header so the PDF says what it covers.
  range?: Range;
  onRange?: (r: Range) => void;
  rangeHint?: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const now = new Date();
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/reports" className="text-sm text-primary hover:underline">
          &larr; All reports
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Print / Save as PDF
          </button>
          <button
            onClick={onCsv}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-bg"
          >
            Download CSV
          </button>
        </div>
      </div>

      {range && onRange && (
        <div className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4 print:hidden">
          <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
            From
            <input
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={(e) => onRange({ ...range, from: e.target.value })}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
            To
            <input
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => onRange({ ...range, to: e.target.value })}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-primary"
            />
          </label>
          <button onClick={() => onRange({ from: "", to: "" })} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg">
            All dates
          </button>
          {rangeHint && <span className="text-xs text-text-muted">{rangeHint}</span>}
        </div>
      )}

      <article className="flex flex-col gap-5 rounded-card border border-border bg-surface p-8 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">SchediQ report</p>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-text-muted">{subtitle}</p>
            {range && <p className="mt-1 text-sm font-medium">Period: {rangeLabel(range)}</p>}
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{user?.name}</p>
            <p className="text-text-muted">{user?.email}</p>
            <p className="text-text-muted">
              Generated {now.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}{" "}
              {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </header>
        {children}
        <footer className="border-t border-border pt-3 text-xs text-text-muted">
          Generated by SchediQ from live data. Figures are derived from your saved tasks, sessions and lessons.
        </footer>
      </article>
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 break-inside-avoid flex-col gap-2 rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function ReportTable({ head, rows, align }: { head: string[]; rows: CsvCell[][]; align?: ("l" | "r")[] }) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-[480px] border-collapse text-sm print:min-w-0">
      <thead>
        <tr className="border-b-2 border-text/20 text-left text-xs uppercase tracking-wide text-text-muted">
          {head.map((h, i) => (
            <th key={h} className={`py-2 pr-3 font-semibold ${align?.[i] === "r" ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="break-inside-avoid border-b border-border">
            {r.map((c, ci) => (
              <td key={ci} className={`py-1.5 pr-3 ${align?.[ci] === "r" ? "text-right tabular-nums" : ""}`}>
                {c ?? ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

export function Kv({ items }: { items: [string, string | number][] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg bg-bg p-3 print:border print:border-border print:bg-transparent">
          <dt className="text-xs uppercase tracking-wide text-text-muted">{k}</dt>
          <dd className="text-lg font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
