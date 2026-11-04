# Project Constitution

> Universal policies that apply to ALL code in this project.
> This file is always inherited from root — modules cannot override it.

Derived from `CLAUDE.md` and `AGENTS.md` during the AI-DLC → FIRE migration on 2026-08-20.
Where this file and `CLAUDE.md` disagree, `CLAUDE.md` is authoritative and this file is stale.

## Human-Agent Collaboration Model

- **Human** defines requirements, makes architecture decisions, reviews changes, and specifies
  routes, endpoints, request context, response schemas, and service-layer logic.
- **Agent** implements service-layer logic and fills in response schemas according to spec.
- The agent proposes an approach before implementing, and reuses existing helpers where possible.

## Git Workflow

- **Commit Style**: Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- **Branch Strategy**: Feature branches merged via pull request
- **Main Branch**: `main` is always deployable
- **Never commit directly to `main`/`master`.**
- **Never push to remote without explicit human permission.**

## Code Review

- All changes require pull request review
- At least one approval required before merge
- No self-merging to main/master
- Security-sensitive changes require additional review — in this codebase that means anything
  touching `src/middleware/` (JWT, RBAC, guards) or fiscal-year write authority

## Change Control

- **Do not modify Drizzle migration output directly.** Generate schema changes via
  `src/drizzle/schema.ts` and wait for human review.
- **Ask before installing any new dependency.**
- **Ask first if a task is unclear** — do not assume and implement.
- For large tasks, break into subtasks and confirm the approach first.

## Security Policies

- **No secrets in code** — all environment variables are validated at startup in `src/config.ts`,
  which throws on missing or malformed values. Do not reach for `Bun.env` directly elsewhere.
- No credentials, API keys, or tokens in source control
- Dependencies must be from trusted sources
- Authorization is expressed through the pre-composed guards in `src/middleware/guards.ts`. Routes
  do not assemble `jwtPlugin + requireRoles` themselves.

## Error Handling

- Services return `status(code, body)` rather than throwing. Routes check for these and return them
  directly.
- The global handler in `src/index.ts` classifies expected errors (`VALIDATION`,
  `INVALID_FILE_TYPE`, `PARSE` → 400; `NOT_FOUND` → 404) and unexpected ones → 500.
- Do not add ad-hoc `console.log` for error handling — rely on the established flow.

## Documentation

- Public APIs must be documented; OpenAPI is served at `/twhp/api/document`
- Breaking changes require migration notes
- Domain documentation lives in `docs/` with ADRs under `docs/adr/`
- README kept up to date with setup instructions

---
*Migrated from AI-DLC standards by specs.md - fabriqa.ai FIRE Flow*
