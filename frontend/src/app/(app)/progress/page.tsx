"use client";

import { useProgress } from "@/lib/progress-context";
import { FlameIcon, TrophyIcon } from "@/lib/icons";
import { ErrorState, LoadingState } from "@/lib/states";

export default function ProgressPage() {
  const { progress, loading, refresh } = useProgress();

  if (loading) return <LoadingState label="Loading progress" rows={3} />;
  if (!progress)
    return (
      <ErrorState
        message="Your progress could not be loaded. Your XP is safe: it is recalculated from your saved work."
        onRetry={() => void refresh()}
      />
    );

  const { levelProgress, streak, badges, leaderboard, rank, totalUsers } = progress;
  const pct =
    levelProgress.span > 0 ? levelProgress.intoLevel / levelProgress.span : 1;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      {/* Top cards: level ring, streak, rank */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex items-center gap-5 rounded-card border border-border bg-surface p-5">
          <LevelRing pct={pct} level={progress.level} />
          <div>
            <p className="text-sm font-semibold">
              Level {progress.level} <span className="font-normal text-text-muted">· {progress.levelTitle}</span>
            </p>
            <p className="text-2xl font-semibold tracking-tight">{progress.xp} XP</p>
            <p className="text-xs text-text-muted">
              {levelProgress.toNext} XP to level {progress.level + 1}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber/10 text-amber">
            <FlameIcon width={28} height={28} />
          </span>
          <div>
            <p className="text-sm font-semibold">Current streak</p>
            <p className="text-2xl font-semibold tracking-tight">
              {streak} {streak === 1 ? "day" : "days"}
            </p>
            <p className="text-xs text-text-muted">Consecutive days with a completed session</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <TrophyIcon width={28} height={28} />
          </span>
          <div>
            <p className="text-sm font-semibold">Campus rank</p>
            <p className="text-2xl font-semibold tracking-tight">
              {rank ? `#${rank}` : "—"}
              <span className="text-base font-normal text-text-muted"> / {totalUsers}</span>
            </p>
            <p className="text-xs text-text-muted">Ranked by XP across the cohort</p>
          </div>
        </div>
      </div>

      {/* How to earn XP: every source, its value, and what you have earned from it */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-card border border-border bg-surface p-5">
          <h2 className="mb-1 text-sm font-semibold">How to earn XP</h2>
          <p className="mb-4 text-xs text-text-muted">
            XP is recalculated from your saved study sessions, lessons and quizzes every time, so it
            never drifts and always survives a reload.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium">Worth</th>
                <th className="pb-2 text-right font-medium">You earned</th>
              </tr>
            </thead>
            <tbody>
              {progress.xpRules.sources.map((r) => (
                <tr key={r.source} className="border-t border-border align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{r.label}</span>
                    <span className="block text-xs text-text-muted">{r.howTo}</span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-primary">{r.amount}</td>
                  <td className="py-2 text-right font-semibold">{progress.breakdown[r.source]} XP</td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="pt-2 font-semibold" colSpan={2}>
                  Total
                </td>
                <td className="pt-2 text-right font-semibold">{progress.xp} XP</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-card border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">Recent XP</h2>
          {progress.recentEvents.length === 0 ? (
            <p className="text-sm text-text-muted">Complete a study block or a lesson to earn your first XP.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {progress.recentEvents.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate">{e.label}</span>
                    <span className="text-xs text-text-muted">{new Date(e.at).toLocaleString()}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-accent">+{e.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Badges</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((b) => (
            <div
              key={b.key}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                b.unlocked
                  ? "border-accent/40 bg-accent/5"
                  : "border-border bg-bg opacity-60"
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  b.unlocked ? "bg-accent/15 text-accent" : "bg-border/60 text-text-muted"
                }`}
              >
                <TrophyIcon width={20} height={20} />
              </span>
              <div>
                <p className="text-sm font-medium">{b.label}</p>
                <p className="text-xs text-text-muted">{b.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="rounded-card border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Leaderboard</h2>
          <span className="rounded-full bg-bg px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Demo cohort
          </span>
        </div>
        <p className="mb-4 text-xs text-text-muted">
          Seeded classmate accounts. XP is derived from completed sessions,
          lessons and quizzes with the exact same rules for everyone, including you.
        </p>
        <ol className="flex flex-col gap-1.5">
          {leaderboard.map((e) => (
            <li
              key={e.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                e.isCurrentUser ? "bg-primary/10 font-semibold text-primary" : ""
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-text-muted">{e.rank}.</span>
                <span>{e.name}</span>
                {e.isCurrentUser && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-white">
                    You
                  </span>
                )}
                {e.isDemo && !e.isCurrentUser && (
                  <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] text-text-muted">
                    demo
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-text-muted">Lv {e.level}</span>
                <span>{e.xp} XP</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// Circular level ring using a conic-gradient fill for the progress arc.
function LevelRing({ pct, level }: { pct: number; level: number }) {
  const deg = Math.round(pct * 360);
  return (
    <div
      className="relative flex h-20 w-20 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(var(--primary) ${deg}deg, var(--border) ${deg}deg)`,
      }}
    >
      <div className="flex h-15 w-15 items-center justify-center rounded-full bg-surface"
           style={{ height: "3.75rem", width: "3.75rem" }}>
        <span className="text-lg font-semibold text-primary">{level}</span>
      </div>
    </div>
  );
}
