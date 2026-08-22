---
id: 005-fiscal-year-in-responses
unit: 001-fiscal-year-reads
intent: 013-fiscal-year-addressing
status: draft
priority: should
created: 2026-08-20T08:55:00Z
assigned_bolt: 030-fiscal-year-reads
implemented: false
---

# Story: 005-fiscal-year-in-responses

## User Story

**As a** frontend client rendering Thai fiscal years
**I want** each fiscal-scoped record to state its own Common Era fiscal year
**So that** I can display พ.ศ. by adding 543, instead of re-deriving the year from a date and
risking a different answer than the server's

## Acceptance Criteria

- [ ] **Given** an enrollment, cover, score, or list-item response from a fiscal-scoped read,
  **When** it is returned, **Then** it carries a Common Era `fiscalYear`.
- [ ] **Given** that value, **When** it is produced, **Then** it comes from the story-001 helper
  applied to the record's `enroll_date` — not recomputed in a route, not inferred by a client.
- [ ] **Given** a response for a record in FY2026, **When** the client renders it, **Then**
  `fiscalYear + 543` yields 2569.
- [ ] **Given** the addition of this field, **When** existing consumers parse the response, **Then**
  no existing field is renamed, recased, removed, or reordered in meaning.
- [ ] **Given** the OpenAPI document, **When** it is generated, **Then** `fiscalYear` appears in the
  affected response schemas and is documented as Common Era.

## Technical Notes

- Derive in one place. Two derivations — one for filtering and one for display — can disagree at a
  boundary, which is precisely the failure mode this intent exists to reduce.
- Compose the response DTOs from the `BaseXxxSelect` schemas in `src/schema/index.ts` rather than
  redeclaring column shapes, per the project standard.
- This field is additive. It is not part of the pagination envelope; it belongs to the item, since
  a list can in principle be requested for one year but the item is what carries identity.
- Buddhist Era never appears in the payload. The API is Common Era on both sides of the wire.

## Dependencies

### Requires

- 001-fiscal-year-resolver
- 003-staff-list-fiscal-year-addressing
- 004-factory-self-read-fiscal-year-addressing

### Enables

- 006-fiscal-year-boundary-coverage

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A record whose `enroll_date` falls within an hour of an Oct 1 boundary | `fiscalYear` matches the window that selected it; the displayed year can never contradict the filter that returned the row |
| An empty list page | No item-level `fiscalYear`; the envelope is unchanged |
| A response assembled from a join across enrollment and cover | The year derives from the enrollment, the sole carrier of fiscal-year identity |

## Out of Scope

- Buddhist Era conversion or any localisation, owned by the frontend.
- Adding the field to non-fiscal-scoped responses such as location reference lists or the question set.
