# ExoJS Repository Map

Last updated: 2026-03-09 (Codex initialization pass)

## 1) Package and build surface
- Package: `exojs` (`package.json`)
- Published files: `dist`, `README.md`
- Main artifacts:
  - `main`: `dist/exo.js` (CJS)
  - `module`: `dist/exo.esm.js` (ESM)
  - `browser`: `dist/exo.bundle.js` (IIFE global `Exo`)
  - `types`: `dist/exo.d.ts`
- Entry source for bundle: `src/index.ts`

## 2) Tooling and configs
- TypeScript:
  - `tsconfig.json`: strict mode enabled, baseUrl `src`, target `es2020`
  - `tsconfig.declaration.json`: declaration-only single-file output (`dist/exo.d.ts`)
- Lint: `eslint.config.ts` (ESLint 9 + typescript-eslint)
- Test: `jest.config.ts` (`ts-jest`, `jsdom`, root `test/`)
- Bundle: `rollup.config.js` (Rollup 2, shader string imports for `.vert`/`.frag`)
- CI: `.github/workflows/ci.yml` (currently runs lint + build + declaration build)
- Local push gate: `.husky/pre-push` (runs lint + typecheck + test + build + declarations)

## 3) Module boundaries (`src/`)
- `rendering` (32 files): WebGL2 render stack, shaders, textures, drawables, views.
- `math` (18 files): vectors, matrices, transforms, primitives, geometry helpers.
- `input` (15 files): keyboard/gamepad/pointer handling and mappings.
- `types` (15 files): shared engine, rendering, input, resource/storage typing.
- `particles` (15 files): particle system, emitters/affectors, renderer.
- `resources` (14 files): loader, resource container, factories, IndexedDB backend.
- `core` (12 files): app lifecycle, scene graph, timing, signals, color/bounds/quadtree.
- `utils` (8 files): helper modules for core/math/rendering/resources/audio context.
- `audio` (4 files): music/sound/analyser.
- `vendor` (1 file): WebGL debug helper.

## 4) Public entrypoints and exports
- Root entrypoint: `src/index.ts`
- Re-exported at root:
  - `utils`, `types`, `core`, `audio`, `input`, `math`, `particles`, `rendering`
- Not directly re-exported at root:
  - `resources/index.ts` (exists but is not re-exported by `src/index.ts`)

## 5) Runtime architecture seams
- Application lifecycle seam:
  - `core/Application.ts` wires loader, render manager, input manager, scene manager.
- Scene/transform seam:
  - `core/SceneNode.ts` + `math/Transformable.ts`
  - Convention documented in `docs/TRANSFORM_CONVENTIONS.md`.
- Renderer seam:
  - `rendering/RenderManager.ts` owns context/state and renderer selection.
  - Renderer contract in `rendering/Renderer.ts`.
- Resource pipeline seam:
  - `resources/Loader.ts` + `resources/factories/*` + `resources/ResourceContainer.ts`
  - Optional persistence via `resources/IndexedDbDatabase.ts`.

## 6) Resource loading, rendering, storage, consumption notes
- Resource loading:
  - Queue-based loader with factory dispatch by `ResourceTypes`.
  - Fetch path and optional IndexedDB cache fallback.
- Rendering:
  - WebGL2-centric context and APIs (`WebGL2RenderingContext` used broadly).
  - Shader sources imported from `.vert`/`.frag` at build-time.
- Storage:
  - IndexedDB implementation creates/deletes stores based on `ResourceTypes`.
- Package consumption:
  - Multi-format bundles plus single d.ts output.
  - No explicit `exports` map in current `package.json`.

## 7) Baseline commands available
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run build:declarations`
