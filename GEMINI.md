# Project Context: twhp-elysia

## Project Overview
This project is the backend API for the Thailand Workplace Health Promotion (TWHP) application. It provides a robust, type-safe RESTful API to manage factory registrations, evaluations, and health promotion enrollments.

The application is built using **ElysiaJS** on the **Bun** runtime, leveraging **Drizzle ORM** for PostgreSQL and **MinIO** for object storage.

### Key Technologies
- **Runtime:** [Bun](https://bun.sh/)
- **Framework:** [ElysiaJS](https://elysiajs.com/)
- **ORM:** [Drizzle ORM](https://orm.drizzle.team/) (PostgreSQL)
- **Object Storage:** [MinIO](https://min.io/) (S3-compatible)
- **Validation:** [TypeBox](https://github.com/sinclairzx81/typebox) (integrated with Elysia)
- **Background Jobs:** [BullMQ](https://docs.bullmq.io/) (Redis-backed)
- **Authentication:** JWT-based with role-based access control (RBAC)

---

## Architecture
The project follows a layered architecture to maintain clear separation of concerns:

- **Controllers (`src/controller/`):** Define API endpoints, handle HTTP routing, and enforce request/response validation using TypeBox schemas.
- **Services (`src/service/`):** Contain core business logic, orchestrate data flow between repositories, and handle external integrations (MinIO, BullMQ).
- **Drizzle Schema (`src/drizzle/schema.ts`):** Defines the PostgreSQL table structures and relationships.
- **Schemas (`src/schema/`):** Centralized TypeBox schema definitions for reusable request bodies and response types.
- **Utilities (`src/utils.ts`):** Shared helper functions for fiscal year calculation, Redis connectivity, and file management.

---

## Building and Running

### Local Development
1. **Install Dependencies:**
   ```bash
   bun install
   ```
2. **Environment Setup:** Configure `.env` with variables for `DATABASE_URL`, `MINIO_*` credentials, `REDIS_*`, and `AUTH_JWT_SECRET`.
3. **Database Migration:**
   ```bash
   bun run db:push  # Sync schema to DB
   ```
4. **Start Dev Server:**
   ```bash
   bun run dev
   ```

### Docker Environment
The project includes a `docker-compose.yaml` for containerized development and production deployments. Production builds utilize `bun build --compile` for optimized standalone binaries.

---

## Development Conventions

### File Management (MinIO)
- **Storage:** All standard-related files (HC, SAN, etc.) are stored in MinIO.
- **Naming:** Files are assigned unique UUIDs using `crypto.randomUUID()` upon upload to prevent collisions.
- **Sync Operations:** File uploads and deletions are handled synchronously within the service layer using `Promise.all` for concurrency.

### Enrollment Validation Mandates
- **Boolean-File Lock:** If a standard boolean field (e.g., `standardHc`) is set to `true`, a corresponding file must be provided (for `create`) or must already exist in storage (for `update`).
- **Update Logic:** When updating an existing file:
    1. Check for the new file in the DTO.
    2. If present, delete the old file from MinIO.
    3. Upload the new file and update the database with the new URL.

### Coding Standards
- **Type Safety:** Always define explicit `response` schemas in controllers to ensure the API matches the service return types.
- **Naming:**
    - **Database/JSON:** Use `snake_case` for fields (e.g., `is_validate`, `file_standard_hc_url`).
    - **TypeScript:** Use `camelCase` for properties and variables (e.g., `isValidate`, `fileStandardHcUrl`).
- **Error Handling:** Utilize `elysia.status` for consistent error reporting (e.g., `throw status(400, { message: "..." })`).
