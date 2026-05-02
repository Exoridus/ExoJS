# Changelog

All notable changes to ExoJS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.4] - 2026-05-02

> **Heads-up — breaking change despite the patch number.** Reshapes
> the capabilities API one version after it was introduced. Pre-1.0
> SemVer permits breaking changes within the 0.x.y line; we kept the
> minor digit unchanged because the previous shape only existed for
> a single release (0.6.3) and almost no one will have pinned to it.

0.6.3 shipped a sync-only `capabilities` object plus an `isSupported`
helper; both are gone. The replacement is a `Capabilities` class with
a lazy-cached `static get ready` Promise — async-aware (real WebGPU
adapter check, not just API surface), flat-property, OOP-flavored to
match the rest of ExoJS.

### Breaking

- **`capabilities` (lowercase const) and `isSupported` are removed.**
  Replace with `await Capabilities.ready`. Properties on the resolved
  instance carry the same information at richer fidelity:
  - `capabilities.touch` (`boolean`) → `caps.touch` (`boolean`) plus
    new `caps.maxTouchPoints` (`number`).
  - `capabilities.webgpu` (`boolean`, API-surface only) →
    `caps.webgpu` (`boolean`, same API-surface meaning) plus new
    `caps.webgpuAdapter` (`GPUAdapter | null`, the actual adapter
    request result), `caps.webgpuVendor`, `caps.webgpuArchitecture`.
  - `capabilities.audio` (`boolean`) → `caps.audio` (`boolean`).
  - All other booleans (`pointer`, `keyboard`, `gamepad`,
    `fullscreen`, `vibration`, `offscreenCanvas`, `webWorkers`,
    `devicePixelRatio`, `webgl2`) carry over with identical names.
- **`CapabilityName` type is removed.** It existed only to type
  `isSupported`'s parameter; with the function gone the union has no
  consumer.

### Added

- **`Capabilities` class** with lazy-cached static `ready` Promise.
  First read fires the probes (sync ones immediate, the WebGPU
  adapter check async); every subsequent read returns the same
  Promise. The resolved instance is frozen.
- **`Application.capabilities`** accessor returns the same instance
  after `await app.start(...)` resolves; reading before start throws.
  Application's start now overlaps capability detection with backend
  init via `Promise.all`-style parallelism — no extra startup
  latency.
- **Real WebGPU adapter check** as part of detection: `webgpuAdapter`
  is non-null only if `navigator.gpu.requestAdapter()` succeeded.
  Solves the "API surface present but adapter not available" false
  positive that the 0.6.3 sync `capabilities.webgpu` couldn't
  distinguish.

### Migration

```ts
// Before (0.6.3)
import { capabilities, isSupported } from '@codexo/exojs';
if (capabilities.webgpu) startWebGpu();             // false positives possible
if (isSupported('touch')) showTouchUi();

// After (0.6.4)
import { Capabilities } from '@codexo/exojs';
const caps = await Capabilities.ready;
if (caps.webgpuAdapter) startWebGpu();              // strict adapter check
if (caps.touch) showTouchUi();

// Or via Application after start:
await app.start(scene);
if (app.capabilities.touch) showTouchUi();
```

## [0.6.3] - 2026-05-02

Adds the `capabilities` feature-detection API. Pure addition — no
existing surface changes shape.

### Added

- **`capabilities` and `isSupported`.** A frozen
  `Readonly<Record<CapabilityName, boolean>>` evaluated once at
  module load, plus a typed `isSupported(name)` lookup. Initial
  probes: `webgl2`, `webgpu`, `audio`, `pointer`, `touch`, `gamepad`,
  `keyboard`, `fullscreen`, `vibration`, `offscreenCanvas`. All
  probes are synchronous; for "is the WebGPU adapter actually
  available" the answer remains async and lives in `Application`'s
  backend selection. `Capabilities` and `CapabilityName` types are
  also exported.

## [0.6.2] - 2026-05-02

Adds the `Mesh` primitive — the first new public Drawable since the
0.6.0 cleanup. PATCH bump because the only change is additive: a new
class plus its two backend renderers; nothing existing changes shape.

### Added

- **`Mesh` Drawable.** Arbitrary 2D triangle-mesh primitive sitting
  alongside `Sprite` in the Drawable hierarchy. Construction takes a
  `MeshOptions` object with required `vertices` (flat (x,y) pairs) and
  optional `indices`, `uvs`, `colors` (packed RGBA8 u32 per vertex),
  and `texture`. Mesh data is immutable post-construction, but the
  underlying typed arrays may be mutated in place — call
  `mesh.recomputeLocalBounds()` afterwards to keep culling correct.
  Validation is enforced at construction (mismatched array lengths,
  out-of-range indices, non-multiple-of-3 vertex/index counts all
  throw).
- **`WebGl2MeshRenderer`.** Single-drawcall-per-mesh path on WebGL2.
  Vertex layout is 20 bytes (pos f32x2 + uv f32x2 + color u8x4-norm).
  Texture is bound to slot 0; meshes without an explicit texture
  resolve to `Texture.white` so the fragment shader stays branchless.
- **`WebGpuMeshRenderer`.** Deferred batched-pass path on WebGPU. CPU
  bakes (view × globalTransform) into vertex positions so the WGSL is
  uniform-free except for a per-mesh dynamic-offset tint+flags slot.
  Pipelines are created per (blendMode × format) and pre-warmed via
  `prewarmPipelines` during backend init. Texture bind groups are
  cached per Texture/RenderTexture instance.
- **Three live examples** under `examples/public/examples/rendering/`:
  `mesh-triangle.js` (untextured, vertex-colored), `mesh-textured-quad.js`
  (textured quad equivalent to a Sprite, hand-built from a Mesh), and
  `mesh-deformed-grid.js` (16×16 grid whose vertex positions wave
  each frame — demonstrates the deformation use case Sprite can't
  handle).

## [0.6.1] - 2026-05-02

Playground-only release. Library code is unchanged from 0.6.0; the
npm tarball ships byte-for-byte the same `dist/` output. The version
bump exists so the published changelog and the playground's release
catalog stay in sync.

### Changed

- **Playground version selector now reads GitHub Releases at runtime.**
  The dropdown was previously fed by a committed `versions.json` plus
  per-version snapshot directories under
  `examples/public/examples/versions/<id>/` and
  `examples/public/vendor/exojs/<id>/`. Both are gone. The dropdown
  now fetches from the GitHub Releases API
  (`api.github.com/repos/Exoridus/ExoJS/releases`); the special
  "current" entry continues to load locally-vendored sources for the
  build-time HEAD. Example sources for any released version load
  from `raw.githubusercontent.com/Exoridus/ExoJS/v<id>/...` and the
  library bundle loads from `cdn.jsdelivr.net/npm/@codexo/exojs@<id>`.
  Versions appear in the dropdown automatically once a tag is
  published — no bookkeeping commit is needed any more.

### Removed

- **Versioned-snapshot scaffolding in the playground.** The
  `examples/public/examples/versions/` snapshot tree, the
  per-version `examples/public/vendor/exojs/<id>/` mirrors, and
  `examples/public/examples/versions.json` are all gone, along with
  the `phase2-bundle.smoke.test.mjs` smoke test that policed their
  byte-identical layout. The `versions.json` shape test in
  `phase1-bundle.smoke.test.mjs` is also gone. `sync-exo-vendor.ts`
  no longer mirrors the flat vendor into a versioned subdirectory.

## [0.6.0] - 2026-05-02

A large pre-1.0 cleanup release. Two intentional API breaks (Backend
rename, Scene class-only), a full GPU-instancing pass across sprite
and particle renderers on both backends, and a slimmer npm package
shape. All on a single 0.x minor since the project is still pre-1.0
and breaks freely between minors.

### Breaking

- **`Runtime` types renamed to `Backend`; render-manager classes
  collapse into the same name.** `SceneRenderRuntime` →
  `RenderBackend`. The split `WebGl2RendererRuntime` /
  `WebGpuRendererRuntime` interfaces are gone — the concrete classes
  are the public type. `WebGl2RenderManager` → `WebGl2Backend`,
  `WebGpuRenderManager` → `WebGpuBackend`. `Application.renderManager`
  → `Application.backend`. Internal field/parameter names follow
  (`runtime` → `backend`, `_runtime` → `_backend`, `getRuntime()` →
  `getBackend()`). `WebGl2ShaderRuntime` → `WebGl2ShaderProgram` (the
  type stores a `WebGLProgram` plus its bound state — the new name
  reflects that). `WebGl2RenderBufferRuntime` and
  `WebGl2VertexArrayObjectRuntime` keep their names — they describe
  per-resource lifecycle, not the render backend.
- **`Scene` is class-only; the plain-object definition constructor is
  gone.** `new Scene({ update() { ... } })` no longer works. Subclass
  to define a scene — `class GameScene extends Scene { override
  update(...) { ... } }` for named scenes, `new class extends Scene
  { ... }` for one-offs. The `SceneData` interface and
  `SceneInstance<T>` type alias are removed (they only existed to
  type the spread-into-`this` constructor). Internal Scene fields
  move from ECMAScript `#`-private to TS `protected _app/_root/
  _stackMode/_inputMode` — subclasses can now reach internal state
  directly when they need to.
- **npm package shape simplified.** Dropped: `dist/exo.global.js` /
  `dist/exo.global.min.js` (legacy IIFE for `<script>` use) and
  `dist/exo.esm.min.js` (consumers minify on their side). What ships
  now: `dist/esm/` (per-module ESM tree, the canonical entry) and
  `dist/exo.esm.js` (single-file ESM bundle for direct module
  loading). `package.json#main`, `module`, `browser`, `exports` are
  unchanged in semantics — only the auxiliary artifacts go away.

### Performance

- **WebGL2 sprite renderer is now fully GPU-instanced.** Quad
  corners derive from `gl_VertexID` in the vertex shader; per-instance
  attributes carry `localBounds`, `transformAB`/`transformCD` (the 2D
  affine), `uvBounds`, packed RGBA8 tint, and packed slot/flags (56
  bytes per instance). The CPU per-frame cost is one bounded
  `writeBuffer` per batch; no per-vertex stream is uploaded.
  `drawArraysInstanced` over `TRIANGLE_STRIP` replaces the per-vertex
  `drawElements` path.
- **WebGPU sprite renderer matches the same instanced layout.** Uses
  `drawIndexed` over a static `[0,1,2,0,2,3]` index buffer with
  `triangle-list` topology (the index buffer keeps mock-frame
  bookkeeping deterministic — the on-screen result is the same as a
  triangle-strip).
- **Particle renderers fully instanced on both backends, with system
  data hoisted out of per-instance.** `localBounds`, `uvBounds`, and
  `systemTransform` are now uniforms (one upload per system per
  frame). Per-instance shrinks from 56 to 24 bytes (translation,
  scale, rotation, packed RGBA8 color). `WebGl2ParticleRenderer` no
  longer extends `AbstractWebGl2BatchedRenderer` — particles don't
  share batch infrastructure with sprites anymore.

### Removed

- `docs/` directory and the README's "Next Steps" link block. The
  prose docs were drifting out of sync with the code; the in-repo
  examples (`examples/README.md`) remain the supported reference.
- `SceneRenderRuntime`, `WebGl2RendererRuntime`, `WebGpuRendererRuntime`
  interfaces (collapsed into the renamed classes — see Breaking).
- `SceneData` interface, `SceneInstance<T>` type alias (no longer
  needed without the Scene definition-spread constructor).
- `WebGl2RenderManager`, `WebGpuRenderManager` class names (renamed
  to `*Backend` — see Breaking).
- `Sampler._premultiplyAlpha`, `Sampler._generateMipMap`,
  `Sampler._flipY` (write-only — texture pixel-store path consumes
  these directly from `SamplerOptions`, the GL sampler object only
  cares about scale and wrap modes).
- `AudioAnalyser._audioContext` (write-only — never read after
  setup).
- `WebGpuRenderManager._blendMode` (write-only — renderers consult
  `sprite.blendMode` directly; `setBlendMode` keeps its
  not-yet-implemented blend-mode validation).
- `@rollup/plugin-terser` devDependency (no minified bundle output
  any more).

### Migration

```ts
// Before (0.5.x)
class GameScene extends Scene {
    override draw(runtime: SceneRenderRuntime): void {
        this.root.render(runtime);
    }
}

const triangleRenderer = new CustomRenderer(app.renderManager);

if (app.renderManager instanceof WebGpuRenderManager) { /* ... */ }

// Plain-object scene
app.start(new Scene({ update() { /* ... */ } }));
```

```ts
// After (0.6.0)
class GameScene extends Scene {
    override draw(backend: RenderBackend): void {
        this.root.render(backend);
    }
}

const triangleRenderer = new CustomRenderer(app.backend);

if (app.backend instanceof WebGpuBackend) { /* ... */ }

// Anonymous-subclass scene (or named subclass)
app.start(new class extends Scene { override update() { /* ... */ } });
```

## [0.5.1] - 2026-04-28

Rendering-pipeline performance pass. No public API changes; all
optimisations are internal to the renderer subsystem.

### Changed

- **WebGL2 sprite batching is now multi-texture.** A single batch can
  bind up to eight textures (units 0..7); each vertex carries a uint
  texture-slot attribute and the fragment shader's per-slot if-chain
  selects the right sampler. Previously every texture change forced a
  flush, capping multi-atlas scenes at roughly one batch per texture.
  The vertex stride grows from 16 to 20 bytes (the new u32 slot at
  offset 16 is the only addition); position, packed UV, and packed
  RGBA8 tint are unchanged. Batches still flush on buffer-full,
  blend-mode change, and now slot exhaustion (more than eight
  textures in one batch).
- **WebGPU sprite vertex layout compacted from 28 to 24 bytes.** The
  per-vertex `premultiplyAlpha` flag and `textureSlot` index
  previously took one u32 attribute each; they are now packed into a
  single u32 with the slot in bits 0..7 and the flag in bit 8. The
  WGSL vertex shader unpacks via bit ops. 16 bytes saved per sprite.
- **Async-compile path now syncs the shader between buffer setup and
  attribute lookup.** The 0.5.0+slice-C deferral of attribute /
  uniform extraction from `initialize()` to first `sync()` broke
  connect-time `getAttribute()` callers under a real WebGL2 context
  (jest mocks didn't exercise that code path). Fixed in
  `AbstractWebGl2BatchedRenderer`, `WebGl2PrimitiveRenderer`, and
  `WebGl2MaskCompositor`. The driver still gets a parallel-compile
  window between `shader.connect()` and `shader.sync()` thanks to
  KHR_parallel_shader_compile; the eventual blocking status query is
  a no-op when compile already finished.

### Added

- **`WebGl2SpriteRenderer.prewarmPipelines` equivalent for WebGPU.**
  `WebGpuSpriteRenderer.prewarmPipelines(formats)` calls
  `createRenderPipelineAsync` for every BlendMode × format combo in
  parallel during render-manager init. The first draw of every common
  blend mode no longer blocks on synchronous pipeline creation.
  Renderers without a `prewarmPipelines` method continue to create
  pipelines lazily on first use; the pre-warm fallback gracefully
  no-ops when `createRenderPipelineAsync` isn't available (older
  browsers, headless test mocks).
- **`KHR_parallel_shader_compile` opt-in for WebGL2 shader compile.**
  When the extension is present (Chrome / Edge / Firefox by default,
  Safari since 17) the GL driver may compile shaders on a worker
  thread; status queries are deferred to the first `sync()` call so
  the main thread doesn't block on compile.
- **`ShaderPrimitives.UnsignedInt`, `UnsignedIntVec2..4`** with their
  byte-size and array-constructor mappings, so `getActiveAttrib` /
  `getActiveUniform` on a `uint` shader slot resolves correctly. The
  enum gains four members; the runtime export inventory is unchanged.
- **`WebGl2VertexArrayObject.addAttribute(..., integer)`** parameter
  routes integer-typed shader inputs (`uint`, `uvec`) to
  `vertexAttribIPointer` rather than `vertexAttribPointer`, so the
  shader receives the raw integer value instead of a coerced float.
- **`RendererRegistry.renderers()`** iterator exposes the registered
  renderers so backend managers can dispatch optional lifecycle hooks
  (such as the WebGPU pipeline pre-warm above) without per-renderer
  private-field reach-ins.

### Performance notes

- Sprite-heavy scenes with multiple atlases see a draw-call reduction
  proportional to atlas count (up to 8×) on WebGL2.
- WebGPU sprite vertex bandwidth is reduced 14% (16 bytes per sprite).
- First-frame stutter from JIT shader / pipeline compilation is
  largely eliminated when KHR_parallel_shader_compile (WebGL2) or
  `createRenderPipelineAsync` (WebGPU) is supported.

## [0.5.0] - 2026-04-28

Three focused breaking changes targeted at the first pre-1.0 minor: a hierarchy-semantics boundary slice (per `.workspace/reviews/opus-pre-1.0-architecture-review/09-b1-implementation-rfc.md`), a unified mask API with full multi-source support (per `.workspace/reviews/opus-pre-1.0-architecture-review/10-mask-api-decision.md`), and a Scene API simplification that collapses the static factory into the constructor. No aliases.

### Removed

- **`Transformable` class and `TransformableFlags` enum.** Inlined into `SceneNode`. `SceneNode` now owns its transform fields and accessors (`position`, `x`, `y`, `rotation`, `scale`, `origin`, `setPosition`, `setRotation`, `setScale`, `setOrigin`, `move`, `rotate`, `getTransform`, `updateTransform`, `flags`) directly. The public surface shrinks by two symbols. `Flags<T>` (the generic class) remains public.
- **`SceneNode.render(runtime)` no-op.** Render belongs to `RenderNode` and below; bare `SceneNode` no longer pretends to participate in the render pass.
- **`Scene.create(definition)` static factory.** Replaced by a typed constructor overload — see Changed below.

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
- **`Scene` is now generic and constructable with an optional typed `SceneData` definition.** `class Scene<T extends SceneData = SceneData>` — `new Scene()` produces an empty scene; `new Scene({ update() { ... }, draw() { ... } })` accepts a typed definition object whose method bodies see `this` as `Scene<T> & T` via `ThisType<>`. `class extends Scene` is unchanged and remains the recommended path for stateful scenes — TypeScript only infers properties declared inside the definition object, so `this._foo = ...` assignments inside method bodies are still invisible to the type system without pre-declaration. The existing `SceneInstance<T>` type alias keeps its meaning (`Scene<T> & T`) and is still re-exported from the package root.

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
| `Scene.create({ update() {...} })` | `new Scene({ update() {...} })` (drop-in replacement; same `this` typing via `ThisType<Scene & T>`) |
| `Scene.create({})` | `new Scene()` |

No deprecated aliases are provided. The migration is mechanical and the project is pre-1.0 with explicit "may break between minors" policy.

### Modernized

Quality-of-life cleanups using ES2022+ features. No public-API impact, but flagged here for transparency:

- **`Scene` uses ECMAScript `#` private fields** (`#app`, `#root`, `#stackMode`, `#inputMode`) instead of TypeScript `private _xxx`. True runtime privacy — fields are unreachable from outside the class even via bracket notation. The rest of the codebase still uses `private _xxx`; full sweep is queued for a future release pending test refactor (existing tests reach into private state via `obj['_field']`, which `#` fields block).
- **`Loader.ts` uses `Object.hasOwn(obj, key)`** instead of `Object.prototype.hasOwnProperty.call(obj, key)`. Same semantics, less ceremony.
- **`SceneManager` uses `array.at(-1)`** for stack-tail access instead of `arr[arr.length - 1]`. Three sites: the active-scene getter, `popScene`, and `_unloadCoveredScenes`.
- **`Loader.ts` uses `Error.cause`** for the wrapped error in `factory.create()` failures. `cause` carries the full original error (with stack trace) so DevTools, Sentry, etc. surface the underlying cause automatically. The wrapper message still contains the inner message for backward compatibility with consumers that string-match the error message.

### Performance notes

- `mask = Rectangle` is O(1) GPU scissor — free at scale.
- `mask = Texture` / `mask = RenderTexture` adds one intermediate render texture acquire and one composite pass per masked render.
- `mask = RenderNode` adds a second intermediate render texture acquire (to bake the mask node's visual output) plus the composite pass — so two extra passes per masked render. Use sparingly for high-frequency draws; consider `cacheAsBitmap` on the masked content.

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
