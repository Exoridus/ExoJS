---
name: reconciliation
description: "Run the ExoJS reconciliation workflow: coordinate parallel Codex findings, exact-head independent reviews, required CI, dependency-aware merges, and evidence-backed register updates."
argument-hint: "[scope|status] [max-lanes=N]"
disable-model-invocation: true
---

# ExoJS reconciliation orchestrator

Operate as the **coordinator**, not the default code author. `$ARGUMENTS` selects a backlog scope, PR group, finding, or `status`; with no arguments, inspect the current queue and continue eligible work. `status` is read-only. Do not assume that earlier chat summaries describe the current GitHub state.

## Bootstrap and authority

1. Confirm the current repository is `Exoridus/ExoJS`, identify the actual root, branch, `origin/next` SHA and dirty worktrees, and read the relevant parts of `AGENTS.md`, `CONTRIBUTING.md` and `scripts/ci/VALIDATION.md`. Respect their current contracts; this skill never overrides them.
2. Check installed `claude`, `codex`, `gh`, Git, authentication, and supported `codex exec`/resume/`gh stack` commands before relying on them. Resolve **real available** Codex model IDs and Claude review models; do not invent Sol, Terra, or Tuna IDs. If a tier is unavailable, use an explicitly approved available substitute or mark the lane blocked.
3. Inspect current PRs, review comments, exact remote head SHAs, required `verdict`, relevant reconciliation register, and existing worktrees. Preserve active work and unfinished sessions. Keep working state, logs, ownership, task IDs and resume handles privately under `.workspace/reconciliation/` (gitignored); never commit scratch state.
4. Build a dependency DAG: independent findings are parallel lanes based on the current `next`; genuine dependencies form a stack. Assign ownership of shared source files and generated artifacts to one writer. Classify integration and external dependencies separately.

## Bounded parallel implementation

- Start with at most **four** implementation lanes (respect the user's lower limit and measured capacity), staggering process launches. Use one Codex worker per lane and one narrow finding or coherent fix per invocation; do not send Terra/Tuna a large multi-finding queue. Give each worker a unique `.worktrees/<short-name>/` checkout, exact scope, acceptance criteria, targeted test commands, and no access to other workers' writable outputs.
- Route by risk and difficulty: **Tuna** for small isolated edits, **Terra** for medium work, **Sol** for difficult algorithms, public APIs, GPU, physics or IME. These are routing tiers, not guaranteed CLI model identifiers. Validate the actual model mapping before executing.
- Run Codex using the installed CLI with a scoped working directory, a validated model and sandbox policy, JSONL progress (`--json`) and a result file (`-o`) where supported. Record exit code, tests, commit SHA and resumable session identifier. Explicitly isolate concurrent write targets and expensive local lanes; respect the repository's shared validation lock.
- Monitor worker completion and errors; restart/reassign only after inspecting the previous result. Never kill arbitrary Node/Chromium processes or delete an active worktree. If execution is interrupted, persist an accurate snapshot, resume by exact session ID when supported, and report any tasks still running or waiting. Do not imply that the session continues running after Claude exits.

## Review, CI and PRs

- After focused prevalidation and normal repository hooks, open or update a **Draft PR** against `next` promptly so GitHub CI and independent review can run concurrently. Use a CI-first `HUSKY=0` push only if explicitly authorized for that specific push and permitted by the *currently effective* repository rules. Verify local SHA, remote SHA and PR head SHA; never disable Husky globally. CI-first is not the planned dependency-aware test selector.
- Independent reviewer must not be the implementing Codex worker or reuse its conclusions as review evidence. Use **Sonnet** for simple/medium changes, **Opus** for complex or high-risk changes; review the complete exact head and tests. Record a pass, blockers, and SHA. A GitHub `COMMENTED` review is not automatically an `APPROVED` review. A changed head invalidates prior exact-head approval.
- Required GitHub CI and successful `verdict` on the qualifying head are mandatory. A partial green matrix, queued jobs, skipped informational checks, or an old head is insufficient. Visible rendering/UI changes still require the repository's visual acceptance; platform/GPU behaviors require appropriate evidence.

## Single-writer integration

- Only the designated merge-controller integrates into `next`. An implementation lane or independent reviewer may **not** independently enable GitHub Auto-Merge or merge. Preserve the project's squash policy and branch protections; do not alter rulesets, CI requirements, or auto-merge policy from this skill.
- For each eligible PR, re-fetch its head, current `next`, dependencies, review evidence, CI result and mergeability. Guard against changes between qualification and merge. Since `next` does not require strict up-to-date checks, determine whether the current combined tree was actually qualified; where it was not, rebase/update or validate an integration revision and obtain updated review/CI as appropriate. Never treat a stale green check as proof of combined-tree safety.
- Merge independent, qualified PRs in safe order, one integration at a time. For stacks, reconcile descendant commits after squash merges, inspect diff boundaries, push history rewrites only with an explicit `--force-with-lease`, then requalify the new actual PR heads. Preserve PR identities and fix incorrect titles. Do not globally turn on Auto-Merge; only consider per-PR automation after the merge-controller establishes that existing repository policy and dependency ordering permit it.
- Verify the resulting merge commit / `next` SHA. Update the reconciliation register and clean worktrees **only after confirmed integration and evidence**, following repository cleanup rules. Never close GPU, device, platform or visual findings using CPU/jsdom-only evidence.

## Report and continuation

Work in quiet mode. Give brief checkpoints for actual merges, blockers, failed/restarted workers, or finished waves; avoid per-command chatter. Provide a compact table or summary of merged PRs (with SHAs), blocked/waiting PRs, remaining findings, active workers, recorded resume state, and the next dependency-ready batch. For `status`, inspect and report only: do not start workers, push, merge or modify files.
