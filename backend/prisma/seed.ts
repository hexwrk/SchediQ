import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { validatePassword } from "../../shared/validation";

// Seed: creates (or resets) the single super-admin account and nothing else.
// No demo students, classmates, tasks or courses are created, so a fresh
// install starts empty and every user goes through first-run onboarding.
// Idempotent: re-running only resets the admin's password/role/tier; it never
// touches any other account.
const prisma = new PrismaClient();

// Operator account for the admin module.
const ADMIN_EMAIL = "admin@schediq.app";
// Local/demo default only. Production must pass SEED_ADMIN_PASSWORD, so a
// deployed admin is never protected by a password published in the repo.
const LOCAL_DEFAULT_PASSWORD = "admin1234";

function adminPassword(): string {
  const fromEnv = process.env.SEED_ADMIN_PASSWORD?.trim();
  if (fromEnv) {
    const problem = validatePassword(fromEnv);
    if (problem) throw new Error(`SEED_ADMIN_PASSWORD rejected: ${problem}`);
    return fromEnv;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SEED_ADMIN_PASSWORD is required in production. Run: SEED_ADMIN_PASSWORD='<strong password>' npx prisma db seed"
    );
  }
  return LOCAL_DEFAULT_PASSWORD;
}

async function main() {
  const password = adminPassword();
  const passwordHash = await bcrypt.hash(password, 12);
  // PREMIUM so the admin never trips the FREE tier gates while testing.
  const data = { passwordHash, name: "System Admin", role: "SUPER_ADMIN" as const, accountType: "PREMIUM" as const, mustChangePassword: false };
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: data,
    create: { email: ADMIN_EMAIL, ...data },
  });
  // The password is only echoed when it is the published local default.
  const shown = password === LOCAL_DEFAULT_PASSWORD ? `password ${LOCAL_DEFAULT_PASSWORD}` : "password from SEED_ADMIN_PASSWORD";
  console.log(`Seeded super admin ${ADMIN_EMAIL} (${shown}, SUPER_ADMIN, PREMIUM). No demo data.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
