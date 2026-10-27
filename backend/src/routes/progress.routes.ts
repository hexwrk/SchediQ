import { Router } from "express";
import { getProgress } from "../controllers/progress.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", getProgress);

export default router;
