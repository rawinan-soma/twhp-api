---
id: 003-authorship-edit-guard
unit: 001-per-answer-verdict-save
intent: 008-per-answer-verdict-save
status: complete
priority: must
created: 2026-07-02T00:00:00.000Z
assigned_bolt: 019-per-answer-verdict-save
implemented: true
---

# Story: 003-authorship-edit-guard

# User Story

**As** the system
**I want** an authorship-keyed write guard on per-Answer saves
**So that** reviewers may edit their own in-flight verdicts without re-opening settled or others' work

## Acceptance Criteria

- [ ] **Given** an Answer whose latest status is `finished`, **When** any caller (including ODPC) saves it, **Then** rejected `400` (immutable to everyone)
- [ ] **Given** an Answer whose latest status is `recommended`, **When** the caller is its **author** (`answerLogs.eval_id` matches) **or** ODPC, **Then** the save is allowed
- [ ] **Given** an Answer whose latest status is `recommended`, **When** the caller is a non-author, non-ODPC reviewer, **Then** `403`
- [ ] **Given** a Factory-accepted `recommended` (no tier-1 author), **When** a tier-1 attempts to re-open it, **Then** `403` (only ODPC may touch it)
- [ ] **Given** an Answer whose latest status is `rejected` or `in_review`, **When** any category-scoped reviewer saves it, **Then** allowed
- [ ] **Given** a tier-1 reviewer, **When** it edits its own verdict, **Then** allowed **only while the Cover is `in_review`**
- [ ] **Given** the old blanket rule `recommended && level !== "ODPC" → 403`, **When** replaced, **Then** a tier-1 can re-edit its **own** `recommended` (previously wrongly blocked)

## Technical Notes

- Read the latest `answerLogs` row for the Answer (status + `eval_id`) before writing.
- Guard order: `finished` → deny all; else `recommended` → author-or-ODPC; else (`rejected`/`in_review`) → category-scope only.
- Category scope already comes from the caller's level (Mental/DOH/ODPC map).

## Dependencies

### Requires
- 002-save-answer-verdict-service

### Enables
- 005-save-and-finalize-routes

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| ODPC re-saves its own earlier `recommended` | Allowed (ODPC + author) |
| Mental re-saves its own `recommended` while cover `in_review` | Allowed (author) |
| DOH tries to edit Mental's `recommended` | `403` (disjoint categories + non-author) |
| Any tier-1 edits its `recommended` after cover left `in_review` | `403` |

## Out of Scope

- The finalize-time `recommended → finished` conversion (004).
