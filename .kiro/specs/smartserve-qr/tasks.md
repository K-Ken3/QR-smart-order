# Implementation Plan

## Overview

This plan implements the SmartServe QR platform across 22 phases, progressing from infrastructure scaffolding through authentication, core domain modules (tenants, branches, locations, QR, catalogs, menus, requests), real-time notifications, analytics dashboards, billing, and a full Next.js 15 frontend. Two property-based tests validate critical invariants: QR token round-trip integrity and request pipeline source-type equivalence. The final phase covers E2E tests and CI/CD pipeline configuration.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4", "13"] },
    { "wave": 5, "tasks": ["5", "6"] },
    { "wave": 6, "tasks": ["7"] },
    { "wave": 7, "tasks": ["8"] },
    { "wave": 8, "tasks": ["9"] },
    { "wave": 9, "tasks": ["10", "11", "14"] },
    { "wave": 10, "tasks": ["12", "15", "16"] },
    { "wave": 11, "tasks": ["17", "21", "23"] },
    { "wave": 12, "tasks": ["18", "19"] },
    { "wave": 13, "tasks": ["20", "24"] },
    { "wave": 14, "tasks": ["22", "25", "26", "27"] },
    { "wave": 15, "tasks": ["28", "29", "30", "31"] },
    { "wave": 16, "tasks": ["32", "34"] },
    { "wave": 17, "tasks": ["33", "35", "39"] },
    { "wave": 18, "tasks": ["36", "40"] },
    { "wave": 19, "tasks": ["37", "41", "43", "44", "45"] },
    { "wave": 20, "tasks": ["38", "42", "46", "47"] },
    { "wave": 21, "tasks": ["48"] },
    { "wave": 22, "tasks": ["49", "51"] },
    { "wave": 23, "tasks": ["50"] },
    { "wave": 24, "tasks": ["52"] }
  ]
}
```

## Tasks

## Phase 1: Foundation & Infrastructure

- [x] 1. Project Scaffolding and Monorepo Setup
  - Initialize a monorepo with `apps/backend` (NestJS) and `apps/frontend` (Next.js 15)
  - Configure shared TypeScript settings, ESLint, Prettier, and path aliases
  - Set up `pnpm` workspaces (or equivalent) with shared `packages/types` for DTOs and enums
  - Verify both apps start cleanly with `npm run dev`
  - _Requirements: 21_

- [x] 2. Database Schema and Prisma Setup
  - Add Prisma to the backend, configure the `DATABASE_URL` environment variable
  - Implement the full Prisma schema from the design document: `Tenant`, `Branch`, `Location`, `QrCode`, `User`, `RefreshToken`, `Request`, `RequestItem`, `MenuItem`, `Menu`, `ServiceCatalog`, `Service`, `Subscription`, `Invoice`, `Feedback`, `AuditLog`
  - Define all enums: `LocationType`, `LocationStatus`, `QrValidity`, `UserRole`, `SourceType`, `RequestStatus`, `ServiceType`, `MenuItemCategory`, `MenuItemStatus`, `SubscriptionPlan`, `SubStatus`
  - Create initial migration and seed script with one demo tenant, branch, and location
  - _Requirements: 1, 2, 3, 4, 6, 7, 8, 13, 15, 16, 17, 18_

- [x] 3. Redis and Environment Configuration
  - Add Redis client (ioredis) to the backend NestJS app
  - Implement a `ConfigModule` using `@nestjs/config` with Joi validation for all required env vars
  - Expose `RedisModule` as a global module for pub/sub and cache
  - _Requirements: 7, 16, 17, 19_


- [x] 4. Global API Gateway Setup
  - Configure `helmet`, CORS with per-tenant allowed origins, and global `ValidationPipe` (whitelist, transform)
  - Implement `HttpExceptionFilter` returning `{success, error: {code, message, details}}` envelope
  - Implement rate-limiting middleware: 30 req/min unauthenticated, 120 req/min authenticated
  - Add Helmet HTTP security headers and force HTTPS redirect middleware
  - Write unit tests for the exception filter and rate limiter middleware
  - _Requirements: 20_

- [x] 5. Structured Logging and Health Check
  - Add structured JSON request logging (method, path, status, response time, requestId via `cls-rtracer` or `AsyncLocalStorage`)
  - Implement `GET /health` endpoint that checks PostgreSQL connectivity, Redis connectivity, and returns overall status within 200 ms
  - Write integration tests for the health endpoint
  - _Requirements: 21_

## Phase 2: Authentication and RBAC

- [x] 6. Authentication Module — Local (Email/Password)
  - Implement `POST /auth/register`: create `Tenant` + `User (BUSINESS_OWNER)`, hash password with bcrypt, send email verification link (SMTP/SendGrid), respond within 60 s
  - Implement `POST /auth/login`: verify bcrypt hash, check `lockedUntil`, issue JWT (15 min) + RefreshToken (30 days), store refresh token hash in Redis and DB
  - Implement `POST /auth/logout`: revoke RefreshToken in Redis and DB, clear sessions
  - Enforce account lockout: lock for 15 min after 5 consecutive failed logins from same IP, send notification email
  - Enforce unique email across all tenants (409 Conflict on duplicate)
  - Write unit tests for registration, login success/failure, lockout, and duplicate email
  - _Requirements: 1, 17_

- [x] 7. Authentication Module — JWT Refresh and Google OAuth
  - Implement `POST /auth/refresh`: validate Refresh_Token from Redis, issue new JWT + rotated Refresh_Token, invalidate old token
  - Implement `GET /auth/google` and `GET /auth/google/callback` via Passport.js Google OAuth 2.0 strategy
  - On Google callback: create or link `Tenant`/`User` account from verified Google identity, issue JWT + Refresh_Token pair
  - Implement `PATCH /auth/password`: change password and revoke all Refresh_Tokens for the user, requiring re-auth on all sessions
  - Write unit tests for token refresh rotation, revocation, and Google OAuth linking
  - _Requirements: 1, 17_


- [x] 8. RBAC Guards and Tenant Context Middleware
  - Implement a `JwtAuthGuard` and `RolesGuard` (decorator-driven) that enforce RBAC on every endpoint; return 401/403 as appropriate
  - Implement Prisma middleware (`TenantContext`) that automatically appends `WHERE tenant_id = :tenantId` to all `findMany`, `findFirst`, `findUnique`, `update`, and `delete` operations; throw 403 on mismatch
  - Write unit tests for each guard and the tenant isolation middleware
  - _Requirements: 1, 2, 17_

- [x] 9. Email Verification Flow
  - Implement `GET /auth/verify?token=` endpoint: validate signed verification link, activate Tenant (`isActive=true`, `emailVerified=true`), provision default `Subscription` (STARTER plan)
  - Send verification email via SMTP/SendGrid within 60 s of registration
  - Write unit tests for verification success, expired token, and double-verification
  - _Requirements: 1_

## Phase 3: Tenant, Branch, and Location Management

- [-] 10. Tenant Management Module
  - Implement `GET /tenants/me` and `PATCH /tenants/me` (name, logo, contact details)
  - On profile update, emit a WebSocket event so branch-branded guest interfaces refresh within 5 s
  - Implement Super Admin endpoints: `GET /tenants` and `PATCH /tenants/:id/suspend` (deactivate all branches + QR codes within 60 s, guarded by SUPER_ADMIN role)
  - Write unit tests for profile update, suspension propagation, and SUPER_ADMIN guard
  - _Requirements: 1, 12_

- [~] 11. Branch Management Module
  - Implement `POST /branches`: create branch under authenticated tenant, enforce Subscription branch quota (422 on exceeded)
  - Implement `GET /branches`, `PATCH /branches/:id`, `DELETE /branches/:id` (deactivate disables all QR codes, returns 503 on guest scan)
  - Support independent config per branch: operating hours, currency, default language, escalation threshold
  - Restrict `BRANCH_MANAGER` data access to their assigned branch only (enforced via `TenantContext` + branch-scope guard)
  - Write unit tests for quota enforcement, branch deactivation, and manager scope restriction
  - _Requirements: 2_

- [ ] 12. Location Management Module
  - Implement `POST /branches/:branchId/locations`: create location with name, `LocationType`, floor/zone metadata, auto-associate default `ServiceCatalog`
  - Implement `GET /branches/:branchId/locations`, `PATCH /locations/:id`, `DELETE /locations/:id`
  - On delete: return 422 if location has PENDING or IN_PROGRESS requests
  - Support `PATCH /locations/:id` with `status: UNAVAILABLE` flag; guest interface shows out-of-service message within 5 s
  - On name update, propagate to guest interface within 5 s (WebSocket event)
  - Write unit tests for all CRUD operations, delete guard, and status flag propagation
  - _Requirements: 3_


## Phase 4: QR Code System

- [ ] 13. QR Token Signing and Validation (Core Logic)
  - Implement a pure `QrTokenService` with `sign(context, secret, validity) → token` and `validate(token, secret) → {valid, context, error}`
  - Use HMAC-SHA256 JWT with payload fields: `sub`, `tid`, `bid`, `lid`, `iat`, `exp`
  - Store per-tenant HMAC secret encrypted (AES-256-GCM) in the database
  - Support validity periods: `HOURS_24`, `DAYS_7`, `DAYS_30`, `NON_EXPIRING`
  - Validation must resolve `Tenant → Branch → Location` chain within 300 ms
  - Write unit tests for sign/validate round-trip, expiry, invalid signature, and all validity periods
  - _Requirements: 4_

- [ ] 14. QR Code Generation and Asset Storage
  - Implement `POST /locations/:id/qr/generate`: sign token, render PNG and SVG assets (use `qrcode` library), upload to Supabase Storage, persist `QrCode` record
  - Implement `POST /locations/:id/qr/regenerate`: invalidate previous `QrCode` (set `isActive=false`), generate and persist new token + assets
  - Implement `POST /qr/validate`: validate token, check expiry, resolve context, return `{location, serviceCatalog, menu}` or appropriate error within 300 ms
  - Return `{code: "INVALID_QR", message: "Invalid or Expired QR Code"}` for bad/expired tokens
  - Log every scan attempt (valid + invalid) to `AuditLog` with timestamp, IP, and resolution result
  - Write unit and integration tests for generation, regeneration, validation success/failure paths, and audit logging
  - _Requirements: 4_

- [ ] 15. Property-Based Test — QR Round-Trip
  - Using a property-based testing library (fast-check), write a property test verifying that for any valid `LocationContext`, encoding then decoding the QR token produces an equivalent context (round-trip property)
  - **Validates: Requirement 4.8**
  - _Requirements: 4_

## Phase 5: Service Catalog

- [ ] 16. Service Catalog Module
  - Implement `GET /branches/:branchId/catalog/:locationType` and `PATCH /branches/:branchId/catalog/:locationType`
  - Seed default catalogs on location creation: DINING_TABLE → `[FOOD_AND_BEVERAGE, WAITER_CALL]`; HOTEL_ROOM → `[HOUSEKEEPING, AMENITY_REQUEST]`
  - Validate that published catalogs have at least one active service (422 on empty publish)
  - On add/remove/reorder, emit `catalog:updated` WebSocket event to all active guest sessions for that location type within 10 s
  - Maintain catalogs independently per `LocationType` per Branch
  - Write unit tests for default seeding, publish validation, and real-time propagation
  - _Requirements: 5_

## Phase 6: Menu and Inventory

- [ ] 17. Menu Module — Item CRUD and Sections
  - Implement `POST /branches/:branchId/menu/items`, `GET /branches/:branchId/menu`, `PATCH /menu/items/:id`, `DELETE /menu/items/:id`
  - Support categories: `FOOD`, `BEVERAGE`, `DESSERT`, `AMENITY`, `CUSTOM`
  - Support `sectionName`, `displayOrder`, price, description, status (`AVAILABLE`/`UNAVAILABLE`)
  - On price update: reflect new price in guest interface within 10 s via WebSocket; never retroactively update prices on submitted orders
  - On `UNAVAILABLE` status change: propagate `menu:item_updated` WebSocket event to active guest sessions within 10 s
  - Write unit tests for CRUD, price update isolation, and status propagation
  - _Requirements: 6, 13_


- [ ] 18. Menu Module — Image Upload and Inventory Tracking
  - Implement image upload for menu items: store in Supabase Storage, generate optimized URL, associate with `MenuItem`
  - Implement inventory tracking: when `stockQty` reaches 0, automatically set `MenuItem.status = UNAVAILABLE` and send FCM notification to Branch_Manager
  - Write unit tests for image URL association and stock-zero auto-deactivation
  - _Requirements: 13_

## Phase 7: Unified Request Pipeline

- [ ] 19. Unified Request Pipeline — Core Intake
  - Implement `POST /requests` accepting `CreateRequestDto` with `source_type`, `location_id`, `service_type`, `payload`, `metadata`
  - Pipeline steps: authenticate caller (JWT or IoT API key), validate DTO, resolve `Location → Branch → Tenant`, check deduplication (Redis `locationId:serviceType` 60 s window), persist `Request` with `source_type`, emit `REQUEST_CREATED` domain event
  - Reject payloads with unrecognized `source_type` with descriptive error
  - Return existing `requestId` for duplicate submissions within 60 s window (409)
  - Store `source_type` on every `Request` record
  - Write unit tests for each pipeline step, deduplication, and invalid source_type rejection
  - _Requirements: 7, 16_

- [ ] 20. Request Lifecycle — Status Transitions
  - Implement `PATCH /requests/:id/assign`: update status to ASSIGNED, record `assignedToId` and `assignedAt`, send FCM to employee within 5 s
  - Restrict assignment to active, clocked-in employees of the same branch (422 otherwise)
  - Implement `PATCH /requests/:id/status`: support transitions ASSIGNED→IN_PROGRESS, IN_PROGRESS→COMPLETED; notify guest WebSocket within 2 s
  - On COMPLETED: record `completedAt` and trigger feedback prompt to guest session
  - Implement `DELETE /requests/:id`: guest cancellation of PENDING-only requests; update status to CANCELLED, record `cancelledAt`, notify Reception_Dashboard
  - Write unit tests for each transition, invalid transition rejection, and guest cancel guard
  - _Requirements: 7, 8_

- [ ] 21. IoT Device Authentication
  - Implement device-scoped API key management: generate, store (hashed), and validate API keys for IoT devices per branch
  - Validate IoT API key before processing any `IOT_BUTTON` source_type request
  - Write unit tests for API key validation and rejection of requests without valid key
  - _Requirements: 16_

- [ ] 22. Property-Based Test — Request Pipeline Source-Type Equivalence
  - Using a property-based testing library, write a property test verifying that for any valid `Request` payload, the pipeline produces a `Request` record with identical fields and lifecycle behavior regardless of `source_type` (`QR_SCAN` or `IOT_BUTTON`)
  - **Validates: Requirement 16.4**
  - _Requirements: 16_


## Phase 8: Employee Management

- [ ] 23. Employee Module
  - Implement `POST /branches/:branchId/employees`, `GET /branches/:branchId/employees`, `PATCH /employees/:id`
  - Implement `POST /employees/:id/clock-in` and `POST /employees/:id/clock-out`; on shift end with IN_PROGRESS tasks, notify Branch_Manager and flag tasks as requiring reassignment
  - Track and expose current active task count per employee for the Reception_Dashboard
  - Restrict employee data access to the branch they are assigned to
  - Write unit tests for CRUD, clock-in/out, and shift-end task reassignment notification
  - _Requirements: 8_

## Phase 9: Notifications

- [ ] 24. WebSocket Gateway
  - Implement Socket.IO gateway with rooms: `tenant:{id}`, `branch:{id}`, `location:{id}`, `employee:{id}`
  - Use Redis pub/sub to fan out events across multiple backend instances
  - Emit events: `request:created`, `request:assigned`, `request:status_changed`, `request:cancelled`, `menu:item_updated`, `catalog:updated`, `order:new`, `notification:escalation`
  - On reconnect within 60 s, replay missed events from Redis stream to the reconnected client
  - Write integration tests for event delivery and reconnection replay
  - _Requirements: 7, 9, 10, 19_

- [ ] 25. FCM and Email Notification Dispatchers
  - Implement FCM dispatcher: send push notifications to registered employee `deviceTokens` within 5 s for task assignments, low-satisfaction alerts, payment failures, and inventory depletion
  - Implement email dispatcher via SMTP/SendGrid: registration verification, password reset, subscription receipt, payment failure alert
  - Implement SMS dispatcher (conditional on branch config): new task assignment alerts
  - Allow Branch_Managers to configure enabled notification channels per event type
  - Write unit tests for FCM batch dispatch, email template rendering, and channel config gating
  - _Requirements: 7, 8, 14, 15, 19_

- [ ] 26. Escalation Monitor
  - Implement a scheduled job (cron) that checks for `PENDING` requests older than the branch-configured escalation threshold (default 5 min) and emits `notification:escalation` WebSocket events to the Reception_Dashboard
  - Write unit tests for escalation threshold detection and event emission
  - _Requirements: 9_


## Phase 10: Audit Logging

- [ ] 27. Audit Log Module
  - Implement append-only `AuditLog` writes triggered from: all CRUD operations, status transitions, QR scan attempts, authentication events, permission denials, payment events, and reassignment events
  - Record: actor identity, actor role, action type, entity type, entity ID, IP address, timestamp
  - Prevent any modification or deletion of audit entries by any role (no update/delete endpoints)
  - Implement `GET /audit-logs` with filters: date range, actor, event type, entity (scoped to Super_Admin and Branch_Manager roles); response within 3 s
  - Implement `GET /audit-logs/export` returning CSV for a specified date range and entity scope
  - Write unit tests for immutability enforcement, filter correctness, and CSV export
  - _Requirements: 18_

## Phase 11: Dashboards

- [ ] 28. Reception Dashboard API
  - Implement aggregation query backing the Reception_Dashboard: all active requests for the branch ordered by `createdAt` DESC, with `requestId`, `locationName`, `serviceType`, `status`, `notes`, `elapsed time`, `assignedEmployee`
  - Support filter params: `status`, `serviceType`, `locationId`
  - Real-time updates delivered via WebSocket (task 24 dependency)
  - Expose internal notes: `POST /requests/:id/notes` (staff-only, not visible to guest)
  - Write unit and integration tests for filter combinations and note creation
  - _Requirements: 9_

- [ ] 29. Kitchen Dashboard API
  - Implement aggregation query: all `ORDER`-type requests in `PENDING` or `IN_PROGRESS` for the branch, ordered by `createdAt` ASC (FIFO)
  - Return per order: order ID, location name, items with quantities, special instructions, elapsed time
  - Real-time new order push via WebSocket `order:new` event (task 24)
  - Support `PATCH /requests/:id/status` from kitchen staff (IN_PROGRESS → COMPLETED)
  - Implement `PATCH /menu/items/:id/out-of-stock` from kitchen staff: set `UNAVAILABLE` and propagate to menu within 10 s
  - Write unit and integration tests for FIFO ordering, out-of-stock propagation, and completion flow
  - _Requirements: 10_

- [ ] 30. Manager Analytics Dashboard API
  - Implement `GET /analytics/branches/:branchId`: total requests, requests by status, average completion time, busiest locations, top menu items for a date range; respond within 3 s
  - Implement employee performance metrics: tasks completed, average completion time, tasks/hour
  - Implement location activity heat map data endpoint
  - Implement `GET /analytics/tenants/me`: consolidated metrics across all branches for Business_Owner
  - Implement `GET /analytics/branches/:branchId/export`: CSV export for selected date range
  - Write unit tests for metric aggregation correctness and CSV output
  - _Requirements: 11_


## Phase 12: Feedback

- [ ] 31. Feedback Module
  - Implement `POST /feedback`: accept rating (1–5) and optional comment, associate with `Request`, `Location`, `Branch`, `Employee`; enforce one feedback per completed request (409 on duplicate)
  - Present feedback prompt to guest session within 5 s of request reaching COMPLETED (WebSocket trigger)
  - On rating ≤ 2: flag as low-satisfaction, send FCM alert to Branch_Manager within 60 s
  - Implement `GET /feedback/requests/:requestId`, `PATCH /feedback/:id/review` (Branch_Manager: add review note, mark as reviewed)
  - Write unit tests for submission, duplicate guard, low-satisfaction alert, and review flow
  - _Requirements: 14_

## Phase 13: Billing and Subscriptions

- [ ] 32. Subscription Plans and Billing Module
  - Define STARTER, PROFESSIONAL, ENTERPRISE plans with `maxBranches`, `maxLocations`, `maxEmployees`, and feature flags
  - Implement `GET /billing/plans`, `POST /billing/subscribe` (Stripe or Flutterwave), `POST /billing/upgrade` (prorated billing)
  - On successful renewal: extend `currentPeriodEnd`, send receipt email
  - On payment failure: notify Business_Owner via email + FCM, set 7-day grace period before restricting access
  - On plan change by Super_Admin: apply new limits immediately without requiring logout
  - Implement `GET /billing/invoices` and PDF invoice generation
  - Flutterwave: support Mobile Money payment methods
  - Write unit tests for quota enforcement, prorated upgrade calculation, grace period logic
  - _Requirements: 15_

- [ ] 33. Stripe and Flutterwave Webhook Handlers
  - Implement `POST /billing/webhooks/stripe` and `POST /billing/webhooks/flutterwave`
  - Verify webhook signatures before processing events
  - Handle: payment success (renew/activate), payment failure (grace period), subscription cancellation, plan change
  - Write unit tests for signature verification and each webhook event type
  - _Requirements: 15_

## Phase 14: Super Admin Portal Backend

- [ ] 34. Super Admin Module
  - Implement `GET /tenants` (all tenants with plan, status, branch count, total requests) — SUPER_ADMIN only
  - Implement `PATCH /tenants/:id/suspend`: deactivate all branches and QR codes within 60 s, return suspension notice on guest scan
  - Implement platform-level metrics endpoint: total active tenants, total active branches, requests in last 24 h, system error rates
  - Implement `GET /audit-logs` with full cross-tenant visibility for Super_Admin
  - Restrict all Super Admin endpoints with SUPER_ADMIN role guard
  - Write unit tests for suspension propagation, metrics aggregation, and role enforcement
  - _Requirements: 12_


## Phase 15: Frontend — Guest Experience

- [ ] 35. Guest QR Scan Landing Page
  - Implement `app/(guest)/scan/[token]/page.tsx`: call `POST /qr/validate`, resolve location context, display branded service list from service catalog
  - Handle error states: "Invalid or Expired QR Code", service-unavailable (deactivated branch or unavailable location)
  - Use React error boundaries for all error states; display human-readable messages with tenant branding
  - _Requirements: 4, 5_

- [ ] 36. Guest Digital Menu Page
  - Implement `app/(guest)/scan/[token]/menu/page.tsx`: display menu grouped by category with name, description, price (in branch currency), and image
  - Filter to `AVAILABLE` items only; show subtotal and taxes before order confirmation
  - Cart state managed via Zustand; on submit call `POST /requests` with `source_type: QR_SCAN`
  - Handle unavailable item rejection: notify guest, allow resubmission without blocked items
  - Where branch has online payment enabled, present Stripe or Flutterwave payment flow before confirming order
  - _Requirements: 6_

- [ ] 37. Guest Request Tracking Page
  - Implement `app/(guest)/scan/[token]/request/page.tsx`: display current `RequestStatus` and elapsed time since submission
  - Subscribe to Socket.IO `request:status_changed` events for real-time status updates within 2 s
  - Support guest cancellation of PENDING requests
  - _Requirements: 7_

- [ ] 38. Guest Feedback Page
  - Implement `app/(guest)/scan/[token]/feedback/page.tsx`: display 1–5 star rating and optional comment form after request COMPLETED event is received
  - Submit via `POST /feedback`; confirm receipt to guest
  - _Requirements: 14_

## Phase 16: Frontend — Authentication

- [ ] 39. Authentication Pages
  - Implement `app/(auth)/register/page.tsx`: registration form with business name, email, password; handle 409 conflict error display
  - Implement `app/(auth)/login/page.tsx`: login form, Google OAuth button, lockout error display
  - Implement `app/(auth)/verify/page.tsx`: email verification callback page
  - Manage JWT + Refresh_Token in httpOnly cookies; implement auto-refresh via React Query interceptor
  - _Requirements: 1, 17_


## Phase 17: Frontend — Staff Dashboards

- [ ] 40. Reception Dashboard UI
  - Implement `app/(dashboard)/reception/page.tsx`: real-time request list (WebSocket via Socket.IO), audio alert + visual badge on new request
  - Display per-request: ID, location name, service type, status, guest notes, elapsed time, assigned employee
  - Support filter controls: status, service type, location
  - Show escalation indicator for PENDING requests exceeding threshold
  - Employee assignment UI: show active task count per employee; call `PATCH /requests/:id/assign`
  - Internal notes panel: add notes visible to staff only
  - _Requirements: 9_

- [ ] 41. Kitchen Dashboard UI
  - Implement `app/(dashboard)/kitchen/page.tsx`: FIFO order queue with WebSocket real-time updates and audio alert
  - Display per order: ID, location name, items + quantities, special instructions, elapsed time
  - IN_PROGRESS / COMPLETED action buttons; mark individual items as OUT_OF_STOCK
  - _Requirements: 10_

- [ ] 42. Manager Analytics Dashboard UI
  - Implement `app/(dashboard)/manager/page.tsx` and `app/(dashboard)/manager/[branchId]/page.tsx`
  - Display: total requests, requests by status, average completion time, busiest locations, top menu items, employee performance metrics
  - Location activity heat map visualization
  - Date range selector; consolidated multi-branch view for Business_Owner
  - CSV export button
  - _Requirements: 11_

## Phase 18: Frontend — Management Pages

- [ ] 43. Locations and QR Code Management UI
  - Implement `app/(dashboard)/locations/page.tsx`: location list with create/edit/delete forms
  - QR code generation panel: select validity period, generate, preview PNG/SVG, download link, regenerate button
  - _Requirements: 3, 4_

- [ ] 44. Menu Management UI
  - Implement `app/(dashboard)/menu/page.tsx`: menu item list with create/edit forms (name, category, description, price, image upload, section, display order)
  - Toggle availability, inventory tracking, and stock quantity fields
  - _Requirements: 13_

- [ ] 45. Employee Management UI
  - Implement `app/(dashboard)/employees/page.tsx`: employee list with create/edit forms, role assignment, clock-in/out status
  - _Requirements: 8_

- [ ] 46. Billing and Settings UI
  - Implement `app/(dashboard)/billing/page.tsx`: plan selection, payment method (Stripe / Flutterwave), invoice history, PDF download
  - Implement `app/(dashboard)/settings/page.tsx`: branch operating hours, currency, language, notification channel config
  - _Requirements: 15_

## Phase 19: Frontend — Super Admin Portal

- [ ] 47. Super Admin Portal UI
  - Implement `app/admin/tenants/page.tsx`: tenant list with plan, status, branch count, request count; suspend/unsuspend action
  - Implement `app/admin/metrics/page.tsx`: platform-level metrics (active tenants, branches, 24 h requests, error rates)
  - Implement `app/admin/audit/page.tsx`: audit log viewer with date range, actor, event type, entity filters
  - Protect all admin routes with SUPER_ADMIN role check; redirect non-admins
  - _Requirements: 12_


## Phase 20: CI/CD and Deployment

- [ ] 48. Docker Configuration
  - Write production `Dockerfile` for the NestJS backend (multi-stage build, non-root user)
  - Write production `Dockerfile` for the Next.js frontend (multi-stage build, standalone output)
  - Write `docker-compose.yml` for local development: backend, frontend, PostgreSQL, Redis services with volumes and health checks
  - _Requirements: 21_

- [ ] 49. GitHub Actions — CI Pipeline
  - Implement `.github/workflows/ci.yml`: trigger on pull requests to `main`
  - Steps: install deps, lint (ESLint), type-check (tsc), run unit tests, run integration tests, build Docker images
  - Cache pnpm/node_modules across runs for speed
  - _Requirements: 21_

- [ ] 50. GitHub Actions — CD Pipeline and Database Migrations
  - Implement `.github/workflows/cd.yml`: trigger on merge to `main`
  - Deploy frontend to Vercel via Vercel CLI; deploy backend to Railway via Railway CLI
  - Run `prisma migrate deploy` as an idempotent pre-deploy step
  - Provide `prisma/migrations` folder with all migration files
  - _Requirements: 21_

## Phase 21: Input Validation and Security Hardening

- [ ] 51. Input Sanitization and Security Hardening
  - Implement a global sanitization interceptor that strips HTML/script tags from all string inputs before persistence (prevent XSS and SQL injection)
  - Verify HTTPS enforcement middleware redirects HTTP → HTTPS in production
  - Verify Helmet headers are present on all API responses
  - Verify CORS is configured to restrict to tenant-configured allowed origins
  - Write integration tests for sanitization, HTTPS redirect, and CORS enforcement
  - _Requirements: 20_

## Phase 22: End-to-End Testing

- [ ] 52. Critical Path E2E Tests
  - Using Playwright (or equivalent), implement E2E tests covering:
    - Guest scans QR → views menu → places order → tracks status to COMPLETED → submits feedback
    - Staff logs in → views Reception Dashboard → assigns request → completes task
    - Branch_Manager creates location → generates QR code → regenerates QR (old code invalidated)
    - Business_Owner registers → verifies email → creates branch → adds employee
  - Tests should run against the Docker Compose local environment
  - _Requirements: 1, 3, 4, 6, 7, 8, 9, 14_

## Notes

- Tasks 15 and 22 are property-based tests (PBT) and use fast-check. Run them with the `LongRunningPBT` warning flag.
- All backend tasks assume NestJS with Prisma ORM and PostgreSQL. All frontend tasks assume Next.js 15 App Router with TanStack Query and Zustand.
- Phase ordering follows data dependency: infrastructure → auth → domain entities → pipeline → notifications → dashboards → frontend → DevOps.
- Tasks referencing "within X seconds" (2 s WebSocket, 5 s FCM, 10 s catalog/menu propagation) should have integration tests that assert the timing SLA.
- The `TenantContext` Prisma middleware (Task 8) is a prerequisite for every module that reads or writes tenant-scoped data — it must be implemented and tested before any domain module tasks.
- Supabase Storage credentials and per-tenant HMAC secrets must be stored in environment variables, never hard-coded.
- All money values (prices, invoices) use `Decimal` type in Prisma and should be handled with a decimal library on the backend to avoid floating-point errors.
