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

Vite projects can share an environment and its aggregate plugin watch set. A module-owned `?raw` import in one project can therefore cause another project's ownership check to retain the full inventory; the WebGL2 Sprite shader scenario currently reaches this conservative fallback. Fresh-context tracing identifies Vite's raw asset loader as the watch source, rather than a shader-plugin startup reader. Accepting any importer across the shared environment would also accept an unrelated project's ordinary import when a plugin has registered an unattributed watch. The same-environment orphan-watch regression protects that distinction, so shader selection remains full until watch ownership can be proven without weakening it.

Markdown contributes its own consumers without turning an otherwise resolvable source change into an unconditional full run. Some tests deliberately read documentation or scan the repository; those conservative consumers remain selected.

## CI execution and shadow evidence

Ordinary PRs calculate a plan for their actual changed range, then execute the selected complete test files in the supported unit and blocking browser projects. Discovery does not calculate the diagnostic scenarios on this path. Before running tests, the adapter verifies the committed checkout and each requested project's complete inventory. It records the selected and omitted files, test counts and results in a separate execution receipt. A missing receipt, changed checkout, incomplete selected run or unhandled error fails the command. A valid empty selection succeeds only after the nonempty complete inventory has been verified.

| Request                                                  | Discovery                             | Execution                                                                      |
| -------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| Ordinary PR                                              | Actual changed range                  | Selected files; full native fallback for uncertain/global inputs               |
| PR with `ci:affected-shadow`                             | Actual range and diagnostic scenarios | Full native tests and shadow comparison                                        |
| PR with `ci:affected-probe`                              | Actual range and diagnostic scenarios | Full native tests, shadow comparison, then the audited diagnostic probes below |
| `ci:full`, coverage, branch push or manual qualification | No affected-test selection            | Native commands for all requested projects                                     |

The source-area lane planner remains responsible for which jobs are required. Benchmarks and informational Firefox WebGPU rows keep their native commands. Allocation and physics qualification also remain separate. A discovery failure clears selection state, still allows the full required command to execute, and fails the job visibly; it never turns an unknown scope into a passing empty run.

In shadow mode, the additional reporter verifies committed HEAD/tree identity and the complete inventory of every represented project. It does not filter tests. It records actual test-file state, test counts, execution duration, wall duration, selected and omitted files, and any failures that a proposed selection would have excluded. An incomplete run or inventory mismatch fails the audit. Each invocation writes a unique result, so separate browser rows cannot overwrite one another.

The `affected-tests-<lane>` Actions artifact contains the plan, discovery log and observed results; the job summary gives the selected/omitted totals. Read `inventoryComplete`, `inventoryProblems` and `excludedFailures` in a shadow report before using a proposed reduction as evidence. A selected receipt instead reports `inventoryValidated` and `selectedInventoryComplete`, and explicitly sets `fullInventoryAudited: false`. A green full run establishes inventory agreement; positive and negative selector tests and mutation tests establish that relevant regressions are selected.

Required checks, JUnit skip-budget reports, qualification preflights, deadlines and `verdict` remain active. Manual/full qualification and release validation execute complete required inventories. The initial rollout used full shadow runs, selector regressions, existing Sprite/AnimatedSprite mutation tests and real selected-execution probes before enabling ordinary PR selection; see [PR #1131](https://github.com/Exoridus/ExoJS/pull/1131) for the exact heads and Actions evidence. Shadow data alone does not establish mutation sensitivity or replace full release qualification.

For a controlled CI measurement, add `ci:affected-probe` before a milestone push. After each required full Unit/WebGPU run succeeds, the workflow verifies the complete matching shadow audits. It replays the AnimatedSprite unit selection and exercises the selected WebGPU Media files to verify receipt delivery through a real browser instance. Media is a functional probe, not a measurement of Core GPU savings: the initial Core replay selected 129 of 130 files and showed no meaningful speed improvement. These additional executions have separate execution JSON and JUnit outside the skip budget. They use the same checkout and runner after its full run, so their caches are warm; report discovery, execution and full-lane wall times separately. A full-qualification request disables the optional probes.

## Qualify the final candidate

Add the `ci:full` label before the final PR push. The next CI event for that exact head requests every lane, coverage, release preparation and consumer checks, plus the entire example catalog. It bypasses dependency selection and PR smoke sampling. Adding the label by itself does not start or cancel a run. Keep the PR as a draft until the required checks on the final combined head are green; a subsequent source or base-branch change needs fresh qualification.

The manual workflow dispatch also defaults to full qualification. None of these validation paths merges the PR, publishes packages or deploys a release.
