# Changelog

All notable changes to ExoJS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Two focused breaking changes targeted at the next pre-1.0 minor: a hierarchy-semantics boundary slice (per `.workspace/reviews/opus-pre-1.0-architecture-review/09-b1-implementation-rfc.md`), and a unified mask API with full multi-source support (per `.workspace/reviews/opus-pre-1.0-architecture-review/10-mask-api-decision.md`). No aliases. No version assigned yet.

### Removed

- **`Transformable` class and `TransformableFlags` enum.** Inlined into `SceneNode`. `SceneNode` now owns its transform fields and accessors (`position`, `x`, `y`, `rotation`, `scale`, `origin`, `setPosition`, `setRotation`, `setScale`, `setOrigin`, `move`, `rotate`, `getTransform`, `updateTransform`, `flags`) directly. The public surface shrinks by two symbols. `Flags<T>` (the generic class) remains public.
- **`SceneNode.render(runtime)` no-op.** Render belongs to `RenderNode` and below; bare `SceneNode` no longer pretends to participate in the render pass.

### Changed

- **`RenderNode.render(runtime)` is now `abstract`.** All concrete subclasses (`Drawable`, `Container`, `Graphics`, `Sprite`, `AnimatedSprite`, `Text`, `Video`, `ParticleSystem`, `DrawableShape`) already implement it. The abstract declaration removes the SceneNode-render lie.
- **`RenderNode.mask` is now the unified visual masking API**, accepting any `MaskSource = Rectangle | Texture | RenderTexture | RenderNode | null`. The behavior depends on the source:
  - `Rectangle` — fast axis-aligned scissor clip (O(1) GPU state). The most common case for UI panels and viewport regions.
  - `Texture` / `RenderTexture` — uses the texture's alpha channel as the mask, stretched to fit the masked node's local bounds. The texture has no transform of its own; for transform/scale/rotation control over the mask source, use a `Sprite(texture)` instead.
  - `RenderNode` (`Sprite`, `Graphics`, `Container`, etc.) — the node's full visual output (with its own transform, filters, cacheAsBitmap) is rendered into an intermediate render texture and used as the alpha mask. Bare `SceneNode` instances are rejected at compile time because they are structural-only.
  - `null` — no mask.

  Setting `node.mask = node` (self-mask) throws at runtime.
- **`SceneRenderRuntime` mask primitives renamed** to match the new vocabulary:
  - `pushMask(maskBounds)` / `popMask()` → `pushScissorRect(bounds)` / `popScissorRect()` (lower-level scissor primitive used internally by the `Rectangle` mask path).
  - New `composeWithAlphaMask(content, mask, x, y, width, height, blendMode)` — used internally by the Texture/RenderTexture/RenderNode mask paths.
  - Backend implementations: `WebGl2MaskCompositor` (new) and `WebGpuMaskCompositor` (new) implement the alpha-compose pipeline. Each owns its own shader/pipeline, lazily initialized on first use, disconnected on manager destroy. Pipelines are cached per (target format, blend mode) on the WebGPU side.
- **`Container._children` narrowed to `Array<RenderNode>`.** `addChild`, `addChildAt`, `removeChild`, `swapChildren`, `getChildIndex`, `setChildIndex`, `getChildAt`, and `Scene.addChild`/`removeChild` now require `RenderNode` instances. Bare `SceneNode` instances cannot be added to a container at compile time. (Previous behavior added them as no-op render nodes; observable behavior was unchanged for any code that already added Drawable/Container/Graphics/Sprite/etc.)

### Added

- **`MaskSource` type alias** is exported from the package root: `Rectangle | Texture | RenderTexture | RenderNode | null`. This is the public type for `RenderNode.mask`.
- **Root export runtime snapshot gate** (`test/core/root-index-snapshot.test.ts`). Captures every runtime-visible export name from `src/index.ts` and compares against a committed Jest snapshot. CI fails on any unintentional addition or removal.
- **Root export type-level inventory** (`test/core/root-index-type-inventory.test.ts`). Enumerates all exported symbols — including interfaces and type aliases erased at runtime — with their kind annotations.
- **RenderNode/SceneNode contract tests** (`test/rendering/render-node.test.ts`). Pin down the `SceneNode` is structural-only / `RenderNode.render` is abstract / `Container.addChild` rejects non-`RenderNode` contracts.
- **MaskSource union tests** (`test/rendering/mask-source.test.ts`). 12 tests covering: Rectangle scissor routing, nested rectangles, zero-size and null masks; Texture / RenderTexture / Sprite / Graphics / Container as alpha-mask sources; bare `SceneNode` rejected at compile time; self-mask rejected at runtime; mask reassignment to null.

### Migration

| Before (0.4.x) | After |
|---|---|
| `import { Transformable } from '@codexo/exojs'`; `class X extends Transformable` | `import { SceneNode } from '@codexo/exojs'`; `class X extends SceneNode` |
| `import { TransformableFlags } from '@codexo/exojs'` | Internal flag enum is no longer public; use SceneNode's high-level transform accessors instead. |
| `node.mask = anyShapeNode` *(silently clipped to bounding rect)* | `node.mask = anyShapeNode` *(now a real shape mask via alpha compositing — except bare SceneNode which is rejected at compile time)* |
| Want fast axis-aligned clipping? | `node.mask = new Rectangle(x, y, w, h)` |
| Want to clip with a texture's alpha channel? | `node.mask = texture` or `node.mask = renderTexture` |
| Want a transformed/positioned alpha mask? | `node.mask = new Sprite(texture)` (Sprite's transform/position/scale apply to the mask source) |
| `runtime.pushMask(rect)` / `runtime.popMask()` | `runtime.pushScissorRect(rect)` / `runtime.popScissorRect()` (renamed; behavior unchanged) |
| `class Group extends SceneNode { override render() {...} }` | `class Group extends RenderNode { override render() {...} }` |
| `class CustomContainer extends Container { override addChild(child: SceneNode) {...} }` | `class CustomContainer extends Container { override addChild(child: RenderNode) {...} }` |

No deprecated aliases are provided. The migration is mechanical and the project is pre-1.0 with explicit "may break between minors" policy.

### Performance notes

- `mask = Rectangle` is O(1) GPU scissor — free at scale.
- `mask = Texture` / `mask = RenderTexture` adds one intermediate render texture acquire and one composite pass per masked render.
- `mask = RenderNode` adds a second intermediate render texture acquire (to bake the mask node's visual output) plus the composite pass — so two extra passes per masked render. Use sparingly for high-frequency draws; consider `cacheAsBitmap` on the masked content.

### Added

- **Root export runtime snapshot gate** (`test/core/root-index-snapshot.test.ts`). Captures every runtime-visible export name from `src/index.ts` and compares against a committed Jest snapshot. CI fails on any unintentional addition or removal, making future root changes deliberate. Update with `npx jest root-index-snapshot --updateSnapshot`. After this slice, the snapshot drops `Transformable` and `TransformableFlags`.
- **Root export type-level inventory** (`test/core/root-index-type-inventory.test.ts`). Uses the TypeScript compiler API to enumerate all exported symbols — including interfaces and type aliases erased at runtime — with their kind annotations (`class`, `interface`, `type alias`, etc.). Complements the runtime snapshot by covering the full TypeScript-visible surface.
- **RenderNode/SceneNode contract tests** (`test/rendering/render-node.test.ts`). Pins down: (1) bare `SceneNode` has no `render` method; (2) `RenderNode.render` is abstract; (3) `Drawable.render` submits via `runtime.draw(this)`; (4) `Container.render` traverses children; (5) `Container.addChild` rejects non-`RenderNode` values at compile time.

### Notes

- The single dominant import model is intentional: `import { Application, Sprite } from '@codexo/exojs'` and `import * as Exo from '@codexo/exojs'` align with the IIFE/global bundle (`Exo.Application`, `Exo.Sprite`). Subpath exports are deferred until a stable API boundary warrants them.
- `SceneNode` is now a concrete structural class — transform, hierarchy, collision, culling. `RenderNode` (abstract) is the render-capable base. Every render-participating class extends `RenderNode`; bare `SceneNode` instances are valid as user-defined data nodes but cannot be added to containers.

## [0.4.0] - 2026-04-26

Pre-1.0 versioning reset. The active development line moves from `2.1.2` to `0.4.0` to honestly reflect that the public API is not yet stable. No runtime behavior change relative to the previous head — this release marks a versioning policy shift, not a code rewrite.

### Notes

- The `2.x` releases (`2.0.0`, `2.1.0`, `2.1.1`, `2.1.2`) remain published on npm as a historical line and will be deprecated with a pointer to the `0.x` line.
- New work happens on the `0.x` line. Expect breaking changes between `0.x` minors as the scene graph, renderer, and resource boundaries continue to evolve.
- `1.0.0` will mark the first stable public API contract. Until then, treat any minor version as potentially breaking and pin exact versions in downstream experiments.
- Current package identity for the reset line is `@codexo/exojs`. Historical `2.x` release notes may reference the legacy package/import name, old example layout, old scripts, or the former `master` branch target.
- The `2.1.0` View camera note below used the old working name `setBoundsConstraint`; the current API is `setBounds(...)` / `clearBounds()`.
- Past CHANGELOG entries for `2.x` are otherwise preserved below as the historical record of work that landed in those releases.

## [2.1.2] - 2026-04-19

Patch release with one runtime fix, a toolchain modernization pass, and a legacy-artifact cleanup. No public API removals or renames.

### Fixed

- **`Signal.dispatch` skipped sibling `once()` handlers.** `once()` wrappers self-remove mid-iteration, which compacts the underlying bindings array; the `for..of` iterator then advanced past the binding that shifted into the just-visited slot. `dispatch` now iterates a snapshot of bindings, so handler-driven mutation is safe. Visible symptom: the Audio Visualisation example received a set-up `Music` but an un-set-up `AudioAnalyser`, so frequency buffers stayed at zero.

### Changed

- Removed the legacy bundled declaration file `dist/exo.d.ts` (emitted via `tsc --outFile` + `module: amd`, both deprecated in TypeScript 6). Modern consumers resolve types through `exports["."].types`, which points at the per-file tree in `dist/esm/`; `dist/exo.d.ts` was never part of the `exports` map. This also removes the `ignoreDeprecations: "6.0"` escape hatch from the build.
- Build upgraded to TypeScript 6, ESLint 10, Jest 30. Internal imports now use the `@/*` path alias (mapped to `src/*`) and `baseUrl` is no longer required.

## [2.1.1] - 2026-04-19

Patch release fixing a cluster of WebGPU and scene-graph bugs discovered after 2.1.0 shipped. No public API removals or renames; one backward-compatible addition on `Container.addChild`.

### Fixed

- **WebGPU adapter ordering.** `WebGpuRenderManager` now requests the GPU adapter before acquiring the canvas WebGPU context. A null adapter previously locked the canvas into WebGPU mode, preventing `Application`'s automatic WebGL2 fallback from obtaining a context on the same element.
- **WebGL2 shader program binding.** `WebGl2ShaderRuntime.sync()` now binds the program before writing uniforms. The previous draw pipeline never called `bindShader(shader)` with a non-null shader, so every `uniform*` write targeted the wrong or null program and `drawElements` reported "no valid shader program in use". Exposed by the WebGPU adapter fallback above.
- **WGSL multi-texture sprite shader** uses `textureSampleGrad` with explicit screen-space derivatives. `textureSample`'s uniformity requirement prevented the 8-slot dispatch from compiling on any sprite batch spanning more than one texture slot.
- **Sprite index buffer** allocation and lifecycle. Buffer size was 4× larger than intended (`indexData.byteLength * BYTES_PER_ELEMENT` instead of `indexData.byteLength`), and `_ensureBatchCapacity` ran inside the draw loop and could destroy a buffer the render pass had already bound. Capacity is now grown once up front.
- **Sprite multi-batch rendering.** When a flush contained multiple batches (blend-mode change, texture-slot overflow, or pipeline switch), each batch's `queue.writeBuffer(vertexBuffer, offset: 0, ...)` serialised before the single submit, leaving only the last batch's vertex data in the buffer. All batch vertex data is now packed into one CPU buffer at distinct sprite offsets and uploaded once; `drawIndexed` uses `firstIndex` to target each range.
- **Particle and primitive multi-drawcall rendering.** Same multi-write-to-offset-0 pattern, plus mid-loop `_ensureCapacity` destroying buffers still referenced by the pass. Particle renderer now submits one command buffer per system. Primitive renderer was rewritten: CPU bakes `view * globalTransform` into `vec4` clip-space positions per vertex, pipeline has no bind-group, one render pass per flush with packed vertex/index buffers.
- **Primitive combine order.** `_combinedTransform.copy(view).combine(global)` produced `global * view` (`Matrix.combine` applies the argument on the left, confirmed by `SceneNode.getGlobalTransform` which chains `local.combine(parent.global)` to yield `parent.global * local`). Swapped to `copy(global).combine(view)` = `view * global`.
- **WebGPU mipmap generation.** The full-screen downsample triangle's UVs are no longer Y-flipped relative to framebuffer orientation. Every odd mip level was being rendered upside-down, producing a visible sprite flip whenever the view zoomed far enough for the LOD selector to cross an odd/even boundary.

### Added

- `Container.addChild` accepts multiple children via rest args (`addChild(...children)`). The previous single-argument signature silently dropped the tail of `addChild(a, b, c, d)`; callers only saw `a` in the scene graph. Single-child usage stays backward compatible.
- Doc comment on `ParticleOptions.position` clarifying it is in the owning `ParticleSystem`'s local coordinate space. The shader applies the system's global transform on top, so passing world coordinates double-translates the emitter.

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
