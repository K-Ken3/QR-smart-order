import { SetMetadata } from '@nestjs/common';

/**
 * UserRole enum values mirroring the Prisma schema enum.
 * Used here to avoid a hard dependency on @prisma/client at decorator-definition time.
 */
export type UserRoleValue =
  | 'SUPER_ADMIN'
  | 'BUSINESS_OWNER'
  | 'BRANCH_MANAGER'
  | 'RECEPTIONIST'
  | 'KITCHEN_STAFF'
  | 'EMPLOYEE'
  | 'GUEST';

export const ROLES_KEY = 'roles';

/**
 * @Roles(...roles) — decorator-driven RBAC metadata.
 *
 * Apply to a controller class or individual route handler to restrict access
 * to users whose `role` matches one of the provided values.
 *
 * @example
 * ```ts
 * @Roles('BRANCH_MANAGER', 'BUSINESS_OWNER')
 * @Get('branches')
 * findAll() { ... }
 * ```
 */
export const Roles = (...roles: UserRoleValue[]) => SetMetadata(ROLES_KEY, roles);
