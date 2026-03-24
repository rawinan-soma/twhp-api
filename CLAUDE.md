# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (hot-reload)
bun run dev

# Production
bun run start

# Background worker (email queue)
bun run worker

# Database
bun run db:push    # Push schema to DB (using drizzle-kit)
bun run db:seed    # Seed database
```

Docker (uses `docker.env` for env vars):

```bash
docker compose --profile dev up       # Development with hot-reload
docker compose --profile production up # Production build
```

## Architecture

**Runtime**: Bun + ElysiaJS framework. All code runs on Bun — use `Bun.env`, `Bun.SHA256`, etc. instead of Node equivalents where available.

**API prefix**: All routes are under `/twhp/api`. OpenAPI docs at `/twhp/api/document`.

**Layer structure** (per domain):

- `src/controller/<domain>.ts` — ElysiaJS route definitions with TypeBox validation
- `src/service/<domain>.ts` — Business logic, exported as singleton (`createXxxService(db)` pattern)
- `src/schema/<domain>.ts` — TypeBox DTOs for request/response validation (built on top of `drizzle-typebox` base schemas)

**Database**: PostgreSQL via Drizzle ORM. Schema defined in `src/drizzle/schema.ts`. Base TypeBox schemas auto-generated in `src/schema/index.ts` using `drizzle-typebox`. Domain schemas in `src/schema/` extend these base schemas.

**Auth flow**:

- Cookie-based JWT (`Authentication` + `Refresh` cookies)
- `src/middleware/jwt.ts` — `jwtPlugin` derives `jwtPayload` globally; handles access token verification and refresh token rotation automatically
- `src/middleware/rbac.ts` — `requireRoles(...roles)` plugin guards routes by role
- Roles: `Factory`, `Provincial`, `Evaluator`, `DOED`

**File storage**: MinIO object storage. `utilities().uploadFile(file)` / `utilities().deleteFile(url)` in `src/utils.ts`. Files are stored with UUID filenames; URLs are stored in DB.

**Background jobs**: BullMQ + Redis. Queue defined in `src/queue/email.ts`. Worker in `src/worker/email.ts`, entrypoint `src/workers.ts`. Workers run as a separate process.

**Shared service** (`src/service/shared.ts`): Cross-domain logic for `enroll` and `factory` operations used by multiple controllers. Fiscal year filtering (Oct 1 – Sep 30) is applied throughout enrollment queries.

**Environment**: All env vars validated at startup in `src/config.ts`. Required vars: `DATABASE_URL`, `APP_PORT`, `AUTH_JWT_SECRET`, `AUTH_TOKEN_EXP`, `REFRESH_JWT_SECRET`, `REFRESH_TOKEN_EXP`, `COOKIE_SECURE`, `REDIS_HOST`, `REDIS_PORT`, `SMTP_*`, `FRONTEND_URL`, `MINIO_*`.

**Error handling**: Services return `status(code, body)` (Elysia's `ElysiaCustomStatusResponse`) rather than throwing. Controllers check for these and return them directly. Global error handler in `src/index.ts` catches unexpected errors and returns 500.

## Human-Agent Collaboration Model

### Roles

- **Human**: Defines requirements, makes architecture decisions, reviews & approves
  changes, and specifies controllers, endpoints, context (parameters, body, query),
  response schemas, and service layer logic.
- **Agent (Claude Code)**: Implements, refactors, debugs, and writes tests according
  to the given spec — with a focus on service layer logic and filling in parts of
  the response schema.

### Workflow

1. Human describes the task and context in controller comments.
2. Agent analyzes the codebase and proposes an approach before implementing.
3. Agent make a service function according to the logic, making a new function as needed.
4. Agent implements with clear commit messages.
5. Human reviews the diff and either approves or requests changes.
6. Agent does not push to remote without explicit permission.

### Agent Constraints

- Do not modify schema migration files directly — generate them and wait for human review.
- Do not commit directly to `main`/`master`.
- If a task is unclear, ask first — do not assume and implement.
- Ask for permission before installing any new dependency.

### Communication Style

- For large tasks, break them into subtasks and confirm the approach with the human first.
- Report blockers immediately — do not stay stuck.
- Summarize what was done at the end of each session.
