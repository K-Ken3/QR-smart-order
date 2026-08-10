/**
 * Prisma seed script
 *
 * Seeds the database with:
 *  - 1 demo Tenant (email-verified, active)
 *  - 1 BUSINESS_OWNER User for that tenant
 *  - 1 Branch
 *  - 1 DINING_TABLE Location
 *  - Default ServiceCatalog entries for every LocationType
 *  - STARTER Subscription
 *
 * Run with: pnpm db:seed
 */

import { PrismaClient, LocationType, ServiceType, UserRole, SubscriptionPlan, SubStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Default service catalog entries per LocationType */
const DEFAULT_CATALOG: Record<LocationType, { name: string; category: ServiceType; displayOrder: number }[]> = {
  DINING_TABLE: [
    { name: 'Food & Beverage', category: ServiceType.FOOD_AND_BEVERAGE, displayOrder: 1 },
    { name: 'Waiter Call', category: ServiceType.WAITER_CALL, displayOrder: 2 },
  ],
  HOTEL_ROOM: [
    { name: 'Housekeeping', category: ServiceType.HOUSEKEEPING, displayOrder: 1 },
    { name: 'Amenity Request', category: ServiceType.AMENITY_REQUEST, displayOrder: 2 },
    { name: 'Food & Beverage', category: ServiceType.FOOD_AND_BEVERAGE, displayOrder: 3 },
    { name: 'Maintenance', category: ServiceType.MAINTENANCE, displayOrder: 4 },
  ],
  LOUNGE_SEAT: [
    { name: 'Waiter Call', category: ServiceType.WAITER_CALL, displayOrder: 1 },
    { name: 'Food & Beverage', category: ServiceType.FOOD_AND_BEVERAGE, displayOrder: 2 },
  ],
  HOSPITAL_BED: [
    { name: 'Nurse Call', category: ServiceType.CUSTOM, displayOrder: 1 },
    { name: 'Amenity Request', category: ServiceType.AMENITY_REQUEST, displayOrder: 2 },
    { name: 'Housekeeping', category: ServiceType.HOUSEKEEPING, displayOrder: 3 },
  ],
  MEETING_ROOM: [
    { name: 'Waiter Call', category: ServiceType.WAITER_CALL, displayOrder: 1 },
    { name: 'Amenity Request', category: ServiceType.AMENITY_REQUEST, displayOrder: 2 },
    { name: 'Maintenance', category: ServiceType.MAINTENANCE, displayOrder: 3 },
  ],
  POOLSIDE: [
    { name: 'Waiter Call', category: ServiceType.WAITER_CALL, displayOrder: 1 },
    { name: 'Food & Beverage', category: ServiceType.FOOD_AND_BEVERAGE, displayOrder: 2 },
    { name: 'Amenity Request', category: ServiceType.AMENITY_REQUEST, displayOrder: 3 },
  ],
};

async function main() {
  console.log('🌱 Starting database seed...');

  // ── 1. Tenant ──────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { email: 'demo@smartserve.app' },
    update: {},
    create: {
      name: 'Demo Restaurant',
      email: 'demo@smartserve.app',
      isActive: true,
      emailVerified: true,
      // Placeholder encrypted HMAC secret (real value generated on first QR sign)
      hmacSecret: null,
    },
  });
  console.log(`✅ Tenant created: ${tenant.name} (${tenant.id})`);

  // ── 2. BUSINESS_OWNER User ─────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Demo1234!', 12);
  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.smartserve.app' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'owner@demo.smartserve.app',
      passwordHash,
      role: UserRole.BUSINESS_OWNER,
      firstName: 'Demo',
      lastName: 'Owner',
      isActive: true,
    },
  });
  console.log(`✅ User created: ${owner.firstName} ${owner.lastName} (${owner.role})`);

  // ── 3. Subscription ────────────────────────────────────────────────────────
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  const subscription = await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      plan: SubscriptionPlan.STARTER,
      status: SubStatus.ACTIVE,
      currentPeriodEnd: periodEnd,
      maxBranches: 1,
      maxLocations: 10,
      maxEmployees: 5,
    },
  });
  console.log(`✅ Subscription created: ${subscription.plan} plan`);

  // ── 4. Branch ──────────────────────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-001' },
    update: {},
    create: {
      id: 'seed-branch-001',
      tenantId: tenant.id,
      name: 'Main Branch',
      address: '123 Demo Street, Demo City',
      timezone: 'UTC',
      currency: 'USD',
      language: 'en',
      isActive: true,
      escalationThresholdMinutes: 5,
    },
  });
  console.log(`✅ Branch created: ${branch.name} (${branch.id})`);

  // Update the owner to belong to this branch
  await prisma.user.update({
    where: { id: owner.id },
    data: { branchId: branch.id },
  });

  // ── 5. Menu ────────────────────────────────────────────────────────────────
  const menu = await prisma.menu.upsert({
    where: { branchId: branch.id },
    update: {},
    create: {
      branchId: branch.id,
      name: 'Main Menu',
      isActive: true,
    },
  });
  console.log(`✅ Menu created: ${menu.name}`);

  // ── 6. Sample Menu Items ───────────────────────────────────────────────────
  const menuItems = [
    { name: 'Classic Burger', category: 'FOOD' as const, price: 12.99, sectionName: 'Mains', displayOrder: 1 },
    { name: 'Caesar Salad', category: 'FOOD' as const, price: 9.99, sectionName: 'Starters', displayOrder: 2 },
    { name: 'Coca-Cola', category: 'BEVERAGE' as const, price: 2.99, sectionName: 'Drinks', displayOrder: 3 },
    { name: 'Chocolate Lava Cake', category: 'DESSERT' as const, price: 7.99, sectionName: 'Desserts', displayOrder: 4 },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: {
        id: `seed-item-${item.name.toLowerCase().replace(/\s+/g, '-')}`,
      },
      update: {},
      create: {
        id: `seed-item-${item.name.toLowerCase().replace(/\s+/g, '-')}`,
        branchId: branch.id,
        menuId: menu.id,
        name: item.name,
        category: item.category,
        price: item.price,
        sectionName: item.sectionName,
        displayOrder: item.displayOrder,
        status: 'AVAILABLE',
      },
    });
  }
  console.log(`✅ Menu items created: ${menuItems.length} items`);

  // ── 7. Location ────────────────────────────────────────────────────────────
  const location = await prisma.location.upsert({
    where: { id: 'seed-location-001' },
    update: {},
    create: {
      id: 'seed-location-001',
      branchId: branch.id,
      name: 'Table 1',
      locationType: LocationType.DINING_TABLE,
      floor: 'Ground Floor',
      zone: 'Main Hall',
      status: 'AVAILABLE',
    },
  });
  console.log(`✅ Location created: ${location.name} (${location.locationType})`);

  // ── 8. Service Catalogs for all LocationTypes ──────────────────────────────
  for (const [locationType, services] of Object.entries(DEFAULT_CATALOG)) {
    const catalog = await prisma.serviceCatalog.upsert({
      where: {
        branchId_locationType: {
          branchId: branch.id,
          locationType: locationType as LocationType,
        },
      },
      update: {},
      create: {
        branchId: branch.id,
        locationType: locationType as LocationType,
        isPublished: locationType === LocationType.DINING_TABLE,
      },
    });

    // Delete existing services to avoid duplicates on re-seed
    await prisma.service.deleteMany({ where: { catalogId: catalog.id } });

    for (const svc of services) {
      await prisma.service.create({
        data: {
          catalogId: catalog.id,
          name: svc.name,
          category: svc.category,
          displayOrder: svc.displayOrder,
          isActive: true,
        },
      });
    }

    console.log(`✅ ServiceCatalog seeded: ${locationType} (${services.length} services)`);
  }

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Demo credentials:');
  console.log('   Email:    owner@demo.smartserve.app');
  console.log('   Password: Demo1234!');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
