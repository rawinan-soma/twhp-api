# Project Context: twhp-elysia

## Project Overview
This project is the backend API for a Thailand Workplace Health Promotion (TWHP) application. It is built using **ElysiaJS** running on the **Bun** runtime, with **Drizzle ORM** for PostgreSQL database interactions and **BullMQ** for background task processing.

### Architecture
The project follows a layered architecture to separate concerns:
- **Controllers (`src/controller/`):** Define API endpoints using Elysia, handle validation with TypeBox, and call UseCases.
- **UseCases (`src/usecase/`):** Implement core business logic and orchestrate data flow between Repositories and external services (e.g., workers).
- **Repositories (`src/repository/`):** Direct database interactions using Drizzle ORM.
- **Schema (`src/schema/`):** TypeBox schemas for request/response validation.
- **Drizzle Schema (`src/drizzle/schema.ts`):** Database table definitions.
- **Workers (`src/worker/`):** Background task logic (e.g., email sending).

### Key Technologies
- **Runtime:** Bun
- **Framework:** ElysiaJS
- **ORM:** Drizzle (PostgreSQL)
- **Validation:** TypeBox (integrated with Elysia)
- **Background Jobs:** BullMQ (Redis)
- **Containerization:** Docker (Multi-stage builds, standalone binaries)

---

## Building and Running

### Prerequisites
- [Bun](https://bun.sh/) installed locally.
- Docker & Docker Compose (for containerized environment).

### Local Development
1. **Install Dependencies:**
   ```bash
   bun install
   ```
2. **Environment Setup:** Create a `docker.env` (used by Compose) or `.env` file based on `src/config.ts` requirements.
3. **Database Setup:**
   ```bash
   bun run db:push  # Sync schema to DB
   bun run db:seed  # Seed initial data
   ```
4. **Run API (Hot Reload):**
   ```bash
   bun run dev
   ```
5. **Run Worker:**
   ```bash
   bun run worker
   ```

### Dockerized Environment
- **Development (Watch Mode):**
  ```bash
  docker compose up api-dev
  ```
- **Production Deployment:**
  ```bash
  docker compose up -d --build
  ```
  *Note: Production builds use `bun build --compile` to generate standalone binaries for maximum performance and reduced memory footprint.*

---

## Development Conventions

### Coding Style & Patterns
- **Dependency Injection:** Use factory functions (e.g., `createAdminUsecase`) to inject dependencies, then export a singleton instance (e.g., `adminUsecase`).
- **Response Schemas:** Always define explicit `response` schemas in controllers using TypeBox (`t`).
- **Schema Reusability:** Utilize `t.Composite` and base schemas (from `src/schema/index.ts`) to avoid duplication.
- **Naming:**
    - Response fields: Generally use `snake_case` (especially for flattened data from JOINs).
    - Variables/Functions: `camelCase`.
- **Validation:** Use `t.Numeric()` for path and query parameters that are passed as strings but should be treated as numbers.
- **Drizzle nuances:** Be mindful of `leftJoin` results; joined fields are often nullable and should be handled with `t.Nullable()` or `t.Optional()` in response schemas.

### Error Handling
- Use `elysia.status` for consistent API error responses.
- Validation errors are handled automatically by Elysia if TypeBox schemas are provided.

### Background Tasks
- Logic for background jobs resides in `src/worker/`.
- Job dispatching is done through `src/queue/` using BullMQ.
