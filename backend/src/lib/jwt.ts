import jwt from "jsonwebtoken";
import { env } from "./env";

// JWT_SECRET presence and length (>= 32 chars) are enforced at boot by
// loadEnv(); reading through env() keeps this module importable in tests.

export interface TokenPayload {
  userId: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env().JWT_SECRET, {
    expiresIn: env().JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): TokenPayload {
  // Pinned algorithm: never let the token header choose (blocks alg=none and
  // HS/RS confusion).
  return jwt.verify(token, env().JWT_SECRET, { algorithms: ["HS256"] }) as TokenPayload;
}
