/**
 * Seeds the SUPER_ADMIN account into the database.
 * Run with: npx ts-node scripts/seed-superadmin.ts
 * Requires DATABASE_URL env var to be set.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = 'karasiraken5@gmail.com';
const SUPER_ADMIN_PASSWORD = '20060Ken';

async function main() {
  const email = SUPER_ADMIN_EMAIL.toLowerCase().trim();

  // Check if already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Superadmin ${email} already exists (id: ${existing.id}). Skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);

  // Create a dedicated tenant for the superadmin (required by schema)
  const tenant = await prisma.tenant.create({
    data: {
      name: 'SmartServe Platform',
      email,
      isActive: true,
      emailVerified: true,
    },
  });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'SUPER_ADMIN',
      firstName: 'Super',
      lastName: 'Admin',
      tenantId: tenant.id,
    },
  });

  console.log(`Superadmin created:`);
  console.log(`  Email:    ${email}`);
  console.log(`  User ID:  ${user.id}`);
  console.log(`  Tenant ID: ${tenant.id}`);
  console.log(`  Role:     SUPER_ADMIN`);
  console.log(`  Password: ${SUPER_ADMIN_PASSWORD}`);
  console.log(``);
  console.log(`⚠  Login page will redirect you to /admin dashboard.`);
  console.log(`⚠  Use "Forgot password?" on the login page to recover.`);
}

main()
  .catch((e) => {
    console.error('Failed to seed superadmin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
