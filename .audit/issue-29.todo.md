# Issue #29 — Feature playbook
- [x] 1. `how` over the affected subsystem. skip: subsystem is two files (finalize enqueue at evaluator-review.ts:842-866, the script); read directly.
- [x] 2. `architect` for parallel design exploration. skip: one 3-line pure helper + a script; the ticket fixes the shape.
- [x] 3. Throughput checkpoint:
  - Blocking first steps: worktree ../twhp-elysia-29 on feat/29-fy2569-grade-email-batch with the untracked script copied in.
  - Independent workstreams: n/a, helper + script + finalize call site are coupled by one helper signature.
  - Shared mutable state: delegate owns the worktree exclusively; I don't touch it until it returns.
  - Smallest safe decomposition: one worker (sonnet), ~3 files.
- [ ] 4. Delegate code-writing (sonnet, worktree).
- [ ] 5. Verify on the matching surface (isolated tests, biome, script no-batch run against a DB with no Redis).
- [ ] 6. Rebase into small, ordered commits.
- [ ] 7. interrogate. skip unless design is contested.
- [ ] 8. Opening a PR.

## Review-fix round (2026-11-06)
- [ ] EXCLUDED line per excluded Cover
- [ ] verdictFinishedJob builder shared by finalize + script (fixes Duplicated Code + module name)
- [ ] finalize-written count: only Covers still finished
- [ ] drop "UTC" claim (awarded_at is DB-session local time)
- [x] hardcoded FY2569 bounds. skip: justified (src/utils opens Redis at import); proper fix is a side-effect-free fiscal-year module, separate change
- [x] docs lists (project-structure.md, CLAUDE.md/AGENTS.md isolated list). skip: all three have uncommitted user edits on main; editing on the branch would collide. Report instead.
