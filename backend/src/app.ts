import cors from "cors";
import express from "express";
import authRoutes from "./routes/auth.routes";
import preferencesRoutes from "./routes/preferences.routes";
import sessionsRoutes from "./routes/sessions.routes";
import subjectsRoutes from "./routes/subjects.routes";
import tasksRoutes from "./routes/tasks.routes";
import { errorHandler } from "./middleware/error.middleware";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/subjects", subjectsRoutes);
  app.use("/api/tasks", tasksRoutes);
  app.use("/api/sessions", sessionsRoutes);
  app.use("/api/preferences", preferencesRoutes);

  app.use(errorHandler);

  return app;
}
