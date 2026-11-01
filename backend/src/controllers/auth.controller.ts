import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { appUrl, env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { tokenFor } from "../lib/jwt";
import { emailField, nameField, passwordContextFrom, passwordFieldFor, usernameField } from "../lib/validators";
import { usernameErrors } from "../../../shared/validation";

// bcrypt work factor. 12 rounds = 2^12 key-expansion iterations, roughly
// 200-300ms per hash on commodity hardware: slow enough to make offline
// cracking of a leaked hash expensive, fast enough for interactive login.
export const BCRYPT_ROUNDS = 12;

// Hash of a random throwaway string at the same cost, used only to burn equal
// CPU time on logins for unknown emails.
const DUMMY_HASH = bcrypt.hashSync("schediq-timing-equaliser", BCRYPT_ROUNDS);

// Email/username/password/name rules come from shared/validation.ts, the same
// module the register form uses, so client and server reject exactly the same
// input. Built per request because the password must not contain the
// username or email name typed in the same body.
function registerSchema(body: unknown) {
  return z.object({
    email: emailField,
    username: usernameField,
    password: passwordFieldFor(passwordContextFrom(body)),
    name: nameField,
  });
}

const USERNAME_TAKEN = "That username is already taken.";

function usernameTaken(res: Response) {
  return res.status(409).json({ error: USERNAME_TAKEN, details: { fieldErrors: { username: [USERNAME_TAKEN] } } });
}

// Login only checks shape: applying the full email rule here would leak which
// addresses are "valid" and lock out any pre-existing account.
const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(1, "Password is required.").max(200),
});

export function toPublicUser(user: {
  id: string;
  email: string;
  username: string;
  name: string;
  role: string;
  accountType: string;
  mustChangePassword: boolean;
}) {
  // Explicit allow-list: passwordHash must never leave the server.
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    role: user.role,
    accountType: user.accountType,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function register(req: Request, res: Response) {
  const { email, username, password, name } = registerSchema(req.body).parse(req.body);

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
    return usernameTaken(res);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  let user;
  try {
    user = await prisma.user.create({
      data: { email, username, passwordHash, name },
    });
  } catch (err) {
    // Two sign-ups racing for the same name: the unique index decides, and
    // the loser gets the same field error as the pre-check above.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String((err.meta as { target?: unknown } | undefined)?.target ?? "");
      if (target.includes("username")) return usernameTaken(res);
      return res.status(409).json({ error: "Email already registered" });
    }
    throw err;
  }

  const token = tokenFor(user);
  return res.status(201).json({ token, user: toPublicUser(user) });
}

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  // Case-insensitive match so accounts registered before emails were
  // lower-cased on write still log in.
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  // Same generic message for unknown email and wrong password so the endpoint
  // cannot be used to enumerate registered accounts. The dummy compare keeps
  // the response time similar too, closing the timing side channel.
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = tokenFor(user);
  return res.json({ token, user: toPublicUser(user) });
}

const usernameQuery = z.object({ username: z.string().max(100).default("") });

// GET /api/auth/username-available?username=...
// Live availability for the register form. Format problems come back as
// reasons (same rules as register) so the form needs one call, not two.
// Usernames are public handles, not credentials, so revealing that one is
// taken is acceptable; the route is still rate limited against bulk scraping.
export async function usernameAvailable(req: Request, res: Response) {
  const { username } = usernameQuery.parse(req.query);
  const normalised = username.trim().toLowerCase();
  const problems = usernameErrors(normalised);
  if (problems.length > 0) {
    return res.json({ username: normalised, available: false, reasons: problems });
  }
  const taken = await prisma.user.findUnique({ where: { username: normalised }, select: { id: true } });
  return res.json({ username: normalised, available: !taken, reasons: taken ? [USERNAME_TAKEN] : [] });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({ user: toPublicUser(user) });
}

// ---------- Forgot / reset password ----------

// Reset links expire quickly: long enough to switch to the inbox, short enough
// that a link left in an old email is useless.
const RESET_TTL_MIN = 30;

const forgotSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").max(254).transform((v) => v.toLowerCase()),
});

// Password is only shape-checked here; the full rules run once the token has
// identified the account, because they depend on its username and email.
const resetSchema = z.object({
  token: z.string().min(20, "This reset link is invalid.").max(200),
  password: z.string({ message: "Password is required." }).max(200),
});

// SHA-256 of the raw token. The raw token only ever exists in the link; the DB
// stores the hash, so a DB leak cannot be turned into working reset links.
// A fast hash is fine here (unlike passwords) because the token is 256 random
// bits: there is nothing to brute-force.
function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// There is no email service yet. DEMO_MODE=true (local only) returns the reset
// link in the response so the flow can be tested in the browser. With
// DEMO_MODE=false (production) the response is ONLY the generic message:
// returning the link there would let anyone reset any account by typing its
// email. The link is written to the server log instead, where only the
// operator can see it; the user-facing recovery path is an admin reset.

const GENERIC_FORGOT = "If an account exists for that email, a reset link has been sent.";

// POST /api/auth/forgot
export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotSchema.parse(req.body);
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  // Same response whether or not the account exists (no enumeration), except
  // for the demo-mode link itself.
  if (!user) {
    return res.json({ message: GENERIC_FORGOT });
  }

  const raw = crypto.randomBytes(32).toString("base64url");
  await prisma.$transaction([
    // A new request invalidates any older unused links for this account.
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000),
      },
    }),
  ]);

  const resetUrl = `${appUrl()}/reset-password?token=${raw}`;
  console.log(`[reset] Password reset link for ${user.email} (expires in ${RESET_TTL_MIN} min): ${resetUrl}`);

  return res.json(
    env().DEMO_MODE
      ? { message: GENERIC_FORGOT, demo: true, resetUrl, expiresInMinutes: RESET_TTL_MIN }
      : { message: GENERIC_FORGOT }
  );
}

// POST /api/auth/reset
export async function resetPassword(req: Request, res: Response) {
  const { token, password } = resetSchema.parse(req.body);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
  }
  const owner = await prisma.user.findUnique({ where: { id: record.userId }, select: { email: true, username: true } });
  if (!owner) {
    return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
  }
  // Throws a ZodError (400 with one message per failing rule) on a weak password.
  z.object({ password: passwordFieldFor(owner) }).parse({ password });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.$transaction([
    // tokenVersion++ logs out every existing session: if the reset was needed
    // because someone else had the account, their tokens die here.
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
    }),
    // Burn this token and any other outstanding ones for the account.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
  return res.json({ message: "Password updated. You can now log in with your new password." });
}
