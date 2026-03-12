# Packaging Review — March 2026

## Scope

Initial review of ExoJS packaging, bundling, and consumer DX.
Review-only pass. No implementation.

## Key Findings

### 1. Build toolchain is severely version-lagged

- Rollup 2.15.0 released ~mid-2020. Current is Rollup 4.x.
- rpt2 (rollup-plugin-typescript2) 0.27.1 released ~2020. Current is 0.36.x.
- @rollup/plugin-node-resolve 8.0.1 (current is 15.x), @rollup/plugin-commonjs 14.0.0 (current is 28.x).
- TS 5.9.3 is installed, but rpt2 0.27.1 has no design-time knowledge of TS 5.x features. It works via the generic TS compiler API, so it does not break, but it provides no guarantees for new TS 5.x language features in the build path.
- The mismatch is latent risk, not an active fire, but it is technical debt.

### 2. Declaration strategy has a known structural problem

- `tsconfig.declaration.json` extends the base config (`module: "esnext"`, `moduleResolution: "node"`).
- It uses `outFile: "dist/exo.d.ts"`, which requires `module` to be `"amd"` or `"system"` for tsc to bundle declarations into a single file.
- With `module: "esnext"` inherited, tsc may silently accept `outFile` for declarations only, but the result is unpredictable across TS versions.
- In practice, TS allows `emitDeclarationOnly + outFile` with ESM module mode as of TS 4.x, but the output is a concatenated `.d.ts` with internal module wrapping quirks.
- The single-file declaration approach is fragile. A consumer using `moduleResolution: "bundler"` or `"node16"` may get incorrect type resolution.

### 3. No `exports` field

- Without `exports`, any file inside `dist/` is technically importable by consumers.
- `main`/`module`/`browser` are legacy fields. Modern bundlers (Vite, webpack 5+, esbuild, Rollup itself) prefer `exports`.
- Node.js 12+ uses `exports` for proper subpath resolution and dual-package disambiguation.
- Without `exports`, there is no way to prevent consumers from reaching internal dist paths.

### 4. No `sideEffects` field

- Modern bundlers use `sideEffects` for tree-shaking. Without it, the whole bundle is assumed to have side effects.
- However: `src/utils/audio-context.ts` and `src/utils/core.ts` both execute DOM/Web API calls at module parse time.
  - `audio-context.ts`: instantiates AudioContext, OfflineAudioContext, registers 3 document event listeners
  - `core.ts`: calls document.createElement('audio'), document.createElement('canvas'), getContext('2d'), window.addEventListener(...)
- These are real, observable side effects at import time. Setting `sideEffects: false` on the whole package would be incorrect and would allow bundlers to drop these files even when their exports are used in ways that depend on the initialization.
- A partial `sideEffects` array listing only these two files as true side effects would be technically correct but fragile to maintain.
- The deeper fix is to move these module-level executions behind lazy initializers. That is a source-level change, not a packaging change.

### 5. CJS / ESM / IIFE output strategy assessment

- CJS (`dist/exo.js`): serves `require()` consumers and older toolchains. Reasonable to keep.
- ESM (`dist/exo.esm.js`): served via `module` field, a non-standard Webpack/bundler convention. Modern packages should express this through `exports["import"]` instead. The `module` field still works but is legacy.
- IIFE (`dist/exo.bundle.js`): served via `browser` field. This is appropriate for `<script>` tag usage, CDN, and game dev playground scenarios (the IIFE with `name: 'Exo'` makes sense for this library type). Keep it.
- Assessment: the three-format strategy is reasonable for a multimedia/game library. ESM + IIFE are the most valuable for consumers. CJS is legacy utility. The issue is not the formats, but the absence of `exports` to express them correctly.

### 6. Single-file declaration strategy assessment

- Pros: simple for consumers — one import, one type file, no need to follow `dist/` tree.
- Cons: the `outFile` + `emitDeclarationOnly` path has documented TS quirks; re-export aliasing may collapse; ambient module merging may not work correctly in all cases.
- Modern alternative: emit per-file `.d.ts` alongside the ESM build, with `exports` pointing each condition to the right `.d.ts` file, or emit a single rollup via `dts` (a dedicated Rollup `.d.ts` plugin).
- The current approach works well enough for a flat single-entry package, but the `outFile` dependency on internal TS behavior is a maintenance risk.
- Recommendation: eventually migrate to `rollup-plugin-dts` or `@microsoft/api-extractor` for declaration bundling, but this is lower priority than fixing the `exports` field and the toolchain version lag.

### 7. Source maps assessment

- `tsconfig.json` has `sourceMap: true`, but the Rollup config does not pass `sourcemap: true` to any output.
- The declaration build does not emit source maps (expected).
- Result: no source maps in `dist/`. Consumers get no debugging path back to source.
- For a game/multimedia library, source map shipping is a meaningful DX improvement.
- Risk: source maps increase dist size. For CDN/IIFE consumers this may matter slightly.
- Recommendation: add `sourcemap: true` to the ESM output at minimum. CJS and IIFE are lower priority.

### 8. Rollup/plugin modernization assessment

- Rollup 4.x has significant improvements: native ESM config, better tree-shaking, faster builds, built-in output size reports, better TypeScript support via `@rollup/plugin-typescript` (official Rollup plugin, separate from rpt2).
- `@rollup/plugin-typescript` is now the recommended path for Rollup + TS, replacing the third-party rpt2.
- `rollup-plugin-cleaner` is also outdated (1.0.0, last updated ~2019). Rollup 4+ has a native `cleanOnce` option or a simple shell command suffices.
- `rollup-plugin-string` is still actively maintained and serves the `.vert`/`.frag` inline use case — keep it or find a Rollup 4-compatible equivalent.
- Assessment: Rollup upgrade from 2.x to 4.x is a meaningful investment. It is the biggest modernization lever, but also the highest-risk single change because it touches the entire build pipeline.
- Sequencing: fix `exports` and `sideEffects` first (lower risk), then upgrade Rollup toolchain.

### 9. Node/browser typing pollution

- `tsconfig.json` includes `"lib": ["es2020", "dom", "dom.iterable"]` — this is correct for a browser-only library.
- `@types/node@^13.13.10` is in devDependencies, which is extremely outdated (v13 from 2020 covers Node 10.x era).
- The Node types are used for build tooling (ts-node, Jest, rollup config) but are not runtime dependencies.
- Node types leaking into consumer type space is possible if `types` is not explicitly excluded. The tsconfig does not set `types: []` in the main config (only in the declaration config).
- The declaration tsconfig sets `"types": []` which should prevent Node type bleed into the declaration file — this is correct.
- `@types/node` should be upgraded to match actual Node version (22 in CI).

### 10. Package surface cleanliness

- `files: ["dist", "README.md"]` — clean, but `README.md` does not currently exist in the repo (not seen in glob). This may silently include a missing file without error.
- No `LICENSE` file is explicitly listed in `files` — but npm includes `LICENSE` by default regardless.
- The `prepare` script runs husky. With `--ignore-scripts` in CI, this is correctly skipped.
- `gitmoji-cli` in devDependencies is a contributor tool, not a build tool — acceptable.

### 11. Downstream consumer ergonomics summary

A consumer today who does:
```ts
import { Application, Vector } from 'exo-js-core';
```
...will:
- Get the CJS bundle via `main` on Node/bundler with CJS resolution
- Get the ESM bundle via `module` on webpack/Rollup
- Have no subpath imports available
- Have no tree-shaking guarantees
- Have `dist/exo.d.ts` as their type file

For a game library that consumers use in browser apps with bundlers, this is functional but suboptimal.
