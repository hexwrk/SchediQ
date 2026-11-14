import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

// Super-admin gate. Must be mounted AFTER requireAuth (it relies on req.userId).
//
// The role is loaded from the database on every request rather than embedded in
// the JWT. A token is valid for days; if the role lived in the token, demoting
// an admin would not take effect until their token expired. Reading it fresh
// makes a demotion or account deletion revoke admin access immediately.
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { role: true },
  });

  // 403 (not 404) for an authenticated non-admin: the caller is known, just not
  // allowed. The frontend turns this into its "Access denied" state.
  if (!user || user.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Access denied: super admin only" });
  }

  next();
}
