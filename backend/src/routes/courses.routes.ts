import { Router } from "express";
import {
  deleteCourse,
  generateCourse,
  getCourse,
  linkCourse,
  listCourses,
  scheduleCourse,
} from "../controllers/courses.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { aiLimiter } from "../middleware/rateLimit.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", listCourses);
// Generation can call OpenAI, so it shares the AI rate limit policy.
router.post("/generate", aiLimiter(), generateCourse);
router.get("/:id", getCourse);
router.patch("/:id", linkCourse);
router.delete("/:id", deleteCourse);
router.post("/:id/schedule", scheduleCourse);

export default router;
