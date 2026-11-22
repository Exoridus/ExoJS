# Dependency-aware test selection

The selector uses the same Vite/Vitest project configuration, aliases, workspace resolution and transformed module graph as the tests. It selects test **files**, retaining every test and assertion in a selected file. Project names are part of the identity: the same file in two browser projects represents two separate obligations.

## Inspect a change

Run from the repository root after installing dependencies and building the tooling:

```sh
node scripts/ci/affected-plan.ts --base origin/next --explain -- --project="exojs*" --project=rendering-perf
node scripts/ci/affected-plan.ts --base origin/next --explain -- --project=browser-webgpu --project=browser-webgpu-media
```

The default command only discovers tests. It reports the selected files, complete inventory, elapsed discovery time, dependency paths and conservative fallbacks in a JSON plan. `--explain` also prints individual reasons. `--scenarios` adds the documented Sprite, AnimatedSprite, shader, audio, documentation, configuration and deleted-file examples without editing source files.

To execute an inspected kind of change, calculate a fresh selection and run it in the same process:

```sh
node scripts/ci/affected-plan.ts --base origin/next --run -- --project="exojs*" --project=rendering-perf
```

This direct command is a diagnostic runner. Use the supervised `pnpm lanes` workflow for shared resource ownership, deadlines and completion validation. Do not run concurrent rendering or performance lanes on one machine. `--full --run` requests every test in the chosen projects; coverage also forces full execution. Project options follow `--`, keeping Vitest flags distinct from selector flags.

## Pre-push scope

The hook runs affected static gates and calls `pnpm lanes --run --tests-only --pre-push` for its verified range. On an existing source scope eligible for graph selection, this keeps dependency-selected units and applicable allocation/physics checks locally, then defers browser, structural benchmark and smoke lanes to mandatory CI for the pushed commit. Each deferred lane and its reason are printed, including in silent mode, and recorded in the lane summary. A successful local result does not certify the deferred lanes.

Inspect that decision without running commands:

```sh
pnpm lanes --pre-push --tests-only --base origin/next
```

Global configuration, unknown or deleted inputs, an unresolved base, and `--all` retain the existing broad local lanes. Content and tooling scopes retain their existing focused policy. Without `--pre-push`, manual lane runs keep their browser, benchmark and smoke commands. `--quick` and `--only` remain separate diagnostic modes and cannot combine with `--pre-push`.

The hook still verifies dist content stamps before gates that consume built output. Retained unit tests can also inspect dist, including production-stripping tests, so deferring browser lanes does not automatically remove a required build. API documentation is generated from source entry points, but site checks consume built package types. There is no reuse of an earlier test result or unchecked build artifact. Required CI, final full qualification, review and merge authorization remain unchanged.

## Range and dependency safety

Local discovery resolves the merge base afresh and includes committed, staged, unstaged and untracked paths. Git paths are NUL-delimited; both sides of a rename are reported as deletion and addition. The checkout identity, range and changed-file contents are checked again after discovery; an edit or branch switch during discovery aborts the command. CI's `--committed` mode compares its actual checkout with the exact event base and rejects a dirty range by retaining the full inventory.

Vite resolves imports, re-exports, workspace packages, aliases, literal dynamic imports and query modules. The selector follows canonical module files and Vite's recorded watch dependencies. Worker wrappers are connected to their source input. Unknown dynamic reads, external helpers and runtime file/asset access keep their dependent tests even when a static import path does not connect the current change.

Missing or deleted inputs, global configuration, build and generator inputs, untraceable plugin watch dependencies, graph errors and uncertain paths retain the full project inventory with an explicit reason. Failure to discover the inventory itself is an error. An unknown inventory is never reported as a successful empty selection.

Markdown contributes its own consumers without turning an otherwise resolvable source change into an unconditional full run. Some tests deliberately read documentation or scan the repository; those conservative consumers remain selected.

## CI shadow evidence

PR lanes first calculate a plan, including the fixed diagnostic scenarios. Their ordinary full test commands then run with an additional reporter. The reporter does not filter tests. A planning failure still allows the full command to execute and fails the job visibly.

For each invocation, the reporter verifies committed HEAD/tree identity and the complete inventory of every represented project. It records actual test-file state, test counts, execution duration, wall duration, selected and omitted files, and any failures that a proposed selection would have excluded. An incomplete run or inventory mismatch fails the audit. Each invocation writes a unique result, so separate browser rows cannot overwrite one another.

The `affected-tests-<lane>` Actions artifact contains the plan and observed results; the job summary gives the selected/omitted totals. Read `inventoryComplete`, `inventoryProblems` and `excludedFailures` before using any proposed reduction as evidence. A green full run establishes inventory agreement; positive and negative selector tests and mutation tests establish that relevant regressions are selected.

Required checks, JUnit skip-budget reports, qualification preflights, deadlines and `verdict` remain independent of the proposed subsets. Manual/full qualification and release validation continue to execute the complete required inventories. Shadow data alone does not authorize reducing a lane.

For a controlled CI measurement, add `ci:affected-probe` before a milestone push. After each required full Unit/WebGPU run succeeds, the workflow verifies the complete matching shadow audits and replays the AnimatedSprite unit or WebGPU Core subset. These are additional diagnostic executions, with separate execution JSON and JUnit outside the skip budget. They use the same checkout and runner after its full run, so their caches are warm; report discovery, execution and full-lane wall times separately. A full-qualification request disables these optional probes.

## Qualify the final candidate

Add the `ci:full` label before the final PR push. The next CI event for that exact head requests every lane, coverage, release preparation and consumer checks, plus the entire example catalog. It bypasses dependency selection and PR smoke sampling. Adding the label by itself does not start or cancel a run. Keep the PR as a draft until the required checks on the final combined head are green; a subsequent source or base-branch change needs fresh qualification.

The manual workflow dispatch also defaults to full qualification. None of these validation paths merges the PR, publishes packages or deploys a release.
