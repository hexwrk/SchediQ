import { Router } from "express";
import { changePassword, deleteAccount, getAccount, updateTier } from "../controllers/account.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/rateLimit.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", getAccount);
router.patch("/tier", updateTier);
// Rate limited like login: it checks a password.
router.post("/password", authLimiter("password change"), changePassword);
router.delete("/", deleteAccount);

export default router;
