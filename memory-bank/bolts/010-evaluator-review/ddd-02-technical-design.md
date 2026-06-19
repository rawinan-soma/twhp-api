---
stage: technical-design
bolt: 010-evaluator-review
created: 2026-06-17T04:45:00Z
---

## Technical Design: Grade + Verdict Email (010-evaluator-review)

### Files to Change

| File | Change |
|------|--------|
| `src/service/scoreHelpers.ts` | Add `special: number` to `AnswerWithCategory`; add `computeGrade()` |
| `src/service/score.ts` | Add `special` to answer selects; include `grade` in all report outputs |
| `src/service/evaluator-review.ts` | Extend `allCoverAnswers` query; compute grade; fetch email; enqueue after txn |
| `src/worker/email.ts` | Add `verdict-result-finished` + `verdict-result-in-progress` job handlers |
| `src/routes/evaluators/covers/[coverId]/verdict/index.ts` | Update 200 schema to include `grade` |

### Grade Algorithm

```ts
const computeGrade = (breakdown, answers: AnswerWithCategory[]) => {
  const categories = [breakdown.collaborate, breakdown.disease, breakdown.safety, breakdown.mental, breakdown.outcome];
  const specialFull = answers.filter(a => a.special > 0).every(a => a.selectedChoice === "3");
  if (categories.every(c => c.percentage > 80) && breakdown.total.percentage >= 90 && specialFull) return "gold";
  if (categories.every(c => c.percentage > 60) && breakdown.total.percentage >= 80) return "silver";
  if (breakdown.total.percentage >= 60) return "certificate";
  return "joined";
};
```

### Score Report Grade Field

- `grade: null` when `coverStatus !== "finished"`
- `grade: computeGrade(...)` when `coverStatus === "finished"`

### Finalize Path Additions (evaluator-review.ts ODPC branch)

Post-transaction:
1. Compute `grade` using `allCoverAnswers` (with added `selectedChoice`, `category`, `special` from joined `questions`)
2. Fetch `enrolls.safetyOfficerEmail` + `factories.nameTh` via a pre-transaction query
3. After txn succeeds, enqueue email in try/catch

Return: `status(200, { message: "verdict submitted", grade })`

### Email Enqueue (after txn, ODPC path only)

```ts
if (enrollData?.email) {
  try {
    if (newCoverStatus === "finished") {
      await emailQueue.add("verdict-result-finished", { email, grade, factoryNameTh });
    } else {
      await emailQueue.add("verdict-result-in-progress", { email, factoryNameTh });
    }
  } catch (err) {
    console.error("Failed to enqueue verdict email", err);
  }
}
```
