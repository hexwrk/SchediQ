"use client";

import { useEffect, useState } from "react";
import { AccessDenied } from "@/lib/access-denied";
import { ApiError, DataModel, adminApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// Read-only "how it links together" view for presentations: the entities,
// their relationships in plain language, and live row counts from Postgres.

// Simple fixed layout for the relationship diagram (inline SVG, no library).
const BOXES: Record<string, { x: number; y: number }> = {
  User: { x: 260, y: 10 },
  Preference: { x: 20, y: 10 },
  Subject: { x: 120, y: 120 },
  Course: { x: 400, y: 120 },
  Task: { x: 120, y: 230 },
  Lesson: { x: 400, y: 230 },
  StudySession: { x: 120, y: 340 },
};
const EDGES: [string, string, string][] = [
  ["User", "Preference", "1 : 1"],
  ["User", "Subject", "1 : many"],
  ["User", "Course", "1 : many"],
  ["Subject", "Task", "1 : many"],
  ["Subject", "Course", "1 : many"],
  ["Course", "Lesson", "1 : many"],
  ["Lesson", "Task", "1 : 0..1"],
  ["Task", "StudySession", "1 : many"],
];
const BW = 130;
const BH = 44;

export default function DataModelPage() {
  const { token } = useAuth();
  const [model, setModel] = useState<DataModel | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    adminApi
      .dataModel(token)
      .then(setModel)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setError(err instanceof ApiError ? err.message : "Failed to load");
      });
  }, [token]);

  if (forbidden) return <AccessDenied />;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!model) return <p className="text-sm text-text-muted">Loading data model...</p>;

  const rows = Object.fromEntries(model.entities.map((e) => [e.name, e.rows]));

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <p className="text-sm text-text-muted">
        Live from PostgreSQL at {new Date(model.generatedAt).toLocaleTimeString()}. Each box is a table; each line is a
        foreign-key relationship.
      </p>

      <div className="grid gap-6 lg:grid-cols-[560px_1fr]">
        <div className="rounded-card border border-border bg-surface p-4">
          <svg viewBox="0 0 560 400" className="w-full" role="img" aria-label="Entity relationship diagram">
            {EDGES.map(([a, b, label]) => {
              const A = BOXES[a];
              const B = BOXES[b];
              const x1 = A.x + BW / 2;
              const y1 = A.y + BH / 2;
              const x2 = B.x + BW / 2;
              const y2 = B.y + BH / 2;
              return (
                <g key={`${a}-${b}`}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--border)" strokeWidth={2} />
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 4}
                    fontSize="10"
                    textAnchor="middle"
                    fill="var(--text-muted)"
                    style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4 }}
                  >
                    {label}
                  </text>
                </g>
              );
            })}
            {Object.entries(BOXES).map(([name, { x, y }]) => (
              <g key={name}>
                <rect x={x} y={y} width={BW} height={BH} rx={8} fill="var(--surface)" stroke="var(--primary)" strokeWidth={1.5} />
                <text x={x + BW / 2} y={y + 19} fontSize="13" fontWeight={600} textAnchor="middle" fill="var(--text)">
                  {name}
                </text>
                <text x={x + BW / 2} y={y + 34} fontSize="10" textAnchor="middle" fill="var(--text-muted)">
                  {rows[name] ?? 0} rows
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">How the parts connect</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            {model.flows.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {model.entities.map((e) => (
          <div key={e.name} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">{e.name}</h3>
              <span className="text-xs text-text-muted">{e.rows} rows</span>
            </div>
            <p className="text-sm text-text-muted">{e.purpose}</p>
            <ul className="flex flex-col gap-0.5 text-xs">
              {e.relations.map((r) => (
                <li key={r}>→ {r}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
