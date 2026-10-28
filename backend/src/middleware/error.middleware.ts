import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { MulterError } from "multer";
import { ZodError } from "zod";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    // details.fieldErrors maps each field to its messages; the frontend shows
    // them inline under the matching input. The first message is surfaced in
    // `error` so a form without field mapping still shows something readable.
    const details = err.flatten();
    const first = err.issues[0]?.message;
    return res.status(400).json({
      error: first ? `Validation failed: ${first}` : "Validation failed",
      details,
    });
  }

  // Unique constraint (e.g. duplicate subject name per user) is a client error,
  // not a server fault.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return res.status(409).json({ error: "That value already exists." });
  }

  // Upload parser errors (file too large, unexpected field) on the restore route.
  if (err instanceof MulterError) {
    return res.status(400).json({ error: `Upload rejected: ${err.message}` });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
