import { Router } from "express";
import { getAccount, updateTier } from "../controllers/account.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", getAccount);
router.patch("/tier", updateTier);

export default router;
