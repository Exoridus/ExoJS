# ExoJS Baseline Report (Initialization)

Date: 2026-03-09  
Mode: Initialization only (no runtime refactor, no dependency upgrades, no package behavior changes)

## Commands executed
1. `npm ci --ignore-scripts --no-audit --fund=false`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run build`
6. `npm run build:declarations`

## Status summary
- Install: PASS
- Lint: PASS
- Typecheck: PASS
- Tests: PASS (16 suites, 39 tests)
- Build: PASS
- Declaration build (TS 3.9 path): PASS

## Warnings observed
- `npm ci` printed dependency deprecation warnings (for example `inflight`, `rimraf@2.7.1`, `glob@7.1.6`, `sourcemap-codec@1.4.8`).
- `npm run build` reported circular dependency warnings:
  - `src/math/Vector.ts` <-> `src/utils/collision-detection.ts`
  - additional cycles through `src/math/Line.ts` and `src/math/Rectangle.ts`

## Current risk areas (observed, unfixed)

### Strict TypeScript quality blockers
- Lint explicitly allows weak patterns:
  - `@typescript-eslint/no-explicit-any: off` (`eslint.config.ts:29`)
  - `@typescript-eslint/no-non-null-assertion: off` (`eslint.config.ts:30`)
- Weak public typing in core abstractions:
  - `Signal<T = any>` and `context?: object` (`src/core/Signal.ts:7`, `src/core/Signal.ts:10`)
  - `IResourceFactory<SourceValue = any, TargetValue = any>` and `options?: object | null` (`src/types/IResourceFactory.ts:3`, `src/types/IResourceFactory.ts:8`)
  - `IDatabase.load<T = any>(...)` and `save(..., data: any)` (`src/types/IDatabase.ts:8`, `src/types/IDatabase.ts:9`)
- Weakly typed resource containers/queues:
  - `Map<string, any>` usage (`src/resources/ResourceContainer.ts:1`, `src/resources/ResourceContainer.ts:6`)
  - queue item options and add-items object bag (`src/resources/Loader.ts:26`, `src/resources/Loader.ts:112`)
  - `loadItem` intermediate `any` values (`src/resources/Loader.ts:151`, `src/resources/Loader.ts:152`)
- Renderer and utility code includes `any` helpers in operational paths:
  - GL debug callback args (`src/rendering/RenderManager.ts:23`, `src/rendering/RenderManager.ts:27`, `src/rendering/RenderManager.ts:35`)

### Bundling and publication concerns
- Packaging uses legacy field set without explicit `exports` map:
  - `main`/`module`/`browser`/`types` fields present (`package.json:9`-`package.json:12`)
- Root public export excludes direct `resources` re-export:
  - root exports include rendering/util/core/etc but not `./resources/index` (`src/index.ts:1`-`src/index.ts:8`)
- Build pipeline is dual-TypeScript and intentionally constrained:
  - modern TS for checks + `typescript-3-9` for Rollup/declaration compatibility (`rollup.config.js:6`, `package.json:17`, `package.json:58`)
- CI coverage is narrower than local push gate:
  - CI runs lint/build/declarations (`.github/workflows/ci.yml:37`-`.github/workflows/ci.yml:43`)
  - pre-push also runs typecheck/test (`.husky/pre-push:3`, `.husky/pre-push:4`)

### Asset and storage concerns
- Resource typing and persistence boundaries are broad:
  - loader item options and add-items typed as generic `object` (`src/resources/Loader.ts:26`, `src/resources/Loader.ts:112`)
  - IndexedDB save accepts `data: any` (`src/resources/IndexedDbDatabase.ts:96`)
  - abstract factory create signature accepts broad options bag (`src/resources/factories/AbstractResourceFactory.ts:10`)
- JSON factory currently returns broad `object` types rather than exact shapes (`src/resources/factories/JsonFactory.ts:3`, `src/resources/factories/JsonFactory.ts:7`, `src/resources/factories/JsonFactory.ts:11`)

### Renderer and WebGPU-readiness concerns
- Rendering path is strongly coupled to WebGL2:
  - context creation explicitly requests `'webgl2'` (`src/rendering/RenderManager.ts:417`)
  - manager and renderer contracts use `WebGL2RenderingContext` directly (`src/rendering/RenderManager.ts:42`, `src/rendering/AbstractRenderer.ts:23`)
  - shader lifecycle is WebGL2-specific throughout (`src/rendering/shader/Shader.ts`)
- Backend seam is currently render-manager-centric rather than backend-interface-centric:
  - renderers directly connect to `RenderManager` and GL state mutation methods (`src/rendering/IRenderer.ts`, `src/rendering/RenderManager.ts`)

## Notes
- Baseline is intentionally strict and observational only.
- No `src/` runtime behavior was changed during this initialization pass.
