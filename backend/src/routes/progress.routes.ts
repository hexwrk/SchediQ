import { Router } from "express";
import { getOverview, getProgress } from "../controllers/progress.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", getProgress);
router.get("/overview", getOverview);

export default router;
