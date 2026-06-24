---
intent: 007-cover-status-filter
phase: inception
status: context-defined
updated: 2026-06-24T06:09:51Z
---

# Cover Status Filter - System Context

## System Overview

A read-only enhancement to the TWHP enroll-listing API. Three existing staff
endpoints (`GET /admins/enrolls`, `GET /evaluators/enrolls`,
`GET /provincialOfficers/enrolls`) gain an optional `coverStatus` query filter and
return each enroll enriched with its cover's `coverId` + `coverStatus`. No new
tables, no writes — it joins the existing `covers`/`coverLogs` data already
produced by the assessment/verdict flows.

## Context Diagram

```mermaid
C4Context
title System Context - cover-status-filter

    Person(admin, "DOED Admin", "Lists all enrolls")
    Person(evaluator, "Evaluator", "Lists enrolls in their health region")
    Person(officer, "Provincial Officer", "Lists enrolls in their province")

    System(api, "TWHP Enroll API", "GET enroll lists + cover-status filter")
    SystemDb_Ext(pg, "PostgreSQL", "enrolls, covers, coverLogs, factories, provinces")

    Rel(admin, api, "GET /admins/enrolls?coverStatus=")
    Rel(evaluator, api, "GET /evaluators/enrolls?coverStatus=")
    Rel(officer, api, "GET /provincialOfficers/enrolls?coverStatus=")
    Rel(api, pg, "Reads enrolls + latest coverLogs (latest-log-wins)")
```

## External Integrations

- **PostgreSQL (Drizzle)**: Source of `enrolls`, `covers`, `coverLogs`,
  `factories`, `provinces`. Cover status is the latest `coverLogs` row per cover.
- No third-party services, queues, or file storage involved (pure read path).

## High-Level Constraints

- Reuse existing auth guards (`adminGuard`, `evalGuard`, `officerGuard`) — no auth change.
- Reuse `utilities().getFiscalYear()` for fiscal-year scoping.
- Additive only: existing enroll-list consumers must keep working unchanged.

## Key NFR Goals

- No N+1: enrichment uses ≤ 2 bounded queries over the enroll set
  (mirrors `score.ts buildScoreReports`).
- Behaviour-preserving when `coverStatus` is absent.
