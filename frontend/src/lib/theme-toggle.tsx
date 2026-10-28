"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";
import { ThemePref, applyTheme, readPref, setPref, subscribeTheme } from "./theme";

// The server cannot read localStorage, so it renders as "system"; React then
// switches to the stored value right after hydration without a mismatch error.
const serverPref = (): ThemePref => "system";

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribeTheme, readPref, serverPref);
}

// Mounted once in the root layout. Keeps <html data-theme> in sync when the
// OS scheme changes (for "system") or another tab changes the choice. It only
// updates the DOM (an external system), so no React state is involved.
export function ThemeSync() {
  useEffect(() => subscribeTheme(() => applyTheme(readPref())), []);
  return null;
}

const NEXT: Record<ThemePref, ThemePref> = { light: "dark", dark: "system", system: "light" };
const LABEL: Record<ThemePref, string> = { light: "Light", dark: "Dark", system: "System" };

// Top-bar toggle. One button that cycles Light -> Dark -> System. The label
// says both the current mode and what pressing it will do, for screen readers.
export function ThemeToggle() {
  const pref = useThemePref();
  const Icon = pref === "light" ? SunIcon : pref === "dark" ? MoonIcon : MonitorIcon;
  const label = `Theme: ${LABEL[pref]}. Switch to ${LABEL[NEXT[pref]]}.`;
  return (
    <button
      type="button"
      onClick={() => setPref(NEXT[pref])}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted ring-1 ring-border transition-colors hover:bg-bg hover:text-text"
    >
      <Icon width={16} height={16} aria-hidden />
    </button>
  );
}
