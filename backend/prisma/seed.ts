import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// Seed: creates (or resets) the single super-admin account and nothing else.
// No demo students, classmates, tasks or courses are created, so a fresh
// install starts empty and every user goes through first-run onboarding.
// Idempotent: re-running only resets the admin's password/role/tier; it never
// touches any other account.
const prisma = new PrismaClient();

// Operator account for the admin module. Change the password (or delete the
// account) on any deployment that is not a local demo.
const ADMIN_EMAIL = "admin@schediq.app";
const ADMIN_PASSWORD = "admin1234";

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  // PREMIUM so the admin never trips the FREE tier gates while testing.
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash, name: "System Admin", role: "SUPER_ADMIN", accountType: "PREMIUM" },
    create: { email: ADMIN_EMAIL, passwordHash, name: "System Admin", role: "SUPER_ADMIN", accountType: "PREMIUM" },
  });
  console.log(`Seeded super admin ${ADMIN_EMAIL} (password ${ADMIN_PASSWORD}, SUPER_ADMIN, PREMIUM). No demo data.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
