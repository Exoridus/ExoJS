# CI performance and selection evidence

This records the implemented validation changes and their measured limits.
The integration is [PR #1131](https://github.com/Exoridus/ExoJS/pull/1131), based
on `next`. The PR records the published commit sequence, independent reviews
and final exact-head qualification. [Validation](VALIDATION.md) describes the
daily workflow; [affected tests](AFFECTED_TESTS.md) describes selection and
fallback contracts; [Oxc evaluation](OXC_EVALUATION.md) contains the complete
formatter and linter compatibility decisions.

[Machine-readable results](performance-results.json) preserve the measured
heads, trees, scopes, job durations and local comparison metadata.

## What changed

- Local and ordinary PR test execution use Vite/Vitest's resolved dependency
  graph. Selection preserves whole test files and each project identity.
  Mixed documentation and source changes contribute their own dependencies.
- Unknown runtime readers, unresolved plugin watches, global configuration,
  generators, deleted inputs and invalid ranges retain broader validation.
  CI selected execution requires a complete execution receipt, separate from
  discovery and full shadow audits. Local same-context execution retains its
  checkout, cleanup and completion checks without that CI receipt reporter.
- Resolved source pre-push validation retains static gates, affected units
  and applicable allocation/physics checks. It explicitly defers browser,
  benchmark and smoke obligations to required CI on the published commit.
  Broad or uncertain changes retain the broad hook. Locks, deadlines,
  process cleanup, dist content stamps and completion checks remain active.
- Playground's 66 checks run in four complete, disjoint suites. Full example
  qualification runs the complete 121-entry catalog across three runners.
  Ordinary PRs retain the existing 17-example sample. No assertion, test
  tolerance or qualification timeout was relaxed for this change.
- Playwright caches are separated by OS, browser and lockfile. Playwright
  installs its own host dependencies; the redundant Xvfb apt step is gone.
  Guide media preparation runs only for its actual consumers, and one GPU
  fixture registers only the renderer bindings it needs.
- Oxfmt formats authored files, including Astro. Oxlint handles only verified
  rules in verified contexts; residual and fallback ESLint preserve the
  remaining checks. Generated-output contracts that use Prettier's API remain
  unchanged.

## Measurement rules

Job times include setup and teardown. Workflow elapsed time below starts at
the first job and ends when `verdict` completes; only rows marked passed have
a successful verdict. It is not the sum of parallel jobs. Queue time before
the first job is separate. Browser command times
include test execution and browser lifecycle unless a reporter separates
them. Selected-file counts are file/project obligations, not individual
assertions.

Compare like scopes. A normal PR sample without coverage is not equivalent
to full qualification with coverage and all examples. Shadow diagnostic
scenarios and selected replays deliberately add work and are not production
overhead. Failed runs and missing receipts are diagnostic evidence, not
successful performance results. There is no matched empty-store cold-cache
comparison; local timings use installed dependencies and warm filesystem
caches unless stated otherwise.

## Real GitHub Actions observations

| Published head                             | Run and scope                                                                                                                | First job to verdict | Result                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------: | -------------------------------------------------------- |
| `5b7aab32bddc2f27a09344468351a064fb5fad54` | [44964984546](https://github.com/Exoridus/ExoJS/actions/runs/44964984546), early tooling scope, no site/smoke                |                601 s | Passed                                                   |
| `9a4dea791ec4f7c9b74e853775c4de48e09ecf41` | [44967144139](https://github.com/Exoridus/ExoJS/actions/runs/44967144139), upstream full push, coverage and full catalog     |              1,778 s | Passed                                                   |
| `88cbe0a16e46e2492544bd31fd82f9d8e2254281` | [44968455136](https://github.com/Exoridus/ExoJS/actions/runs/44968455136), full shadow and PR smoke sample                   |              1,034 s | Lint failed; native browser/unit/smoke checks passed     |
| `89995924c9dc73b5b3e4a6e5025b68d72f2f8900` | [44972691207](https://github.com/Exoridus/ExoJS/actions/runs/44972691207), full shadow plus additional Core replay           |              1,322 s | Two unit contract assertions failed; repaired separately |
| `ea34a371ea1c80b84f76bf494c15b2dff017c545` | [44974423318](https://github.com/Exoridus/ExoJS/actions/runs/44974423318), full shadow and PR smoke sample, no replay        |                680 s | Passed                                                   |
| `87ffba14e11ce246f18df6fb68cbe7c0626051de` | [44976278981](https://github.com/Exoridus/ExoJS/actions/runs/44976278981), full shadow and PR sample plus Unit/Media replays |              1,063 s | All 23 jobs passed                                       |

The successful `ea34a37` path was plan 11 s, dispatch 3 s, unit 600 s,
dispatch 3 s, skip-budget 51 s, dispatch 1 s and verdict 11 s. Unit therefore
determined completion, ahead of WebGPU at 560 s. Its 600 s consisted of
44 s startup/setup, 58 s discovery and nine extra diagnostic scenarios,
487 s required commands, and 11 s tail work. The actual global-change plan
took about 26 ms; ordinary selected PRs do not run the nine diagnostics.

| Lane/job   | Early `5b7aab3` | Green `ea34a37` | Interpretation                                                |
| ---------- | --------------: | --------------: | ------------------------------------------------------------- |
| Unit       |           475 s |           600 s | Later run includes more tests and shadow diagnostics          |
| WebGPU     |           539 s |           560 s | Full native qualification in both; no claimed GPU speedup     |
| WebGL2     |           254 s |           351 s | Shadow discovery and runner variability remain                |
| Firefox    |           343 s |           316 s | Same required second-engine role                              |
| Benchmarks |   Not requested |           465 s | Retained native qualification when selected                   |
| Lint gates |           209 s |           149 s | Includes setup and all gates, not a controlled tool benchmark |
| Build      |           140 s |           105 s | Produces the exact candidate consumed downstream              |

The upstream full run's critical path was build (126 s), site (181 s), then
combined smoke (1,432 s), with scheduling and verdict accounting for the
remaining elapsed time. The completed final full qualification must be
compared with that full-scope run, not with the early tooling-only PR.

The final rollout probe at `87ffba1` completed all 23 jobs, plus Windows,
WorkflowLint and both platform Asset checks. Its 1,063 s elapsed time includes
the optional replay. The exact path was plan 15 s, dispatch 3 s, unit 989 s,
dispatch 2 s, skip-budget 35 s, dispatch 2 s and verdict 17 s. The unit job's
989 s includes 44 s startup/setup, 58 s diagnostic discovery, 483 s required
commands, 392 s replay and 12 s tail. Subtracting diagnostic work would be
a model, not an observed green ordinary PR run.

### Browser and smoke work

The 66 Playground check identities in the old combined smoke execution and
the new four suites match exactly, once each. The measured stage maximum
fell from 681 s in the shadow run to 240 s in `8999592`, a 64.8% reduction.
The four job durations summed to 826 s versus 681 s before: this reduces wall
time using parallel runners; it is not a claim of lower aggregate runner
consumption. The later green `ea34a37` maximum was 216 s. Full example
catalog partitioning is independently checked for a complete disjoint union;
its actual full-scope timing belongs to final qualification.

At `ea34a37`, WebGPU Core ran 130 files and 851 tests in 441.12 s; Media ran
2 files and 14 tests in 9.76 s. The initial controlled Core replay at
`8999592` selected 129 of 130 Core files: native execution was 587.94 s and
selected execution was 585.33 s (590.13 s command wall). This is no meaningful
speed improvement. That initial browser replay also lacked a complete
execution receipt; it prompted the workspace-reporter fix and is not used
as completed selection-audit evidence.

The reporter fix registers the observer through Vite's public global config
hook, including non-inheriting workspace projects, preserves ordinary
reporters, and requires a receipt after execution. Real child-process tests
cover inherited and independent projects and a deliberately missing observer.
At `87ffba1`, the real Media replay completed both files and all 14 tests,
with `inventoryValidated` and `selectedInventoryComplete` true and no errors.
Vitest took 9.13 s and command wall was 12.336 s. The native full GPU command
covered 130 Core files/851 tests and two Media files/14 tests in 430.26 s
and 9.62 s respectively. The Media replay proves the receipt contract, not
GPU pruning or a browser speed improvement.

Guide media preparation's local 200-file copy took about 270 ms; the in-process
already-prepared boolean guard returned in about 0.006 ms. That fast return
does not repeat content/hash verification. Preparation now runs only in guide
consumers. No isolated end-to-end
GPU saving is attributed to this or the narrower bounce-fixture registration.
Device lifecycle regression tests and parity assertions remain intact.

### Installation, build and platform costs

On the green `ea34a37` runners, warm dependency bootstrap took 8.77 s for
units, 8.66 s for WebGPU and 9.56 s for build, using a roughly 254 MiB package
store cache. GPU restored its roughly 271 MiB browser cache in 5.15 s, then
spent 27.41 s installing host dependencies. Core build took 13 s and extension
builds 4 s; the 105 s build job also verifies production stripping, packages
and consumers. These checks were not removed to improve the build number.

Historical PR #1129 also used a warm store (roughly 232 MiB), with installs
of 5.6-8.9 s and dependency/bootstrap totals of 7.8-12.1 s. The old Firefox
cache could restore a Chromium archive and still download Firefox. Separating
cache keys fixes that reuse error; these observations do not establish a
matched cold/warm speedup.

Windows has its own real workflow, including affected graph/runner regressions
and process cleanup tests. Windows watch identities use native real paths;
signal fixtures use platform-specific behavior without increasing production
deadlines. Linux local timings are not Windows performance measurements.
There is no physical-GPU speed claim: the required Linux WebGPU qualification
uses Chromium's SwiftShader fallback adapter, as documented in validation.

## Paired local unit measurement

The pair uses published commit
`c69a495301cd7028c2596f9a35c6581e1f9d86b1`, tree
`b337105c028430ca40a3a3b7711c4026e66a954a`. Local commit
`53b47ce79b8d33a32bce2e1bc04c905f14242491` has that identical tree. Subsequent
changes through `87ffba1` repair the empty-plan failure path, add its two
real-child regression cases, and update documentation. This pair remains a
measurement of the pinned `c69a495` tree, not the later test population.

Both runs use fresh Node processes, four workers, installed dependencies and
a warm filesystem on the same Linux host (AMD EPYC 9V74, nine available CPUs,
approximately 10.45 GB RAM). The full control runs before the selected run;
this is one sequential pair, not a randomized multi-run estimate. Cache
metadata matches between the end of the full run and start of selection.
Two short single-worker reporter fixtures and small commit hooks ran elsewhere
during the pair; no competing whole-suite/lint/benchmark run was started.

The measurement harness calls `selectAffectedTests` and executes the resulting
specifications in one fresh Vitest context, with projects `exojs*` and
`rendering-perf` and coverage disabled. It isolates the local selector-plus-test
path. It does not measure the separate-process CI discovery and admission
steps, the complete pre-push hook, or allocation/physics qualification. Those
costs must be reported separately rather than applying this percentage to an
entire lane or workflow.

| Phase/result            | Full control | AnimatedSprite selection |
| ----------------------- | -----------: | -----------------------: |
| Selected files          |        1,111 |                      907 |
| Tests                   |       19,828 |                   16,231 |
| Passed / skipped        |  19,782 / 46 |              16,185 / 46 |
| Discovery               |      0.031 s |                 29.019 s |
| Execution               |    367.633 s |                317.514 s |
| Total process wall      |    370.813 s |                349.293 s |
| Exit / unhandled errors |        0 / 0 |                    0 / 0 |

Execution falls by 50.119 s (13.6%), but discovery consumes much of that
saving. The actual process-wall reduction is 21.520 s (5.8%). All 16,231
retained tests match the full run's full-name/status multiset, and the exact
selected file inventory completes. Local Naga is absent, explaining part of
the 46 skips; strict GitHub qualification installs and requires it. These
local totals must not be treated as identical to the CI environment.

## Selection, mutation and execution proof

At `87ffba1`, the full unit shadow observed 1,111 files and 19,830 tests
(19,815 passed, 15 skipped). All six lane audits (unit, WebGPU, WebGL2,
Firefox, audio and tilemap) cover their full project/file inventories exactly
once, with no unhandled errors and zero excluded failures. Every diagnostic
scenario has a complete inventory. That green audit establishes agreement
with the actual full run; it does not by itself prove that every possible
mutation would be caught. The diagnostic selection counts below were also
repeated locally on `87ffba1`; its real rename probe is identified separately.

The same CI runner then executed the audited AnimatedSprite selection:
907 files, 16,233 tests (16,218 passed, 15 skipped), 204 omitted files,
and a complete selected execution receipt. Native Vitest took 441.28 s;
the replay took 389.36 s (392.064 s command wall). This is a sequential
warm-run diagnostic with a precomputed plan. Its 51.92 s lower Vitest duration
excludes discovery and the separate required supervisor/allocation/physics
commands; it is not an ordinary PR end-to-end comparison.

The audits and both Unit/Media receipts identify merge checkout
`b1bd3dceac6545c21fe12622da9ee81e939d1ae3`, tree
`668b10fe6d327cc8d33d7f48dc0a8f4596916b97`, matching the published `87ffba1`
candidate tree. The results artifacts are `14736760090` (unit) and
`14736410381` (WebGPU) in the linked run.

| Change                                 | Selected unit files / 1,111 | Behavior                                                                 |
| -------------------------------------- | --------------------------: | ------------------------------------------------------------------------ |
| `Sprite.ts`                            |                         907 | 18.4% fewer files; direct/transitive and conservative consumers retained |
| `AnimatedSprite.ts`                    |                         907 | 18.4% fewer files                                                        |
| Sprite plus README                     |                         907 | Documentation does not disable source selection                          |
| Audio subsystem                        |                         932 | 16.1% fewer files                                                        |
| WebGL2 Sprite shader                   |                       1,111 | Full fallback for an unattributed shared-environment plugin watch        |
| Shared shader packer                   |                       1,111 | Shared build/renderer dependency retains complete qualification          |
| Global Vitest/TypeScript configuration |                       1,111 | Conservative full validation                                             |
| Deleted/unreadable input               |                       1,111 | Conservative full fallback                                               |
| Real staged `R100` rename              |                       1,111 | Both old/new paths retained; full fallback, 127 ms discovery             |
| Documentation alone                    |          Consumer-dependent | Actual lane planner avoids unnecessary browser jobs                      |

Except for the separately executed real rename probe, these are diagnostic
changed-file inputs. The full PR range includes global CI/toolchain files
and consequently retains full native execution. Full shadow audits and
selected execution receipts distinguish a complete audited inventory from
a verified subset.

For Sprite, 494 files have a direct/transitive dependency and 413 are retained
only conservatively. For AnimatedSprite, those counts are 316 and 591. Of
98 audio-named files, 35 are omitted in each scenario; some retained tests
really import Application/renderer bindings and Sprite. Serialization and UI
also have real consumers. A package label cannot safely override the resolved
import path. The current GPU selection for AnimatedSprite is 131 of 132
file/project obligations (129/130 Core, 2/2 Media), so browser selection is
functionally enabled but this example is not yet a useful GPU reduction.

The selector regressions cover import/re-export chains, aliases and workspaces,
literal dynamic imports, raw/worker modules, watched assets, unknown runtime
readers, global/generator inputs, Git ranges, deletion/rename, missing
inventories, branch/content changes, exact project identity and process
completion. A same-environment orphan-watch fixture prevents weakening raw
shader fallback merely because another project happens to import that file.

The fresh mutation experiment at `87ffba1` uses existing Sprite/AnimatedSprite
tests. Each Core-only production plan selects 598 of 770 files and retains
the representative through a direct dependency reason. The experiment executes
that one selected representative file per mutation, not all 598 files or the
907-file multi-project selection. Baseline and restored sources pass all
73 tests. Replacing Sprite's width with frame height causes four failures in
`test/rendering/sprite/sprite.test.ts` (27 pass). Dividing AnimatedSprite's
elapsed delta by 1,000 causes 23 failures in
`test/rendering/animated-sprite.test.ts` (19 pass). Assertions and timeouts
are unchanged. Source SHA-256 hashes match after restoration and the index
and worktree are clean. This establishes sensitivity to those concrete
regressions, not universal mutation coverage.

The real rename probe at `87ffba1` stages an `R100` rename of `Sprite.ts`.
The production `--base HEAD` plan contains both old and new names and retains
the entire 1,111-file unit inventory because the old input is unreadable.
Source bytes and the index are restored exactly after the probe. This is
separate from the built-in synthetic deleted/unreadable scenario and from
the Git-diff parser's rename regressions.

## Real pre-push execution and portability

The first actual source-hook attempt used a normally formatted/linted
comment-only Sprite commit over `87ffba1`, with explicit existing-branch
base/head refs supplied to `sh .husky/pre-push`. It exited 1 after 1.579 s:
the first file-symbol gate could not create the `tsx` CLI's IPC listener on
this host (`EPERM`). No later gates or test lanes ran. This failed attempt is
recorded as incomplete, not as a fast pre-push result.

The source-path fix in `f2e7fcf046bba7a57f4c97e22f233c0c1e7dd2ff` preserves
the same entrypoints and arguments while starting their TypeScript loader
directly with `node --import tsx`. It covers 12 package scripts and the lane
dist preflight. This is a
[documented tsx integration](https://tsx.hirok.io/dev-api/node-cli); no gate,
assertion, timeout, lock or completion requirement is removed. Existing
plan/lane/hook tests pass 86/86, and the real file-symbol package command
accepts a valid source and rejects a deliberately mismatched exported name.
Independent checks cover failure arguments, package working directories,
generator execution and extensionless site imports.

This change addresses resolved source-push chains. Broad/global scopes still
reach other `tsx` CLI commands and can encounter the same host restriction.
The full PR range therefore remains subject to real GitHub qualification;
source-hook timing must use an isolated clean baseline containing the fix,
followed by a real source-only commit. An earlier successful whole-hook wall
baseline is unavailable, so no before/after whole-hook percentage is claimed.

The next real hook attempt, with that fix, passed fast static checks (5.331 s),
the natural production/package rebuild (11.434 s), core/worker/test typechecks,
API synchronization (63.4 s), and document history. Required lint then
exhausted this host's default Node heap. The hook failed after 211.077 s,
before test/allocation lanes; this is also an incomplete attempt, not a
successful timing result. Source bytes, index and dist were restored normally.

The observed default heap limit is 2,348,810,240 bytes, with no `NODE_OPTIONS`,
and 8,378,327,040 bytes available out of 10,451,427,328 total host memory.
The final source-hook measurement uses an explicit
`NODE_OPTIONS=--max-old-space-size=4096` only in the hook child's environment,
with four workers. Production defaults and all gates, assertions, deadlines
and cleanup remain unchanged. This is a configured resource profile, not a
speed improvement over a failed process. Read the PR's final evidence section
for that attempt's outcome and the final published-head full CI
qualification; neither can be inferred from the earlier partial attempts.

## Formatter and linter results

| Tool scope                      |           Before |                         After | Measurement                                                  |
| ------------------------------- | ---------------: | ----------------------------: | ------------------------------------------------------------ |
| Authored-file formatting, local | Prettier 53.04 s |                  Oxfmt 1.48 s | Fresh processes, warm filesystem                             |
| Actual CI format gate           |           41.1 s |                         1.8 s | Early and `ea34a37` runs; runner variation applies           |
| Matched engine/package lint     |  ESLint 150.24 s | Native plus residual 110.41 s | Same 3,154 files, 4 GiB heaps, no ESLint cache               |
| Implemented standard hybrid     |                - |                      119.32 s | Includes inventory/configuration work on the evaluation tree |

The local matched lint reduction is 26.5%. React/site checks and installation
are outside that benchmark. Actual `lint:all` was 129.6 s in the early CI,
136.4 s at `8999592` and 107.6 s at `ea34a37`; this variability prevents
attributing an exact CI percentage to the linter alone.

Oxfmt 0.79.0 and Astro compiler 0.5.0 were checked against 3,544 supported
non-Astro files plus 87 Astro files. Fifteen TypeScript layout changes
round-trip exactly through the original Prettier configuration. All 87 Astro
files are byte-equivalent, with no parser errors. Package JSON sorting is
disabled and import sorting stays with ESLint. Prettier remains only where
its JavaScript API is part of the generator contract.

Oxlint 1.94.0 with type-aware backend 7.0.2007 is the standard hybrid's native
pass. The inventory covers all 513 actually active ESLint rule IDs and their
resolved options. Of 273 native candidates, 241 evaluated IDs can be delegated
in validated contexts. All 11 security rules and all 10 custom ExoJS rules
remain active in ESLint. Unsupported rules/options, nursery implementations,
seven diagnostic mismatches, React/site contexts, named TypeScript projects
and suppression-bearing files retain the required original rules. Native
lint is followed by residual ESLint, not another full-rule ESLint pass.

The user-reported historical 56,381 type-aware findings were not reproduced
by the current reevaluation. The current
unfiltered candidate run produced 20 findings across seven mismatched rules;
the corresponding original ESLint checks were clean. Those rules remain in
ESLint. The `#math/Vector` alias and built-in floating-promise probes resolve,
but the named examples project loses imported promise information in Oxlint's
default type context. All 348 affected example files therefore keep full
ESLint. No important rule was disabled merely to reach zero findings.

The policy checks exact options, versions, parser/plugin/language identity,
file membership and configuration inputs. Changed or unknown contexts fall
back to original ESLint. The independent review matched all 241 delegated
entries against the 513-row [rule inventory](lint-rule-coverage.csv), with
zero policy mismatches. Detailed diagnostics and retained-rule decisions are
in [the Oxc report](OXC_EVALUATION.md).

## Remaining limits and next measurements

The largest remaining opportunity is conservative graph fan-out. An evaluated
extra TypeScript proof removed only five more unit files, made discovery slower
and left GPU selection unchanged; it was not shipped. Relaxing aggregate Vite
watch ownership would risk missing plugin inputs, so shader changes in the
shared unit environment still fall back until ownership can be proven through
supported graph information.

GPU Core was not split in this change. The shadow run's unit 600 s versus GPU
560 s does not establish the ordinary PR bottleneck: those jobs include 58 s
and 20 s of diagnostic discovery respectively. Measure ordinary and full
qualification paths separately before choosing the next partition. A future
GPU split must preserve a complete, disjoint receipt union and measure actual
wall time, browser initialization and runner consumption; a theoretical hash
partition is not a speed result.

A small incremental typecheck probe was 2.17 s without incremental state,
1.63 s with empty state and 0.87 s with warm state. It does not justify a new
global cache invalidation system while tests dominate. Existing content-stamped
build reuse remains the safe artifact reuse mechanism; no test PASS is cached.

Before integration, qualify the current combined `next` and PR head using
`ci:full`: all required native projects, coverage, all example shards,
Playground suites, skip budget, package/release consumers and successful
`verdict`. Independent review and exact-head checks remain necessary. The PR
stays Draft; validation does not authorize merging or publishing packages.
