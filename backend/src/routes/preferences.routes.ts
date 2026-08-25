import { Router } from "express";
import { getPreferences, updatePreferences } from "../controllers/preferences.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", getPreferences);
router.put("/", updatePreferences);

export default router;
