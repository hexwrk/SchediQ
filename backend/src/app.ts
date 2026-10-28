import cors from "cors";
import express from "express";
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

export function createApp() {
  const app = express();

  // exposedHeaders lets the browser read the backup filename/format on the
  // cross-origin download response.
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? "*",
      exposedHeaders: ["Content-Disposition", "X-Backup-Format", "X-Backup-Fallback"],
    })
  );
  // Explicit body cap: JSON bodies here are small forms; uploads use multer.
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/subjects", subjectsRoutes);
  app.use("/api/tasks", tasksRoutes);
  app.use("/api/sessions", sessionsRoutes);
  app.use("/api/preferences", preferencesRoutes);
  app.use("/api/progress", progressRoutes);
  // requireAuth is mounted before the router so the parse route is token-gated.
  app.use("/api/ai", requireAuth, aiRoutes);
  app.use("/api/account", accountRoutes);
  app.use("/api/courses", coursesRoutes);
  app.use("/api/lessons", lessonsRoutes);
  // Admin module: authenticated AND super admin, enforced before any handler.
  app.use("/api/admin", requireAuth, requireSuperAdmin, adminRoutes);

  app.use(errorHandler);

  return app;
}
