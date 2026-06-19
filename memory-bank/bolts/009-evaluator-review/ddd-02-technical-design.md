---
stage: technical-design
bolt: 009-evaluator-review
created: 2026-06-17T04:15:00Z
---

## Technical Design: Factory Negotiation + Re-submit Gate (009-evaluator-review)

---

### Files to Change

| File | Change |
|------|--------|
| `src/schema/answer.ts` | Add `NegotiateAnswerSchema` + `NegotiateAnswerDto` type |
| `src/service/answer.ts` | Add `negotiate()` method; modify `submit()` re-submit gate |
| `src/routes/factories/assessments/index.ts` | Add `POST /answers/negotiate` route |

---

### Schema: `NegotiateAnswerSchema`

Multipart form with `action` discriminator and optional file fields:

```ts
export const NegotiateAnswerSchema = t.Object({
  action: t.Union([t.Literal("accept"), t.Literal("redo")]),
  questionId: t.Numeric(),
  selectedChoice: t.Optional(t.Union([t.Literal("0"), t.Literal("1"), t.Literal("2"), t.Literal("3"), t.Literal("n/a")])),
  file_1_1: t.Optional(t.File(fileOption)),
  // ... all 9 file fields optional
})
export type NegotiateAnswerDto = Static<typeof NegotiateAnswerSchema>
```

---

### Service: `negotiate(factoryId, dto)`

```text
1. Find cover (fiscal year) → 404 if missing
2. Fetch latest coverLog → if not "in_progress" → 400
3. Find question → 404 if missing
4. Find existing answer (coverId + questionId) → 404 if missing
5. Fetch latest answerLog → get status + verdictChoice

── ACCEPT branch ──────────────────────────────────────────────
6a. status !== "rejected" → 400 ("answer cannot be accepted in its current status")
7a. verdictChoice === null → 400 ("hard-rejected answer cannot be accepted; redo instead")
8a. effectiveChoice = verdictChoice
9a. File validator against effectiveChoice (existing fileUrls only, no new DTO files)
    → same logic as update step 7, but dto.file_xxx are undefined → uses existingAnswer.fileUrlXxx
10a. No MinIO ops (no file changes on accept)
11a. Transaction: UPDATE answers SET selectedChoice = effectiveChoice
                  INSERT answerLogs (status: "recommended")
12a. return status(200, { message: "answer accepted" })

── REDO branch ────────────────────────────────────────────────
6b. status !== "rejected" → 400 ("answer is not in a state that can be redone")
7b. effectiveChoice = dto.selectedChoice ?? existingAnswer.selectedChoice
8b. File validator against effectiveChoice (dto.file OR existingUrl satisfies requirement)
    → same logic as update step 7
9b. MinIO reconcile (same as update: processAnswerFile + clearFile, special===3 branch)
10b. Transaction: UPDATE answers SET selectedChoice + fileUrls
                  INSERT answerLogs (status: "in_review")
11b. return { message: "answer redone" }
```

---

### Service: `submit()` — Re-submit Gate Modification

Replace the current `notInReview` check (lines ~328-332) with:

```ts
// Before (initial-submit only):
const notInReview = latestAnswerLogs.some((log) => log.status !== "in_review");
if (notInReview) return status(400, { message: "not all answers are in review status" });

// After (handles both initial submit and re-submit):
const rejectedLogs = latestAnswerLogs.filter((log) => log.status === "rejected");
if (rejectedLogs.length > 0) {
  return status(400, {
    message: "re-submit blocked: some answers are still rejected",
    rejectedAnswerIds: rejectedLogs.map((l) => l.answerId),
  });
}
```

`selectDistinctOn` for `latestAnswerLogs` must also select `answerId` (currently it only selects `status`). Change: `{ status: answerLogs.status, answerId: answerLogs.answerId }`.

---

### Route: `POST /answers/negotiate`

```ts
.post(
  "/answers/negotiate",
  async ({ jwtPayload, body }) => {
    const factoryId = Number(jwtPayload.sub);
    return await answerService.negotiate(factoryId, body);
  },
  {
    body: NegotiateAnswerSchema,
    parse: "multipart/form-data",
    response: {
      200: t.Object({ message: t.String() }),
      400: t.Object({ message: t.String(), rejectedAnswerIds: t.Optional(t.Array(t.Number())) }),
      403: t.Object({ message: t.String() }),
      404: t.Object({ message: t.String() }),
    },
  }
)
```

Wait — 400 with optional `rejectedAnswerIds` won't work cleanly in Elysia's response schema. Use two separate 400 shapes with `t.Union`.

---

### Notes

- `negotiate` redo branch is functionally identical to `update` but with the added cover `in_progress` gate and restricted to `rejected` answers only.
- Standard question branch in `negotiate`: same logic as `update` — skip file reconcile, force selectedChoice="3", write `in_review` log. On `accept` of a standard question the same path applies but writes `recommended`.
- `submit` `latestAnswerLogs` query must include `answerId` in the select for the re-submit gate error message.
