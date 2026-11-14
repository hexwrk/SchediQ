import jwt from "jsonwebtoken";
import { env } from "./env";

// JWT_SECRET presence and length (>= 32 chars) are enforced at boot by
// loadEnv(); reading through env() keeps this module importable in tests.

export interface TokenPayload {
  userId: string;
  // User.tokenVersion when the token was signed. requireAuth rejects the token
  // once the stored version has moved on (revocation without a denylist).
  tokenVersion: number;
}

// Compact claim name on the wire; tokens signed before revocation existed have
// no "tv" and are read as version 0, the column default, so deploying this
// does not log anyone out.
interface WireClaims {
  userId: string;
  tv?: number;
}

export function signToken(payload: TokenPayload): string {
  const claims: WireClaims = { userId: payload.userId, tv: payload.tokenVersion };
  return jwt.sign(claims, env().JWT_SECRET, {
    expiresIn: env().JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

// Signs a fresh token for a user row (anything carrying id + tokenVersion).
export function tokenFor(user: { id: string; tokenVersion: number }): string {
  return signToken({ userId: user.id, tokenVersion: user.tokenVersion });
}

export function verifyToken(token: string): TokenPayload {
  // Pinned algorithm: never let the token header choose (blocks alg=none and
  // HS/RS confusion).
  const claims = jwt.verify(token, env().JWT_SECRET, { algorithms: ["HS256"] }) as WireClaims;
  return { userId: claims.userId, tokenVersion: typeof claims.tv === "number" ? claims.tv : 0 };
}
