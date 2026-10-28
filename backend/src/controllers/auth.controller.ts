import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { emailField, nameField, passwordField } from "../lib/validators";

// bcrypt work factor. 12 rounds = 2^12 key-expansion iterations, roughly
// 200-300ms per hash on commodity hardware: slow enough to make offline
// cracking of a leaked hash expensive, fast enough for interactive login.
export const BCRYPT_ROUNDS = 12;

// Hash of a random throwaway string at the same cost, used only to burn equal
// CPU time on logins for unknown emails.
const DUMMY_HASH = bcrypt.hashSync("schediq-timing-equaliser", BCRYPT_ROUNDS);

// Email/password/name rules come from shared/validation.ts, the same module the
// register form uses, so client and server reject exactly the same input.
const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  name: nameField,
});

// Login only checks shape: applying the full email rule here would leak which
// addresses are "valid" and lock out any pre-existing account.
const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(1, "Password is required.").max(200),
});

export function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  accountType: string;
}) {
  // Explicit allow-list: passwordHash must never leave the server.
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    accountType: user.accountType,
  };
}

export async function register(req: Request, res: Response) {
  const { email, password, name } = registerSchema.parse(req.body);

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  const token = signToken({ userId: user.id });
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

  const token = signToken({ userId: user.id });
  return res.json({ token, user: toPublicUser(user) });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({ user: toPublicUser(user) });
}
