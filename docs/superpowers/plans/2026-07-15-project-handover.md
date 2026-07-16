# Project Handover Documentation Plan

> **For agentic workers:** Execute this plan through bounded specialist investigations, coordinator-owned synthesis, and independent review passes.

**Goal:** Preserve enough verified technical and operational knowledge for a new human maintainer or AI coding agent to safely operate, debug, maintain, and extend the project without the original developer.

**Architecture:** Investigators produce evidence-backed findings by domain without modifying production behavior. The coordinator reconciles findings into focused documents, validates every operational claim against source/configuration/runtime evidence, and owns the final completeness decision.

**Tech Stack:** Bun, TypeScript, ElysiaJS, Drizzle ORM, PostgreSQL, BullMQ, Redis, MinIO, Nodemailer, Docker Compose, Biome.

## Global Constraints

- Do not change application behavior or refactor production code.
- Preserve all pre-existing working-tree changes.
- Categorize material claims as Verified, Inferred, or Unknown.
- Use `Unknown / Requires Organizational Knowledge` when repository evidence cannot answer a required question.
- Treat source and configuration as stronger evidence than existing documentation.
- Do not expose secrets or execute destructive database/deployment commands.
- The coordinator owns conflict resolution, validation, and final completion decisions.

---

### Task 1: Repository Inventory and Finding Registry

**Files:**
- Create: `.scratch/handover-findings.md`

- [ ] Record repository state, primary entry points, technologies, and existing documentation.
- [ ] Record pre-existing working-tree changes that must not be overwritten.
- [ ] Establish the Verified/Inferred/Unknown finding registry format.

### Task 2: Structural Investigations

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/project-structure.md`
- Create: `docs/database.md`
- Create: `docs/api-conventions.md`

- [ ] Run architecture, persistence, and API investigations in parallel.
- [ ] Capture exact file paths, symbols, scripts, constraints, and unresolved conflicts.

### Task 3: Behavioral Investigations

**Files:**
- Create: `docs/domain-model.md`
- Create: `docs/business-rules.md`
- Create: `docs/authentication-authorization.md`

- [ ] Run domain/business-rule and authentication/security investigations in parallel.
- [ ] Cross-check role names, fiscal-year logic, workflow transitions, and authorization boundaries.

### Task 4: Operational Investigations

**Files:**
- Create: `docs/development.md`
- Create: `docs/testing.md`
- Create: `docs/deployment.md`
- Create: `docs/troubleshooting.md`

- [ ] Run development/deployment, testing/quality, and operations/troubleshooting investigations in parallel.
- [ ] Verify commands and configuration claims against repository evidence.

### Task 5: Synthesis and Maintainability Review

**Files:**
- Create: `docs/technical-debt.md`
- Create: `docs/README.md`
- Create: `docs/handover.md`
- Modify: `AGENTS.md`

- [ ] Consolidate structural, behavioral, and operational findings.
- [ ] Run technical-debt review using the consolidated documents and source evidence.
- [ ] Rewrite `AGENTS.md` as a concise operational reading map while preserving valid project constraints.

### Task 6: Cross-Review

- [ ] Architecture review: architecture, project structure, deployment.
- [ ] Domain review: domain model, business rules, database.
- [ ] Security review: authentication, API conventions, security debt.
- [ ] Operations review: development, testing, deployment, troubleshooting.
- [ ] AI usability review: `AGENTS.md`, navigation, validation, dangerous assumptions.
- [ ] Resolve or explicitly document every review conflict.

### Task 7: Validation and Final Report

- [ ] Check commands, runtime versions, ports, environment variables, prefixes, roles, schema relationships, migration/test/deployment instructions, business rules, and links.
- [ ] Run safe type, lint/check, test, build/schema, and documentation checks where supported.
- [ ] Record exact commands and observed results; do not convert absent tooling into a success claim.
- [ ] Produce the final maintainer-facing report with confidence ratings and organizational unknowns.
