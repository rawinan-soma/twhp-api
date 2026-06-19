---
stage: domain-model
bolt: 010-evaluator-review
created: 2026-06-17T04:45:00Z
---

## Static Model: Grade + Live Choice + Verdict Email (010-evaluator-review)

> Scope: Live-choice scoring, 4-tier Grade, and factory notification email on ODPC commit.
> Stories: 009-grade-and-live-choice, 010-verdict-email.

---

### Value Objects

- **LiveChoice**: The effective choice for scoring purposes for a single answer.
  - Invariant: `liveChoice = answers.selectedChoice` (always). The `selectedChoice` column is already up-to-date:
    - Factory original answer → `selectedChoice`
    - Factory accepted change_score verdict → `selectedChoice` was updated to `verdictChoice` by `negotiate(accept)` 
    - ODPC approved → `selectedChoice` unchanged (factory's agreed value)
  - "Open verdicts don't affect the score" (AC 1) is satisfied because `rejected` logs don't change `selectedChoice`.

- **Grade** (pure function, derived on-demand, never persisted):
  - Inputs: per-category percentage breakdown + overall percentage + answers with `special` values
  - Algorithm (top-down, first match):
    1. `gold`:   every category `>80%` AND overall `≥90%` AND all special (`special > 0`) questions answered `"3"`
    2. `silver`: every category `>60%` AND overall `≥80%`
    3. `certificate`: overall `≥60%`
    4. `joined`: overall `<60%` (catch-all)
  - `null` for non-`finished` Covers

- **GradePayload**: Included in the ODPC finalize response (`POST /verdict` 200 body).
  - `grade: "gold" | "silver" | "certificate" | "joined" | null`

---

### Domain Rules

- **Score is live-choice based**: `answers.selectedChoice` at query time is the effective score.
- **Grade requires finished Cover**: Only `finished` Covers get a non-null grade.
- **Grade is ephemeral**: Computed each time from current data; not stored in any table.
- **Verdict email triggers**: ODPC commit only (not tier-1 approve, not factory re-submit).
- **Email recipient**: `enrolls.safetyOfficerEmail` (nullable — skip if null).
- **Email error isolation**: Enqueue failure after a committed transaction is logged and swallowed.

---

### Email Events

- **VerdictResultFinished**: Sent when ODPC commits and Cover → `finished`.
  - BullMQ job name: `verdict-result-finished`
  - Payload: `{ email: string, grade: string, factoryNameTh: string }`
  - Content: Thai "ผ่านการประเมิน" template with grade tier

- **VerdictResultInProgress**: Sent when ODPC commits and Cover → `in_progress`.
  - BullMQ job name: `verdict-result-in-progress`
  - Payload: `{ email: string, factoryNameTh: string }`
  - Content: Thai "ต้องปรับปรุง" template

---

### Ubiquitous Language

| Term | Definition |
|------|-----------|
| live choice | The effective score choice for an answer — always `answers.selectedChoice`, updated by accept |
| grade | 4-tier award tier (gold/silver/certificate/joined), null for non-finished covers |
| top-down grade | Grade evaluated in order gold→silver→certificate→joined; first matching tier wins |
| special question | A question with `special > 0` — must be answered "3" for gold grade |
| verdict email | Email sent to factory's safety officer (`safetyOfficerEmail`) after every ODPC commit |
