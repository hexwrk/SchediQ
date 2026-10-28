import path from "node:path";
import type { NextConfig } from "next";

// The repo root holds shared/validation.ts, imported by BOTH this app and the
// backend so the two can never disagree on validation rules. Turbopack only
// resolves files inside its root, so the root is widened to the repo root
// (one level up). outputFileTracingRoot must match it or Next warns.
//
// On Vercel the project's Root Directory stays "frontend"; this works because
// "Include files outside the root directory in the Build Step" is enabled, so
// ../shared exists during the build. scripts/check-build-env.mjs fails the
// build early with that instruction if it does not (docs/DEPLOYMENT.md).
const repoRoot = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
