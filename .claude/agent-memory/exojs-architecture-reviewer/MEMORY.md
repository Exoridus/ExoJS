# ExoJS Architecture Reviewer Memory

## Repository Overview
- TypeScript-first browser multimedia/game library (WebGL2)
- Single package: `exo-js-core`, version 1.0.20
- Entry: `src/index.ts`, outputs CJS + ESM + IIFE via Rollup 4
- Single runtime dependency: `earcut` (polygon triangulation)
- Vendor: `webgl-debug.js` (1191 lines, Khronos, plain JS)

## Confirmed Architecture Facts
- `strict: true` in tsconfig, typecheck passes clean
- ESLint 9 flat config with typescript-eslint, passes clean
- Zero `any` in authored TypeScript (eslint rule is `off` but none used)
- 20 test suites, 47 tests, all passing (Jest + jsdom)
- Signal: tuple-based generics `Signal<Args extends Array<unknown>>`
- ResourceContainer: typed via `IResourceTypeMap` keyed by `ResourceTypes` enum
- IResourceFactory: generic `<SourceValue, TargetValue, Options>`
- Renderer lifecycle: null-safe connection objects pattern (PrimitiveRenderer uses connection object, AbstractRenderer uses nullable fields)
- Audio lifecycle: `_audioSetup` pattern for Sound, Music, Video
- ShaderMappings extracted to dedicated file
- Package exports field properly configured with types/import/require/default

## Public API Constraints
- Exports: single entrypoint `.` with types, import, require, default
- Declaration: single `outFile: dist/exo.d.ts` via tsconfig.declaration.json
- `sideEffects: false` declared
- Consumer-facing types re-exported via barrel files through src/index.ts

## Tooling Constraints
- Rollup 4 with @rollup/plugin-typescript, rollup-plugin-string (for .vert/.frag)
- Jest 29 with ts-jest, jsdom environment
- Husky for git hooks
- tsconfig: target es2020, module esnext, moduleResolution node
- baseUrl: src (path aliases like `rendering/Foo`, `types/Bar`)

## Known Issues (as of 2026-03-09 review)
- `Readonly<T>` type in types.ts shadows built-in TypeScript `Readonly`
- `object` used for Signal context parameter (justified: mirrors EventEmitter pattern)
- ~15 non-null assertions remain, most in render/texture lifecycle
- Loader.loadItem uses `unknown` throughout (factory type erasure at map boundary)
- rollup-plugin-string is unmaintained; @rollup/plugin-replace or raw plugin recommended
- webgl-debug.js is vendored plain JS (1191 lines), only used in debug mode
- No tests for: Signal, SceneManager, math types beyond circle/ellipse/polygon/matrix, shader, audio
