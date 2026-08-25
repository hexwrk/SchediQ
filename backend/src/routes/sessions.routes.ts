import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();
router.use(requireAuth);

// Study sessions are derived by the scheduling engine — built in Sprint 3.
router.get("/", (_req, res) => res.json({ sessions: [] }));

export default router;
