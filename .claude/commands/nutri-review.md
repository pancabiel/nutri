---
description: Audit the current change against Nutri's architectural invariants (tenant isolation, AI metering/caps, env-var triple-edit, no-Stripe-SDK, native safety) via the nutri-reviewer subagent.
argument-hint: "[optional: file paths or a PR number to scope the review]"
allowed-tools: Agent, Bash(git diff:*), Bash(git status:*), Bash(git log:*)
---

Run a Nutri guardrail review.

Scope: $ARGUMENTS

If no scope was given, review the current change set:
- `git diff main...HEAD` (committed work on this branch)
- `git diff` and `git status` (uncommitted work)

Launch the **nutri-reviewer** subagent (Agent tool, `subagent_type: "nutri-reviewer"`) with
the scope above. Hand it the exact files/diff to review so it doesn't re-derive scope from
scratch. When it returns, relay its findings to me verbatim-ish — keep the BLOCKER/WARN
grouping and the `file:line` citations — and end with the one-line verdict (SHIP / FIX
BLOCKERS FIRST). Do not start fixing anything unless I ask.
