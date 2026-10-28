import { Router } from "express";
import multer from "multer";
import {
  createBackupHandler,
  deleteUser,
  getDataModel,
  getStats,
  listUsers,
  restoreHandler,
  updateUser,
} from "../controllers/admin.controller";

// requireAuth + requireSuperAdmin are applied at mount time in app.ts, before
// this router, so every route below is super-admin only.
const router = Router();

// Restore uploads are held in memory (never written to disk) and capped: one
// file, 50 MB, .sql or .json only. Anything else is rejected before the
// controller runs.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    cb(null, /\.(sql|json)$/i.test(file.originalname));
  },
});

router.get("/users", listUsers);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.get("/stats", getStats);
router.get("/data-model", getDataModel);
router.post("/backup", createBackupHandler);
router.post("/restore", upload.single("file"), restoreHandler);

export default router;
