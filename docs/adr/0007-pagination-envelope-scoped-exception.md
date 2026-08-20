# ADR 0007: The `{ items, meta }` pagination envelope is a scoped exception, not a global wrapper

**Status:** Accepted (2026-08-19)

**Amends:** `memory-bank/standards/api-conventions.md` — *"Elysia status responses with no envelope wrapper"* — for nine named endpoints only. That statement remains true for every other route in the API.

## Context

`memory-bank/standards/api-conventions.md` records two things that are in tension once pagination arrives. It states the API uses **no envelope wrapper**, and it also specifies **offset-based pagination** with `?page=1&limit=20`. Offset pagination is not usable without returning `total` alongside the items, and there is nowhere to put `total` in a bare array.

Intent `012-list-pagination` resolves the tension by wrapping. Nine staff list endpoints — the factory, enrollment, and score report lists for DOED Admin, Evaluator, and Provincial Officer — change their `200` body from `[...]` to `{ items, meta }`.

Left unrecorded, this creates a standing ambiguity that a future contributor resolves in one of two wrong directions:

- Reading the standards file, they conclude the envelope was a mistake and unwrap the nine endpoints, destroying `total` and with it the ability to paginate.
- Reading the nine endpoints, they conclude the envelope is the house style and wrap everything, breaking every other client for no benefit.

Both readings are reasonable from the artefacts alone. Neither is correct.

## Decision

The envelope is an exception with an explicit, enumerated boundary.

- **Shape.** `{ items: T[], meta: { page, limit, total, totalPages } }`. `meta` field names are camelCase on every endpoint, including the factory lists whose items are snake_case. Item shapes and casing are unchanged.
- **Applies to exactly nine endpoints**: `GET /{admins,evaluators,provincialOfficers}/{factories,enrolls,score}`.
- **Applies to `200` only.** Existing error responses — `404 invalid evaluator`, `404 provincial officer not found` — are returned unwrapped exactly as today.
- **Does not apply to anything else.** Single-resource reads, write responses, and bounded collections stay as they are.
- **Bounded collections stay bare arrays.** The question catalogue, the per-Cover answer reads, and the location reference lists (provinces, districts, subdistricts) cannot grow past a fixed ceiling. They return bare arrays deliberately, not by omission.
- **The envelope is unconditional on those nine.** It does not depend on whether `page` or `limit` was supplied. There is one response shape per endpoint, never a union.

The boundary rule, stated once: **an endpoint gets the envelope if and only if its result set grows with the data.** Size is the criterion, not aesthetics or consistency.

## Considered options

- **No envelope; return a bare array and put pagination in response headers (rejected).** Keeps the standards statement literally true. Rejected because headers are awkward to consume in the browser clients this API serves, are invisible in the OpenAPI response schema, and are routinely dropped by intermediaries. The frontend would have to read `total` from a header while reading items from the body.
- **Wrap every list endpoint in the API for consistency (rejected).** Removes the exception entirely and gives clients one shape. Rejected because it breaks the location and question endpoints — which are consumed as dropdown sources and want all rows in one call — for no benefit, since those collections are bounded by administrative geography and by the question catalogue.
- **Wrap only when `page` or `limit` is supplied (rejected).** Avoids the frontend cutover. Rejected because the `200` schema becomes a permanent union of array and object, which is harder to document, harder to type, and harder to consume forever, in exchange for a one-time migration saving.
- **Scoped exception with an enumerated boundary (chosen).** One documented deviation, nine named endpoints, one stated rule for deciding future cases.

## Reasons

- **`total` has nowhere else to live.** The standards file already committed to offset pagination, which cannot function without it.
- **The exception is enumerable.** Nine endpoints, listed by name, with a rule that decides new cases without another ADR.
- **It preserves what the no-wrapper convention was protecting.** That convention exists so simple responses stay simple. Bounded and single-resource reads keep that property.
- **One shape per endpoint.** Rejecting the conditional wrapper keeps the OpenAPI document honest and the client types narrow.

## Consequences

- **`memory-bank/standards/api-conventions.md` and `docs/api-conventions.md` must both state the exception and its boundary.** A standards file that flatly denies the envelope is worse than no statement, because it actively misleads.
- **Breaking change for all nine endpoints simultaneously.** The frontend must migrate in a coordinated release. This cost was accepted deliberately in preference to the conditional wrapper.
- **New list endpoints require a size judgement.** The author must decide whether the result set grows with the data. The rule above is the test; only a genuinely ambiguous case needs a new ADR.
- **Two response conventions coexist permanently.** This is the accepted cost. It is bounded by an enumerated list rather than left to taste.
