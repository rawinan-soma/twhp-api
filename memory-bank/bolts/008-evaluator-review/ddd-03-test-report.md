---
stage: test
bolt: 008-evaluator-review
created: 2026-06-17T03:57:48Z
---

## Test Report: ODPC Finalize + File Deletion (008-evaluator-review)

**Verification method**: Static AC review + TypeScript + Biome (no test suite)

---

### TypeScript

```
bunx tsc --noEmit → 0 errors in evaluator-review.ts
Pre-existing test-file errors unrelated to this bolt (index.test.ts, score.integration.test.ts)
```

### Biome

```
bunx biome check src/service/evaluator-review.ts → Checked 1 file. No fixes applied.
```

---

### Story 005: Finalize and Transition

| AC | Description | Status |
|----|-------------|--------|
| AC 1 | Tier-1 commit: no coverLogs write, Cover stays `in_review` | ✅ Tier-1 falls into the unchanged `else` branch — only `answerLogs` inserted, no `coverLogs` write |
| AC 2 | ODPC can override any non-`finished` answer | ✅ Actionability check: `finished → 400`; `recommended + non-ODPC → 403`; ODPC can act on `in_review`, `rejected`, `recommended` |
| AC 3 | Un-overridden `recommended` answers backstopped to `finished` | ✅ `backstopRows` built from `allCoverAnswers` filtered to `recommended` + not in `batchIds`; each gets a `finished` answerLog with evaluator's `accountId` |
| AC 4 | `finished` is immutable to everyone including ODPC | ✅ Actionability check `currentStatus === "finished" → 400` runs before ODPC branch |
| AC 5 | ODPC commit is single-shot (always finalizes) | ✅ `level === "ODPC"` branch always runs finalize gate + transition; no partial mode |
| AC 6 | Finalize blocked if any `in_review` remains after batch + backstop | ✅ `effectiveState.some(s => s.finalStatus === "in_review") → status(400, ...)` |
| AC 7 | All answers `finished` → Cover → `finished` | ✅ `hasRejected = false → newCoverStatus = "finished"` |
| AC 8 | ≥1 answer `rejected` → Cover → `in_progress` | ✅ `hasRejected = true → newCoverStatus = "in_progress"` |
| AC 9 | `coverLogs` row written with evaluatorId | ✅ `tx.insert(coverLogs).values({ coverId, status: newCoverStatus, evaluatorId: evaluator.accountId })` |

**Score: 9/9**

---

### Story 006: File Deletion on Reject

| AC | Description | Status |
|----|-------------|--------|
| AC 1 | Hard-rejected answers (verdictChoice null, final `rejected`) → files deleted | ✅ `hardRejectIds` = answers where `finalStatus === "rejected" && finalVerdictChoice === null`; all 9 fileUrl cols extracted and passed to `utilities().deleteFile` |
| AC 2 | Change-score rejects (verdictChoice set) → files preserved | ✅ `finalVerdictChoice !== null` → not in `hardRejectIds`; files untouched |
| AC 3 | Prior tier-1 hard-rejects not overridden by ODPC → files deleted at ODPC commit | ✅ `effectiveState` for non-batch answers uses `allLogMap` verdictChoice; prior `rejected + verdictChoice null` → falls into `hardRejectIds` |
| AC 4 | Prior tier-1 rejects deferred; files NOT deleted on tier-1 commit | ✅ Tier-1 branch has no file deletion logic at all |
| AC 5 | Answer row file URLs cleared in transaction | ✅ `tx.update(answers).set({ fileUrl1_1: null, ... fileUrl3_3: null }).where(inArray(answers.id, [...hardRejectIds]))` |
| AC 6 | File I/O (deleteFile) happens BEFORE the transaction | ✅ `await Promise.all(fileUrlsToDelete.map(...))` executes before `database.transaction(...)` |
| AC 7 | No files deleted if `hardRejectIds` is empty | ✅ `fileUrlsToDelete` array is empty → `Promise.all([])` is a no-op; UPDATE guarded by `hardRejectIds.size > 0` |

**Note on MinIO error surfacing**: `utilities().deleteFile` swallows errors (try/catch, console.error only). If MinIO delete fails mid-way, the function logs but does NOT abort — matching the existing project pattern in `answer.ts`. Full error surfacing would require a custom delete helper; deferred as out-of-scope for this bolt.

**Score: 7/7 (with caveat on AC MinIO error surfacing per project pattern)**

---

### Overall

| Story | ACs Passed | Total ACs |
|-------|-----------|----------|
| 005-finalize-and-transition | 9 | 9 |
| 006-file-deletion-on-reject | 7 | 7 |
| **Total** | **16** | **16** |

- TypeScript: 0 errors in changed files
- Biome: clean
- File changed: `src/service/evaluator-review.ts` only (extension of existing `verdict()`)
- No new routes: existing `POST /evaluators/covers/:coverId/verdict` handles both tier-1 and ODPC
