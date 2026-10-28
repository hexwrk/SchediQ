import type { MetadataRoute } from "next";

// Web app manifest (served at /manifest.webmanifest by Next). With the icons
// below, Chromium browsers offer "Install SchediQ" and launch it in its own
// window (display: standalone), on desktop and phone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SchediQ: study planner",
    short_name: "SchediQ",
    description: "Plan your study week, learn weak topics, and track progress.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f8fa",
    theme_color: "#3454d1",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Full-bleed variant whose content sits inside the 80% safe zone, so
      // Android can crop it to a circle or squircle without clipping "SQ".
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
