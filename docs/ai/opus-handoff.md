# ExoJS Opus Handoff

Last updated: 2026-03-09 (after Codex initialization pass)

## What Codex initialized
- Strengthened repository AI guidance:
  - `AGENTS.md` (strict review and typing expectations, English-only policy, semver/API discipline).
  - `CLAUDE.md` (Claude-specific persistent guidance aligned with ExoJS constraints).
  - `.codex/config.toml` (minimal conservative Codex defaults).
- Added focused Claude subagents in `.claude/agents/`:
  - `exojs-architecture-reviewer`
  - `exojs-strict-typescript-migrator`
  - `exojs-bundling-and-dx-modernizer`
  - `exojs-assets-and-storage-hardener`
  - `exojs-webgpu-architecture-advisor`
- Added AI project docs:
  - `docs/ai/repo-map.md`
  - `docs/ai/baseline-report.md`
  - `docs/ai/opus-start-prompt.md`

## Baseline snapshot
- Baseline commands executed and documented in `docs/ai/baseline-report.md`.
- Current result: all baseline commands pass.
- Notable warnings:
  - dependency deprecation warnings during `npm ci`
  - Rollup circular dependency warnings involving `math/Vector`, `math/Line`, `math/Rectangle`, and `utils/collision-detection`

## What remains intentionally unfixed
- No runtime architecture refactor was started.
- No broad `src/` TypeScript rewrites were performed.
- No dependency upgrades were performed.
- No package behavior changes were made.
- Existing weak typing patterns (`any`, vague `object`, non-null assertions) remain for a planned phase.
- Existing bundling/export strategy remains unchanged.
- Existing resource/storage and renderer boundaries remain unchanged.

## Highest-priority implementation tracks (for later, after review approval)
1. Strict type-boundary hardening:
   - resource loader/factory/database/container contracts
   - signal/event typing
   - reduce non-null assertions in renderer/audio/resource code paths
2. Public API and packaging discipline:
   - verify intended root exports and semver surface
   - evaluate `exports` strategy and declaration/public type hygiene
3. Resource and persistence hardening:
   - typed queue item options and resource maps
   - error-mode consistency for fetch/decode/indexedDB fallback
4. Renderer architecture seam work:
   - isolate WebGL2 assumptions behind cleaner backend seams
   - prepare staged WebGPU-readiness plan without backend rewrite
5. CI and validation parity:
   - align CI coverage with local validation expectations where appropriate

## Repo-specific caveats Opus must respect
- Keep English-only output and file content.
- Preserve behavior unless explicitly approved to change.
- Keep changes small and reviewable.
- Maintain compatibility with both:
  - `npm run typecheck` (modern TS)
  - `npm run build:declarations` (TS 3.9 path)
- Treat package export surface as semver-sensitive.
- Avoid speculative dependency churn.
- Use evidence from this repository; do not rely on generic templates.

## Suggested sequence for next phase
1. Run strict review/proposal only (no implementation).
2. Produce a staged plan with risk matrix and validation checkpoints.
3. Wait for user approval.
4. Implement approved stage 1 only, then re-validate and report.
