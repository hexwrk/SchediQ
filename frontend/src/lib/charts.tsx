"use client";

// Minimal, dependency-free SVG charts for reports. Plain SVG prints crisply in
// "Save as PDF" (no canvas), and every mark carries a <title> tooltip.

export interface Datum {
  label: string;
  value: number;
  color?: string;
}

const PALETTE = ["#3454D1", "#0E9E7E", "#D98324", "#6B52E0", "#DC2626", "#0891B2", "#64748B"];

// HTML bars (flex items with % heights) rather than an SVG viewBox: label
// text stays the same size whatever the container width, so the chart reads
// the same in a full-width card, a half-width grid cell, on a phone, or in print.
export function BarChart({
  data,
  unit = "",
  height = 180,
  ariaLabel,
}: {
  data: Datum[];
  unit?: string;
  height?: number;
  ariaLabel: string;
}) {
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <p className="py-6 text-center text-sm text-text-muted">No data in this range.</p>;
  }
  const nice = niceMax(Math.max(...data.map((d) => d.value)));
  // Thin out x labels when there are many bars so they never overlap.
  const every = Math.ceil(data.length / 12);

  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <div className="flex w-8 shrink-0 flex-col justify-between text-right text-[10px] text-text-muted" style={{ height }}>
          <span>{nice}</span>
          <span>{nice / 2}</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }}>
          {[0, 50, 100].map((f) => (
            <div key={f} className="absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${f}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end justify-around gap-1">
            {data.map((d, i) => (
              <div
                key={`${d.label}-${i}`}
                title={`${d.label}: ${d.value}${unit ? ` ${unit}` : ""}`}
                className="w-full max-w-12 rounded-t"
                style={{ height: `${(d.value / nice) * 100}%`, background: d.color ?? PALETTE[0] }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="w-8 shrink-0" />
        {/* min-w-0 lets long labels truncate instead of widening the chart. */}
        <div className="flex min-w-0 flex-1 justify-around gap-1">
          {data.map((d, i) => (
            <span key={`${d.label}-${i}`} className="w-full min-w-0 truncate text-center text-[10px] text-text-muted" title={d.label}>
              {i % every === 0 ? d.label : ""}
            </span>
          ))}
        </div>
      </div>
      {unit && <span className="pl-10 text-[10px] text-text-muted">{unit}</span>}
    </div>
  );
}

export function DonutChart({ data, ariaLabel }: { data: Datum[]; ariaLabel: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="py-6 text-center text-sm text-text-muted">No data in this range.</p>;
  const R = 60;
  const r = 36;
  const slices = data.filter((d) => d.value > 0);
  // Start angle of each slice = 12 o'clock + the share of all slices before it.
  const arcs = slices.map((d, i) => {
    const before = slices.slice(0, i).reduce((s, x) => s + x.value, 0);
    const start = -Math.PI / 2 + (before / total) * Math.PI * 2;
    const sweep = (d.value / total) * Math.PI * 2;
    return { ...d, color: d.color ?? PALETTE[i % PALETTE.length], path: arcPath(R, r, start, start + sweep, sweep) };
  });

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="-70 -70 140 140" className="h-36 w-36 shrink-0" role="img" aria-label={ariaLabel}>
        {arcs.map((a) => (
          <path key={a.label} d={a.path} fill={a.color}>
            <title>{`${a.label}: ${a.value} (${Math.round((100 * a.value) / total)}%)`}</title>
          </path>
        ))}
        <text y="5" textAnchor="middle" fontSize="16" fontWeight={600} fill="var(--text)">
          {total}
        </text>
      </svg>
      <ul className="flex flex-col gap-1 text-sm">
        {arcs.map((a) => (
          <li key={a.label} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: a.color }} />
            <span>{a.label}</span>
            <span className="text-text-muted">
              {a.value} ({Math.round((100 * a.value) / total)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Round the axis maximum up to 1/2/5 x 10^n so gridline labels are readable.
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function arcPath(R: number, r: number, a0: number, a1: number, sweep: number): string {
  // A full circle cannot be drawn as one arc; nudge it just under 360 degrees.
  if (sweep >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (rad: number, a: number) => `${(rad * Math.cos(a)).toFixed(3)} ${(rad * Math.sin(a)).toFixed(3)}`;
  return `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
}
