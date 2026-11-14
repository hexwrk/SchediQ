// Pre-build checks (npm "prebuild" hook, so it runs before every `next build`,
// locally and on Vercel). Each failure stops the build with the fix, instead of
// a confusing module-not-found error or a site that silently calls localhost.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const shared = join(here, "..", "..", "shared", "validation.ts");
const problems = [];

// The validation rules live in ../shared (outside this app) and are imported
// by both the frontend and the API. Vercel only provides files outside the
// Root Directory when "Include files outside the root directory in the Build
// Step" is enabled for the project.
if (!existsSync(shared)) {
  problems.push(
    "../shared/validation.ts is missing. On Vercel: Project Settings > Build and Deployment > Root Directory, " +
      'keep it "frontend" and enable "Include files outside the root directory in the Build Step". See docs/DEPLOYMENT.md.'
  );
}

// NEXT_PUBLIC_* values are inlined at build time; without it the deployed app
// would call http://localhost:4000 from every visitor's browser.
if (process.env.VERCEL && !process.env.NEXT_PUBLIC_API_URL) {
  problems.push(
    "NEXT_PUBLIC_API_URL is not set. Add it in Vercel Project Settings > Environment Variables (your Render API URL), then redeploy."
  );
}

if (problems.length > 0) {
  console.error(`Build preflight failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
