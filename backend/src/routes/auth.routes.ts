import { Router } from "express";
import { forgotPassword, login, me, register, resetPassword, usernameAvailable } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { authLimiter, lookupLimiter } from "../middleware/rateLimit.middleware";

const router = Router();

router.post("/register", authLimiter("registration"), register);
// Called as the user types (debounced), so it gets a looser budget than login.
router.get("/username-available", lookupLimiter("username check"), usernameAvailable);
router.post("/login", authLimiter("login"), login);
router.get("/me", requireAuth, me);
router.post("/forgot", authLimiter("password reset"), forgotPassword);
router.post("/reset", authLimiter("password reset"), resetPassword);

export default router;
