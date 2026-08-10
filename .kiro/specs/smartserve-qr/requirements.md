# Requirements Document

## Introduction

SmartServe QR is a production-ready, enterprise-grade, multi-tenant SaaS hospitality service platform. Every QR code represents a unique physical location — restaurant table, hotel room, lounge seat, hospital bed, or office meeting room — and dynamically serves only the services configured for that location. Guests scan a QR code, are automatically placed in context (Business → Branch → Location), and interact with a branded interface to submit service requests. Staff receive real-time notifications, fulfill requests, and managers gain full operational visibility through analytics dashboards. The platform is architecturally future-compatible with ESP32-based IoT buttons that will submit identical request payloads through the same unified request-processing pipeline.

---

## Glossary

- **Platform**: The SmartServe QR SaaS system as a whole.
- **Super_Admin**: A Platform-level administrator who manages tenants, billing plans, and system health.
- **Tenant**: A registered business entity (e.g., a restaurant chain, hotel group) that subscribes to the Platform.
- **Business_Owner**: A user who owns or manages a Tenant account.
- **Branch**: A physical location belonging to a Tenant (e.g., a specific restaurant outlet or hotel property).
- **Branch_Manager**: A user responsible for managing one or more Branches within a Tenant.
- **Employee**: A staff member (waiter, housekeeper, receptionist, nurse, etc.) assigned to a Branch.
- **Location**: A uniquely identifiable physical spot within a Branch (table, room, seat, bed, meeting room).
- **Location_Type**: A category that defines the kind of Location and its available services (e.g., DINING_TABLE, HOTEL_ROOM, LOUNGE_SEAT).
- **QR_Code**: A scannable code that encodes a secure, signed token uniquely identifying a Location.
- **QR_Token**: A cryptographically signed JWT embedded in a QR_Code that encodes Business, Branch, and Location identifiers plus an expiry.
- **Guest**: An unauthenticated or lightly-authenticated end user who scans a QR_Code.
- **Service**: A capability offered at a Location (e.g., "Order Food", "Request Housekeeping", "Call Waiter").
- **Service_Catalog**: The set of Services configured for a specific Location_Type within a Branch.
- **Menu**: A structured list of orderable items (food, beverages, amenities) available at a Location.
- **Menu_Item**: A single orderable product within a Menu, with price, category, description, and availability status.
- **Request**: A service interaction initiated by a Guest at a Location (order, waiter call, housekeeping request, etc.).
- **Request_Status**: The lifecycle state of a Request: PENDING → ASSIGNED → IN_PROGRESS → COMPLETED → CANCELLED.
- **Request_Pipeline**: The unified backend processing path through which both QR-initiated and IoT-initiated Requests flow.
- **IoT_Device**: An ESP32-based physical button that submits Request payloads identical in schema to QR-initiated Requests.
- **Reception_Dashboard**: A real-time UI used by front-desk staff to view and manage incoming Requests for a Branch.
- **Kitchen_Dashboard**: A real-time UI used by kitchen staff to view and fulfill food/beverage Orders for a Branch.
- **Manager_Dashboard**: An analytics and operational oversight UI used by Branch_Managers and Business_Owners.
- **Super_Admin_Portal**: A Platform-level UI used by Super_Admins to manage Tenants, subscriptions, and system health.
- **Subscription_Plan**: A billing tier that defines feature access, location quotas, and pricing for a Tenant.
- **Audit_Log**: An immutable, timestamped record of every significant action performed on the Platform.
- **RBAC**: Role-Based Access Control — the permission model governing what each user role can read or modify.
- **JWT**: JSON Web Token used for stateless authentication and QR_Token signing.
- **Refresh_Token**: A long-lived token used to obtain new access JWTs without requiring re-authentication.
- **FCM**: Firebase Cloud Messaging — the push notification delivery service.
- **WebSocket**: A persistent bidirectional connection (via Socket.IO) used for real-time event delivery.
- **Stripe**: The primary payment processor for subscription billing in supported regions.
- **Flutterwave**: An alternative payment processor supporting African markets and Mobile Money.
- **Prisma**: The ORM used to interact with the PostgreSQL database.
- **Redis**: The in-memory cache and pub/sub broker used for session management and real-time event routing.
- **Supabase_Storage**: The file storage service used for images, QR code assets, and documents.
- **Rate_Limiter**: A component that enforces request-per-minute thresholds on API endpoints to prevent abuse.

---

## Requirements

### Requirement 1: Multi-Tenant Business Registration and Management

**User Story:** As a Business_Owner, I want to register my business on the Platform and manage its profile, so that I can onboard branches and staff under a single tenant account.

#### Acceptance Criteria

1. WHEN a Business_Owner submits a registration form with a unique business name, email, and password, THE Platform SHALL create a Tenant account, assign the BUSINESS_OWNER role, and send an email verification link within 60 seconds.
2. WHEN a Business_Owner verifies their email address, THE Platform SHALL activate the Tenant account and provision a default Subscription_Plan.
3. THE Platform SHALL enforce unique email addresses across all Tenant accounts.
4. WHEN a Business_Owner updates the Tenant profile (name, logo, contact details), THE Platform SHALL persist the changes and reflect them in all Branch-branded guest interfaces within 5 seconds.
5. IF a Business_Owner submits a registration with an email address already associated with an existing account, THEN THE Platform SHALL return a descriptive conflict error without creating a duplicate account.
6. THE Platform SHALL store Tenant data in strict isolation so that no Tenant can read or modify another Tenant's data.
7. WHEN a Business_Owner authenticates via Google OAuth, THE Platform SHALL create or link the Tenant account using the verified Google identity and issue a JWT and Refresh_Token pair.

---

### Requirement 2: Branch Management

**User Story:** As a Business_Owner or Branch_Manager, I want to create and manage branches, so that each physical location of my business operates independently with its own staff and configuration.

#### Acceptance Criteria

1. WHEN a Business_Owner creates a Branch with a name, address, timezone, and currency, THE Platform SHALL persist the Branch under the Tenant and assign a unique Branch identifier.
2. THE Platform SHALL enforce that the number of active Branches does not exceed the quota defined by the Tenant's Subscription_Plan.
3. IF a Business_Owner attempts to create a Branch that would exceed the Subscription_Plan branch quota, THEN THE Platform SHALL return a quota-exceeded error and prompt an upgrade.
4. WHEN a Branch_Manager is assigned to a Branch, THE Platform SHALL restrict the Branch_Manager's data access to that Branch only.
5. WHEN a Branch is deactivated by a Business_Owner, THE Platform SHALL disable all QR_Codes belonging to that Branch and return a service-unavailable response to any Guest who scans them.
6. THE Platform SHALL allow each Branch to independently configure its operating hours, currency, and default language.

---

### Requirement 3: Location Management

**User Story:** As a Branch_Manager, I want to create and configure physical locations within my branch, so that each QR code maps to a specific, identifiable spot and serves appropriate services.

#### Acceptance Criteria

1. WHEN a Branch_Manager creates a Location with a name, Location_Type, and floor/zone metadata, THE Platform SHALL persist the Location under the Branch and assign a unique Location identifier.
2. THE Platform SHALL support the following Location_Types: DINING_TABLE, HOTEL_ROOM, LOUNGE_SEAT, HOSPITAL_BED, MEETING_ROOM, and POOLSIDE.
3. WHEN a Location_Type is assigned to a Location, THE Platform SHALL automatically associate the default Service_Catalog for that Location_Type with the Location.
4. WHEN a Branch_Manager updates a Location's name, THE Platform SHALL reflect the updated name in the Guest interface within 5 seconds without invalidating the existing QR_Code.
5. IF a Branch_Manager attempts to delete a Location that has PENDING or IN_PROGRESS Requests, THEN THE Platform SHALL return an error and require all open Requests to be resolved before deletion.
6. THE Platform SHALL allow a Branch_Manager to temporarily mark a Location as UNAVAILABLE, causing the guest interface to display an out-of-service message when the QR_Code is scanned.

---

### Requirement 4: QR Code Generation and Validation

**User Story:** As a Branch_Manager, I want to generate, download, and manage QR codes for each location, so that guests can scan them to access location-specific services.

#### Acceptance Criteria

1. WHEN a Branch_Manager requests QR_Code generation for a Location, THE Platform SHALL produce a QR_Token signed with HMAC-SHA256 encoding the Tenant ID, Branch ID, Location ID, and a configurable expiry, and render it as a downloadable PNG and SVG asset stored in Supabase_Storage.
2. THE Platform SHALL allow Branch_Managers to set QR_Token validity periods of 24 hours, 7 days, 30 days, or non-expiring.
3. WHEN a Guest scans a QR_Code and the backend receives the QR_Token, THE Platform SHALL validate the signature, check the expiry, and resolve the Tenant → Branch → Location chain within 300 milliseconds.
4. IF a QR_Token signature is invalid or the token is expired, THEN THE Platform SHALL return an error response and display a human-readable "Invalid or Expired QR Code" message to the Guest.
5. IF a QR_Token resolves to a Branch that is deactivated or a Location that is UNAVAILABLE, THEN THE Platform SHALL return a service-unavailable response with a descriptive message.
6. WHEN a Branch_Manager regenerates a QR_Code for a Location, THE Platform SHALL invalidate the previous QR_Token and generate a new signed token, ensuring old codes no longer grant access.
7. THE Platform SHALL log every QR_Token scan attempt — valid or invalid — in the Audit_Log with a timestamp, IP address, and resolution result.
8. FOR ALL valid QR_Tokens, encoding then decoding the token SHALL produce an equivalent Location context (round-trip property).

---

### Requirement 5: Dynamic Service Catalog per Location Type

**User Story:** As a Branch_Manager, I want to configure which services are available at each location type, so that guests only see relevant options when they scan a QR code.

#### Acceptance Criteria

1. THE Platform SHALL maintain a Service_Catalog independently per Location_Type per Branch, allowing different Branches of the same Tenant to offer different services.
2. WHEN a Guest's QR_Token is validated, THE Platform SHALL load and return only the Services belonging to the Service_Catalog configured for that Location's Location_Type.
3. WHEN a Branch_Manager adds, removes, or reorders a Service in a Service_Catalog, THE Platform SHALL propagate the change to all active guest sessions for Locations of that Location_Type within 10 seconds.
4. THE Platform SHALL support the following Service categories: FOOD_AND_BEVERAGE, HOUSEKEEPING, WAITER_CALL, MAINTENANCE, AMENITY_REQUEST, and CUSTOM.
5. WHERE the Location_Type is HOTEL_ROOM, THE Platform SHALL include HOUSEKEEPING and AMENITY_REQUEST in the default Service_Catalog.
6. WHERE the Location_Type is DINING_TABLE, THE Platform SHALL include FOOD_AND_BEVERAGE and WAITER_CALL in the default Service_Catalog.
7. IF a Branch_Manager attempts to publish a Service_Catalog with no active Services, THEN THE Platform SHALL return a validation error requiring at least one active Service.

---

### Requirement 6: Digital Menu with Ordering

**User Story:** As a Guest, I want to browse a digital menu and place food or beverage orders from my location, so that I can be served without calling a staff member.

#### Acceptance Criteria

1. WHEN a Guest opens the FOOD_AND_BEVERAGE service at a Location, THE Platform SHALL display the Menu associated with that Branch, filtered to items marked AVAILABLE.
2. THE Platform SHALL present Menu_Items grouped by category, each with name, description, price in the Branch currency, and an image if available.
3. WHEN a Guest adds Menu_Items to a cart and submits an order, THE Platform SHALL create a Request of type ORDER, persist all ordered items with quantities and unit prices, link the Request to the Location, and assign Request_Status PENDING.
4. IF a Guest submits an order containing a Menu_Item marked UNAVAILABLE, THEN THE Platform SHALL reject the item, notify the Guest which items are unavailable, and allow resubmission without the unavailable items.
5. WHEN a Branch_Manager marks a Menu_Item as UNAVAILABLE, THE Platform SHALL reflect the change in all active guest sessions within 10 seconds.
6. THE Platform SHALL calculate and display the order subtotal and applicable taxes before the Guest confirms the order.
7. WHERE the Branch has enabled online payment, THE Platform SHALL present Stripe or Flutterwave as payment options and complete payment authorization before confirming the order.
8. WHEN an order is confirmed, THE Platform SHALL transmit the order details to the Kitchen_Dashboard in real time via WebSocket.

---

### Requirement 7: Service Request Management

**User Story:** As a Guest, I want to submit service requests from my location and track their status in real time, so that I know my request has been received and is being handled.

#### Acceptance Criteria

1. WHEN a Guest submits a service Request, THE Platform SHALL assign a unique Request identifier, set Request_Status to PENDING, record the creation timestamp, and persist the Request linked to the Location.
2. THE Platform SHALL transmit a real-time notification to the Reception_Dashboard of the corresponding Branch via WebSocket within 2 seconds of Request creation.
3. THE Platform SHALL deliver an FCM push notification to all Employees of the relevant department within 5 seconds of Request creation.
4. WHEN a Guest views their active Request, THE Platform SHALL display the current Request_Status and the elapsed time since submission.
5. WHEN a Request's status transitions, THE Platform SHALL notify the Guest's session via WebSocket within 2 seconds of the transition.
6. IF a Guest submits a duplicate Request for the same Location and Service within 60 seconds of an existing PENDING Request, THEN THE Platform SHALL return the existing Request identifier rather than creating a duplicate.
7. THE Platform SHALL support Guest cancellation of Requests that are in PENDING status only.
8. WHEN a Request is cancelled by a Guest, THE Platform SHALL update the Request_Status to CANCELLED, notify the Reception_Dashboard, and record the cancellation timestamp.

---

### Requirement 8: Employee Assignment and Task Management

**User Story:** As a Branch_Manager or Reception staff, I want to assign employees to incoming requests and track task completion, so that every guest request is fulfilled by an identified staff member.

#### Acceptance Criteria

1. WHEN a Branch_Manager or Reception staff assigns an Employee to a PENDING Request, THE Platform SHALL update the Request_Status to ASSIGNED, record the assigned Employee and assignment timestamp, and notify the Employee via FCM within 5 seconds.
2. THE Platform SHALL restrict Employee assignment to Employees who are active and clocked-in on the Branch where the Request was created.
3. WHEN an Employee accepts a task, THE Platform SHALL update the Request_Status to IN_PROGRESS and notify the Guest's session via WebSocket within 2 seconds.
4. WHEN an Employee marks a task as complete, THE Platform SHALL update the Request_Status to COMPLETED, record the completion timestamp, and prompt the Guest to submit feedback.
5. IF an assigned Employee is unavailable and a Branch_Manager reassigns the Request to another Employee, THEN THE Platform SHALL update the assignment record, notify the new Employee, and log the reassignment event in the Audit_Log.
6. THE Platform SHALL display each Employee's current active task count on the Reception_Dashboard to assist workload-balanced assignment.
7. WHEN an Employee's shift ends while they have IN_PROGRESS tasks, THE Platform SHALL notify the Branch_Manager and mark those tasks as requiring reassignment.

---

### Requirement 9: Reception Dashboard

**User Story:** As a front-desk Employee, I want a real-time dashboard that shows all incoming requests for my branch, so that I can monitor, assign, and resolve requests efficiently.

#### Acceptance Criteria

1. WHEN an Employee with RECEPTIONIST or BRANCH_MANAGER role opens the Reception_Dashboard, THE Platform SHALL display all active Requests for the Branch in descending order of creation time, updating in real time via WebSocket.
2. THE Reception_Dashboard SHALL display for each Request: Request identifier, Location name, Service type, Request_Status, Guest notes, elapsed time, and assigned Employee (if any).
3. WHEN the Reception_Dashboard receives a new Request via WebSocket, THE Platform SHALL play an audio alert and display a visual notification badge without requiring a page refresh.
4. THE Platform SHALL allow Reception staff to filter Requests by Request_Status, Service type, and Location from within the Reception_Dashboard.
5. THE Reception_Dashboard SHALL display an escalation indicator for any Request that has remained in PENDING status for longer than the Branch-configured escalation threshold (default: 5 minutes).
6. THE Platform SHALL allow Reception staff to add internal notes to a Request that are visible to staff but not to the Guest.

---

### Requirement 10: Kitchen Dashboard

**User Story:** As a kitchen staff member, I want a dedicated real-time order queue, so that I can view and process food and beverage orders in the sequence they were received.

#### Acceptance Criteria

1. WHEN an Employee with KITCHEN_STAFF role opens the Kitchen_Dashboard, THE Platform SHALL display all ORDER-type Requests in PENDING or IN_PROGRESS status for the Branch, ordered by creation time ascending (FIFO).
2. THE Kitchen_Dashboard SHALL display for each order: order identifier, Location name, ordered items with quantities, special instructions, and elapsed time.
3. WHEN a new ORDER Request is created, THE Platform SHALL push it to the Kitchen_Dashboard via WebSocket within 2 seconds and play an audio alert.
4. WHEN Kitchen staff marks an order as IN_PROGRESS, THE Platform SHALL update the Request_Status and notify the Reception_Dashboard.
5. WHEN Kitchen staff marks an order as COMPLETED, THE Platform SHALL update the Request_Status, record the completion timestamp, and notify the Guest's session via WebSocket.
6. THE Kitchen_Dashboard SHALL allow staff to mark individual Menu_Items within an order as OUT_OF_STOCK, which THE Platform SHALL propagate to the Menu as UNAVAILABLE within 10 seconds.

---

### Requirement 11: Manager Analytics Dashboard

**User Story:** As a Branch_Manager or Business_Owner, I want an analytics dashboard with operational metrics and trends, so that I can make data-driven decisions to improve service quality and efficiency.

#### Acceptance Criteria

1. THE Manager_Dashboard SHALL display the following real-time metrics for the selected Branch and date range: total Requests, Requests by status, average Request-to-completion time, busiest Locations, and top-ordered Menu_Items.
2. THE Manager_Dashboard SHALL display Employee performance metrics including total tasks completed, average task completion time, and tasks-per-hour for the selected period.
3. WHEN a Branch_Manager selects a date range, THE Platform SHALL return aggregated analytics data within 3 seconds.
4. THE Manager_Dashboard SHALL display a heat map of Location activity showing which Locations generate the most Requests.
5. THE Platform SHALL allow Branch_Managers to export analytics reports as CSV files covering the selected date range.
6. WHERE the Tenant has multiple Branches, THE Manager_Dashboard SHALL allow the Business_Owner to view consolidated metrics across all Branches.

---

### Requirement 12: Super Admin Portal

**User Story:** As a Super_Admin, I want a portal to manage all tenants, subscriptions, and system health, so that I can operate and grow the platform commercially.

#### Acceptance Criteria

1. THE Super_Admin_Portal SHALL display all registered Tenants with their Subscription_Plan, account status, Branch count, and total Requests processed.
2. WHEN a Super_Admin suspends a Tenant, THE Platform SHALL deactivate all Branches and QR_Codes under that Tenant within 60 seconds and return a suspension notice to any Guest scanning a QR_Code.
3. THE Super_Admin_Portal SHALL display platform-level metrics: total active Tenants, total active Branches, total Requests in the last 24 hours, and system error rates.
4. WHEN a Super_Admin changes a Tenant's Subscription_Plan, THE Platform SHALL apply the new feature and quota limits immediately without requiring the Tenant to log out.
5. THE Super_Admin_Portal SHALL allow Super_Admins to view the Audit_Log for any Tenant filtered by date range, event type, and actor.
6. THE Platform SHALL restrict Super_Admin_Portal access exclusively to users with the SUPER_ADMIN role.

---

### Requirement 13: Inventory and Menu Management

**User Story:** As a Branch_Manager, I want to manage the menu and track inventory levels, so that guests only see items that are available and stock levels remain accurate.

#### Acceptance Criteria

1. WHEN a Branch_Manager creates a Menu_Item with a name, category, description, price, and image, THE Platform SHALL persist it under the Branch Menu and set its status to AVAILABLE.
2. THE Platform SHALL support Menu_Item categories: FOOD, BEVERAGE, DESSERT, AMENITY, and CUSTOM.
3. WHEN a Branch_Manager updates the price of a Menu_Item, THE Platform SHALL reflect the new price in the guest interface within 10 seconds and apply it to all subsequent orders.
4. THE Platform SHALL not retroactively change the price recorded on submitted orders when a Menu_Item price is updated.
5. WHEN inventory tracking is enabled for a Menu_Item and the stock quantity reaches zero, THE Platform SHALL automatically set the Menu_Item status to UNAVAILABLE and notify the Branch_Manager via FCM.
6. WHEN a Branch_Manager uploads a Menu_Item image, THE Platform SHALL store it in Supabase_Storage, generate an optimized URL, and associate it with the Menu_Item.
7. THE Platform SHALL allow Branch_Managers to organize Menu_Items into named sections and set display order within each section.

---

### Requirement 14: Customer Feedback and Reviews

**User Story:** As a Guest, I want to submit feedback after my request is completed, so that I can share my experience and help the business improve its service.

#### Acceptance Criteria

1. WHEN a Request reaches COMPLETED status, THE Platform SHALL present the Guest with a feedback prompt containing a 1–5 star rating and an optional text comment within 5 seconds.
2. WHEN a Guest submits feedback, THE Platform SHALL associate it with the completed Request, Location, Branch, and Employee, persist it, and confirm receipt.
3. THE Platform SHALL allow each Guest session to submit at most one feedback entry per completed Request.
4. THE Manager_Dashboard SHALL display aggregated average ratings per Branch, per Location, and per Employee for the selected date range.
5. IF a Guest submits a feedback rating of 1 or 2 stars, THEN THE Platform SHALL flag the feedback as a low-satisfaction alert and notify the Branch_Manager via FCM within 60 seconds.
6. THE Platform SHALL allow Branch_Managers to view individual feedback entries, respond with a note, and mark them as reviewed.

---

### Requirement 15: Billing and Subscriptions

**User Story:** As a Business_Owner, I want to manage my subscription plan and payment method, so that I can access platform features appropriate to my business size and pay securely.

#### Acceptance Criteria

1. THE Platform SHALL offer at least three Subscription_Plans: STARTER, PROFESSIONAL, and ENTERPRISE, each defining maximum Branch count, Location count, Employee count, and feature access.
2. WHEN a Business_Owner selects a Subscription_Plan and provides payment details, THE Platform SHALL process the subscription via Stripe or Flutterwave and activate the plan within 60 seconds.
3. WHEN a subscription renewal payment is processed successfully, THE Platform SHALL extend the subscription period and send a receipt email to the Business_Owner.
4. IF a subscription renewal payment fails, THEN THE Platform SHALL notify the Business_Owner via email and FCM and set the Tenant to a grace period of 7 days before restricting feature access.
5. WHEN a Business_Owner upgrades to a higher Subscription_Plan mid-cycle, THE Platform SHALL apply prorated billing for the remaining period and activate the new limits immediately.
6. WHERE Flutterwave is selected as the payment provider, THE Platform SHALL support Mobile Money payment methods in addition to card payments.
7. THE Platform SHALL provide the Business_Owner with a downloadable invoice for each billing period in PDF format.

---

### Requirement 16: Unified Request Processing Pipeline

**User Story:** As a Platform architect, I want all service requests — regardless of whether they originate from QR code scans or IoT device buttons — to be processed through a single pipeline, so that future IoT integrations require no architectural changes.

#### Acceptance Criteria

1. THE Request_Pipeline SHALL accept Request payloads conforming to a defined schema containing: source_type (QR_SCAN or IOT_BUTTON), location_id, service_type, payload, and optional metadata.
2. WHEN a Request_Pipeline receives a payload with source_type IOT_BUTTON, THE Platform SHALL validate the payload schema, resolve the Location, and process the Request identically to a QR_SCAN-originated Request.
3. THE Platform SHALL validate the source_type field of every incoming Request payload and reject payloads with an unrecognized source_type with a descriptive error.
4. FOR ALL valid Request payloads regardless of source_type, THE Request_Pipeline SHALL produce a Request record with identical fields and lifecycle behavior.
5. WHEN an IoT_Device submits a Request, THE Platform SHALL authenticate the device using a device-scoped API key before processing the Request.
6. THE Platform SHALL store the source_type on every Request record for audit and analytics filtering purposes.

---

### Requirement 17: Authentication and Role-Based Access Control

**User Story:** As a Platform user, I want secure authentication and role-based permissions, so that I can only access the features and data relevant to my role.

#### Acceptance Criteria

1. THE Platform SHALL support the following roles: SUPER_ADMIN, BUSINESS_OWNER, BRANCH_MANAGER, RECEPTIONIST, KITCHEN_STAFF, EMPLOYEE, and GUEST.
2. WHEN a user authenticates successfully, THE Platform SHALL issue a JWT with a 15-minute expiry and a Refresh_Token with a 30-day expiry.
3. WHEN a client presents a valid Refresh_Token, THE Platform SHALL issue a new JWT and a rotated Refresh_Token, and invalidate the previous Refresh_Token.
4. IF a client presents an expired or revoked JWT, THEN THE Platform SHALL return a 401 Unauthorized response with a descriptive error message.
5. THE Platform SHALL enforce RBAC on every API endpoint, returning a 403 Forbidden response when the authenticated user's role lacks the required permission.
6. WHEN a user logs out, THE Platform SHALL revoke the active Refresh_Token and invalidate any associated sessions stored in Redis.
7. THE Platform SHALL lock a user account for 15 minutes after 5 consecutive failed login attempts from the same IP address and notify the account owner via email.
8. WHEN a user changes their password, THE Platform SHALL revoke all existing Refresh_Tokens for that user and require re-authentication on all sessions.

---

### Requirement 18: Audit Logs and Event Tracking

**User Story:** As a Super_Admin or Branch_Manager, I want an immutable audit log of all significant platform actions, so that I can investigate incidents, ensure compliance, and maintain accountability.

#### Acceptance Criteria

1. THE Platform SHALL record an Audit_Log entry for every create, update, delete, and status-transition event, capturing: actor identity, actor role, action type, affected entity type, affected entity ID, timestamp, and IP address.
2. THE Platform SHALL record QR_Token scan attempts (valid and invalid), authentication events, permission denials, and payment events in the Audit_Log.
3. WHEN a Super_Admin or Branch_Manager queries the Audit_Log, THE Platform SHALL return results filtered by date range, actor, event type, and entity within 3 seconds.
4. THE Platform SHALL prevent modification or deletion of Audit_Log entries by any user role including SUPER_ADMIN.
5. THE Platform SHALL retain Audit_Log entries for a minimum of 90 days, after which entries may be archived to cold storage.
6. THE Platform SHALL export Audit_Log entries as CSV files for a specified date range and entity scope.

---

### Requirement 19: Real-Time Notifications

**User Story:** As a staff member or Guest, I want to receive real-time notifications for events that affect me, so that I can respond promptly without manually refreshing the interface.

#### Acceptance Criteria

1. THE Platform SHALL deliver WebSocket events to connected dashboard clients within 2 seconds of the triggering action for: new Request creation, Request status transitions, and new Menu_Item availability changes.
2. THE Platform SHALL deliver FCM push notifications to registered Employee devices within 5 seconds for: new task assignments, low-satisfaction feedback alerts, and subscription payment failures.
3. THE Platform SHALL send transactional emails for: account registration, email verification, password reset, subscription receipts, and payment failure alerts.
4. WHERE SMS notifications are enabled for a Branch, THE Platform SHALL send SMS alerts to Employees for new task assignments.
5. IF a WebSocket connection is lost and reconnects within 60 seconds, THE Platform SHALL replay any events missed during the disconnection window to the reconnected client.
6. THE Platform SHALL allow Branch_Managers to configure which notification channels (WebSocket, FCM, Email, SMS) are enabled for each event type within their Branch.

---

### Requirement 20: API Security, Rate Limiting, and Input Validation

**User Story:** As a Platform operator, I want all APIs to enforce rate limiting and validate inputs, so that the system is protected from abuse, injection, and denial-of-service attacks.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL restrict unauthenticated endpoints to 30 requests per minute per IP address and return HTTP 429 with a Retry-After header when the threshold is exceeded.
2. THE Rate_Limiter SHALL restrict authenticated endpoints to 120 requests per minute per user and return HTTP 429 with a Retry-After header when the threshold is exceeded.
3. THE Platform SHALL validate all API request bodies against defined schemas and return HTTP 400 with field-level error messages for any validation failure.
4. THE Platform SHALL sanitize all user-supplied string inputs to prevent SQL injection and XSS before persisting or rendering the data.
5. THE Platform SHALL enforce HTTPS for all API and WebSocket connections and redirect HTTP requests to HTTPS.
6. THE Platform SHALL include CORS policies that restrict cross-origin requests to allowed domains configured per Tenant.
7. THE Platform SHALL apply Helmet HTTP security headers on all API responses.

---

### Requirement 21: Deployment, CI/CD, and Observability

**User Story:** As a Platform engineer, I want a fully containerized, automated deployment pipeline with observability tooling, so that the Platform can be reliably deployed, monitored, and scaled.

#### Acceptance Criteria

1. THE Platform SHALL provide Dockerfile definitions for both the frontend (Next.js) and backend (NestJS) services that produce production-ready container images.
2. THE Platform SHALL provide Docker Compose configuration that orchestrates the backend, frontend, PostgreSQL, and Redis services for local development.
3. THE Platform SHALL provide GitHub Actions CI workflow that runs linting, unit tests, integration tests, and builds Docker images on every pull request targeting the main branch.
4. THE Platform SHALL provide GitHub Actions CD workflow that deploys the frontend to Vercel and the backend to Railway on successful merges to the main branch.
5. THE Platform SHALL expose a health-check endpoint at GET /health that returns the status of database connectivity, Redis connectivity, and overall service health within 200 milliseconds.
6. THE Platform SHALL emit structured JSON logs for every API request including method, path, status code, response time, and request identifier.
7. THE Platform SHALL provide database migration scripts managed by Prisma that can be executed in an idempotent manner.
