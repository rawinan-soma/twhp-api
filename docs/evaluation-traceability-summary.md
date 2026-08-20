# Evaluation Module — Traceability Summary

This document is a short summary. It uses ASD-STE100 Simplified Technical English. It uses the domain words from `CONTEXT.md`.

The full document is [Requirements Traceability](./requirements-traceability.md). The Thai version is [การสอบทวนข้อกำหนด](./requirements-traceability-th.md). The test results are in the [Test Report](./test-report.md).

| Item | Value |
|---|---|
| Date | 2026-08-17 |
| Scope | The Evaluation module |
| Requirements | 37 |
| Source | `memory-bank/intents/*/requirements.md` |

---

## 1. Why This Document Exists

A requirement tells you what the system must do. A test tells you what the system does. The two lists were not connected.

This document connects them. Each requirement has one row. Each row shows the test that checks the requirement.

The result is a clear answer to one question: **which rules of the Evaluation module do the tests actually check?**

## 2. What the Evaluation Module Does

The Factory sends a Cover for review. Each Cover has many Answers.

An Evaluator has a level. The level sets which Question categories the Evaluator can review:

- **Mental** — the `Mental` category.
- **DOH** — the `Disease` and `Safety` categories.
- **ODPC** — all five categories.

The server applies this filter. The user interface does not apply it.

The review has two phases:

1. **Save.** The Evaluator records one Evaluator Verdict for one Answer. The verdict is `approve`, `change-score`, or `reject`. An `approve` writes `recommended`. This is true for all levels, and also for ODPC.
2. **Finalize.** ODPC closes the whole Cover. Finalize changes each `recommended` Answer to `finished`. Finalize is the only operation that writes `finished`. Finalize writes the Cover transition. Finalize sends one email to the Factory.

If all Answers are `finished`, the Cover becomes `finished` and gets a Grade. If one Answer is `rejected`, the Cover becomes `in_progress` and gets no Grade.

A `finished` Answer is permanent. No user can change it. ODPC also cannot change it.

## 3. Where the Requirements Come From

Six intents made the Evaluation module. Each new intent changed the intent before it. It did not replace it.

| Intent | What it added | Requirements |
|---|---|---:|
| `003-evaluator-review` | The review model, the Verdict Score, the Negotiation Loop, the Grade, and the email | 10 |
| `004-admin-as-evaluator` | A DOED admin reviews as a national ODPC | 6 |
| `008-per-answer-verdict-save` | The save phase and the finalize phase | 9 |
| `009-review-standard-files` | The standard files in the review read | 4 |
| `010-change-score-file-deletion` | A `change-score` deletes the files at finalize | 3 |
| `011-finished-cover-reward-guard` | The Grade is only for a `finished` Cover | 5 |

Read the rows in the full document to get the current rules. Do not read one requirements file alone. One file can show an old rule.

## 4. What the Tests Show

Each requirement has one result:

| Result | Count | What it means |
|---|---:|---|
| Verified | 28 | A test checks the requirement. The test passed. |
| Not run | 5 | A test exists. Nobody has run the test. |
| Code review only | 2 | A person read the code. No test exists. |
| Replaced | 2 | A later intent removed the behavior. |
| No check | 0 | — |

Six of the 28 verified requirements are only partly verified. One part of each requirement has no test.

The last full test run was on 2026-07-07. The result was 51 tests, and all 51 passed. Nobody ran the tests for this document. The Docker stack was not in operation.

## 5. The Problems

There are seven gaps. A gap is a rule with no test, or with a weak test.

**G-1 is the most important gap.** The system must write the admin account id to `coverLogs.evaluatorId`. Bolt 012 had a test for this rule. Bolt 021 then replaced that test file with a different file. The new file does not have this test. This is the only rule in the module that lost its test.

To correct G-1, add one line to the admin finalize test. The test already exists.

The other gaps are:

- **G-2** — The Negotiation Loop and the re-submit rule have no test. A person read the code in bolt 009. This is the largest part of the module with no test.
- **G-3** — The finalize test only checks that the Grade is one of the four values. It does not check that a known Cover gets a known Grade.
- **G-4** — The rule "no N+1 query" has no test.
- **G-5** — Intent 011 has five tests. Nobody has run them. Bolt 024 has no test report.
- **G-6** — The rule "an accepted Verdict Score becomes the live choice" has no test. This rule is in `answer.negotiate`.
- **G-7** — The `adminGuard` rejection paths have no test.

## 6. What To Do Next

Do these tasks in this order:

1. Add one line to the admin finalize test. This corrects G-1.
2. Make a test database that you can delete after use. Then run the four main test files again.
3. Complete bolt 024. Run the five tests. Write the test report.
4. Write tests for the Negotiation Loop and the re-submit rule. This corrects G-2.

## 7. More Information

| Document | Contents |
|---|---|
| [Requirements Traceability](./requirements-traceability.md) | All 37 rows, with the test for each requirement |
| [Test Report](./test-report.md) | The test list, the results, and the ten defects |
| [Testing](./testing.md) | How to run the tests without damage to the database |
| `CONTEXT.md` | The domain words that this document uses |
