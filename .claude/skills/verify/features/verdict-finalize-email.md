# Verdict, finalize and the results email

A factory submits its self-evaluation, an evaluator saves a verdict on every Answer, and ODPC (or a
DOED admin) finalizes the Cover. Finalize writes the Cover status and the Award, then the worker
emails the factory: `verdict-result-finished` with the Grade, or `verdict-result-in-progress`
when an Answer was hard-rejected. The safety officer is cc'd when they have their own address.
This is the journey that would have caught the stale worker dropping that cc on staging.

## Sub-features

- `submit` sends the Cover for review (`POST /factories/assessments/submission`).
- `verdict` saves `approve`, `change_score` (with `verdictChoice` and `description`) or `reject`
  (with `description`) per Answer (`POST /{evaluators|admins}/covers/{coverId}/answers/{answerId}/verdict`).
- `finalize` settles the Cover (`POST /{evaluators|admins}/covers/{coverId}/finalize`, empty body).
- `results-email` is the email from finalize, with To = factory email and Cc = safety officer.

## How to get to it (user POV)

- Factory: enrollment (`POST /factories/enrolls`, multipart, with the safety officer's email),
  answers (`POST /factories/assessments/answers`, multipart, `questionId` and `selectedChoice`),
  then submission.
- Reviewer: `GET /evaluators/covers/{coverId}/answers`, a verdict per Answer, then finalize.

## Driving it with stack.sh

Preconditions: a validated factory from [factory-register.md](factory-register.md), enrolled in the
current fiscal year with a safety officer email different from the account email.

- **Submit.** As the factory, answer every question and run `$S call POST /factories/assessments/submission`.
  Multipart answer uploads need `curl -F`; `stack.sh call` only sends JSON, so call curl directly
  with `-b .verify-evidence/cookies.txt`.
- **Verdicts.** Log in as `test1` and run `$S call POST /admins/covers/<coverId>/answers/<answerId>/verdict '{"decision":"approve"}'`
  for every Answer.
- **Finalize.** Run `$S call POST /admins/covers/<coverId>/finalize '{}'`. It returns
  `cover finalized` with `coverStatus` and `grade`.
- **Stored state.** Run `$S sql` for the Cover's latest `CoverLogs` row (greatest `id`, ADR-0010)
  and its `Awards` row. Status is `finished` and the Award's grade matches the response.
- **Proof.** `$S mail` lists one message to the factory email with the safety officer in Cc.
  Save it with `$S mail-save <id>`. `$S logs worker` shows `accepted` for both addresses.

## Gotchas

- Not yet driven end to end. The first run should fix any step above that does not match the code
  and then mark it proven in the README.
- During the evaluation period a `reject` verdict on the prior fiscal year returns 400
  (ADR-0012, amended). That is expected behavior, not a failed journey.
- Finalize stays ODPC-only for evaluators. Use `test1` (DOED counts as national ODPC) or an `odpc*`
  evaluator from `seed_data/eval.json`.
