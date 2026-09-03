# TWHP API (`twhp-elysia`)

Backend for the Total Worker Health Promotion (TWHP) system: factory registration, annual
enrollment, workplace-health assessment, hierarchical evaluator review, scoring/grading, and
evidence-file handling. Bun + ElysiaJS + TypeBox, PostgreSQL/Drizzle, BullMQ/Redis, MinIO,
Nodemailer, Docker Compose.

This file is a pointer, not the documentation. Start at [`docs/README.md`](docs/README.md) for the
maintained guide index, or [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) for agent-facing
conventions. `CONTEXT.md` is the current domain glossary.

## Quick start

```bash
bun install --frozen-lockfile
bun run dev          # hot-reload API, pino-pretty logs
```

Or via Docker Compose (see [Development](docs/development.md) and
[Deployment](docs/deployment.md) for the full profile/env setup):

```bash
docker compose --profile dev up --build
```

The API is served under `/twhp/api`; OpenAPI docs are at `/twhp/api/document`; liveness is
`/twhp/api/health`.

## Where to go next

| Need | Read |
|---|---|
| Full documentation index | [docs/README.md](docs/README.md) |
| Current status, hazards, first-day checklist | [docs/handover.md](docs/handover.md) |
| System shape and processes | [docs/architecture.md](docs/architecture.md) |
| Where code for a given behavior lives | [docs/project-structure.md](docs/project-structure.md) |
| Domain vocabulary | [CONTEXT.md](CONTEXT.md) |
| Business rules and known code/prose conflicts | [docs/business-rules.md](docs/business-rules.md) |
| Local commands, env vars, safe test commands | [docs/development.md](docs/development.md), [docs/testing.md](docs/testing.md) |
| Local issue tracker (`.scratch/<feature>/PRD.md` + `issues/NN-*.md`) | [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) |

Not a template starter project — treat the tree above as authoritative, not this file.
