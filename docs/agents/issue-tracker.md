# Issue tracker: GitHub Issues

As of 2026-11-06, issues for this repo live in GitHub Issues on `rawinan-soma/twhp-api`. Use the
`gh` CLI.

## Conventions

- One issue per implementation ticket. Title states the change, not the symptom.
- Triage state is a GitHub label (see `triage-labels.md`). Each triaged issue carries exactly one
  category label (`bug` or `enhancement`) and one state label.
- Comments and conversation history are GitHub issue comments.
- A larger feature gets a PRD issue; its implementation issues link back to it with
  `Part of #<n>`, and dependencies are written as `Depends on #<n>`.
- External pull requests are not a triage surface; triage covers issues only.
- Close an issue from the PR that implements it (`Closes #<n>`).

## Legacy `.scratch/`

Tickets filed before 2026-11-06 stay as markdown under `.scratch/<feature-slug>/` (`PRD.md`,
`issues/NN-*.md`, `Status:` line). They are history: do not add new tickets there. Link to them by
full path from GitHub issues when needed. `.scratch/` is still fine for temporary investigation
output.

## When a skill says "publish to the issue tracker"

`gh issue create --title "<title>" --label <category> --label <state> --body-file <file>`.

## When a skill says "fetch the relevant ticket"

`gh issue view <n> --comments`. A bare `#42` means GitHub issue 42. A `.scratch/...` path means a
legacy local ticket: read the file.
