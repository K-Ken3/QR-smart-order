# Design Document: SmartServe QR

## Overview

SmartServe QR is a production-ready, multi-tenant SaaS hospitality platform where every QR code represents a unique physical location. Guests scan a QR code, are placed in context (Tenant → Branch → Location), and interact with a branded service interface. Staff receive real-time notifications, fulfill requests, and managers gain full operational visibility through analytics dashboards.

The platform is built on a **Clean Architecture** foundation with a feature-based modular structure. The backend (NestJS) and frontend (Next.js 15) are independently deployable, communicate through well-defined REST and WebSocket contracts, and share no runtime coupling. An IoT-compatible unified request pipeline ensures future ESP32 hardware buttons require zero architectural changes.

### Key Design Goals

- **Multi-tenancy with strict data isolation**: every query is scoped to the authenticated tenant
- **Location-aware context resolution**: QR token → Tenant → Branch → Location → Service Catalog in under 300ms
- **Unified Request Pipeline**: QR scans and IoT button presses flow through the same processing path
- **Real-time everything**: WebSocket events within 2 seconds, FCM within 5 seconds
- **Extensible role model**: RBAC enforced at the API gateway layer, not scattered in business logic
- **Enterprise observability**: structured logs, audit trail, health checks, CI/CD

---

## Architecture

### High-Level System Architecture

```mermaid
graph TB
    subgraph Clients
        GuestApp[Guest Web App\nNext.js 15]
        StaffApp[Staff Dashboard\nNext.js 15]
        AdminPortal[Super Admin Portal\nNext.js 15]
        IoTDevice[IoT Button\nESP32]
    end

    subgraph Edge
        Vercel[Vercel CDN\nFrontend Hosting]
        HTTPS[HTTPS / TLS Termination]
    end

    subgraph Backend["Backend — NestJS on Railway"]
        Gateway[API Gateway Module\nAuth, CORS, Helmet, Rate Limiter]
        AuthModule[Auth Module\nJWT, Refresh, Google OAuth]
        TenantModule[Tenant Module]
        BranchModule[Branch Module]
        LocationModule[Location Module]
        QRModule[QR Module\nToken Sign / Validate]
        CatalogModule[Service Catalog Module]
        MenuModule[Menu Module]
        RequestPipeline[Unified Request Pipeline\nQR_SCAN + IOT_BUTTON]
        EmployeeModule[Employee Module]
        DashboardModule[Dashboard Module\nReception + Kitchen + Manager]
        NotifModule[Notifications Module\nWS + FCM + Email + SMS]
        BillingModule[Billing Module\nStripe + Flutterwave]
        AuditModule[Audit Log Module]
        HealthModule[Health Check Module]
    end

    subgraph DataLayer["Data Layer"]
        Postgres[(PostgreSQL\nPrisma ORM)]
        Redis[(Redis\nCache + PubSub)]
        SupabaseStorage[(Supabase Storage\nImages + QR Assets)]
    end

    subgraph ExternalServices["External Services"]
        FCM[Firebase Cloud Messaging]
        Stripe[Stripe]
        Flutterwave[Flutterwave]
        GoogleOAuth[Google OAuth 2.0]
        EmailSMTP[Email Provider\nSMTP / SendGrid]
        SMSGateway[SMS Gateway]
    end

    Clients --> Vercel
    Vercel --> HTTPS
    HTTPS --> Gateway
    IoTDevice --> Gateway
    Gateway --> AuthModule
    Gateway --> TenantModule
    Gateway --> BranchModule
    Gateway --> LocationModule
    Gateway --> QRModule
    Gateway --> CatalogModule
    Gateway --> MenuModule
    Gateway --> RequestPipeline
    Gateway --> EmployeeModule
    Gateway --> DashboardModule
    Gateway --> NotifModule
    Gateway --> BillingModule
    Gateway --> AuditModule
    Gateway --> HealthModule

    RequestPipeline --> NotifModule
    RequestPipeline --> AuditModule

    Backend --> Postgres
    Backend --> Redis
    Backend --> SupabaseStorage
    Backend --> FCM
    Backend --> Stripe
    Backend --> Flutterwave
    Backend --> GoogleOAuth
    Backend --> EmailSMTP
    Backend --> SMSGateway
```

### Request Lifecycle Flow

```mermaid
sequenceDiagram
    participant Guest
    participant Frontend
    participant QRModule
    participant RequestPipeline
    participant NotifModule
    participant StaffDashboard

    Guest->>Frontend: Scans QR Code
    Frontend->>QRModule: POST /qr/validate {token}
    QRModule->>QRModule: Verify HMAC-SHA256 signature
    QRModule->>QRModule: Resolve Tenant→Branch→Location
    QRModule-->>Frontend: {location, serviceCatalog, menu}
    Guest->>Frontend: Submits Service Request
    Frontend->>RequestPipeline: POST /requests {source_type: QR_SCAN, location_id, service_type, payload}
    RequestPipeline->>RequestPipeline: Validate schema, deduplicate, persist
    RequestPipeline->>NotifModule: Emit REQUEST_CREATED event
    NotifModule->>StaffDashboard: WebSocket push (<2s)
    NotifModule->>StaffDashboard: FCM push (<5s)
    RequestPipeline-->>Frontend: {requestId, status: PENDING}
    StaffDashboard->>RequestPipeline: PATCH /requests/{id}/assign
    RequestPipeline->>NotifModule: Emit REQUEST_ASSIGNED event
    NotifModule->>Frontend: WebSocket push (<2s)
```

### Clean Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│                  Presentation Layer                  │
│   Controllers · WebSocket Gateways · DTOs · Guards   │
├─────────────────────────────────────────────────────┤
│                 Application Layer                    │
│     Use Cases · Command/Query Handlers · Services    │
├─────────────────────────────────────────────────────┤
│                   Domain Layer                       │
│  Entities · Value Objects · Domain Events · Rules    │
├─────────────────────────────────────────────────────┤
│               Infrastructure Layer                   │
│  Prisma Repos · Redis Client · FCM · Stripe · S3     │
└─────────────────────────────────────────────────────┘
```

Each NestJS feature module maps to one vertical slice of this layered structure. Dependency direction is always inward — infrastructure depends on domain, never the reverse.

---

## Components and Interfaces

### Backend Module Map

| Module | Responsibility |
|---|---|
| `AuthModule` | JWT issuance, Refresh Token rotation, Google OAuth, account lockout |
| `TenantModule` | Tenant CRUD, profile, email verification, data isolation middleware |
| `BranchModule` | Branch CRUD, operating hours, quota enforcement |
| `LocationModule` | Location CRUD, Location_Type, unavailability flag |
| `QRModule` | Token signing (HMAC-SHA256), validation, PNG/SVG generation, Supabase upload |
| `ServiceCatalogModule` | Per-Location_Type catalog config, real-time propagation |
| `MenuModule` | Menu_Item CRUD, pricing, inventory tracking, image upload |
| `RequestPipelineModule` | Unified intake: schema validation, deduplication, persistence, event emission |
| `EmployeeModule` | Employee profiles, clock-in/out, role assignment, workload tracking |
| `DashboardModule` | Reception, Kitchen, Manager aggregation queries |
| `NotificationsModule` | WebSocket gateway, FCM, email, SMS dispatch |
| `BillingModule` | Subscription plan management, Stripe/Flutterwave webhooks, invoicing |
| `AuditModule` | Immutable append-only audit log writes and queries |
| `FeedbackModule` | Post-completion feedback, aggregation, low-satisfaction alerts |
| `AnalyticsModule` | Metric aggregation, heatmap data, CSV export |
| `HealthModule` | GET /health — DB, Redis, storage connectivity checks |

### REST API Surface (Key Endpoints)

```
Auth
  POST   /auth/register
  POST   /auth/login
  POST   /auth/refresh
  POST   /auth/logout
  GET    /auth/google
  GET    /auth/google/callback

Tenants
  GET    /tenants/me
  PATCH  /tenants/me
  GET    /tenants          (SUPER_ADMIN)
  PATCH  /tenants/:id/suspend  (SUPER_ADMIN)

Branches
  POST   /branches
  GET    /branches
  PATCH  /branches/:id
  DELETE /branches/:id

Locations
  POST   /branches/:branchId/locations
  GET    /branches/:branchId/locations
  PATCH  /locations/:id
  DELETE /locations/:id

QR Codes
  POST   /locations/:id/qr/generate
  POST   /qr/validate
  POST   /locations/:id/qr/regenerate

Service Catalog
  GET    /branches/:branchId/catalog/:locationType
  PATCH  /branches/:branchId/catalog/:locationType

Menu
  POST   /branches/:branchId/menu/items
  GET    /branches/:branchId/menu
  PATCH  /menu/items/:id
  DELETE /menu/items/:id

Requests (Unified Pipeline)
  POST   /requests
  GET    /requests
  GET    /requests/:id
  PATCH  /requests/:id/assign
  PATCH  /requests/:id/status
  DELETE /requests/:id  (cancel, PENDING only)

Employees
  POST   /branches/:branchId/employees
  GET    /branches/:branchId/employees
  PATCH  /employees/:id
  POST   /employees/:id/clock-in
  POST   /employees/:id/clock-out

Analytics
  GET    /analytics/branches/:branchId
  GET    /analytics/tenants/me  (Business_Owner consolidated)
  GET    /analytics/branches/:branchId/export

Feedback
  POST   /feedback
  GET    /feedback/requests/:requestId
  PATCH  /feedback/:id/review

Billing
  GET    /billing/plans
  POST   /billing/subscribe
  POST   /billing/upgrade
  GET    /billing/invoices
  POST   /billing/webhooks/stripe
  POST   /billing/webhooks/flutterwave

Audit
  GET    /audit-logs

Health
  GET    /health
```

### WebSocket Events (Socket.IO)

| Event Name | Direction | Payload |
|---|---|---|
| `request:created` | Server→Client | `{requestId, locationName, serviceType, status, createdAt}` |
| `request:assigned` | Server→Client | `{requestId, employeeName, status}` |
| `request:status_changed` | Server→Client | `{requestId, oldStatus, newStatus, timestamp}` |
| `request:cancelled` | Server→Client | `{requestId, cancelledAt}` |
| `menu:item_updated` | Server→Client | `{itemId, status, price}` |
| `catalog:updated` | Server→Client | `{branchId, locationType, services[]}` |
| `order:new` | Server→Client | `{orderId, locationName, items[], createdAt}` (Kitchen) |
| `notification:escalation` | Server→Client | `{requestId, elapsedMinutes}` |

Rooms are structured as: `tenant:{tenantId}`, `branch:{branchId}`, `location:{locationId}`, `employee:{employeeId}`.

Redis pub/sub is used to fan out events across multiple backend instances (horizontal scaling).

---

## Data Models

### Entity Relationship Diagram

```mermaid
erDiagram
    TENANT ||--o{ BRANCH : has
    TENANT ||--o{ SUBSCRIPTION : has
    BRANCH ||--o{ LOCATION : contains
    BRANCH ||--o{ EMPLOYEE : employs
    BRANCH ||--o{ MENU : owns
    BRANCH ||--o{ SERVICE_CATALOG : configures
    LOCATION }o--|| LOCATION_TYPE : "is of"
    SERVICE_CATALOG }o--|| LOCATION_TYPE : "for"
    SERVICE_CATALOG ||--o{ SERVICE : includes
    LOCATION ||--o{ QR_CODE : has
    LOCATION ||--o{ REQUEST : receives
    MENU ||--o{ MENU_ITEM : contains
    REQUEST }o--|| EMPLOYEE : "assigned to"
    REQUEST ||--o| FEEDBACK : receives
    REQUEST ||--o{ REQUEST_ITEM : contains
    REQUEST_ITEM }o--|| MENU_ITEM : references
    TENANT ||--o{ AUDIT_LOG : generates
    BRANCH ||--o{ AUDIT_LOG : generates
```

### Core Prisma Schema (Abbreviated)

```prisma
model Tenant {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  logoUrl       String?
  isActive      Boolean  @default(false)
  emailVerified Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  branches      Branch[]
  employees     User[]
  subscription  Subscription?
  auditLogs     AuditLog[]
}

model Branch {
  id           String   @id @default(cuid())
  tenantId     String
  name         String
  address      String
  timezone     String
  currency     String   @default("USD")
  language     String   @default("en")
  isActive     Boolean  @default(true)
  escalationThresholdMinutes Int @default(5)
  createdAt    DateTime @default(now())

  tenant       Tenant         @relation(fields: [tenantId], references: [id])
  locations    Location[]
  employees    User[]
  menu         Menu?
  catalogs     ServiceCatalog[]
  requests     Request[]
  auditLogs    AuditLog[]
}

model Location {
  id           String        @id @default(cuid())
  branchId     String
  name         String
  locationType LocationType
  floor        String?
  zone         String?
  status       LocationStatus @default(AVAILABLE)
  createdAt    DateTime       @default(now())

  branch       Branch      @relation(fields: [branchId], references: [id])
  qrCodes      QrCode[]
  requests     Request[]
}

enum LocationType {
  DINING_TABLE
  HOTEL_ROOM
  LOUNGE_SEAT
  HOSPITAL_BED
  MEETING_ROOM
  POOLSIDE
}

enum LocationStatus {
  AVAILABLE
  UNAVAILABLE
}

model QrCode {
  id         String   @id @default(cuid())
  locationId String
  token      String   @unique
  pngUrl     String
  svgUrl     String
  validityPeriod QrValidity @default(NON_EXPIRING)
  expiresAt  DateTime?
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())

  location   Location @relation(fields: [locationId], references: [id])
}

enum QrValidity {
  HOURS_24
  DAYS_7
  DAYS_30
  NON_EXPIRING
}

model Request {
  id           String        @id @default(cuid())
  tenantId     String
  branchId     String
  locationId   String
  sourceType   SourceType
  serviceType  ServiceType
  status       RequestStatus @default(PENDING)
  payload      Json
  notes        String?
  assignedToId String?
  assignedAt   DateTime?
  startedAt    DateTime?
  completedAt  DateTime?
  cancelledAt  DateTime?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  branch       Branch      @relation(fields: [branchId], references: [id])
  location     Location    @relation(fields: [locationId], references: [id])
  assignedTo   User?       @relation(fields: [assignedToId], references: [id])
  items        RequestItem[]
  feedback     Feedback?
  auditLogs    AuditLog[]
}

enum SourceType {
  QR_SCAN
  IOT_BUTTON
}

enum RequestStatus {
  PENDING
  ASSIGNED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum ServiceType {
  FOOD_AND_BEVERAGE
  HOUSEKEEPING
  WAITER_CALL
  MAINTENANCE
  AMENITY_REQUEST
  CUSTOM
}

model RequestItem {
  id         String  @id @default(cuid())
  requestId  String
  menuItemId String
  quantity   Int
  unitPrice  Decimal
  notes      String?

  request    Request  @relation(fields: [requestId], references: [id])
  menuItem   MenuItem @relation(fields: [menuItemId], references: [id])
}

model User {
  id           String   @id @default(cuid())
  tenantId     String
  branchId     String?
  email        String   @unique
  passwordHash String?
  googleId     String?
  role         UserRole
  firstName    String
  lastName     String
  deviceTokens String[]
  isClockedIn  Boolean  @default(false)
  isActive     Boolean  @default(true)
  lockedUntil  DateTime?
  failedLogins Int      @default(0)
  createdAt    DateTime @default(now())

  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  branch       Branch?  @relation(fields: [branchId], references: [id])
  assignedRequests Request[]
  refreshTokens RefreshToken[]
}

enum UserRole {
  SUPER_ADMIN
  BUSINESS_OWNER
  BRANCH_MANAGER
  RECEPTIONIST
  KITCHEN_STAFF
  EMPLOYEE
  GUEST
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())

  user      User @relation(fields: [userId], references: [id])
}

model MenuItem {
  id          String          @id @default(cuid())
  branchId    String
  menuId      String
  name        String
  description String?
  category    MenuItemCategory
  price       Decimal
  imageUrl    String?
  status      MenuItemStatus  @default(AVAILABLE)
  stockQty    Int?
  displayOrder Int            @default(0)
  sectionName String?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  menu        Menu     @relation(fields: [menuId], references: [id])
  requestItems RequestItem[]
}

enum MenuItemCategory {
  FOOD
  BEVERAGE
  DESSERT
  AMENITY
  CUSTOM
}

enum MenuItemStatus {
  AVAILABLE
  UNAVAILABLE
}

model ServiceCatalog {
  id           String    @id @default(cuid())
  branchId     String
  locationType LocationType
  isPublished  Boolean   @default(false)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  branch       Branch    @relation(fields: [branchId], references: [id])
  services     Service[]

  @@unique([branchId, locationType])
}

model Service {
  id          String      @id @default(cuid())
  catalogId   String
  name        String
  category    ServiceType
  displayOrder Int        @default(0)
  isActive    Boolean     @default(true)

  catalog     ServiceCatalog @relation(fields: [catalogId], references: [id])
}

model Subscription {
  id          String   @id @default(cuid())
  tenantId    String   @unique
  plan        SubscriptionPlan
  status      SubStatus @default(ACTIVE)
  stripeSubId String?
  flwSubId    String?
  currentPeriodEnd DateTime
  gracePeriodEnd   DateTime?
  maxBranches Int
  maxLocations Int
  maxEmployees Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  invoices    Invoice[]
}

enum SubscriptionPlan {
  STARTER
  PROFESSIONAL
  ENTERPRISE
}

enum SubStatus {
  ACTIVE
  PAST_DUE
  GRACE_PERIOD
  CANCELLED
  SUSPENDED
}

model AuditLog {
  id           String   @id @default(cuid())
  tenantId     String?
  branchId     String?
  actorId      String?
  actorRole    UserRole?
  actionType   String
  entityType   String
  entityId     String
  ipAddress    String?
  metadata     Json?
  createdAt    DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([entityType, entityId])
}

model Feedback {
  id         String   @id @default(cuid())
  requestId  String   @unique
  locationId String
  branchId   String
  employeeId String?
  rating     Int
  comment    String?
  isReviewed Boolean  @default(false)
  reviewNote String?
  createdAt  DateTime @default(now())

  request    Request  @relation(fields: [requestId], references: [id])
}
```

---

## QR Token Design

QR tokens use **HMAC-SHA256** signed JWTs with the following payload:

```json
{
  "sub": "<locationId>",
  "tid": "<tenantId>",
  "bid": "<branchId>",
  "lid": "<locationId>",
  "iat": 1700000000,
  "exp": 1700086400
}
```

The secret is a per-tenant HMAC secret stored encrypted in the database (AES-256-GCM). Token validation is a pure function:

```
validate(token, secret) → {valid: bool, context: LocationContext | null, error: string | null}
```

This pure functional design enables property-based testing of the round-trip property.

---

## Unified Request Pipeline Design

The `RequestPipelineModule` accepts a single `CreateRequestDto`:

```typescript
interface CreateRequestDto {
  source_type: 'QR_SCAN' | 'IOT_BUTTON';
  location_id: string;
  service_type: ServiceType;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

The pipeline steps are identical regardless of `source_type`:

```
1. Authenticate caller (JWT for staff/IoT API key for IoT device)
2. Validate DTO schema (class-validator)
3. Resolve Location → Branch → Tenant
4. Check deduplication (Redis: locationId:serviceType:60s window)
5. Persist Request record with source_type field
6. Emit REQUEST_CREATED domain event
7. Dispatch to NotificationsModule
8. Return Request record
```

---

## Frontend Architecture

### Application Structure (Next.js 15 App Router)

```
app/
├── (guest)/                    # Unauthenticated guest experience
│   └── scan/[token]/           # QR scan landing page
│       ├── page.tsx            # Context resolution + service list
│       ├── menu/page.tsx       # Digital menu
│       ├── request/page.tsx    # Request submission + tracking
│       └── feedback/page.tsx   # Post-completion feedback
├── (auth)/                     # Authentication pages
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── verify/page.tsx
├── (dashboard)/                # Authenticated staff/owner views
│   ├── reception/page.tsx      # Reception dashboard
│   ├── kitchen/page.tsx        # Kitchen dashboard
│   ├── manager/                # Manager analytics
│   │   ├── page.tsx
│   │   └── [branchId]/page.tsx
│   ├── locations/page.tsx
│   ├── menu/page.tsx
│   ├── employees/page.tsx
│   ├── billing/page.tsx
│   └── settings/page.tsx
└── admin/                      # Super Admin portal
    ├── tenants/page.tsx
    ├── audit/page.tsx
    └── metrics/page.tsx
```

### State Management Strategy

- **Server Components**: tenant-scoped data fetching (menus, catalogs, analytics)
- **React Query (TanStack Query)**: client-side data fetching, optimistic updates, cache invalidation
- **Zustand**: lightweight global state (active request tracking, WebSocket connection state)
- **Socket.IO Client**: real-time event subscriptions per authenticated dashboard role

---

## Error Handling

### Backend Error Taxonomy

| HTTP Status | Scenario |
|---|---|
| 400 Bad Request | DTO validation failure — returns field-level error array |
| 401 Unauthorized | Missing, expired, or revoked JWT |
| 403 Forbidden | Valid JWT but insufficient RBAC role |
| 404 Not Found | Entity not found within the caller's tenant scope |
| 409 Conflict | Duplicate email, duplicate active request within 60s window |
| 422 Unprocessable Entity | Business rule violation (quota exceeded, catalog empty, etc.) |
| 429 Too Many Requests | Rate limit exceeded — includes `Retry-After` header |
| 503 Service Unavailable | QR resolves to deactivated Branch or UNAVAILABLE Location |

### Global Exception Filter

All unhandled exceptions are caught by a NestJS global `HttpExceptionFilter` that:
1. Maps domain exceptions to HTTP status codes
2. Writes a structured error log entry (method, path, status, requestId)
3. Returns a consistent response envelope: `{success: false, error: {code, message, details}}`
4. Never leaks stack traces or internal error messages to clients

### Frontend Error Boundaries

React error boundaries wrap each major route segment. Network errors trigger toast notifications. QR validation failures render a branded error page with a human-readable message.

---

## Security Architecture

### Authentication Flow

```mermaid
sequenceDiagram
    participant Client
    participant AuthModule
    participant Redis
    participant DB

    Client->>AuthModule: POST /auth/login {email, password}
    AuthModule->>DB: Lookup user, verify bcrypt hash
    AuthModule->>AuthModule: Check lockout state
    AuthModule->>AuthModule: Sign JWT (15min) + Refresh Token (30day)
    AuthModule->>Redis: Store refresh token hash
    AuthModule->>DB: Persist RefreshToken record
    AuthModule-->>Client: {accessToken, refreshToken}

    Client->>AuthModule: POST /auth/refresh {refreshToken}
    AuthModule->>Redis: Validate + revoke old token
    AuthModule->>AuthModule: Issue new JWT + rotated Refresh Token
    AuthModule-->>Client: {accessToken, refreshToken}
```

### Multi-Tenant Data Isolation

Every Prisma query is wrapped in a `TenantContext` middleware that:
1. Extracts `tenantId` from the authenticated JWT
2. Automatically appends `WHERE tenant_id = :tenantId` via Prisma middleware
3. Throws a 403 if a resource's `tenantId` doesn't match the caller's

This is implemented as a Prisma client extension that intercepts all `findMany`, `findFirst`, `findUnique`, `update`, and `delete` operations.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Property Reflection:** After prework analysis, several properties were consolidated:
- Requirements 1.3 and 1.5 (duplicate email) → single Property 1
- Requirements 4.1, 4.3, and 4.8 (QR token round-trip) → single Property 3
- Requirements 4.4 and invalid token handling → single Property 4
- Requirements 16.2 and 16.4 (pipeline equivalence) → single Property 12
- Requirements 3.2 and 5.4 (enum acceptance) → merged into respective properties
- Requirements 5.5 and 5.6 (default catalogs) → subsumed by Property 6

---

### Property 1: Duplicate Email Rejection

*For any* email address, if a Tenant account already exists with that email, then any subsequent registration attempt using the same email address (regardless of case, whitespace, or other formatting variations) shall be rejected with a conflict error, and no duplicate account shall be created.

**Validates: Requirements 1.3, 1.5**

---

### Property 2: Multi-Tenant Data Isolation

*For any* two distinct Tenants A and B, when Tenant A's credentials are used to query any resource belonging to Tenant B, the platform shall return a 403 or 404 response and shall never return Tenant B's data in the response body.

**Validates: Requirements 1.6**

---

### Property 3: QR Token Round-Trip Fidelity

*For any* valid Location context (tenantId, branchId, locationId), encoding it into a QR Token and then decoding/validating that token shall produce an equivalent Location context with identical tenant, branch, and location identifiers.

**Validates: Requirements 4.1, 4.3, 4.8**

---

### Property 4: Invalid QR Token Rejection

*For any* QR token with a tampered signature, expired timestamp, or malformed structure, the validation endpoint shall always return an error response and shall never resolve a Location context from that token.

**Validates: Requirements 4.4**

---

### Property 5: QR Regeneration Invalidates Old Token

*For any* Location, after a Branch_Manager regenerates its QR Code, every previously issued QR Token for that Location shall be rejected as invalid by the validation endpoint, regardless of whether the old token's expiry has passed.

**Validates: Requirements 4.6**

---

### Property 6: Default Service Catalog Completeness

*For any* LocationType in the set {DINING_TABLE, HOTEL_ROOM, LOUNGE_SEAT, HOSPITAL_BED, MEETING_ROOM, POOLSIDE}, when a Location of that type is created, the automatically associated Service_Catalog shall contain all services defined in the default catalog specification for that LocationType (including HOUSEKEEPING + AMENITY_REQUEST for HOTEL_ROOM, and FOOD_AND_BEVERAGE + WAITER_CALL for DINING_TABLE).

**Validates: Requirements 3.3, 5.5, 5.6**

---

### Property 7: Location Name Update Preserves QR Validity

*For any* Location with an active, non-expired QR Token, updating the Location's name shall not invalidate the existing QR Token — the token shall remain valid and shall still resolve to the same Location.

**Validates: Requirements 3.4**

---

### Property 8: Location Deletion Blocked by Open Requests

*For any* Location that has at least one Request in PENDING or IN_PROGRESS status, the delete operation shall always fail with an error, regardless of the caller's role or the specific content of the open Requests.

**Validates: Requirements 3.5**

---

### Property 9: Branch Quota Enforcement

*For any* Subscription_Plan with a defined maximum branch count N, once a Tenant has N active Branches, every subsequent branch creation attempt shall fail with a quota-exceeded error until the plan is upgraded or an existing Branch is removed.

**Validates: Requirements 2.2, 2.3**

---

### Property 10: Guest Menu Shows Only Available Items

*For any* Branch Menu containing a mix of AVAILABLE and UNAVAILABLE Menu_Items, the guest-facing menu endpoint shall return only items with AVAILABLE status, and no UNAVAILABLE items shall appear in the response.

**Validates: Requirements 6.1**

---

### Property 11: Order Subtotal Mathematical Correctness

*For any* cart containing one or more Menu_Items with quantities, the order subtotal calculated and returned by the platform shall equal exactly the sum of (quantity × unitPrice) for each item in the cart.

**Validates: Requirements 6.6**

---

### Property 12: Unified Pipeline Source-Type Equivalence

*For any* valid request body with a valid location_id and service_type, submitting it with source_type QR_SCAN and submitting the identical body with source_type IOT_BUTTON shall produce Request records with identical fields (status, locationId, serviceType, payload) differing only in the source_type field itself.

**Validates: Requirements 16.2, 16.4**

---

### Property 13: Invalid Source-Type Rejection

*For any* string value not in the set {QR_SCAN, IOT_BUTTON}, submitting a Request payload with that source_type value shall always be rejected with a 400 validation error, regardless of the other fields in the payload.

**Validates: Requirements 16.3**

---

### Property 14: Request Deduplication Within Time Window

*For any* Location and ServiceType combination, if a PENDING Request exists for that combination, submitting an identical Request within 60 seconds shall return the existing Request identifier rather than creating a new Request record.

**Validates: Requirements 7.6**

---

### Property 15: Request Cancellation Only From PENDING

*For any* Request in a status other than PENDING (i.e., ASSIGNED, IN_PROGRESS, COMPLETED, or CANCELLED), a cancellation attempt shall always fail with an error. For any Request in PENDING status, cancellation shall always succeed.

**Validates: Requirements 7.7**

---

### Property 16: Employee Assignment Eligibility

*For any* Employee who is inactive (isActive=false) or not clocked-in (isClockedIn=false), attempting to assign them to any Request shall always fail with an error, regardless of the Request's status or the caller's role.

**Validates: Requirements 8.2**

---

### Property 17: Submitted Order Price Immutability

*For any* Request containing ordered items with recorded unitPrices, updating the corresponding Menu_Item's price shall not change the unitPrice values already recorded on the Request's items — historical order prices shall remain frozen at the value captured at submission time.

**Validates: Requirements 13.4**

---

### Property 18: Feedback Idempotency Per Request

*For any* completed Request, submitting a feedback entry twice shall fail on the second attempt with an error — at most one feedback entry shall exist per Request, regardless of the Guest session or submission interval.

**Validates: Requirements 14.3**

---

### Property 19: Low-Satisfaction Feedback Flagging

*For any* feedback submission with a rating value of 1 or 2, the platform shall flag it as a low-satisfaction alert. For any feedback with a rating of 3, 4, or 5, the platform shall not flag it as a low-satisfaction alert.

**Validates: Requirements 14.5**

---

### Property 20: Audit Log Completeness

*For any* create, update, delete, or status-transition operation on any entity, an Audit_Log entry shall be created with the actor identity, action type, affected entity type, entity ID, and timestamp. No such operation shall complete without a corresponding Audit_Log entry.

**Validates: Requirements 18.1**

---

### Property 21: Audit Log Immutability

*For any* user role — including SUPER_ADMIN — attempting to update or delete any Audit_Log entry shall always fail with a 403 error. No Audit_Log entry, once written, shall be modifiable through any API endpoint.

**Validates: Requirements 18.4**

---

### Property 22: Rate Limiting at Threshold

*For any* IP address, after sending exactly 30 requests to any unauthenticated endpoint within a 60-second window, the immediately following request from that same IP address shall receive an HTTP 429 response with a Retry-After header.

**Validates: Requirements 20.1**

---

### Property 23: Token Expiry Correctness

*For any* successful login or token refresh, the issued JWT's expiry timestamp shall be within a 1-minute window of (issuance time + 15 minutes), and the issued Refresh Token's expiry shall be within a 1-minute window of (issuance time + 30 days).

**Validates: Requirements 17.2**

---

### Property 24: Refresh Token Single-Use Rotation

*For any* valid Refresh Token, after it has been presented once to the refresh endpoint, presenting the same token a second time shall return a 401 Unauthorized response — each Refresh Token is valid for exactly one use.

**Validates: Requirements 17.3**

---

### Property 25: Catalog Independence Per Branch

*For any* two distinct Branches A and B under the same Tenant, updating the Service_Catalog for Branch A's LocationType shall not change the Service_Catalog of Branch B's same LocationType — catalogs are isolated per Branch.

**Validates: Requirements 5.1**

---

### Error Response Envelope

All API errors follow a consistent JSON envelope:

```json
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Your STARTER plan allows a maximum of 2 branches. Upgrade to PROFESSIONAL for up to 10 branches.",
    "details": [
      { "field": "branchCount", "constraint": "max", "value": 2 }
    ]
  },
  "requestId": "req_01HXQ..."
}
```

Success responses use `{ "success": true, "data": {...}, "meta": {...} }`.

### Domain Exception Hierarchy

```typescript
// Base
class AppException extends Error { constructor(public code: string, message: string, public statusCode: number) }

// Specific
class ValidationException extends AppException {}         // 400
class UnauthorizedException extends AppException {}       // 401
class ForbiddenException extends AppException {}          // 403
class NotFoundException extends AppException {}           // 404
class ConflictException extends AppException {}           // 409
class BusinessRuleException extends AppException {}       // 422
class RateLimitException extends AppException {}          // 429
class ServiceUnavailableException extends AppException {} // 503
```

### QR Token Error Cases

| Condition | Code | Guest Message |
|---|---|---|
| Signature mismatch | `QR_INVALID_SIGNATURE` | "Invalid or Expired QR Code" |
| Token expired | `QR_TOKEN_EXPIRED` | "Invalid or Expired QR Code" |
| Token revoked | `QR_TOKEN_REVOKED` | "This QR code has been replaced. Please scan the updated code." |
| Branch deactivated | `BRANCH_UNAVAILABLE` | "This location is temporarily out of service." |
| Location unavailable | `LOCATION_UNAVAILABLE` | "This spot is currently unavailable. Please ask a staff member for assistance." |
| Tenant suspended | `TENANT_SUSPENDED` | "Service is currently suspended. Please contact the establishment." |

### Real-Time Error Recovery

WebSocket disconnections are handled with exponential backoff reconnection (1s, 2s, 4s, 8s, max 30s). On reconnect, the client sends its last-seen event sequence number, and the server replays missed events from Redis within the 60-second replay window (Requirement 19.5).

---

## Testing Strategy

### Test Technology Stack

| Layer | Tool | Purpose |
|---|---|---|
| Unit + Property | Jest + `fast-check` | Property-based testing for business logic |
| Integration | Jest + Supertest | API endpoint testing against real DB (test containers) |
| E2E | Playwright | Full user journeys (guest scan → order → completion) |
| WebSocket | Socket.IO test client | Real-time event delivery verification |
| Load | k6 | Rate limiting and latency benchmarks |

### Property-Based Testing Approach

**Library**: [`fast-check`](https://fast-check.dev/) for TypeScript/Node.js.

Each correctness property is implemented as a single `fc.property` test that runs a minimum of **100 iterations** per execution. Tests are tagged with a comment referencing the design property:

```typescript
// Feature: smartserve-qr, Property 3: QR Token Round-Trip Fidelity
it('QR token encode/decode round trip preserves location context', () => {
  fc.assert(
    fc.property(
      fc.record({
        tenantId: fc.string({ minLength: 1 }),
        branchId: fc.string({ minLength: 1 }),
        locationId: fc.string({ minLength: 1 }),
      }),
      (ctx) => {
        const token = qrService.sign(ctx, 'NON_EXPIRING');
        const decoded = qrService.verify(token);
        expect(decoded.tenantId).toBe(ctx.tenantId);
        expect(decoded.branchId).toBe(ctx.branchId);
        expect(decoded.locationId).toBe(ctx.locationId);
      }
    ),
    { numRuns: 100 }
  );
});
```

**Tag format:** `// Feature: smartserve-qr, Property {N}: {property_title}`

### Property Test Coverage Map

| Property | Test File | Category |
|---|---|---|
| 1 - Duplicate Email Rejection | `auth/duplicate-email.property.spec.ts` | PROPERTY |
| 2 - Multi-Tenant Data Isolation | `tenant/isolation.property.spec.ts` | PROPERTY |
| 3 - QR Token Round-Trip | `qr/token-roundtrip.property.spec.ts` | PROPERTY |
| 4 - Invalid QR Token Rejection | `qr/invalid-token.property.spec.ts` | PROPERTY |
| 5 - QR Regeneration Invalidates Old | `qr/regeneration.property.spec.ts` | PROPERTY |
| 6 - Default Catalog Completeness | `catalog/defaults.property.spec.ts` | PROPERTY |
| 7 - Name Update Preserves QR | `location/name-update.property.spec.ts` | PROPERTY |
| 8 - Deletion Blocked by Open Requests | `location/deletion-guard.property.spec.ts` | PROPERTY |
| 9 - Branch Quota Enforcement | `branch/quota.property.spec.ts` | PROPERTY |
| 10 - Guest Menu Available Only | `menu/availability-filter.property.spec.ts` | PROPERTY |
| 11 - Order Subtotal Correctness | `order/subtotal.property.spec.ts` | PROPERTY |
| 12 - Pipeline Source Equivalence | `pipeline/source-equivalence.property.spec.ts` | PROPERTY |
| 13 - Invalid Source-Type Rejection | `pipeline/invalid-source.property.spec.ts` | PROPERTY |
| 14 - Request Deduplication | `request/deduplication.property.spec.ts` | PROPERTY |
| 15 - Cancellation State Guard | `request/cancellation.property.spec.ts` | PROPERTY |
| 16 - Employee Assignment Eligibility | `employee/assignment.property.spec.ts` | PROPERTY |
| 17 - Submitted Order Price Immutability | `order/price-immutability.property.spec.ts` | PROPERTY |
| 18 - Feedback Idempotency | `feedback/idempotency.property.spec.ts` | PROPERTY |
| 19 - Low-Satisfaction Flagging | `feedback/satisfaction-flag.property.spec.ts` | PROPERTY |
| 20 - Audit Log Completeness | `audit/completeness.property.spec.ts` | PROPERTY |
| 21 - Audit Log Immutability | `audit/immutability.property.spec.ts` | PROPERTY |
| 22 - Rate Limit Threshold | `security/rate-limit.property.spec.ts` | PROPERTY |
| 23 - Token Expiry Correctness | `auth/token-expiry.property.spec.ts` | PROPERTY |
| 24 - Refresh Token Single-Use | `auth/token-rotation.property.spec.ts` | PROPERTY |
| 25 - Catalog Independence | `catalog/independence.property.spec.ts` | PROPERTY |

### Unit Test Strategy

Unit tests target pure service functions and validators. Each module has a `.spec.ts` file covering:
- Happy path example
- Known edge cases (empty catalogs, zero-inventory items, expired tokens)
- Error condition examples

Unit tests **avoid** testing external service behavior (FCM, Stripe, S3). Those are covered by mocked integration tests.

### Integration Test Strategy

Integration tests use **Testcontainers** to spin up real PostgreSQL and Redis instances. They cover:
- Full request lifecycle (create → assign → in-progress → complete → feedback)
- Multi-tenant isolation boundaries
- WebSocket event delivery (Socket.IO test client)
- QR token validation against live DB state
- Stripe/Flutterwave webhook handling (mocked payloads)

### E2E Test Strategy (Playwright)

Key Playwright scenarios:
1. **Guest journey**: Scan QR → View menu → Add items → Place order → Track status → Submit feedback
2. **Reception flow**: Login → View dashboard → Assign employee → Monitor completion
3. **Kitchen flow**: Login → View order queue → Mark in-progress → Mark complete
4. **Onboarding flow**: Register → Verify email → Create branch → Create locations → Generate QR codes
5. **Billing flow**: Select plan → Enter payment → Receive confirmation

### CI Test Execution Order

```
1. Lint (ESLint, Prettier)
2. Type check (tsc --noEmit)
3. Unit tests (Jest --coverage)
4. Property tests (Jest + fast-check, 100 iterations)
5. Integration tests (Jest + Testcontainers)
6. Build (Docker images)
7. E2E tests (Playwright, staging env)
```

---

## Deployment Architecture

### Container Structure

```yaml
# docker-compose.yml (local dev)
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: smartserve
      POSTGRES_USER: smartserve
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: [pgdata:/var/lib/postgresql/data]
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend:
    build: ./backend
    depends_on: [postgres, redis]
    environment:
      DATABASE_URL: postgresql://smartserve:${DB_PASSWORD}@postgres:5432/smartserve
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
    ports: ["3001:3001"]

  frontend:
    build: ./frontend
    depends_on: [backend]
    environment:
      NEXT_PUBLIC_API_URL: http://backend:3001
    ports: ["3000:3000"]
```

### CI/CD Pipelines

**CI (Pull Request)**:
```
on: pull_request → main
jobs:
  - lint-and-typecheck
  - unit-and-property-tests
  - integration-tests
  - build-docker-images
  - e2e-tests (on staging)
```

**CD (Merge to Main)**:
```
on: push → main
jobs:
  - deploy-frontend → Vercel (automatic)
  - deploy-backend → Railway (via Railway CLI)
  - run-db-migrations → Prisma migrate deploy
```

### Environment Configuration

| Variable | Usage |
|---|---|
| `DATABASE_URL` | Prisma PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | JWT signing secret |
| `QR_HMAC_SECRET_ENCRYPTION_KEY` | AES-256-GCM key for per-tenant HMAC secrets |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | File storage |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | FCM push notifications |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Stripe billing |
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave billing |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | OAuth |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Transactional email |

---

## Frontend Design System

The guest and staff interfaces follow a **premium SaaS aesthetic** inspired by Stripe, Linear, Notion, and Apple:

- **Typography**: Inter (body) + Geist Mono (code/IDs)  
- **Color System**: Neutral gray scale with per-tenant primary accent (stored on Tenant profile)
- **Motion**: Framer Motion for page transitions, toast animations, status badge transitions
- **Components**: Material UI base + custom Tailwind variants for branded theming
- **Accessibility**: WCAG 2.1 AA — keyboard navigation, ARIA labels, focus rings, color contrast ≥ 4.5:1
- **Responsive**: Mobile-first (guest QR experience) + desktop-optimized dashboards

### Guest QR Experience Design Principles

1. Zero-auth friction — no login required for guests
2. Context-aware branding — tenant logo and colors from Tenant profile
3. Immediate feedback — skeleton loaders, optimistic UI, real-time status badges
4. Progressive disclosure — service list → menu → cart → order summary
