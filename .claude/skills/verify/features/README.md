# twhp-elysia verification map

This directory is the maintained source for verifying twhp-elysia's user-facing behavior on the
`twhp-verify` stack. Read this index first, then use the matching feature file as the recipe.

## Baseline preconditions

- `S=.claude/skills/verify/scripts/stack.sh`, run from the repo root.
- `$S up` has finished and `$S doctor` passes, including `smtp: worker -> mailpit`.
- The database holds only the seed: provinces, districts, sub-districts, provincial officers,
  evaluators from `seed_data/eval.json`, questions, and the DOED admin `test1`. No factory exists.

## Features

| Feature | File | Proven end to end |
| --- | --- | --- |
| Staff login with emailed OTP | [staff-login-otp.md](staff-login-otp.md) | yes, 2026-11-06 |
| Password reset email | [password-reset-email.md](password-reset-email.md) | yes, 2026-11-06 |
| Factory registration and validation | [factory-register.md](factory-register.md) | no |
| Verdict, finalize and the results email | [verdict-finalize-email.md](verdict-finalize-email.md) | no |

## Driving conventions

- Paths are relative to `/twhp/api`. Bodies come from `http://127.0.0.1:3901/twhp/api/document/json`.
- Log in as the role the journey belongs to. A factory journey uses a factory account, never an admin.
- Rebuild with `$S up` after every code change before driving again.

## Proof and skip reporting

- Save each `call` output, the `sql` check that reads the stored result, and each email with `mail-save`.
- Name the feature file and step with every artifact in `.verify-evidence/`.
- A journey blocked by a missing precondition is reported as failed with the step and the reason.
  Never weaken the journey to make it pass.
