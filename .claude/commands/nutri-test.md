---
description: Write Playwright E2E tests for a just-implemented frontend feature via the playwright-test-author subagent — reads the change, authors specs under frontend/tests/e2e, runs them, iterates to green.
argument-hint: "<feature name or files> (default: the current diff)"
allowed-tools: Agent, Bash(git diff:*), Bash(git status:*), Bash(git log:*)
---

Add Playwright E2E coverage. Target: $ARGUMENTS

If no target was given, infer it from the current change set (`git diff main...HEAD`, plus
`git diff` / `git status` for uncommitted work) and focus on frontend-facing changes under
`frontend/src/`.

Launch the **playwright-test-author** subagent (Agent tool, `subagent_type:
"playwright-test-author"`). Give it:
- the feature/files to cover (or the diff summary),
- a reminder that it must import from `frontend/tests/e2e/fixtures.js`, keep AI endpoints
  stubbed, use real staging auth/CRUD, clean up any data it creates, and never touch prod.

When it returns, relay: which spec files it wrote, what each covers, the run result (green or
the specific failure), and any product bug or setup caveat it surfaced. If it reports a real
product bug rather than a test issue, highlight that — don't let it get buried. Don't change
product code yourself unless I ask.
