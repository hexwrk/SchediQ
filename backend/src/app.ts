import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import accountRoutes from "./routes/account.routes";
import adminRoutes from "./routes/admin.routes";
import aiRoutes from "./routes/ai.routes";
import coursesRoutes from "./routes/courses.routes";
import lessonsRoutes from "./routes/lessons.routes";
import authRoutes from "./routes/auth.routes";
import preferencesRoutes from "./routes/preferences.routes";
import progressRoutes from "./routes/progress.routes";
import sessionsRoutes from "./routes/sessions.routes";
import subjectsRoutes from "./routes/subjects.routes";
import tasksRoutes from "./routes/tasks.routes";
import { errorHandler } from "./middleware/error.middleware";
import { requireAuth } from "./middleware/auth.middleware";
import { requireSuperAdmin } from "./middleware/admin.middleware";
import { aiLimiter } from "./middleware/rateLimit.middleware";
import { env } from "./lib/env";
import { prisma } from "./lib/prisma";

const DB_HEALTH_TIMEOUT_MS = 5000;

export function createApp() {
  const config = env();
  const app = express();

  // Render terminates TLS at one proxy hop in front of the app. Trusting
  // exactly one hop makes req.ip the real client (needed by the rate limiter)
  // without letting a client spoof X-Forwarded-For to pick its own IP.
  app.set("trust proxy", 1);
  // Do not advertise the framework (helmet also strips it; this is explicit).
  app.disable("x-powered-by");
  // Security headers. The API only returns JSON and file downloads, so the
  // defaults (nosniff, frame-ancestors none, HSTS, strict CSP...) all apply.
  app.use(helmet());

  // CORS allowlist from CORS_ORIGIN. Requests with no Origin header (curl,
  // Render health checks) are not browser cross-origin calls and pass; any
  // other origin gets no CORS headers, so the browser blocks the response.
  // exposedHeaders lets the browser read the backup filename/format on the
  // cross-origin download response.
  const allowed = new Set(config.CORS_ORIGIN);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
      exposedHeaders: ["Content-Disposition", "X-Backup-Format", "X-Backup-Fallback"],
    })
  );

  // Concise access log: method, path, status, size, latency. No bodies or
  // headers, so tokens and passwords never reach the logs. Health probes are
  // skipped so the platform's checks do not drown out real traffic.
  if (config.NODE_ENV !== "test") {
    app.use(
      morgan(":remote-addr :method :url :status :res[content-length] - :response-time ms", {
        skip: (req) => req.url === "/api/health",
      })
    );
  }

  // Explicit body cap: JSON bodies here are small forms; uploads use multer.
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  // Database reachability, for uptime monitors and post-deploy checks. Bounded
  // so a hung connection reports "fail" instead of hanging the probe.
  app.get("/api/health/db", async (_req, res) => {
    const started = Date.now();
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), DB_HEALTH_TIMEOUT_MS).unref()),
      ]);
      res.json({ status: "ok", latencyMs: Date.now() - started });
    } catch (err) {
      console.error("DB health check failed:", err instanceof Error ? err.message : err);
      res.status(503).json({ status: "fail" });
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/subjects", subjectsRoutes);
  app.use("/api/tasks", tasksRoutes);
  app.use("/api/sessions", sessionsRoutes);
  app.use("/api/preferences", preferencesRoutes);
  app.use("/api/progress", progressRoutes);
  // requireAuth runs first so the AI limiter can key on the user id.
  app.use("/api/ai", requireAuth, aiLimiter(), aiRoutes);
  app.use("/api/account", accountRoutes);
  app.use("/api/courses", coursesRoutes);
  app.use("/api/lessons", lessonsRoutes);
  // Admin module: authenticated AND super admin, enforced before any handler.
  app.use("/api/admin", requireAuth, requireSuperAdmin, adminRoutes);

  app.use(errorHandler);

  return app;
}
