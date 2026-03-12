# ExoJS Bundling and DX Modernizer — Agent Memory

## Packaging Overview

- Package name: `exo-js-core` | Version: `1.0.20`
- Entry: `src/index.ts` (star-re-exports all sub-module indexes)
- Single runtime dependency: `earcut@^2.2.2`
- No external consumers currently. Clean-slate packaging decisions are safe.

## Export Policy (current as of review phase, March 2026)

- `main`: `dist/exo.js` (CJS)
- `module`: `dist/exo.esm.js` (ESM — non-standard Webpack/Rollup field)
- `browser`: `dist/exo.bundle.js` (IIFE, global `Exo`)
- `types`: `dist/exo.d.ts` (single-file, bundled declaration via `outFile`)
- No `exports` field — not present yet
- No `sideEffects` field — not present yet

## Build Artifact Constraints

- Rollup 2.15.0 (very old, released ~2020) with rpt2 0.27.1
- TypeScript 5.9.3 is installed but rpt2 0.27.1 was written for TS ~3.x/4.x
- `@rollup/plugin-node-resolve@8.0.1` and `@rollup/plugin-commonjs@14.0.0` — both ~2020 vintage
- Declaration strategy: `tsc -p tsconfig.declaration.json` with `outFile: "dist/exo.d.ts"` (requires `module: "amd"` or `"system"` semantics for outFile — currently inherits `module: "esnext"` from base, which is a known bug risk)
- No source maps shipped to consumers (tsconfig has `sourceMap: true` but declarations build is separate)
- No `tslib` helper injection configured in rpt2

## Known Sideeffect Risks (blocks `sideEffects: false`)

- `src/utils/audio-context.ts`: runs `new AudioContext()`, `new OfflineAudioContext()`, and registers DOM event listeners at module parse time — definite side effect
- `src/utils/core.ts`: calls `document.createElement('audio')`, `document.createElement('canvas')`, `.getContext('2d')`, `window.addEventListener(...)` at module parse time — definite side effect
- These files are exported from `src/utils/index.ts` -> `src/index.ts`
- `sideEffects: false` would be incorrect and dangerous. At most, a selective `sideEffects` array could list only safe files.

## Module Resolution Issues

- tsconfig uses `moduleResolution: "node"` (classic Node resolution)
- Bare path imports like `'core/Signal'`, `'math/Size'`, `'types/rendering'`, `'particles/affectors/IParticleAffector'` are resolved via `baseUrl: "src"` — works for tsc and ts-jest (via moduleNameMapper) but not for Rollup without node-resolve
- Rollup node-resolve plugin handles this, but `mainFields: ['module', 'main', 'browser']` ordering is non-standard

## CI State

- Single job: `verify` — runs typecheck, lint, test, build bundles, build declarations in sequence
- Node 22, npm, ubuntu-latest
- `npm ci --ignore-scripts` — husky prepare hook is skipped in CI (correct)
- No release/publish job — manual publish assumed
- No artifact upload or publish step in CI

## Accepted Modernization Decisions

(none finalized yet — review phase only as of March 2026)

## Rejected / Deferred

(none yet)

## Detailed Notes

See `packaging-review-2026-03.md` for full assessment from initial review session.
