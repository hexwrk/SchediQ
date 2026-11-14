import { Router } from "express";
import { updateLesson } from "../controllers/courses.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();
router.use(requireAuth);

router.patch("/:id", updateLesson);

export default router;
