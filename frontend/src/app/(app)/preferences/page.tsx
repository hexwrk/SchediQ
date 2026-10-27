"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError, Preference, preferencesApi, sessionsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function PreferencesPage() {
  const { token } = useAuth();
  const [prefs, setPrefs] = useState<Preference | null>(null);
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
      .then((r) => setPrefs(r.preferences))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [token]);

  function set<K extends keyof Preference>(key: K, value: Preference[K]) {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token || !prefs) return;
    // Guard: preferred end must be after preferred start, else the scheduler
    // has a zero-width window and produces nothing.
    if (prefs.preferredEnd <= prefs.preferredStart) {
      setError("Preferred end must be later than preferred start.");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const { preferences } = await preferencesApi.update(token, {
        maxDailyMins: prefs.maxDailyMins,
        preferredStart: prefs.preferredStart,
        preferredEnd: prefs.preferredEnd,
        breakMins: prefs.breakMins,
        clustering: prefs.clustering,
      });
      setPrefs(preferences);
      setSavedMsg("Preferences saved.");
      setOfferRegen(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
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

  if (loading || !prefs) {
    return <p className="text-sm text-text-muted">Loading preferences...</p>;
  }

  return (
    <form onSubmit={onSave} className="flex max-w-xl flex-col gap-5 rounded-card border border-border bg-surface p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Max study minutes per day
          <input
            type="number"
            min={30}
            step={15}
            value={prefs.maxDailyMins}
            onChange={(e) => set("maxDailyMins", Number(e.target.value))}
            className="rounded-lg border border-border px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Break between blocks (minutes)
          <input
            type="number"
            min={0}
            step={5}
            value={prefs.breakMins}
            onChange={(e) => set("breakMins", Number(e.target.value))}
            className="rounded-lg border border-border px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Preferred start
          <input
            type="time"
            value={prefs.preferredStart}
            onChange={(e) => set("preferredStart", e.target.value)}
            className="rounded-lg border border-border px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Preferred end
          <input
            type="time"
            value={prefs.preferredEnd}
            onChange={(e) => set("preferredEnd", e.target.value)}
            className="rounded-lg border border-border px-3 py-2 outline-none focus:border-primary"
          />
        </label>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={prefs.clustering}
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
