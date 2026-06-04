---
intent: 001-score-calculator-and-report
phase: inception
created: 2026-06-03T00:00:00Z
---

# System Context: Score Calculator and Report

## Actors

| Actor | Type | Description |
|-------|------|-------------|
| **Factory** | Human | Submits self-assessment answers; reads their own score after submission |
| **Evaluator** | Human | Reviews covers for factories in their health region; reads region-wide scores |
| **Provincial Officer** | Human | Oversees factories in their province; reads province-wide scores |
| **DOED Admin** | Human | Oversees entire programme; reads all scores with optional region/province filter |

## External Systems

| System | Direction | Data Exchanged | Protocol |
|--------|-----------|---------------|----------|
| **PostgreSQL** | Inbound | Answers, Questions, Covers, Enrolls, Factories, Provinces | Drizzle ORM (SQL) |
| **JWT Auth (cookie)** | Inbound | Identity + Role from `Authentication` cookie | HTTP cookie / HMAC |

No outbound external integrations — score is read-only, no webhooks or notifications.

## Data Flows

### Inbound

- Authenticated HTTP GET request with `Authentication` cookie
- No request body (all GET endpoints)
- Factory endpoint: no params (identity from JWT)
- Evaluator/Provincial endpoints: no params (scope from JWT-derived profile)
- Admin endpoint: optional `?region=` and `?provinceId=` query params

### Outbound

- JSON Score Report: `{ factoryId, factoryNameTh, coverId, coverStatus, enrollId, totalScore, collaborate, disease, safety, mental, outcome }`
- Single object (Factory endpoint) or array of objects (Evaluator, Provincial, Admin endpoints)
- All score values are rounded integers (0–100)

## System Context Diagram

```mermaid
C4Context
title System Context - Score Calculator and Report

    Person(factory, "Factory", "Self-assessment participant")
    Person(evaluator, "Evaluator", "DOH/ODPC/Mental reviewer")
    Person(officer, "Provincial Officer", "Province-level oversight")
    Person(admin, "DOED Admin", "Programme administrator")

    System(api, "TWHP API", "ElysiaJS backend — score calculator endpoints")
    SystemDb(db, "PostgreSQL", "Stores answers, covers, enrolls, questions")

    Rel(factory, api, "GET /factories/assessments/score", "HTTPS + JWT cookie")
    Rel(evaluator, api, "GET /evaluators/score", "HTTPS + JWT cookie")
    Rel(officer, api, "GET /provincialOfficers/score", "HTTPS + JWT cookie")
    Rel(admin, api, "GET /admins/score", "HTTPS + JWT cookie")
    Rel(api, db, "Query answers + questions + covers", "Drizzle ORM")
```
