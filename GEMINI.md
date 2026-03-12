# Gemini Repository Rules — ExoJS

These rules apply to Gemini and similar AI assistants working in this repository.

## 1) Operating Mode

- Work in English only for outputs, edits, summaries, comments, and commit suggestions.
- Base recommendations on actual repository evidence.
- Keep changes small, reviewable, and independently verifiable.
- State assumptions, tradeoffs, and risks explicitly.

## 2) Project Purpose and Shape

ExoJS is a TypeScript-first browser multimedia / graphics / game-oriented library/framework.

The repository typically includes:
- `src/` for runtime library/framework source
- package/build/type configuration defining the public package surface
- `docs/` for contributor and consumer documentation
- `.github/` for CI/CD and automation
- generated output, demos, examples, or temporary artifacts only where explicitly present

Treat generated outputs and local experiments as non-authoritative unless explicitly promoted and documented.

## 3) Repository Boundary Rules

Use these boundaries consistently:

- `src/` → runtime library/framework source code
- `docs/` → contributor-facing and consumer-facing documentation
- `.github/` → CI/CD and repository automation
- generated outputs → build products, not source of truth
- example/demo/playground code → usage surfaces, not core runtime architecture
- local scratch and machine-specific content → local-only by default

Do not mix temporary experiments or generated output into stable runtime paths.

## 4) Build and Workflow Contract

- Use the repository’s existing package manager and lockfile strategy.
- Use package scripts and existing documented commands before inventing wrappers.
- Keep validation non-destructive.
- Prefer stable defaults and opt-in for risky behavior.
- Match the actual repository shell/workflow style in examples.

## 5) Core Engineering Principles

- Prefer stable, reversible changes over broad speculative rewrites.
- Preserve runtime behavior unless behavior change is explicitly requested.
- Keep behavior deterministic where feasible.
- Prefer one clear control path over multiple hidden paths.
- Prefer narrow diffs and focused changes over repo-wide churn.
- Mark speculative ideas as speculative.

## 6) Refactoring and Architecture Rules

- Prefer incremental restructuring over big-bang rewrites.
- Do not introduce new architectural layers unless they remove a concrete recurring pain.
- Do not split code into more packages or parallel systems without strong justification.
- Avoid cargo-cult clean architecture and premature abstraction.
- Do not mix naming cleanup, architecture changes, and runtime behavior changes in one refactor unless explicitly requested.
- When proposing a refactor, identify:
  - target boundary
  - touched files/areas
  - expected payoff
  - risk level
  - validation method
  - rollback path

## 7) TypeScript and Code Quality Rules

Prefer modern TypeScript patterns that fit this repository:

- strict, readable typing
- explicit public API contracts
- exact option shapes where practical
- small focused functions and modules
- explicit state transitions over implicit side effects

For touched code:
- resolve warnings introduced by the change
- remove stale toggles and temporary probe code after validation
- prefer concrete, readable implementations over clever indirection
- do not introduce `any` unless explicitly justified and temporary
- avoid vague `object`
- minimize unsafe non-null assertions
- treat exported types with extra scrutiny

## 8) Runtime Boundary Rules

Keep these concerns clearly separated where possible:

- public API surface and consumer-facing types
- core/runtime orchestration
- renderer/backend-specific behavior
- shader or graphics-pipeline concerns
- resource loading and asset lifecycle
- storage/persistence behavior
- utilities and shared low-level helpers
- debug/diagnostics/example-only support code

Avoid mixing packaging concerns directly into runtime behavior.
Avoid mixing experimental backend work into stable runtime paths prematurely.

## 9) Packaging / Bundling Rules

- Treat exports, declarations, entrypoints, and artifact formats as public-facing infrastructure.
- Do not change package surface casually.
- Call out semver and downstream consumer impact explicitly.
- Prefer incremental modernization over broad build-tool churn unless strongly justified.

## 10) Resource / Storage Rules

- Treat loading, assets, caching, and IndexedDB/storage behavior as first-class design boundaries.
- Keep lifecycle ownership explicit.
- Keep factory/container typing strong and readable.
- Avoid vague cache semantics.
- Call out runtime behavior changes clearly when touching resource or persistence logic.

## 11) Risky Changes Policy

Risky changes include anything touching:
- public exports or consumer-facing types
- bundling or package entrypoints
- renderer/backend abstractions
- shader/backend contracts
- resource lifecycle or caching
- storage / IndexedDB behavior
- initialization flow
- release packaging behavior

For risky changes:
- gate risky logic behind explicit opt-in where appropriate
- keep risky paths disabled by default unless explicitly requested otherwise
- define expected success and rollback conditions before implementation
- avoid repeated blind attempts
- when iteration is not converging, stop churn, return to a stable baseline, and report one clear next step

## 12) Tests and Verification Rules

Use realistic verification.

Prefer automated checks for:
- type safety
- lint correctness
- build/package assertions
- declaration output sanity
- export surface validation
- smoke checks where practical

After edits:
- run the smallest relevant validation first
- then run broader verification only if justified by the scope

## 13) CI/CD and Release Rules

- Conventional Commits are preferred unless the repository documents a different convention.
- Keep release tags immutable; fix forward with a new version.
- Keep release outputs deterministic.
- Ensure required checks pass before merge or release.
- Add guardrails against shipping local-only or generated-only content as runtime package surface.

## 14) Documentation Rules

- Keep docs aligned with real workflows and implemented behavior.
- Remove stale docs when behavior is removed or changed.
- Prefer concise operational docs over speculative narrative in public-facing files.
- Keep public docs focused on what contributors and consumers actually need.

## 15) Assistant Working Style Rules

- Prefer concrete edits over abstract recommendations.
- If blocked, report the exact blocker and the best fallback.
- If repository visibility is incomplete, say what is known, what is inferred, and what is conditional.
- Do not flatter.
- Do not recommend overengineering.
- Keep runtime logic separate from generated output, examples, and local-only infrastructure.

## 16) Default Priorities

Unless explicitly overridden:
1. stability and reproducibility
2. correctness and determinism
3. runtime and consumer safety
4. code clarity and maintainability
5. contributor and consumer ergonomics
6. optional enhancements