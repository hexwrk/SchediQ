import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { MulterError } from "multer";
import { ZodError } from "zod";

// Full detail goes to the server log; clients only ever get a short, generic
// message for anything unexpected (no stack traces, SQL or internal paths).
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
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

  // Client errors raised by Express/body-parser (malformed JSON, body too
  // large). They carry an HTTP status and are safe to classify, but the raw
  // parser message is replaced with a fixed one.
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const message =
      status === 413 ? "Request body too large." : status === 400 ? "Malformed request body." : "Bad request.";
    return res.status(status).json({ error: message });
  }

  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  return res.status(500).json({ error: "Internal server error" });
}
