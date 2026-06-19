---
stage: test
bolt: 009-evaluator-review
created: 2026-06-17T04:15:00Z
---

## Test Report: Factory Negotiation + Re-submit Gate (009-evaluator-review)

**Verification method**: Static AC review + TypeScript + Biome (no test suite)

---

### TypeScript

```
bunx tsc --noEmit → 0 errors in changed files
Pre-existing test-file errors unchanged (index.test.ts, score.integration.test.ts)
```

### Biome

```
bunx biome check src/service/answer.ts src/schema/answer.ts src/routes/factories/assessments/index.ts
→ Checked 3 files. No fixes applied.
```

---

### Story 007: Factory Accept / Object / Redo — 5/5

| AC | Description | Status |
|----|-------------|--------|
| AC 1 | Change-score answer accept → `recommended`, verdictChoice becomes live, file validator runs | ✅ `negotiate(action: "accept")`: checks `verdictChoice !== null`; file validator uses `existingAnswer.fileUrlXxx` only; tx updates `selectedChoice = verdictChoice`, inserts `status: "recommended"` |
| AC 2 | Change-score accept with insufficient files (upward) → 400, must object | ✅ File validator fails when `existingAnswer.fileUrl*` absent for the required group; returns 400 |
| AC 3 | Change-score object → re-answers with own choice + file reconcile → `in_review` | ✅ `negotiate(action: "redo")` runs full MinIO reconcile (processAnswerFile + clearFile) → inserts `status: "in_review"` |
| AC 4 | Hard-reject redo → re-uploads evidence → `in_review` | ✅ Same `redo` path; hard-rejected answers have all fileUrls null (cleared by bolt-008) → file validator requires new DTO files |
| AC 5 | `recommended` or `finished` locked → rejected | ✅ Both cases: `latestLog.status !== "rejected"` → 400 "answer is not in a state that can be negotiated" |

**Additional AC (edge case)**: Cover not `in_progress` → 400 | ✅ Latest coverLog check: `status !== "in_progress"` → 400 "negotiation only allowed when cover is in progress"

**Score: 5/5 + edge case**

---

### Story 008: Re-submit Gate — 4/4

| AC | Description | Status |
|----|-------------|--------|
| AC 1 | Re-submit allowed only if no answer is `rejected` | ✅ `submit()` gate changed from "all in_review" to `rejectedLogs.length > 0 → 400` |
| AC 2 | Valid re-submit → Cover → `in_review` (coverLogs row) | ✅ `submit()` already writes `coverLogs: "in_review"` after the gate passes |
| AC 3 | ≥1 answer still `rejected` → 400 with outstanding answer IDs | ✅ Returns `{ message, rejectedAnswerIds: rejectedLogs.map(l => l.answerId) }` |
| AC 4 | `recommended` and `finished` carry over untouched (sticky) | ✅ Gate only blocks `rejected`; `recommended`/`finished` statuses are not touched by re-submit |

**Additional AC (edge case)**: All answers `recommended`/`finished` → re-submit allowed | ✅ No `rejected` → `rejectedLogs` empty → passes

**Score: 4/4 + edge case**

---

### Files Changed

| File | Change |
|------|--------|
| `src/schema/answer.ts` | Added `NegotiateAnswerSchema` + `NegotiateAnswerDto` |
| `src/service/answer.ts` | Added `negotiate()` method; modified `submit()` re-submit gate + `answerId` in select |
| `src/routes/factories/assessments/index.ts` | Added `POST /answers/negotiate`; updated `/submission` 400 response schema |

### New Endpoint

`POST /twhp/api/factories/assessments/answers/negotiate` — factory negotiation (accept/redo)

---

### Overall

| Story | ACs Passed | Total ACs |
|-------|-----------|----------|
| 007-factory-accept-object-redo | 5+1 | 5+1 |
| 008-resubmit-gate | 4+1 | 4+1 |
| **Total** | **10** | **10** |

- TypeScript: 0 errors in changed files
- Biome: clean
