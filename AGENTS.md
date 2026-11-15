# ExoJS agent instructions

## Orientation

ExoJS is a TypeScript-first 2D browser runtime. Core (`@codexo/exojs`) is at the repository root; optional extensions, integrations, tools, and benchmarks live in `packages/`.

Read relevant code and tests first, then only the guidance needed for the task. Use [CONTRIBUTING](CONTRIBUTING.md) for repository conventions, API changes, imports, distribution, and PR/visual-review workflow. Read package-local docs when changing that package. Do not preload unrelated documents.

`.workspace/` contains private, untracked research, reviews, evidence, and working notes, not authoritative source or public references. Promote enduring conclusions into the appropriate tracked documentation; never link private paths or notes from committed files.

## Engineering ownership

Act as a responsible long-term maintainer. Own the correctness, maintainability, performance, and architectural consistency of the result, not merely the requested diff. Fix root causes and directly affected callers, edge cases, and regressions. Reuse existing abstractions; prefer the smallest complete, maintainable solution over the smallest diff. Do not expand into unrelated cleanup, speculative features, or unrequested product changes. Existing contracts, validation rules, and approval boundaries take precedence. If the root cause lies outside the task's package, changes a public contract, or materially widens the PR, report it with evidence and propose a separate follow-up rather than silently expanding scope.

## Architecture and public contracts

- Core must not depend on optional extensions. Use public package entry points, preserve opt-in and side-effect-free extension behavior, and avoid global registries or hidden cross-package ownership.
- Treat exports, TypeScript contracts, serialization, defaults, failures, and observable runtime behavior as public API decisions. Optimize for callers: inference, discovery, lifetime/ownership, compatibility, tree-shaking, guides, examples, and reference docs.
- Preserve WebGL2/WebGPU parity where supported. For hot rendering, input, audio, scene-graph, and allocation paths, respect lifetime/allocation constraints; measure material performance changes rather than optimizing speculatively.
- Keep code and JSDoc concise and caller-oriented. Comments explain non-obvious invariants, safety, ownership, or compatibility, not obvious code. Never put task IDs, PR/commit/branch history, private paths, or agent narratives in source/API docs. Developer-facing documentation is English with ASCII punctuation unless technical notation requires otherwise.

## Validation

- During iteration, run named test files (never a whole Vitest project), affected package typechecks, or one `pnpm gates` group (`typecheck`, `lint`, `sync`, `site`; never `pnpm gates all` for diagnosis). Retry failing checks narrowly rather than rerunning the full suite.
- Before the first push, identify all affected contracts, including generated artifacts, package exports, shaders, examples, browser/backend parity, and documentation where relevant. Check the predicted lanes against the actual PR base (normally `pnpm lanes --base origin/next`), run targeted prerequisites, and use `git diff --check`.
- Before a completion push, or after repairing CI, run the full **applicable** local CI contract for the final tree, including required gates, builds, tests, generated checks, and browser suites. Determine coverage against the PR base, not the last incremental push. A targeted retry or copied/cached result from another checkout is not completion evidence unless the tested inputs and generated artifacts are provably equivalent. Reproduce checkout, OS, or backend differences exposed by CI. If code changes, repeat the completion validation on the new final tree. State checks that cannot be reproduced locally.
- The regular pre-push hook remains the integration check. The only bypass is an explicitly authorized, prevalidated CI-first batch under [CI validation policy](scripts/ci/VALIDATION.md); it never waives required CI, exact-head `verdict`, independent review, visual acceptance, or merge authorization. Do not globally disable Husky or weaken tests/gates to make them pass.
- For visible Playground/rendering changes, provide focused current evidence according to [CONTRIBUTING](CONTRIBUTING.md): stills for static states, short clips for motion, exact frame claims only for deterministic steps. Keep captures untracked under `.workspace/visual-review/current/`, attach evidence to the PR, and retain Draft status until required visual acceptance.

## Pull requests and parallel work

- Base independent branches/worktrees on current `origin/next`; target `next`. Give each shared source or generated output a single writer. Group related small fixes, but do not stack unrelated work.
- For real dependencies, use supported GitHub native stacks when appropriate (inspect `gh stack --help`), keeping each PR's diff, CI, review, and squash merge distinct. If a parent was squash-merged, reconcile descendants without replaying merged commits. Inspect remote heads before any necessary rewrite; use explicit `--force-with-lease=<ref>:<expected-sha>`.
- Preserve review, CI, visual acceptance, verdict, and exact-PR merge authorization. Do not introduce merge queues, change branch protection, relax gates, or alter the squash policy without a separate explicit maintainer decision.

## Worktrees, storage, and reporting

- Put linked worktrees in `.worktrees/<short-name>/` and untracked evidence in `.workspace/`. Exceptions for isolated/cloud filesystems, Windows path limits, or incompatible tooling must be justified in private notes. Each checkout owns writable `node_modules/`, `dist/`, generated output, and browser artifacts. Lane locks live in the Git common directory and are shared across linked worktrees; inspect their owner before clearing a suspected stale lock, and never clear another agent's active lock. Share only safe immutable/content-addressed caches, not writable artifacts through links.
- Preserve active and PR-open worktrees and useful warm builds. Before cleaning or removing a merged inactive worktree, inspect `git worktree list --porcelain`, dirty/unpublished state, locks, current processes, and remote/PR status; preserve evidence and remove through Git without force. Never silently relocate the primary checkout, delete branches, delete shared caches, force-remove worktrees, run `pnpm clean:all`, or use broad recursive cleanup as routine maintenance. Use `pnpm doctor` and narrowly scoped `pnpm clean:artifacts` only after checking ownership.
- Use English Conventional Commits subjects, concise factual PR descriptions, and short final reports that identify changes, verification, and limitations.
