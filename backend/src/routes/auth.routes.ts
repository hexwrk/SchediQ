import { Router } from "express";
import { forgotPassword, login, me, register, resetPassword } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/rateLimit.middleware";

const router = Router();

router.post("/register", authLimiter("registration"), register);
router.post("/login", authLimiter("login"), login);
router.get("/me", requireAuth, me);
router.post("/forgot", authLimiter("password reset"), forgotPassword);
router.post("/reset", authLimiter("password reset"), resetPassword);

export default router;
