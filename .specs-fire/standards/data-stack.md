# Data Stack

## Overview

PostgreSQL for relational domain data, Redis for background job queues, and MinIO for object file storage — all self-hosted via Docker Compose.

## Database

PostgreSQL (self-hosted via Docker Compose)

Primary relational store for all domain data. All enrollment/cover queries are scoped to the current fiscal year (Oct 1 – Sep 30) using `utilities().getFiscalYear()` from `src/utils.ts` — never hand-roll date boundaries. Redis is used as the BullMQ backend for background job queues.

## ORM / Database Client

Drizzle ORM

Single-file schema at `src/drizzle/schema.ts`. Dev workflow uses `db:push` (no migration files generated). TypeBox DTOs are auto-generated from Drizzle tables via `drizzle-typebox` (`createSelectSchema`, `createInsertSchema`, `createUpdateSchema`) in `src/schema/index.ts`. Domain schema files extend these base types — always compose from `BaseXxxSelect/Insert/Update` rather than re-declaring column shapes.

## File Storage

MinIO (self-hosted via Docker Compose)

Files stored with UUID filenames; only the filename (not full URL) persisted to DB. Presigned URLs rewrite internal Docker hostnames to public-facing ones via `MINIO_PUBLIC_URL`. Use `utilities().uploadFile()`, `utilities().deleteFile()`, and `utilities().getPresignedUrl()` from `src/utils.ts`. File I/O is always done outside DB transactions — upload first, then run the transaction.

## Decision Relationships

Drizzle ORM was chosen for its TypeScript-first SQL-like query builder and tight integration with `drizzle-typebox` for automatic DTO generation. MinIO provides S3-compatible object storage without external cloud dependencies, consistent with the self-hosted infrastructure approach.
