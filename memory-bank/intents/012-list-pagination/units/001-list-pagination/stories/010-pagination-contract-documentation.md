---
id: 010-pagination-contract-documentation
unit: 001-list-pagination
intent: 012-list-pagination
status: complete
priority: must
created: 2026-08-19T02:20:30.000Z
assigned_bolt: 028-list-pagination
implemented: true
---

# Story: 010-pagination-contract-documentation

## User Story

**As a** client developer integrating with the TWHP API
**I want** the API documentation and the OpenAPI document to describe the pagination contract
accurately
**So that** I can adopt the new response shape without reading the service source

## Acceptance Criteria

- [ ] **Given** `docs/api-conventions.md`, **When** the pagination section is read, **Then** the
  sentence "There is no pagination contract" is gone and is replaced by the implemented contract:
  parameter names, defaults, maximum, 1-indexed page numbering, and the envelope shape.
- [ ] **Given** the same document's ordering section, **When** it is compared to the code, **Then**
  the listed orderings match the total orders implemented by story 003.
- [ ] **Given** the OpenAPI document at `/twhp/api/document`, **When** a paginated route is
  inspected, **Then** its `query` schema shows `page` and `limit` and its `200` schema shows the
  envelope.
- [ ] **Given** the documentation, **When** a client developer reads it, **Then** the breaking change
  is stated explicitly, naming all nine affected endpoints.
- [ ] **Given** the documentation, **When** the scope boundary is read, **Then** it states which
  collections deliberately remain unwrapped arrays and why.
- [ ] **Given** `memory-bank/standards/api-conventions.md`, **When** it is compared to the
  implementation, **Then** the documented pagination strategy and the code agree.

## Technical Notes

- `docs/api-conventions.md` is the client-facing conventions guide and currently records the
  pre-pagination reality in several places, not only one sentence. Review the whole parameters,
  filtering, and ordering section.
- The OpenAPI schemas are generated from route definitions, so most of this follows automatically
  once stories 004, 006, and 009 land. Verify rather than assume.
- `docs/handover.md` lists unpaginated lists as a known limitation. That entry should be updated so
  the handover document does not contradict the shipped behavior.
- The standards file already describes offset pagination. Confirm the implemented defaults match it,
  and correct whichever side is wrong.

## Dependencies

### Requires

- 004-factory-list-pagination
- 006-enrollment-list-pagination
- 009-score-list-pagination

### Enables

- None

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A generated OpenAPI snapshot drifts from the routes | Route and service code is authoritative; regenerate the snapshot |
| Standards file and implementation disagree on a default | Resolve explicitly and record the decision; do not leave both |

## Out of Scope

- Documenting the deferred bulk-export surface.
- Restructuring the documentation set.
