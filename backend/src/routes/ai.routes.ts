import { Router } from "express";
import { parseTask } from "../controllers/ai.controller";

const router = Router();

// requireAuth is applied at mount time in app.ts, before this router.
router.post("/parse", parseTask);

export default router;
