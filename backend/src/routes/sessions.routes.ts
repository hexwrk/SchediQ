import { Router } from "express";
import {
  generateSchedule,
  listSessions,
  toggleSession,
} from "../controllers/sessions.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", listSessions);
router.post("/generate", generateSchedule);
router.patch("/:id", toggleSession);

export default router;
