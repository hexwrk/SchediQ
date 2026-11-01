"use client";

import { PasswordContext, passwordChecks, passwordStrength } from "@shared/validation";

// Live password checklist + strength meter for Register, Reset and Change
// password. Both read passwordChecks() from shared/validation.ts, the same
// list the server's zod schema enforces, so a green checklist means the API
// will accept it.

const STRENGTH = {
  weak: { label: "Weak", color: "var(--color-red-600)", width: "25%" },
  fair: { label: "Fair", color: "var(--amber)", width: "50%" },
  good: { label: "Good", color: "var(--primary)", width: "75%" },
  strong: { label: "Strong", color: "var(--accent)", width: "100%" },
} as const;

// When the page cannot know whose password it is (the reset link only carries
// a token), the "personal" rule is shown as checked-on-submit and does not
// block the button; the server still enforces it.
export function passwordReady(pw: string, ctx: PasswordContext | null): boolean {
  return passwordChecks(pw, ctx ?? {}).every((c) => c.passed || (ctx === null && c.id === "personal"));
}

export function PasswordChecklist({ password, context, id }: { password: string; context: PasswordContext | null; id?: string }) {
  const checks = passwordChecks(password, context ?? {});
  const strength = STRENGTH[passwordStrength(password, context ?? {})];
  return (
    <div id={id} className="flex flex-col gap-1.5">
      {password && (
        <span className="flex items-center gap-2 text-xs text-text-muted" aria-live="polite">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
            <span className="block h-full rounded-full transition-all" style={{ width: strength.width, background: strength.color }} />
          </span>
          <span style={{ color: strength.color }}>Strength: {strength.label}</span>
        </span>
      )}
      <ul className="flex flex-col gap-0.5 text-xs" aria-label="Password requirements">
        {checks.map((c) => {
          const deferred = context === null && c.id === "personal";
          // Nothing typed yet: neutral, not a wall of red crosses.
          const state = deferred || !password ? "pending" : c.passed ? "pass" : "fail";
          return (
            <li
              key={c.id}
              className={state === "pass" ? "text-accent" : state === "fail" ? "text-red-600" : "text-text-muted"}
            >
              <span aria-hidden className="inline-block w-4 font-semibold">
                {state === "pass" ? "✓" : state === "fail" ? "✗" : "•"}
              </span>
              {c.label}
              {deferred && " (checked when you submit)"}
              <span className="sr-only">{state === "pass" ? " (met)" : state === "fail" ? " (not met)" : ""}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
