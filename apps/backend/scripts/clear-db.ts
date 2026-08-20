/**
 * Clears all data from the database (tenants, users, branches, etc.).
 * Run with: npx ts-node scripts/clear-db.ts
 * Requires DATABASE_URL env var to be set.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all data...');

  // Delete in order to respect foreign key constraints
  await prisma.refreshToken.deleteMany();
  await prisma.requestItem.deleteMany();
  await prisma.request.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.qrCode.deleteMany();
  await prisma.location.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menu.deleteMany();
  await prisma.service.deleteMany();
  await prisma.serviceCatalog.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  console.log('All data cleared.');
}

main()
  .catch((e) => {
    console.error('Failed to clear database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
