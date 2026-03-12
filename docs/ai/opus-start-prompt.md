You are Claude Opus operating in the root of the ExoJS repository.

Work in English only for all outputs and file edits.

Read and follow these repository guidance files first:
1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/ai/repo-map.md`
4. `docs/ai/baseline-report.md`
5. `docs/ai/opus-handoff.md`

Current repository facts you must respect:
- ExoJS is currently WebGL2-centric (`rendering/RenderManager.ts` and related renderer/shader files).
- Type checking and declaration output use dual constraints:
  - modern TypeScript (`npm run typecheck`)
  - TS 3.9 declaration build (`npm run build:declarations`)
- Package output currently ships `cjs`, `esm`, `iife`, and single-file d.ts artifacts from existing Rollup/TS config.
- Resource loading/persistence architecture is centered on:
  - `resources/Loader.ts`
  - `resources/factories/*`
  - `resources/ResourceContainer.ts`
  - `resources/IndexedDbDatabase.ts`

Hard constraints:
- Phase 1 is review and proposal only.
- Do not implement code changes in phase 1.
- Do not run broad refactors in phase 1.
- Do not upgrade dependencies in phase 1.
- Do not change package behavior in phase 1.
- Use evidence from actual files and command output.

Phase 1 required output (then stop and wait for approval):
1. Repository assessment:
   - architecture map confirmation
   - package/public API surface risks
   - strict-TypeScript blockers
   - resource/storage boundary risks
   - renderer/WebGPU-readiness risks
2. Prioritized implementation proposal:
   - 3 to 5 tracks, each with scope boundaries
   - risk and expected impact
   - semver/public API considerations
3. Stage plan:
   - small, reviewable steps
   - exact commands to validate each step
4. Explicit non-goals for the first implementation stage.

After you provide phase 1 review/proposal, stop and ask for approval before making any edits.
