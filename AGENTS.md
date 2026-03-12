# AI Repository Rules — ExoJS

These rules apply to all AI assistants working in this repository, including Claude, Codex, Gemini, and similar coding agents.

## 1) Project Purpose and High-Level Shape

This repository is ExoJS, a TypeScript-first browser multimedia / graphics / game-oriented library/framework.

It contains:
- runtime library code in `src/`
- package metadata and publication surface in `package.json` and related config files
- build, bundling, type generation, and workflow configuration in repository config files and scripts
- contributor and operational documentation in `docs/`
- CI/CD and repository automation in `.github/`
- examples, demos, playgrounds, or generated outputs only if they are explicitly present in the repository

Treat generated outputs and local scratch artifacts as development infrastructure, not as runtime architecture and not as the public source of truth.

## 2) Repository Structure Rules

Use these boundaries consistently:

- `src/` → runtime library/framework source code only
- `docs/` → contributor-facing and consumer-facing documentation
- `.github/` → CI/CD and repository automation
- generated output directories such as `dist/`, `build/`, coverage output, temporary bundles, or declaration artifacts → generated content, not source of truth
- example/demo/playground directories, if present → usage and validation surfaces, not core runtime architecture
- local scratch, experiments, perf notes, temporary exports, and machine-specific files → local-only unless explicitly promoted and documented

Do not move temporary experiments or generated artifacts into runtime paths.

## 3) Runtime vs Generated / Local Rules

Only a subset of the repository is runtime-critical and should drive architecture decisions.

Runtime-critical:
- `src/`
- package metadata that defines the public consumer surface
- runtime-facing documentation where it reflects actual supported behavior

Generated / local / non-authoritative by default:
- compiled bundles
- emitted declaration artifacts
- coverage output
- temporary repro files
- local performance notes
- machine-specific configuration
- ad-hoc experiments

Do not treat generated bundle output as architecture truth.
Do not make release logic depend on undocumented local-only state unless explicitly intended and clearly documented.

## 4) Build and Workflow Contract

- Use the repository’s existing package manager and lockfile strategy as the canonical workflow surface.
- Use the commands already defined in `package.json` before introducing new wrappers.
- Do not add parallel wrapper commands unless explicitly requested.
- Keep verification commands non-destructive.
- Prefer stable defaults and opt-in for risky behavior.
- Use shell examples that match the actual repository workflow.

## 5) Core Engineering Principles

- Prefer stable, reversible changes over broad speculative rewrites.
- Preserve runtime behavior unless behavior change is explicitly requested.
- Keep behavior deterministic where feasible.
- Use one clear control path instead of multiple hidden paths.
- Prefer minimal production surface area.
- Prefer narrow diffs and focused changes over repo-wide churn.
- State assumptions, tradeoffs, and risks explicitly.
- Mark speculative ideas as speculative.

## 6) Refactoring and Architecture Rules

- Prefer incremental restructuring over big-bang rewrites.
- Do not introduce new architectural layers unless they remove a concrete recurring pain.
- Do not split code into additional packages, projects, or parallel systems without strong justification.
- Do not introduce abstraction layers purely as future-proof theater.
- Do not add interfaces, adapter layers, or indirection unless multiple implementations, testing seams, or true boundary clarity require them.
- Avoid cargo-cult clean architecture and premature abstraction.
- Do not mix naming cleanup, architecture changes, and runtime behavior changes in one refactor unless explicitly requested.
- Keep PR-sized changes small, reviewable, and independently verifiable.
- When proposing a refactor, identify:
  - target boundary
  - touched files/areas
  - expected payoff
  - risk level
  - validation method
  - rollback path

## 7) Runtime Boundary Rules

Keep these concerns clearly separated inside runtime code:

- public API surface and consumer-facing types
- core/runtime orchestration
- renderer/backend-specific behavior
- shader or graphics-pipeline concerns
- resource loading and asset lifecycle
- storage and persistence behavior
- math / utility / shared low-level helpers
- debug, diagnostics, examples, and development-only support code

Avoid mixing packaging concerns directly into runtime behavior.
Avoid mixing storage-specific behavior directly into renderer logic.
Avoid mixing experimental backend work into stable runtime paths prematurely.

## 8) TypeScript-First Rules

Prefer standard modern TypeScript patterns that fit this repository:

- strict, readable typing
- explicit public API contracts
- clear small functions with focused responsibility
- exact option types over vague catch-all bags
- explicit state transitions over implicit side effects
- one primary concept per file unless tight cohesion justifies grouping
- filename matches the primary export or responsibility where practical

Naming conventions:
- `PascalCase` for types, classes, interfaces, enums, and public constants
- `camelCase` for functions, methods, locals, and parameters
- avoid ambiguous names that hide lifecycle, ownership, or backend responsibility

For touched code:
- resolve warnings introduced by the change
- remove stale toggles, dead branches, and temporary probe code after validation
- prefer concrete, readable implementations over clever indirection
- do not introduce `any` unless explicitly justified and temporary
- avoid vague `object` and weakly typed registries/containers
- minimize unsafe non-null assertions
- treat exported types with extra scrutiny

## 9) Packaging / Bundling Rules

Treat packaging, exports, declarations, and build artifacts as public-facing infrastructure.

Rules:
- do not change export shape casually
- do not churn bundle formats without a concrete payoff
- call out semver and consumer-impact implications explicitly
- prefer incremental modernization over a full toolchain rewrite unless strongly justified
- keep the package surface intentional and understandable
- prefer predictable artifact generation and validation

## 10) Resource / Storage Rules

Resource loading, asset handling, caching, and persistence are first-class design boundaries.

Rules:
- keep resource lifecycle and ownership explicit
- keep factory/container/registry typing strong and reviewable
- treat persistence and IndexedDB boundaries as explicit contracts
- avoid vague cache semantics
- do not hide failure modes behind overly generic abstractions
- call out runtime behavior changes clearly when touching loading or storage

## 11) Risky Changes Policy

Risky changes include anything touching:
- public exports or consumer-facing types
- bundling or package entrypoints
- renderer/backend abstractions
- shader/backend contracts
- resource lifecycle or asset caching behavior
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

Use realistic verification, not fake ceremony.

Prefer automated checks for:
- type safety
- lint correctness
- build/package assertions
- declaration output sanity
- export surface validation
- smoke checks for consumer-facing usage where practical
- deterministic resource/config behavior where applicable

Do not force artificial test seams into tightly runtime-coupled code unless there is clear payoff.

After edits:
- run the smallest relevant validation first
- then run broader verification only if justified by the scope

## 13) CI/CD and Release Rules

- Conventional Commits are preferred unless the repository already uses a different documented convention.
- Keep release tags immutable; fix forward with a new version.
- Keep release outputs deterministic.
- Ensure required checks pass before merge or release.
- Add guardrails against accidentally shipping local-only, generated-only, or example-only content as runtime package surface.

## 14) Documentation Rules

- Keep docs aligned with real workflows and implemented parameters.
- Remove stale docs when behavior is removed or changed.
- Prefer concise operational docs over speculative narrative in public-facing files.
- Keep public docs focused on what contributors and consumers actually need.
- When behavior differs between internal architecture and public usage, document both clearly.

## 15) Assistant Working Style Rules

- Prefer concrete edits over abstract recommendations.
- If blocked, report the exact blocker and the best fallback.
- If repository visibility is incomplete, say what is known, what is inferred, and what is conditional.
- Do not flatter.
- Do not recommend overengineering.
- Do not assume enterprise patterns are automatically appropriate for a browser library/framework.
- Keep runtime logic separate from generated output, examples, and local-only infrastructure.
- Work in English for summaries, code comments, config text, commit suggestions, and documentation unless explicitly instructed otherwise.

## 16) Default Priorities

Unless explicitly overridden:
1. stability and reproducibility
2. correctness and determinism
3. runtime and consumer safety
4. code clarity and maintainability
5. contributor and consumer ergonomics
6. optional enhancements