// Theme preference: "light", "dark" or "system" (follow the OS). Stored in
// localStorage; applied as <html data-theme="light|dark">, which globals.css
// keys every colour token off.
//
// Plain module (no "use client"): THEME_SCRIPT is imported by the server root
// layout, the helpers by client components.

export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

const KEY = "schediq_theme";
const EVENT = "schediq-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Runs synchronously in <head> while the HTML is parsed, BEFORE first paint,
// so a saved dark preference never flashes light (the approach from the Next
// docs guide "Preventing flash before hydration"). Kept tiny and dependency
// free; try/catch covers blocked storage (private mode, disabled cookies).
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${KEY}");if(p!=="light"&&p!=="dark")p="system";var d=p==="dark"||(p==="system"&&window.matchMedia("${DARK_QUERY}").matches);var e=document.documentElement;e.setAttribute("data-theme",d?"dark":"light");e.setAttribute("data-theme-pref",p)}catch(_){}})()`;

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(pref: ThemePref): Theme {
  if (pref !== "system") return pref;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function applyTheme(pref: ThemePref) {
  const el = document.documentElement;
  el.setAttribute("data-theme", resolveTheme(pref));
  el.setAttribute("data-theme-pref", pref);
}

export function setPref(pref: ThemePref) {
  try {
    // "system" is the default, so it is stored as "no saved choice".
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

// External-store subscription for useSyncExternalStore: fires on a change in
// this tab, in another tab (storage event), or of the OS colour scheme.
export function subscribeTheme(onChange: () => void): () => void {
  const mq = window.matchMedia(DARK_QUERY);
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  mq.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
    mq.removeEventListener("change", onChange);
  };
}
