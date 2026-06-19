---
stage: technical-design
bolt: 008-evaluator-review
created: 2026-06-17T03:57:48Z
---

## Technical Design: ODPC Finalize + File Deletion (008-evaluator-review)

---

### Architecture Pattern

Extension of existing `evaluatorReviewService.verdict()` — no new files, no new routes. All ODPC logic lives in an `if (level === "ODPC")` branch inside `verdict()`.

---

### Execution Order (ODPC commit path)

```text
[Shared validation — same as tier-1]
  1. Resolve evaluator → level + region
  2. Assert cover in region
  3. Duplicate answerId check
  4. Fetch answer categories → verify in cover
  5. Scope check → 403
  6. Fetch latest statuses for batch answers
  7. Actionability check (finished → 400; recommended + non-ODPC → 403)
  8. Build logRows (batch decisions)

[ODPC-only pre-transaction]
  9.  Fetch ALL Cover answers (status + verdictChoice + all fileUrl cols)
  10. Compute effective final status for each answer (batch + backstop)
  11. FinalizeGate: any in_review remaining? → 400
  12. Build backstop entries (recommended not in batch → finished)
  13. Identify hard-reject answers (final rejected + verdictChoice null)
  14. Collect file URLs to delete from hard-reject answers
  15. Delete files outside txn (utilities().deleteFile) — abort on error

[Single transaction for ODPC]
  16. Insert answerLogs for explicit batch (logRows)
  17. Insert answerLogs for backstop entries
  18. UPDATE answers SET fileUrl* = null for hard-reject answerIds
  19. Compute cover transition (all finished → "finished", any rejected → "in_progress")
  20. INSERT coverLogs (coverId, status, evaluatorId)

[Tier-1 path — unchanged]
  16t. Insert answerLogs for explicit batch only
```

---

### Pre-Transaction Query (step 9)

Fetch all answers in the Cover with their latest log and all file URL columns:

```ts
// Query 1: all answers with file URLs
const allAnswers = await database
  .select({
    answerId: answers.id,
    fileUrl1_1: answers.fileUrl1_1,
    fileUrl1_2: answers.fileUrl1_2,
    // ... all 9 fileUrl cols
  })
  .from(answers)
  .where(eq(answers.coverId, coverId))

// Query 2: latest log per answer (status + verdictChoice) for entire cover
const allLatestLogs = await database
  .selectDistinctOn([answerLogs.answerId], {
    answerId: answerLogs.answerId,
    status: answerLogs.status,
    verdictChoice: answerLogs.verdictChoice,
  })
  .from(answerLogs)
  .innerJoin(answers, eq(answers.id, answerLogs.answerId))
  .where(eq(answers.coverId, coverId))
  .orderBy(answerLogs.answerId, desc(answerLogs.id))
```

---

### Effective State Computation (step 10)

```ts
const batchDecisionMap = new Map(logRows.map(r => [r.answerId, r]))
const batchIds = new Set(logRows.map(r => r.answerId))

const effectiveState = allAnswers.map(a => {
  if (batchIds.has(a.answerId)) {
    // Use the batch decision
    const row = batchDecisionMap.get(a.answerId)!
    return { answerId: a.answerId, finalStatus: row.status, finalVerdictChoice: row.verdictChoice }
  }
  // Use existing log
  const log = allLogMap.get(a.answerId)
  const currentStatus = log?.status ?? "in_review"
  if (currentStatus === "recommended") {
    // Backstop: auto-convert to finished
    return { answerId: a.answerId, finalStatus: "finished", finalVerdictChoice: null }
  }
  return { answerId: a.answerId, finalStatus: currentStatus, finalVerdictChoice: log?.verdictChoice ?? null }
})
```

---

### FinalizeGate (step 11)

```ts
const hasUnresolved = effectiveState.some(s => s.finalStatus === "in_review")
if (hasUnresolved) return status(400, { message: "finalization blocked: unresolved in_review answers remain" })
```

---

### Backstop Entries (step 12)

```ts
const backstopRows = allAnswers
  .filter(a => {
    const log = allLogMap.get(a.answerId)
    return !batchIds.has(a.answerId) && (log?.status ?? "in_review") === "recommended"
  })
  .map(a => ({
    answerId: a.answerId,
    status: "finished" as const,
    verdictChoice: null,
    description: null,
    eval_id: evaluator.accountId,
  }))
```

---

### Hard-Reject File Collection (steps 13–14)

```ts
const hardRejectIds = new Set(
  effectiveState
    .filter(s => s.finalStatus === "rejected" && s.finalVerdictChoice === null)
    .map(s => s.answerId)
)

const fileUrlsToDelete: string[] = []
for (const a of allAnswers) {
  if (!hardRejectIds.has(a.answerId)) continue
  for (const url of [a.fileUrl1_1, a.fileUrl1_2, ..., a.fileUrl3_3]) {
    if (url) fileUrlsToDelete.push(url)
  }
}
```

---

### File Deletion (step 15) — outside txn

```ts
// Mirror answer.ts pattern: I/O before transaction
await Promise.all(fileUrlsToDelete.map(url => utilities().deleteFile(url)))
```

`utilities().deleteFile` accepts a filename string. If deletion fails, the `Promise.all` rejects and the function returns before the transaction — no partial state.

---

### Transaction (steps 16–20)

```ts
await database.transaction(async (tx) => {
  // 16: explicit batch
  for (const row of logRows) await tx.insert(answerLogs).values(row)
  // 17: backstop
  for (const row of backstopRows) await tx.insert(answerLogs).values(row)
  // 18: clear file URLs for hard-rejects
  if (hardRejectIds.size > 0) {
    await tx.update(answers)
      .set({ fileUrl1_1: null, fileUrl1_2: null, ..., fileUrl3_3: null })
      .where(inArray(answers.id, [...hardRejectIds]))
  }
  // 19–20: cover transition
  const hasRejected = effectiveState.some(s => s.finalStatus === "rejected")
  const newCoverStatus = hasRejected ? "in_progress" : "finished"
  await tx.insert(coverLogs).values({ coverId, status: newCoverStatus, evaluatorId: evaluator.accountId })
})
```

---

### Files to Change

| File | Change |
|------|--------|
| `src/service/evaluator-review.ts` | Extend `verdict()` with ODPC finalize branch |

No new routes — `POST /verdict` already exists from bolt-007.
