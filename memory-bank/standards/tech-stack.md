# Tech Stack

## Overview

Backend API built on Bun runtime with ElysiaJS — type-safe, high-performance, file-based routing with full TypeScript across the stack.

## Languages

TypeScript (Bun runtime)

Bun is the runtime and package manager. Native Bun APIs are preferred over Node equivalents (`Bun.env`, `Bun.SHA256`, etc.). TypeScript provides type safety across services, schemas, and route definitions.

## Framework

ElysiaJS

Type-safe, high-performance API framework. Routes are auto-registered via `elysia-autoload` from `src/routes/`. No manual route registration. OpenAPI docs generated automatically at `/twhp/api/document`.

## Authentication

Custom cookie-based JWT (self-hosted)

Two-cookie strategy: `Authentication` (access token) + `Refresh` (refresh token). JWT verification and auto-rotation handled in `src/middleware/jwt.ts`. Role-based access via `requireRoles()` in `src/middleware/rbac.ts`. Pre-composed guards (`adminGuard`, `factoryGuard`, `evalGuard`, `officerGuard`) used in routes. Roles: Factory, Provincial, Evaluator, DOED.

## Infrastructure & Deployment

Docker Compose (self-hosted)

Dev profile with hot-reload (`api-dev`), production profile (`api-prod`). `migrate-dev` service runs `db:push && db:seed` as a one-shot before the API starts. Requires `--build` flag when schema or dependencies change.

## Package Manager

Bun

## Decision Relationships

ElysiaJS was chosen for its native TypeScript-first design and tight integration with Bun runtime. Cookie-based JWT auth is fully custom to support the project's specific role hierarchy without external auth service dependencies.
