import { Router } from "express";
import {
  createSubject,
  deleteSubject,
  listSubjects,
  updateSubject,
} from "../controllers/subjects.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", listSubjects);
router.post("/", createSubject);
router.put("/:id", updateSubject);
router.delete("/:id", deleteSubject);

export default router;
