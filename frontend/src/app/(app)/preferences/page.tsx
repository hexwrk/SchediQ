"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  NUMBER_LIMITS,
  validateHHMM,
  validateIntInRange,
  validateTimeWindow,
} from "@shared/validation";
import { ApiError, Preference, preferencesApi, sessionsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, FieldErrors, collectErrors, hasErrors, inputClass, serverFieldErrors } from "@/lib/form";

type Field = "maxDailyMins" | "breakMins" | "preferredStart" | "preferredEnd";
const FIELDS: Field[] = ["maxDailyMins", "breakMins", "preferredStart", "preferredEnd"];

// Numeric inputs are held as the RAW string the user typed, so an empty box or
// "-5" is validated with a clear message instead of silently becoming 0.
interface FormState {
  maxDailyMins: string;
  breakMins: string;
  preferredStart: string;
  preferredEnd: string;
  clustering: boolean;
}

function toForm(p: Preference): FormState {
  return {
    maxDailyMins: String(p.maxDailyMins),
    breakMins: String(p.breakMins),
    preferredStart: p.preferredStart,
    preferredEnd: p.preferredEnd,
    clustering: p.clustering,
  };
}

function validate(f: FormState): FieldErrors<Field> {
  return collectErrors<Field>({
    maxDailyMins: validateIntInRange(f.maxDailyMins, "maxDailyMins"),
    breakMins: validateIntInRange(f.breakMins, "breakMins"),
    preferredStart: validateHHMM(f.preferredStart, "Preferred start"),
    // Window check reported on the end field, matching the server's zod path.
    preferredEnd:
      validateHHMM(f.preferredEnd, "Preferred end") ?? validateTimeWindow(f.preferredStart, f.preferredEnd),
  });
}

export default function PreferencesPage() {
  const { token } = useAuth();
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  // After a successful save we offer to regenerate the schedule.
  const [offerRegen, setOfferRegen] = useState(false);

  useEffect(() => {
    if (!token) return;
    preferencesApi
      .get(token)
      .then((r) => setForm(toForm(r.preferences)))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (!form) return;
    const next = { ...form, [key]: value };
    setForm(next);
    // Once an error is showing, re-validate live so it clears as soon as fixed.
    if (hasErrors(errors)) setErrors(validate(next));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token || !form) return;
    const found = validate(form);
    setErrors(found);
    if (hasErrors(found)) return;

    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const { preferences } = await preferencesApi.update(token, {
        maxDailyMins: Number(form.maxDailyMins),
        preferredStart: form.preferredStart,
        preferredEnd: form.preferredEnd,
        breakMins: Number(form.breakMins),
        clustering: form.clustering,
      });
      setForm(toForm(preferences));
      setSavedMsg("Preferences saved.");
      setOfferRegen(true);
    } catch (err) {
      const fromServer = serverFieldErrors(err, FIELDS);
      setErrors(fromServer);
      if (!hasErrors(fromServer)) setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!token) return;
    setOfferRegen(false);
    try {
      await sessionsApi.generate(token);
      setSavedMsg("Preferences saved and schedule regenerated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to regenerate");
    }
  }

  if (loading || !form) {
    return error ? (
      <p className="text-sm text-red-600">{error}</p>
    ) : (
      <p className="text-sm text-text-muted">Loading preferences...</p>
    );
  }

  const daily = NUMBER_LIMITS.maxDailyMins;
  const brk = NUMBER_LIMITS.breakMins;

  return (
    <form
      onSubmit={onSave}
      noValidate
      className="flex max-w-xl flex-col gap-5 rounded-card border border-border bg-surface p-6"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Max study minutes per day
          <input
            type="number"
            inputMode="numeric"
            min={daily.min}
            max={daily.max}
            step={15}
            value={form.maxDailyMins}
            onChange={(e) => set("maxDailyMins", e.target.value)}
            aria-invalid={!!errors.maxDailyMins}
            className={inputClass(errors.maxDailyMins)}
          />
          {errors.maxDailyMins ? (
            <FieldError message={errors.maxDailyMins} />
          ) : (
            <span className="text-xs text-text-muted">
              {daily.min}-{daily.max} minutes
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Break between blocks (minutes)
          <input
            type="number"
            inputMode="numeric"
            min={brk.min}
            max={brk.max}
            step={5}
            value={form.breakMins}
            onChange={(e) => set("breakMins", e.target.value)}
            aria-invalid={!!errors.breakMins}
            className={inputClass(errors.breakMins)}
          />
          {errors.breakMins ? (
            <FieldError message={errors.breakMins} />
          ) : (
            <span className="text-xs text-text-muted">
              {brk.min}-{brk.max} minutes
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Preferred start
          <input
            type="time"
            value={form.preferredStart}
            onChange={(e) => set("preferredStart", e.target.value)}
            aria-invalid={!!errors.preferredStart}
            className={inputClass(errors.preferredStart)}
          />
          <FieldError message={errors.preferredStart} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Preferred end
          <input
            type="time"
            value={form.preferredEnd}
            onChange={(e) => set("preferredEnd", e.target.value)}
            aria-invalid={!!errors.preferredEnd}
            className={inputClass(errors.preferredEnd)}
          />
          <FieldError message={errors.preferredEnd} />
        </label>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.clustering}
          onChange={(e) => set("clustering", e.target.checked)}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        <span>
          <span className="font-medium">Cluster similar subjects</span>
          <span className="block text-xs text-text-muted">
            Group same-subject work and widen breaks when switching cognitive category.
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {savedMsg && <p className="text-sm text-accent">{savedMsg}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save preferences"}
        </button>
        {offerRegen && (
          <button
            type="button"
            onClick={regenerate}
            className="rounded-lg border border-primary px-5 py-2 text-sm font-medium text-primary hover:bg-primary/5"
          >
            Regenerate schedule now
          </button>
        )}
      </div>
    </form>
  );
}
