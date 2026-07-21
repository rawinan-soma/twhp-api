# Factory Answer Evidence Deletion Design

**Date:** 2026-07-21
**Status:** Implementation complete; PostgreSQL and physical MinIO verification pending

## Problem

Before this feature, `PATCH /twhp/api/factories/assessments/answers` treated an omitted `file_*`
multipart field as “keep the stored object name.” This preserved existing clients, but gave a
Factory no explicit way to remove one optional evidence file. Sending an empty string, `null`, or a
stored object name in a `file_*` field failed request validation because those fields accepted only
newly uploaded PDF files.

At design approval, the maintained API documentation mentioned `delete_file_<row>_<slot>` fields,
but the runtime schema and service did not implement them. Source remained authoritative while this
design awaited implementation and verification.

## Scope

Add explicit, optional deletion flags to the existing Factory Answer PATCH operation. A deletion is
allowed only when the target Answer's latest `AnswerLog` status is `in_review`. Rejected evidence
continues through the existing ODPC/admin finalization cleanup described below. This design does not
allow evidence deletion on `rejected`, `recommended`, or `finished` Answers, and does not add
deletion to the negotiation endpoint.

The change does not alter PostgreSQL tables, MinIO object naming, scoring, answer-state transitions,
or the meaning of an omitted `file_*` field.

## Request Contract

`UpdateAnswerWithFilesSchema` gains these nine optional multipart fields:

- `delete_file_1_1`, `delete_file_1_2`, `delete_file_1_3`
- `delete_file_2_1`, `delete_file_2_2`, `delete_file_2_3`
- `delete_file_3_1`, `delete_file_3_2`, `delete_file_3_3`

Each field uses the repository's multipart Boolean transform: boolean `true`/`false` and the exact
strings `"true"`/`"false"` decode to a boolean. Omission and `false` mean “do not delete.” `true`
means “remove the existing object in this slot and persist `null` for the matching Answer column.”
Clearing only the database column does not satisfy the request: when the slot contains an object,
the PATCH succeeds only after that exact object has been removed from MinIO.

Existing upload fields retain their current semantics:

- omitted `file_<row>_<slot>`: normally keep the stored file;
- supplied PDF: normally replace the stored file;
- non-standard `special=3` exception: for every row not selected by the effective choice, ignore a
  supplied upload, best-effort delete any stored object, and persist `null` for the row's columns;
- empty string, stored filename, non-PDF, or file larger than 10 MiB: request validation fails.

A request that supplies a PDF and sets the matching deletion flag to `true` is contradictory and
returns HTTP 400 without performing MinIO or database writes. Deleting an already-empty optional
slot is an idempotent no-op.

## Business Validation

The service builds the projected nine-slot state before any file I/O and validates the effective
choice against that projected state.

Deletion eligibility is not conditional on `Question.special`, standard classification, selected
choice, or file slot. The mechanism applies uniformly to every Answer that is otherwise eligible for
PATCH. After applying requested deletions to the projected state, the service runs the existing
choice/evidence validation unchanged. That evidence-validation check returns HTTP 400 when the
projected state no longer satisfies the Answer's existing evidence requirements. Explicit deletion
also returns HTTP 400 when the latest status is not `in_review` or when the request uploads and
deletes the same slot.

The existing behavior for `special` and matching-standard Questions remains a business-validation
concern; it must not bypass or disable explicit deletion of an Answer-owned MinIO object.

## Relationship to Evaluator Rejection

The manual PATCH deletion mechanism does not replace or modify evaluator rejection cleanup:

1. Saving a `reject` or `change_score` verdict appends a `rejected` AnswerLog and performs no MinIO
   operation.
2. When ODPC/admin finalizes, every Answer whose latest status is `rejected` has all nine Answer
   evidence objects deleted from MinIO and all nine file columns set to `null`.
3. The Answer row remains so the Factory can redo it with new evidence.

This separation keeps individual optional-file deletion in the Factory's `in_review` editing flow
and whole-Answer rejected-file cleanup in finalization.

## Service Flow

1. Decode and validate the multipart request.
2. Resolve the Factory's current-fiscal Cover, Question, existing Answer, and latest AnswerLog.
3. Apply the existing PATCH status guard, then require `in_review` when any deletion flag is `true`.
4. Reject any slot with both a replacement PDF and a `true` deletion flag.
5. Build the projected state per slot: deletion becomes `null`, replacement becomes pending upload,
   and omission retains the existing object name.
6. Validate the effective choice and Question rules against that projected state.
7. Perform the required MinIO replacements/deletions outside the PostgreSQL transaction using the
   shared helpers.
8. In one database transaction, update all nine file columns and append the existing `in_review`
   AnswerLog event.
9. Return the existing HTTP 200 `{ "message": "answer update" }` response.

All checks that can return HTTP 400 occur before MinIO mutation.

## Failure Handling

Explicit deletion uses the strict MinIO delete helper. If MinIO deletion fails, the service returns
HTTP 500 and performs no database write. This avoids reporting success while the requested evidence
object remains stored.

MinIO cannot participate in the PostgreSQL transaction. Strict explicit deletions are started
concurrently. If one deletion fails, another may already have succeeded or may still complete because
`Promise.all` cannot cancel in-flight MinIO operations. The service returns HTTP 500 and performs no
database write, but PostgreSQL can still reference any object that was removed successfully.

After strict explicit deletions, replacement uploads run before the database transaction. An upload
failure returns HTTP 500 without a database write, but an earlier explicit deletion can already have
left a dangling filename, and an upload completed concurrently can become an orphan. If all file
operations succeed but the database transaction then fails, deleted objects remain referenced and
newly uploaded objects can remain orphaned.

Legacy `special=3` implicit clearing and old-file replacement cleanup use the best-effort delete
helper. It catches and logs deletion failures, permits processing and the database update to
continue, and can therefore return success while an old object remains orphaned. These best-effort
deletion failures do not produce the strict deletion's HTTP 500/no-database-write behavior.

These are existing architectural limitations of the Answer update workflow. There is no automatic
compensation, recovery, or reconciliation; an operator must investigate and reconcile MinIO objects
with Answer columns after such a failure. The best-effort helper logs its caught deletion failure;
operational reports must not reproduce stored object names or presigned URLs. Serialization, a
transactional outbox, or a recoverable object lifecycle requires a separate design decision and is
outside this feature's scope.

Replacement behavior remains unchanged by this feature. The implementation must not broaden the
change into a general rewrite of upload compensation.

## Error Contract

The PATCH route documents these additional HTTP 400 outcomes:

- explicit deletion is attempted while the Answer's latest status is not `in_review`;
- the same slot cannot be uploaded and deleted in one request;
- the projected evidence is missing a file required by the effective choice.

Request-schema failures continue through the global validation handler and are normalized to HTTP
400. Unexpected strict MinIO, upload, or database failures continue through the established 500
handling without exposing stored object names in the response body. Best-effort implicit/replacement
deletion failures are logged and do not change the response to 500.

## Verification

Add focused tests covering:

- multipart decoding for omitted, `false`, and `true` deletion flags;
- an optional-slot deletion succeeds for an `in_review` Answer;
- deletion behavior is available regardless of the Question's `special` value or standard
  classification;
- omitted optional slots remain unchanged;
- deleting each required `_1` anchor is rejected according to the effective choice;
- upload plus delete for the same slot is rejected before file I/O;
- deletion is rejected for `rejected`, `recommended`, and `finished` Answers;
- deleting an already-empty optional slot succeeds without calling MinIO;
- strict MinIO failure leaves database columns and AnswerLogs unchanged;
- successful deletion clears only the requested column, removes only that object, and appends one
  `in_review` AnswerLog.
- after a successful response, the deleted object's name is absent from the Answer row and the
  corresponding object no longer exists in MinIO.

Run isolated schema/component tests first. Run any PostgreSQL integration test only after confirming
`DATABASE_URL` points to a disposable, migrated, seeded test database. Finish with the non-mutating
Biome check and report baseline diagnostics separately from introduced diagnostics.

## Documentation

Implementation aligned `docs/api-conventions.md` and the PATCH response schema. Generated API and
OpenAPI artifacts were intentionally not regenerated because that action requires separate approval
under the repository change-control rules.
