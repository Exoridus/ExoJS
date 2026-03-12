# Claude Repository Rules — ExoJS

These rules apply to Claude Code and Claude agents working in this repository.

## 1) Operating Mode

- Work in English only for outputs, edits, summaries, comments, and commit suggestions.
- Prefer evidence-based analysis over generic best-practice commentary.
- Read the repository first; do not invent architecture facts.
- Keep changes small, reviewable, and independently verifiable.
- Prefer explicit tradeoffs over optimistic hand-waving.

## 2) Project Shape

ExoJS is a TypeScript-first browser multimedia / graphics / game-oriented library/framework.

High-value repository areas typically include:
- `src/` for runtime library source
- package/build/type configuration for the public consumer surface
- `docs/` for contributor and consumer documentation
- `.github/` for CI/CD

Generated outputs, temporary artifacts, and local-only experiments are not the architectural source of truth.

## 3) Phase Discipline

- Separate review/proposal work from implementation work unless explicitly asked to combine them.
- In review mode, do not start broad code edits.
- In implementation mode, do not silently expand scope into architecture cleanup unless current evidence requires it.
- If a task is under-specified, narrow it rather than solving a larger imaginary problem.

## 4) Core Technical Expectations

- Prefer strict TypeScript.
- Do not introduce `any` unless explicitly justified and temporary.
- Avoid vague `object` and weakly typed registries, containers, or options.
- Minimize unsafe non-null assertions.
- Treat exported types and public API contracts with extra scrutiny.
- Prefer exact option shapes, discriminated unions, and readable generic constraints where helpful.
- Preserve behavior unless behavior change is the actual task.

## 5) Architecture and Refactor Rules

- Prefer incremental restructuring over big-bang rewrites.
- Do not add new layers, adapters, or abstractions unless they remove a concrete recurring pain.
- Keep renderer/backend boundaries explicit.
- Keep resource lifecycle, storage, and persistence boundaries explicit.
- Do not bolt WebGPU support on as speculative parallel complexity; separate shared vs backend-specific responsibilities clearly.
- When proposing a refactor, identify:
  - target boundary
  - touched files/areas
  - expected payoff
  - risk level
  - validation method
  - rollback path

## 6) Packaging and Consumer Surface

- Treat package exports, declarations, artifact formats, and entrypoints as public-facing infrastructure.
- Do not change bundling or export behavior casually.
- Call out semver and downstream consumer impact explicitly.
- Prefer practical modernization over trend-driven tool churn.

## 7) Resource / Storage Rules

- Treat loading, assets, caching, and IndexedDB/storage behavior as first-class design boundaries.
- Keep lifecycle ownership explicit.
- Keep factory/container typing strong and readable.
- Call out runtime behavior changes clearly when touching resource or storage code.

## 8) Validation Rules

Use realistic verification.

Prefer relevant commands such as:
- typecheck
- lint
- build
- declaration generation
- tests where present
- narrow smoke validation where justified

After edits:
- run the smallest relevant validation first
- then run broader verification only if justified by scope

Do not claim success without stating what was actually verified.

## 9) Working Style

- Prefer concrete, repo-specific reasoning over abstract advice.
- If blocked, report the exact blocker and the best fallback.
- Distinguish clearly between:
  - confirmed repository facts
  - likely inferences
  - speculation
- Do not flatter.
- Do not recommend overengineering.
- Keep runtime concerns separate from generated/local-only infrastructure.

## 10) Default Priorities

Unless explicitly overridden:
1. stability and reproducibility
2. correctness and determinism
3. runtime and consumer safety
4. code clarity and maintainability
5. contributor and consumer ergonomics
6. optional enhancements