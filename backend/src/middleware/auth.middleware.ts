import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Verifies the bearer token, then checks it against the database: the account
// must still exist and the token's version must equal User.tokenVersion. That
// one primary-key lookup per request is what makes revocation immediate: a
// password change, a used reset link or an admin temporary password bumps the
// version, and every older token gets 401 on its next request.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { tokenVersion: true },
  });
  // Same message for a deleted account and a revoked token: either way the
  // client must log in again, and it reveals nothing extra.
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }

  req.userId = payload.userId;
  next();
}
