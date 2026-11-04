Title: test(mbt): add GraphWalker path harness for booking lifecycle

Base: qa/model-based-booking (draft; never main)

Refs #6

Execute the Issue #5 GraphWalker path through the existing Issue #04 helpers
and read-only Prisma oracles. Create a stale reschedule slot using a synthetic
blocker, then start a separate booking session after cancellation without
changing the cancelled records. Evidence excludes booking identifiers and
records only verified coverage.

Run: `node scripts/run-issue-06-mbt.mjs` after the prerequisites in
`apps/web/playwright/mbt/README.md`.

Actual run: **pass**, edges **6/6 (100%)**, vertices **5/5 (100%)**, 25 model
steps, seed 6006. Tested code SHA `67f426243f8553b73e0d3059e30cb0248f8e10ab`
with `dirty=false`, at 2026-10-13 02:31:46 Asia/Saigon / 2026-10-12 19:31:46 UTC.
Environment: Windows, Node 20.20.2, Temurin JDK 21.0.12.1, GraphWalker 4.3.3,
Docker 29.8.0, PostgreSQL 17.11, Chromium 143. GraphWalker check reports
`No issues found with the model(s).`

The stale-slot edge returned HTTP 409, left A unchanged and created no B.
`date` in the URL was not the submitted slot start: the blocker is created
from request `start/end` before forwarding the request. Selecting another
slot excludes all blockers. Starting a new session preserves the old records.

Evidence: `docs/qa/evidence/issue-06-2026-10-12T19-31-46-588Z.json`.
Two earlier attempts stopped before rescheduling and recorded 1/6 edges,
2/5 vertices; the unexecuted reschedule edge is marked chưa kiểm chứng.
All three runs were reported immediately in Issue #7.

Validation: changed-file TypeScript check has 0 diagnostics; Biome check
exits 0, with one long-function warning. Full
`yarn type-check:ci --force --concurrency=2` was attempted and stops on Windows
with `Error: spawn tsc ENOENT` in embed-snippet; full type check is not claimed
to pass. Final documentation/evidence commit does not alter the tested code.

Limits: only the six-edge personal booking model; supplementary state/guard
coverage from Issue #5 is not claimed. PENDING, REJECTED, AWAITING_HOST,
payment, seats, recurring, external calendar and delivery are unverified.
No new dependencies or schema changes. Runtime binaries, .env and browser
artifacts are ignored; error snapshots/reporters are disabled. Logs do not
contain booking identifiers, email addresses, tokens or Windows account paths.

Report delivered to @anvodangiu (Issue #7, Part G) and @BoyTay:
https://github.com/BoyTay/cal.diy/issues/7#issuecomment-6131239300
