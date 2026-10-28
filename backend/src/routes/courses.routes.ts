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

const router = Router();
router.use(requireAuth);

router.get("/", listCourses);
router.post("/generate", generateCourse);
router.get("/:id", getCourse);
router.patch("/:id", linkCourse);
router.delete("/:id", deleteCourse);
router.post("/:id/schedule", scheduleCourse);

export default router;
