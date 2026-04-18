# Changelog

All notable changes to ExoJS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-04-18

Product-readiness release. Additive across assets, game-feel, visuals, performance, optional physics, and WebGPU parity. No public contracts were removed or renamed since v2.0.0.

### Highlights

- Typed asset manifests and bundle loading workflow.
- `AnimatedSprite` with named clips, loop control, and frame signals.
- Scene stacking with participation policies, input routing, and fade transitions.
- View/camera polish: follow with lerp, bounds clamp, zoom, shake.
- Audio sprites and sound pooling.
- Visual capability wave: filter pipeline, masking, render passes, cache-as-bitmap, multi-texture batching on the WebGPU backend.
- Automatic off-screen culling with observable render stats.
- Optional Rapier physics integration behind an optional peer dependency.
- WebGPU parity improvements and clearer initialization failure semantics.
- Docs and examples overhaul; release verification hardening.

### Assets / workflow

- `defineAssetManifest`, `AssetEntry`, and `loadBundle` with progress callbacks.
- `BundleLoadError` surfaces per-entry failures with the responsible loader token.
- Strict manifest validation runs at definition time.
- `CacheStore` + `IndexedDbStore` remain the persistence path; strategy classes (`CacheFirstStrategy`, `NetworkOnlyStrategy`) are exposed for custom pipelines.

### Game-feel

- `AnimatedSprite`: `defineClip`, `setClips`, `play`, `stop`, `loop` override, `onComplete` and `onFrame` signals.
- `SceneManager` is now a real stack: `pushScene`, `popScene`, `setScene` with resolved `SceneParticipationPolicy` covering stack mode and input mode.
- `SceneInputEvent` routing honours stack participation so overlay/modal scenes can intercept input cleanly.
- Fade transitions integrated into scene switching.
- `View` camera: `follow` with lerp, `setBoundsConstraint`, `zoom`/`setZoom`, `shake` with decay and configurable frequency.
- `Sound`: `setPoolSize`, `playPooled`, `stopPooled`, `defineSprite`, `setSprites` for audio-sprite playback.

### Rendering / visuals

- Filter pipeline: abstract `Filter` base with `BlurFilter` and `ColorFilter` implementations; per-node filter chains wired through the render runtime.
- Masking support in both render managers and on `RenderNode`.
- Render-pass composition: `RenderTargetPass`, `CallbackRenderPass`, `RenderTarget`, and the existing `RenderTexture` for off-screen work.
- `RenderNode.cacheAsBitmap` flattens expensive subtrees to a cached texture with invalidation.
- `Container.sortableChildren` + `SceneNode.zIndex` provide depth-sorted rendering with a stable fallback on insertion order.
- Multi-texture batching on the WebGPU sprite renderer (`textureSlots`, `maxBatchTextures`). See caveat below.
- WebGPU sprite, particle, and primitive renderers reached functional parity with the WebGL2 equivalents.
- Context-loss handling preserved.

### Performance

- Automatic off-screen culling: `Drawable` checks `inView(view)` each frame and counts skipped nodes.
- `RenderStats` exposes `submittedNodes`, `culledNodes`, `drawCalls`, `batches`, `renderPasses`, and `frameTimeMs` for observability.
- Hot-path cleanup across the renderers.
- `npm run perf:benchmark` runs the rendering benchmark harness under `test/perf/`.

### Physics

- Optional Rapier integration via `createRapierPhysicsWorld({ gravityY })`.
- `@dimforge/rapier2d-compat` is declared as an optional `peerDependency`; apps that do not import the physics entry point incur zero runtime cost.
- Collision groups/masks encoded into Rapier's 16/16 packed format; `PhysicsCollisionFilter` lets you declare membership and what each body collides with.
- Triggers vs. solid colliders distinguished via `trigger` on the descriptor; `onTriggerEnter` / `onTriggerExit` signals on the body.
- Transform sync helpers and a `createDebugGraphics`/`updateDebugGraphics` path for debug draw through the existing `Graphics` primitive.

### WebGPU

- Sprite, particle, and primitive renderers now cover the WebGL2 feature surface used by the scene runtime.
- Explicit `backend: { type: 'webgpu' }` errors out if WebGPU is unavailable or initialization fails — failures are not silently swallowed.
- `backend: { type: 'auto' }` prefers WebGPU when `navigator.gpu` is present and falls back to WebGL2 only when the WebGPU init path throws.
- Initialization error paths are now observable through the thrown error rather than partially constructed state.

### Docs / examples

- README rewritten to match the shipped surface.
- New docs hub under `docs/` with sections for getting-started, core-concepts, assets, scenes, rendering, audio, physics, performance, and examples.
- New class-focused API pages: `Application`, `Renderer`, `Graphics`, `AnimatedSprite`, `AssetManifests`, `Audio`, `View`, `VisualEffects`, `PhysicsRapier`, `Performance`, `GameFeel`.
- `examples/` folder contains focused source snippets (`01-quickstart.ts` … `08-physics-rapier.ts`) that are typechecked against the public API via `tsconfig.examples.json`.

### Tooling / release quality

- `npm run typecheck:examples` typechecks the in-repo examples against `src/` to prevent example drift.
- `npm run verify:exports` validates the package entry graph (`scripts/verify-exports.mjs`).
- `npm run verify:package` runs build → example typecheck → export verification → `npm pack --dry-run`.
- `npm run verify:release` is the smallest release gate: typecheck → lint → tests → verify:package.
- CI runs lint, typecheck, tests, bundle build, declaration build, example typecheck, export verification, and pack dry-run on every PR to `master`.

### Behaviour changes worth knowing

These are minor-level behaviour changes, not source-breaks; flagged here for transparency:

- **Automatic culling**: nodes whose `inView(view)` check is false are no longer submitted and are counted in `RenderStats.culledNodes`. Apps that were already relying on correct bounds see no observable change. If a custom drawable under-reports its bounds, it may now be skipped when it was previously drawn off-screen.
- **Scene input routing**: with the new stack, input dispatch honours the resolved `SceneInputMode` of each stack entry. Apps that only use `setScene(...)` with no `pushScene` keep single-scene v2.0.0 behaviour.
- **Explicit WebGPU failures**: `backend: { type: 'webgpu' }` now throws rather than silently picking WebGL2. Apps that want the old "try WebGPU, otherwise WebGL2" behaviour should use `backend: { type: 'auto' }`.

### Known limitations / honest caveats

- **WebGL2 is still single-texture batched.** Multi-texture batching is implemented only in the WebGPU sprite renderer. WebGL2 sprite-heavy scenes will still flush on texture changes.
- **WebGPU is improved, not "production WebGPU".** Treat the WebGPU backend as functional parity with WebGL2 for the features this library ships, not as a general-purpose WebGPU renderer.
- **Rapier is optional.** If you never import the physics entry point, Rapier is not installed or loaded. It is not bundled with the library.
- **Tilemaps are not in scope.** There is no built-in tilemap renderer; engines targeting Tiled-centric games should continue to reach for dedicated tooling.
- **Bitmap fonts are not shipped.** `Text` renders via Canvas with stroke support; `BitmapText` is not included.
- **No tween library.** Animation curves and tween orchestration are left to consumer code or external libraries.
- **Audio remains Web Audio decoded/streaming with pooling and sprites.** Spatial audio (`PannerNode`), effects (`ConvolverNode`, `BiquadFilterNode`, `DynamicsCompressorNode`), and fade helpers are not part of this release.
- **Particles are still CPU-simulated.** The WebGPU particle renderer is a rendering path, not a GPU compute simulator.
- **Graphics: no gradients, patterns, caps/joins, or dashing.** Basic fills and strokes only.
- **Input gaps unchanged from 2.0.0**: no haptics/vibration, no rebinding capture, no gesture library, fixed gamepad dead zones.

### Upgrading from 2.0.0

No code changes are required for typical applications. Review the behaviour-change notes above if your code:

- requests `backend: { type: 'webgpu' }` explicitly and was relying on silent fallback,
- implements a custom `Drawable` with inexact bounds,
- pushed multiple scenes via manual orchestration outside `SceneManager`.

## [2.0.0] - previous major

Baseline for the modernized architecture wave (renderer runtime, scene runtime, class-token loader v2, math and rendering contract renames).
