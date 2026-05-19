# ExoJS Pre-v0.9.0 API & Product Ergonomics Review

## 1. Executive verdict

ExoJS v0.8.4 is a **fundamentally strong, opinionated 2D browser runtime**. The core architectural decisions are correct: explicit `Scene.draw(backend)` orchestration, runtime-owned renderer dispatch, honest backend boundaries, typed resource loading, and a well-scoped scene-graph model. The library has grown significantly from its 0.4.0 reset without losing its identity — a rare achievement.

**v0.9.0 is near, but should not be the API consolidation milestone.** The library is ready for an explicit API-stabilisation pass (0.9.0), but that pass should be preceded by one focused 0.8.x release that addresses the friction catalogued below. Jumping directly to 0.9.0 API freeze with the current surface would entrench problems that are already visible.

**ExoJS has preserved and strengthened its identity.** The "explicit instead of implicit" philosophy survives in `Scene.draw(backend)` remaining an empty stub (no auto-traversal), in the honest `RenderBackend` interface, and in the rejection of fake-universal abstractions. The scene graph now exists where it is semantically true — `Container` owns children, `Drawable` submits to a runtime — without becoming a render dictator. This is the correct evolution.

**The main weakness is not missing features; it is API surface roughness.** Too many ergonomic paper-cuts remain, especially around asset access, scene stacking vocabulary, signal dispatch patterns, and the growing-but-incoherent `Application` options object. These are all fixable in one or two pre-0.9.0 releases.

## 2. Top findings

### #1 — Loader asset access is the single biggest daily DX friction

**Problem:** `new Sprite(loader.get(Texture, 'hero'))` works but burdens every instantiation site with a two-argument getter call. Users must manually track which type each alias belongs to. Common patterns like "I have a manifest, now give me typed access to everything" require boilerplate.

**Evidence:** Every example, every Guide chapter, every Recipe repeats `loader.get(Texture, '...')` verbatim. The old examples (`historical-examples-pre-1.0-reset`) used the same pattern — no improvement in ergonomics across versions.

**Suggested direction:** Add a `loader.assets` proxy that returns a typed accessor per manifest-registered alias, keyed by the asset token. Something like:
```ts
const assets = loader.registerManifest(myManifest);
// then:
assets.texture('hero')   // → Texture
assets.sound('bang')     // → Sound
// or via a generated shape from the manifest definition itself
```
Longer-term, typed manifests with inference could remove the manual `loader.get(Texture, ...)` entirely.

**Breaking?** No — additive API. The existing `loader.get()` path remains.

**Classification:** Core. **Priority: Must before 0.9.0.**

---

### #2 — Scene stacking vocabulary is powerful but too subtle

**Problem:** `overlay | modal | opaque` and `capture | passthrough | transparent` combine into 9 possible `(mode, input)` states. The concepts are individually correct, but the vocabulary requires users to memorise two orthogonal enums and mentally compose them. The Guide needed a full chapter to explain scene stacking, and the Recipes exposed repeated "wait, which mode do I use?" confusion.

**Evidence:** `src/core/Scene.ts:59-67` defines the types. The Guide's scene-stacking chapter is one of the longest. The `PicInPic`, `HUDOverlay`, and `MultipleScenes` examples each manually set both `stackMode` and `inputMode` with non-obvious combinations.

**Suggested direction:** Two options:
1. **Simpler:** Merge into a single `SceneMode` enum with 4-5 named combinations that cover the practical cases (e.g. `'overlay'`, `'modal'`, `'replace'`, `'hud'`). Keep the underlying two-axis system internally but expose the simplified vocabulary publicly.
2. **Presets:** Keep the current two-axis model but add named preset constants: `ScenePresets.hud` = `{ mode: 'overlay', input: 'transparent' }`, `ScenePresets.pauseMenu` = `{ mode: 'modal', input: 'capture' }`, etc.

Option 1 is cleaner long-term. Option 2 is lower-risk. Either would shrink the Guide chapter and eliminate the "which combination?" guessing game.

**Breaking?** Yes if merged to single enum; no if presets are additive.

**Classification:** Core. **Priority: Strong.**

---

### #3 — `SceneNode extends Transformable` remains unresolved (historical issue #1)

**Problem:** The historical Opus review flagged this as a 1.0 blocker. It still is. `SceneNode` inherits position, rotation, scale, and transform methods from `Transformable`, meaning every `SceneNode` — including structural-only nodes — carries a full transform. The historical review's recommendation was "own a `transform: Transformable` property instead." This was never acted on.

**Evidence:** `src/core/SceneNode.ts:26` still says `extends Transformable`. The Opus review (section `01-root-scenenode-and-scenegraph.md`) and the post-reset roadmap both identified this as a must-resolve item for 0.5.0. It was deferred.

**Suggested direction:** Convert `Transformable` from a base class to an owned property on `SceneNode`. This is the recommendation from the Opus review and remains correct. It makes transform state opt-in for structural nodes, cleaner for composition, and more honest about "every node has a transform" being false (what is the transform of a Quadtree node?).

**Breaking?** Yes — changes inheritance to composition. This is the kind of break that should happen before 0.9.0, not after.

**Classification:** Core. **Priority: Must before 0.9.0.**

---

### #4 — Verb naming across the render chain is still inconsistent

**Problem:** The chain is `Scene.draw(backend)` → `Container.render(backend)` → `Drawable.render(backend)` → `backend.draw(drawable)`. Two different verbs (`draw`/`render`) in the user-facing chain, swapped meanings partway through. The Opus review recommended unifying on `draw()` for the user-facing chain. This was never done.

**Evidence:** `src/rendering/Drawable.ts:67` uses `render`, `src/core/Scene.ts:255` uses `draw`, `src/rendering/RenderBackend.ts:64` uses `draw`. The Opus review (section `02-render-call-direction.md`) gave a detailed rename plan (Option N1) and rated it "Important before 1.0."

**Suggested direction:** Execute the Opus review's Option N1: rename `Container.render` → `Container.draw`, `Drawable.render` → `Drawable.draw`, `Renderer.render` → `Renderer.submit`. Two verbs instead of two-with-collision. This aligns with the identity principle of `draw` as the user-facing orchestration verb.

**Breaking?** Yes — method rename. Can be shipped with deprecated aliases for one release.

**Classification:** Core. **Priority: Strong.**

---

### #5 — Fluent `return this` is inconsistent and should either be standardised or eliminated

**Problem:** Some APIs return `this` for chaining (`Scene.addChild`, `Scene.setParticipationPolicy`, `Container.addChild`, `View.follow`, `View.shake`, `Tween.to`, `Tween.onStart`, etc.) while others return `void` (`Application.start`, `Scene.update`, `Scene.draw`, `SceneManager.pushScene`, `Loader.load`). There is no clear rule for when chaining is available. The Tween API is fully fluent; the Scene graph API is partially fluent; the Loader API is partially fluent.

**Evidence:** A grep across the source shows `return this` in roughly 40% of setter/mutator methods. The historical examples show no use of chaining. The current Guide never chains. The Tween system is the only domain where chaining is essential to the API design.

**Suggested direction:** Three-tier approach:
1. **Keep fluent in Tween** — chaining is intrinsic to the builder pattern (`tween.to(...).easing(...).yoyo().start()`).
2. **Keep fluent in View helpers** — `view.follow(player).shake(5, 200)` is genuinely ergonomic.
3. **Remove fluent from Scene graph methods** — `container.addChild(sprite).addChild(text)` reads awkwardly and is never used in Guide/Recipes/examples. The `return this` on `Scene.addChild`/`Container.addChild` is dead weight.
4. **Standardise the remaining fluent methods** — make it a deliberate design decision, not an accident of implementation. Document the fluent contract where it exists.

**Breaking?** Yes for methods that currently return `this` and would become `void` — but no downstream code chains these methods, so the practical breakage is near zero.

**Classification:** Core. **Priority: Nice.**

---

### #6 — The `ApplicationOptions` interface is growing into a config sink

**Problem:** `ApplicationOptions` now has 16 fields (`src/core/Application.ts:30-46`): canvas, width, height, debug, clearColor, spriteRendererBatchSize, particleRendererBatchSize, gamepadDefinitions, gamepadSlotStrategy, pointerDistanceThreshold, webglAttributes, resourcePath, requestOptions, cache, and backend. Some are renderer internals (`spriteRendererBatchSize`), some are loader config (`resourcePath`), some are input config (`gamepadDefinitions`). The boundary between "application configuration" and "subsystem configuration" is blurred.

**Evidence:** `src/core/Application.ts:154-161` merges the user's partial with `defaultAppSettings`. New options are added by appending to the interface and default object — there is no grouping, no validation, no discoverability beyond TypeScript autocomplete.

**Suggested direction:** Group options by subsystem:
```ts
interface ApplicationOptions {
  canvas: HTMLCanvasElement;
  size: { width: number; height: number };
  clearColor: Color;
  rendering?: { spriteBatchSize?: number; particleBatchSize?: number; backend?: BackendConfig };
  loading?: { resourcePath?: string; requestOptions?: RequestInit; cache?: CacheStore | readonly CacheStore[] };
  input?: { gamepadDefinitions?: GamepadDefinition[]; gamepadSlotStrategy?: GamepadSlotStrategy; pointerDistanceThreshold?: number };
  debug?: boolean;
}
```
The flat surface is preserved for simple apps; the nested shape is available for explicit subsystem configuration. This is a pre-0.9.0 change because it defines the first-thing-users-see API shape.

**Breaking?** Yes — restructures the options object. Acceptable pre-0.9.0.

**Classification:** Core. **Priority: Strong.**

---

### #7 — The Tween system is sound but under-scoped — it needs deliberate subsystem integration

**Problem:** The Tween API is clean internally (fluent builder, easing, yoyo, repeat, chain, lifecycle callbacks), but it exists in isolation. Tweens work on arbitrary `number` properties of arbitrary objects — which is flexible but means there is no integration with ExoJS concepts like `View`, `Filter` parameters, audio volume/pan, particle properties, or scene transitions. The Tween feels bolted on, not native.

**Evidence:** `src/animation/Tween.ts` is a standalone generic class. `TweenManager` is attached to `Application.tweens`. There is no `View.tweenTo()`, no `Filter.animate()`, no `Sprite.tweenPosition()`. The Guide's tween chapter shows tweens on raw `sprite.position` but never shows tween integration with any other ExoJS subsystem.

**Suggested direction:**
1. Keep the generic `Tween<T>` as the engine.
2. Add convenience entry points on key ExoJS types:
   - `Sprite.tween()` → returns a tween pre-configured for sprite properties
   - `View.tween()` → returns a tween for camera properties (center, zoom, rotation)
   - `Filter.tween()` → returns a tween for filter uniform properties
3. Add a `Scene.tweens` shortcut that auto-disposes tweens on scene unload (like `Scene.inputs`).

These additions make the Tween feel like a first-class ExoJS subsystem without changing the underlying generic engine.

**Breaking?** No — additive API.

**Classification:** Core. **Priority: Strong.**

---

### #8 — Collision detection is comprehensive; collision response is absent

**Problem:** `src/math/collision-detection.ts` (823 lines) has exhaustive intersection tests for every shape combination, SAT, swept collision, and quadtree (`src/math/Quadtree.ts`). But there is no collision *response* — no penetration resolution, no separation, no contact manifold, no impulse. The `CollisionResponse` type in `src/math/Collision.ts` exists but is only populated with `overlap` data. Users who want "bodies that bounce off each other" must implement it themselves.

**Evidence:** `src/math/collision-detection.ts:327` has a literal comment `overlap: 0 // todo`. The collision detection module is a pure math library with no integration into the scene graph or the update loop. The quadtree is not referenced by Scene, SceneManager, Container, or Drawable.

**Suggested direction:**
1. Keep the collision detection primitives as-is — they are excellent.
2. Add a lightweight `CollisionWorld` or `CollisionGroup` that:
   - Accepts `Collidable` objects (which `SceneNode` already implements)
   - Runs broadphase (quadtree) + narrowphase (existing SAT)
   - Emits collision pairs via Signals
   - Optionally resolves penetration with configurable response (push-out, bounce, none)
3. Integrate with the scene graph so that `SceneNode` children can be registered for collision.

This stays within ExoJS's "practical, minimal, not a physics engine" identity. The Rapier adapter already handles full physics; this would handle the common case of "I just want to know when things touch and maybe push them apart."

**Breaking?** No — additive, no existing API changes.

**Classification:** Extras. **Priority: Nice (can wait until after 0.9.0).**

---

### #9 — Blend modes are adequate but the enum values are WebGL2-coupled

**Problem:** `BlendModes` (Normal, Additive, Subtract, Multiply, Screen — 5 modes) covers the common cases. But the values in `src/rendering/types.ts:5-11` are sequential integers (0-4), not WebGL constants. Meanwhile, `ScaleModes`, `WrapModes`, `RenderingPrimitives`, `BufferTypes`, `BufferUsage`, and `ShaderPrimitives` use raw WebGL2 `GLenum` constants directly as enum values. This creates an inconsistent pattern: some enums are backend-agnostic identifiers, others are backend-specific constants exposed as public API.

**Evidence:** `src/rendering/types.ts` — `BlendModes` uses sequential ints; `ScaleModes.Nearest = 0x2600` (GL_NEAREST). The historical Opus review flagged backend-specific enums in shared types as a leak concern.

**Suggested direction:**
1. `BlendModes` is fine as-is — these are user-facing concepts. Add `Overlay`, `SoftLight`, `HardLight` for parity with CSS blend modes and Pixi.js expectations.
2. Move `ScaleModes`, `WrapModes`, `RenderingPrimitives`, `BufferTypes`, `BufferUsage`, `ShaderPrimitives` out of `types.ts` into a WebGL2-specific file and mark them `@internal` or `@advanced`. They are backend implementation details.

**Breaking?** Yes for moving backend enums — but they are almost certainly unused by consumer code.

**Classification:** Core (BlendModes expansion). **Priority: Nice.**

---

### #10 — Render verb dispatch and render call direction need documentation, not just code

**Problem:** The render dispatch chain is correct but undocumented. A new contributor reading `Drawable.render(backend)` sees it call `backend.draw(this)`, which resolves a renderer and calls `renderer.render(drawable)`. The indirection is intentional and identity-aligned but opaque. The Opus review recommended an architecture doc (`docs/core-concepts/render-dispatch.md`). This was never written.

**Evidence:** The Opus review section `02-render-call-direction.md:189` explicitly recommended "Add an architecture doc ... that shows the call chain explicitly." The current Guide's rendering chapters explain what to do, not how the engine dispatches. No architecture diagram or dispatch-flow documentation exists for contributors.

**Suggested direction:** Add a `docs/architecture/render-dispatch.md` (or Guide appendix) that diagrams the call chain: `Scene.draw → Container.draw → Drawable.draw → Runtime.draw → Registry.resolve → Renderer.submit`. This is not user-critical but is contributor-essential and protects the explicit-draw identity from future erosion.

**Breaking?** No — documentation only.

**Classification:** Core docs. **Priority: Nice.**

---

## 3. API areas reviewed

### 3.1 Scenes / SceneManager / overlay scenes

**Current state:** The scene stack model is sound. `SceneManager` owns a stack of `Scene` instances, each with a `(mode, input)` participation policy. Scene transitions (`FadeSceneTransition`) exist. `Scene` has a well-defined lifecycle: `load → init → update/draw/handleInput → unload → destroy`. The `SceneInputs` proxy auto-disposes input bindings on scene unload — excellent.

**What works:**
- The lifecycle is clear and explicit.
- `Scene.draw(backend)` remaining an empty stub by default correctly enforces explicit orchestration.
- `Scene.root` as a structural-only container with documented non-auto-render contract (per `src/core/Scene.ts:127-138` JSDoc) is the right answer.
- `SceneInputs` auto-dispose is a genuine ergonomic win.

**What needs work:**
- The `(overlay | modal | opaque) × (capture | passthrough | transparent)` vocabulary creates 9 combinations, of which approximately 4-5 are practically useful. The remaining are theoretical and confusing.
- The `SceneParticipationPolicy` interface (`src/core/Scene.ts:70-73`) allows overriding per-push, which is powerful but adds another layer of "what happens when I push with X mode and the underlying scene has Y mode?" mental overhead.
- Default input mode depends on stack mode (`src/core/SceneManager.ts:364`): `overlay → passthrough`, else `capture`. This implicit dependency is not obvious from reading the Scene class alone.
- `Scene.load(loader)` and `Scene.init(loader)` both receive the loader — the distinction between "register assets" (load) and "build scene graph" (init) is sound but subtle. The Guide needed to explain it carefully.

**Recommendation:** Simplify the public vocabulary. Either merge to a single `SceneMode` with 4-5 named presets, or keep the two-axis model but expose preset constants. Either way, remove the default-mode-depends-on-mode implicit coupling.

---

### 3.2 Signals & event handling

**Current state:** `Signal<Args>` (`src/core/Signal.ts`) is a lightweight typed event emitter. Listeners are added via `signal.add(handler)`, dispatched via `signal.dispatch(...args)`, and handlers can return `false` to stop propagation. Dispatch snapshots the listener list before iterating, so handlers can safely add/remove during dispatch.

**What works:**
- The implementation is clean, type-safe, and appropriately minimal.
- `Signal.once()` auto-removing listeners is useful.
- `Signal.clearByContext(object)` for bulk cleanup is the right pattern for scene-level lifecycle.
- The snapshot-before-iterate strategy correctly handles self-removing listeners.

**What needs work:**
- Performance concern: every `dispatch()` allocates a snapshot array (`[...this._bindings]`). For per-frame signals like `onFrame`, this is a per-frame allocation. In practice, the listener count is typically 1-5, making the allocation negligible. A runner-style pre-allocated array with dirty-flag would be faster but measurably not needed until benchmarks show a problem.
- `Signal.once()` wraps the handler in a closure that is never exposed, making `signal.remove(originalHandler)` a silent no-op for `once` registrations. This is documented but can surprise.

**Recommendation:** Keep Signals as-is. The architecture is sound and the performance concern is premature. If profiling reveals a hot path, optimise internally (runner-style dispatch) without changing the public API.

---

### 3.3 Loader / asset typing

**Current state:** `Loader` (`src/resources/Loader.ts`, 1010 lines) is a comprehensive asset management hub with typed overloads, manifest/bundle workflows, background loading, cache strategy support, IndexedDB persistence, and custom factory registration.

**What works:**
- Typed `loader.load(Texture, 'hero.png')` → `Promise<Texture>` is correct and type-safe.
- `AssetManifest` and `defineAssetManifest()` provide a declarative asset definition format.
- `loadBundle('level1')` for grouped loading is practical.
- `CacheStrategy` is actually wired into the loader path (per `src/resources/Loader.ts:685` — resolved in 0.8.x, addressing the historical concern).
- The built-in factory coverage (Texture, Sound, Music, Video, FontFace, HTMLImageElement, Json, text, SVG, VTT, binary, WASM) is comprehensive.

**What needs work:**
- `loader.get(Texture, 'hero')` requires the type token at every call site. This is correct for type safety but burdensome for ergonomics.
- `loader.peek(Texture, 'hero')` and `loader.has(Texture, 'hero')` repeat the same pattern. A typed proxy (`loader.assets`) would eliminate the repetition.
- The `Loadable` type (`abstract new (...args: any[]) => any`) is a workaround for the absence of first-class abstract constructor types in TypeScript. It works but reads like compiler negotiation.
- Custom factory registration (`loader.register(type, factory)`) is powerful but underexposed in docs/examples.

**Recommendation:** Add `loader.assets` as a typed proxy. Keep the `loader.get()` path as the explicit variant. Consider typed manifest inference for longer-term ergonomics. This is a Core change.

---

### 3.4 Scene graph / transforms / camera

**Current state:** The scene graph hierarchy is `SceneNode → RenderNode → (Container | Drawable)`. `Container` owns children with `addChild`, `removeChild`, `sortableChildren` for z-index sorting, and bounds aggregation. `Drawable` extends `RenderNode` with tint, blendMode, and `render(backend)`. `View` (`src/rendering/View.ts`, 538 lines) is a full camera with center, size, rotation, zoom, viewport, follow-target with lerp, bounds constraint, and procedural shake.

**What works:**
- The `Container`/`Drawable` separation is semantically correct and well-implemented.
- `Container.sortableChildren` + `markSortDirty()` for per-frame z-sorting is performant.
- `View.follow(target, { lerp })` with automatic bounds clamping and procedural shake is feature-complete for 2D cameras.
- The `inView(backend.view)` per-node frustum culling is simple and effective.
- Bounds invalidation cascades up the ancestor chain correctly.

**What needs work:**
- `SceneNode extends Transformable` means every structural node inherits full transform state. This is the historical issue #1 and should be resolved by converting to an owned `transform` property.
- No `skewX`/`skewY` support. The transform matrix is 2D affine (position, rotation, scale, origin) but skew is absent. For a 2D game library, skew is occasionally useful (simple isometric projections, UI effects). Adding skew to the `Matrix` class is straightforward and does not complicate the render pipeline.
- `Container.width`/`height` setters divide by `bounds.width`/`bounds.height`, which can be zero for empty containers. This is an edge-case footgun.
- The `Scene.addChild`/`removeChild` proxies to `Scene.root` are convenient but the `return this` fluent pattern is unused in practice.

**Recommendation:** Resolve `Transformable` ownership. Add `skewX`/`skewY` as a nice-to-have. Remove fluent `return this` from scene graph mutation methods.

---

### 3.5 Text / fonts / layout

**Current state:** `Text` (`src/rendering/text/`) with `TextStyle`, `DynamicGlyphAtlas`, and `TextLayout`. Supports font families, size, fill/stroke, alignment, multiline, word wrap, and line height. The `FontFactory` in the loader supports `FontFace` loading.

**What works:**
- The glyph-atlas approach with dynamic cache is the right architecture for WebGL/WebGPU text.
- `TextStyle` composition is clear and extensible.
- Multiline with word wrap works.
- Font loading via `loader.load(FontFace, 'my-font.woff2')` integrates with the loader.

**What needs work:**
- No `Text.measure(text)` or `TextLayout.measure(text, style)` pre-render measurement API. Users cannot know how large text will be before creating a `Text` node. This is a critical omission for UI layout.
- Font readiness is implicit: `Text` renders with a fallback font until the loaded font is available. There is no explicit `await text.ready` or `text.fontLoaded` signal.
- The `DynamicGlyphAtlas` is exported from the rendering barrel — should be `@internal`.

**Recommendation:** Add `TextLayout.measure(text, style): { width: number; height: number }` as a static method. Add `Text.ready: Promise<void>` for font readiness. These are Core additions.

---

### 3.6 Rendering / render targets / filters / shaders / profiling

**Current state:** The rendering pipeline is mature. `RenderTarget` for offscreen rendering, `RenderTargetPass` and `CallbackRenderPass` for composable render passes, `RenderTexture` pool management, `Filter` interface with `BlurFilter`, `ColorFilter`, `LutFilter`, `WebGl2ShaderFilter`, `WebGpuShaderFilter`. `Mesh` with custom geometry, `MeshShader` with dual GLSL+WGSL support (`src/rendering/mesh/MeshShader.ts`). `DataTexture` for CPU-uploaded GPU textures. `RenderStats` with per-frame counters. `RenderPassInspectorLayer` for debug overlay.

**What works:**
- The filter chain with ping-pong RT reuse (v0.8.2) is memory-efficient.
- `MeshShader` dual-source approach correctly acknowledges that WebGL2 and WebGPU are different.
- `DataTexture.commitRect()` for partial uploads enables ring-buffer patterns.
- `RenderPassInspectorLayer` with debug-group labels for external capture tools is thoughtful.
- The `MaskSource` union type (`Rectangle | Texture | RenderTexture | RenderNode | null`) correctly documents three distinct mask paths with different performance profiles.

**What needs work:**
- Backend-specific classes (`WebGl2RenderManager`, `WebGpuSpriteRenderer`, etc.) are still root-exported. The historical recommendation to tier exports (`@stable` / `@advanced` / `@internal`) was never implemented.
- No `RenderInstructions`/`RenderGroup`-style batching architecture. The current per-drawable submission model works but cannot batch across different drawable types (sprites + meshes + text in one GPU call). This is the main architectural gap for Pixi.js-level performance.
- Profiling is limited to `RenderStats` counters. There is no Chrome DevTools integration beyond the debug-group labels added in v0.8.3.
- The `ShaderPrimitives`, `BufferTypes`, `BufferUsage` enums in `src/rendering/types.ts` expose raw WebGL2 `GLenum` values as public API. These should be `@internal`.

**Recommendation:** Tier root exports before 0.9.0. `RenderInstructions`-style batching is a post-0.9.0 engine evolution, not an API concern. Profiling improvements are separate tooling work. Move backend enums to `@internal`.

---

### 3.7 Input / action mapping

**Current state:** `InputManager` with keyboard, pointer, gamepad, and `InputBinding` for action-style bindings (`onStart`, `onActive`, `onStop`, `onTrigger`). 12 gamepad mapping classes for different controller types. `InteractionManager` for pointer hit-testing, drag, interactive/draggable flags on `RenderNode`. `SceneInputs` proxy for auto-disposing scene-bound bindings. `Scene.handleInput(event)` for raw input event routing through the scene stack.

**What works:**
- The action-binding API (`input.onTrigger(keys.Space, callback)`) is ergonomic and type-safe.
- Gamepad support with vendor-specific mappings is unusually thorough for a pre-1.0 library.
- `SceneInputs` auto-dispose is the right lifecycle pattern.
- The `SceneInputEvent` discriminated union for `handleInput` covers all event types.

**What needs work:**
- The `InputBinding` return value pattern (return the binding, call `binding.unbind()` to stop) is clear but the binding object itself is a public type that users must manage. A `SceneInputs.unbindAll()` or automatic disposal on scene unload covers this, but standalone bindings (not scene-bound) still require manual tracking.
- Gamepad mapping classes are root-exported but only relevant to users extending gamepad support — should be `@advanced`.
- No input recording/replay for deterministic testing or demo playback.

**Recommendation:** Input is solid. Move gamepad mapping classes to `@advanced`. Input recording is a post-0.9.0 extras feature.

---

### 3.8 Audio / live rhythm analysis

**Current state:** `AudioManager` (singleton), `Sound`, `Music`, `AudioBus` (mixing), `AudioFilter` (BiquadFilter wrapper), spatial audio via `AudioListener` with PannerNode, `AudioAnalyser` (AnalyserNode wrapper with mel/log spectrum mapping), `BeatDetector` (AudioWorklet-based real-time beat/tempo/downbeat tracker), `Envelope`, `crossFade`, `OscillatorSound`. Audio effects: reverb, delay, distortion, compressor via `src/audio/filters/`.

**What works:**
- The `BeatDetector` is the standout feature. It is architecturally ambitious (AudioWorklet with hand-rolled FFT, mel filterbank, tempogram, phase tracker, parallel 3/4 and 4/4 posterior estimation) and ships as working code, not a prototype. The `pulse`/`barPulse`/`justBeat`/`subdivisionPhase` derived getters for per-frame visual polling are elegantly designed.
- `AudioAnalyser` mel/log spectrum with cached filterbanks is practical and performant.
- `AudioBus` with `onceSetup` for deferred connection solves the audio context readiness problem correctly.
- Duck-typing source resolution (`_resolveToAudioNode` in both `AudioAnalyser` and `BeatDetector`) accepts MediaStream, AudioBus, Sound, Music, or raw AudioNode — genuinely polymorphic.

**What needs work:**
- The `AudioManager` is a singleton accessed via `getAudioManager()`. This is a side door that bypasses the `Application` ownership model. The AudioManager is not created or owned by the Application class — it is a module-level singleton. This contradicts the pattern where `Application` owns `loader`, `input`, `sceneManager`, `tweens`. Historical: the Opus review did not flag this, but it is an architectural inconsistency.
- `BeatDetector` uses a raw string of JavaScript embedded in TypeScript (`beatDetectorWorkletSource` in `BeatDetector.ts:112-755`). This is 643 lines of inline JS string. It works but is unmaintainable — no syntax highlighting, no type checking, no testing of the worklet code in isolation.
- The `BeatDetector` integration path (`source` setter → `_connectSource` → duck-typed resolution → `AudioWorkletNode`) is correct but the duck-typing code is duplicated in `AudioAnalyser` (same `_resolveToAudioNode` pattern, same `_deferConnectionViaBus` logic). This should be extracted into a shared `AudioTap` utility.

**Recommendation:** 
1. Move the `BeatDetector` worklet source to a separate `.js` file and import it as a raw string (Rollup already has `rollup-plugin-string`). This makes the worklet code editable with proper tooling support.
2. Extract shared source-tapping logic into a `resolveAudioTap()` utility.
3. Decide whether `AudioManager` should be owned by `Application` or remain a singleton. The singleton is pragmatic but architecturally inconsistent with the rest of the ownership model.
4. The `BeatDetector` and `AudioAnalyser` are core-level features and should remain in core.

---

### 3.9 Particles

**Current state:** `ParticleSystem` (`src/particles/ParticleSystem.ts`) with `modules/` (emitters, affectors, distributions) and `gpu/` (GPU particle rendering). GPU particles use WebGL2/WebGPU instanced rendering.

**What works:**
- The particle system is feature-rich: emitters, affectors (color, scale, rotation, velocity, torque, attraction), distributions (point, line, circle, rectangle, ring, textures), GPU rendering with instancing.
- The system works as both a `RenderNode` in the scene graph and as a standalone updateable system.

**What needs work:**
- The API surface is large and complex. `ParticleSystem`, `ParticleEmitter`, `ParticleOptions`, multiple affector classes, distribution types — this is a subsystem, not a simple effect.
- The "GPU particle" path is a separate rendering architecture that parallels the sprite/mesh rendering path. This is architecturally correct but adds maintenance burden.
- The particles module is tightly integrated into both WebGL2 and WebGPU renderers — separating it as an extras package would be invasive.

**Recommendation:** Keep particles in core. The integration is too deep to split. But consider whether a simpler, higher-level particle API (e.g. `ParticleEffect.fire({ at: position, texture, count: 50 })`) should complement the existing low-level API for the 80% use case.

---

### 3.10 Collision / physics

**Current state:** Collision detection (`src/math/collision-detection.ts`, 823 lines) and helper primitives (`src/math/collision-primitives.ts`). `SceneNode implements Collidable` with `getBounds()`, `getNormals()`, `project()`, `contains()`. SAT-based intersection for all shape combinations. `Quadtree` (`src/math/Quadtree.ts`) for spatial partitioning. Rapier physics adapter is optional and lazily loaded.

Covered in detail in Findings #8. See also Wishlist triage for physics.

---

### 3.11 App configuration

Covered in Finding #6. Additionally:

- `Application` has 18 public members (`canvas`, `loader`, `input`, `interaction`, `sceneManager`, `tweens`, plus 6 signals, plus `pauseOnHidden`, `cursor`, etc.). This is a wide surface for a top-level class.
- The `Application.audio` getter returns a singleton — inconsistent with `loader`/`input`/`sceneManager`/`tweens` being owned instances.
- `Application.update()` has a hardcoded sequence: `resetStats → input.update → interaction.update → audio.update → tweens.update → view.update → sceneManager.update → onFrame → flush → stats`. This is the right order but users cannot customise it without subclassing and overriding the entire `update()` method.

**Recommendation:**
1. Group `ApplicationOptions` by subsystem.
2. Decide whether `audio` should be owned (current singleton, accessible via `app.audio`) or whether all subsystems should be singletons (unlikely — inconsistent with existing design).
3. Consider an `Application.onPreUpdate` / `Application.onPostUpdate` signal pair for hook injection without overriding the method.

---

### 3.12 Extras / modularisation

**Current state:** The `./debug` subpath export (`@codexo/exojs/debug`) exists for `DebugLayer`, `BoundingBoxesLayer`, `HitTestLayer`, `PerformanceLayer`, `PointerStackLayer`, and `RenderPassInspectorLayer`. The rest of the API ships from the root path (`@codexo/exojs`). No other extras or optional sub-packages exist.

**What works:**
- The `./debug` subpath is the right pattern for optional diagnostics. It separates debug tooling from the core rendering API.
- Rapier physics is already effectively an "extras" integration via optional peer dependency + dynamic import.

**What needs work:**
- The `./debug` subpath creates an asymmetry: debug is a subpath, but particles (which is larger and more niche) is root. The criterion for what becomes a subpath vs. what stays in root should be explicit.
- The historical recommendation (Opus review, `05-public-api-and-exports.md`) to tier exports with `@stable` / `@advanced` / `@internal` JSDoc tags was never implemented. This is the most important pre-0.9.0 governance change.

**Recommendation:** Implement export tiering (JSDoc tags + CI report) before 0.9.0. Use the `./debug` subpath as the model for future extras. Consider a `./extras` subpath for community-style extensions that are maintained alongside core but with a lower stability promise.

---

### 3.13 Examples / real-world workflow friction

**Current state:** 24 example directories under `examples/` covering application scenes, audio, beat detection, custom renderers, debug, filters, geometry, getting-started, input, particles, performance, render targets, scene graph, showcase, spatial audio, sprites/textures, text/fonts, and tweens. The examples catalog has grown substantially from the historical baseline (which had ~17 examples across 6 categories).

**What works:**
- The example catalog is comprehensive and well-organised by domain.
- The examples use modern ExoJS patterns (class-based scenes, typed loader, manifest bundles).

**What needs work:**
- The historical examples used `Scene.create({...})` — a factory pattern that no longer exists. Current examples must use `class MyScene extends Scene {}`. The class-based approach is more TypeScript-idiomatic and enables better type inference, but it is also more verbose than the old factory pattern for simple demos.
- Boilerplate comparison (old vs. new):
  - Old sprite example: 33 lines, factory-based scene, `Scene.create({...})`
  - Current equivalent: ~45 lines, class-based scene, explicit constructor
  - The extra lines are mostly ceremony (`export class MyScene extends Scene {`, `public constructor() { super(); }`). The actual game logic is the same length.
- Asset loading boilerplate is identical: `loader.load(Texture, { ... })` in both eras.
- The examples JSON (`examples/examples.json`, 1506 lines) has machine-generated descriptions (`"Example: Camera And View."`) that add no value. Manual descriptions would better serve discovery.

**Recommendation:** The class-based scene pattern is correct for TypeScript. Do not reintroduce factory scenes. Clean up example descriptions.

---

## 4. Historical delta, identity continuity, and research alignment

### 4.1 Historical roadmap/review delta

**What the old reviews got right:**
- The Opus review correctly identified `SceneNode extends Transformable` as a 1.0 blocker. It still is.
- The Opus review correctly identified the verb naming inconsistency (`draw` vs `render`) and recommended unification. It was never acted on.
- The post-reset roadmap correctly identified the root export surface as too broad. The surface has only grown since then (332 exports in the Opus era → more now with MeshShader, DataTexture, Mesh, etc.).
- The post-reset roadmap's release sequence (0.4.x cleanup → 0.5.0 API decisions → ... → 0.9.0 RC) was sound. The actual sequence through 0.8.4 delivered far more features than planned (Guide, Playground, BeatDetector, MeshShader, DataTexture, debug layers, full audio effects) but deferred several of the 0.5.0 API decisions.

**What has since been resolved:**
- Package identity: `"type": "module"` is now in `package.json` (added between 0.4.0 and 0.8.4). The ESM typeless-package warning is gone.
- `sideEffects` is accurate (`["./dist/esm/rendering/sprite/Sprite.js"]`).
- Scene docs now say `draw(backend: RenderBackend)` — aligned with source.
- Mask semantics: the `MaskSource` union type now supports `Rectangle | Texture | RenderTexture | RenderNode | null`, which is honest and well-documented. The "rectangular-only" criticism from the Opus review is resolved — the API now documents three distinct mask paths with cost summaries.
- `Scene.root` JSDoc explicitly states "structural, not render-authoritative" — the documentation discipline the Opus review requested.
- `CacheStrategy` is wired into the loader — the historical concern about "exported but not integrated" is resolved.

**What remains:**
- `SceneNode extends Transformable` (historical issue #1) — unresolved.
- Verb naming inconsistency — unresolved.
- Root export tiering — unresolved.
- `Sprite.ts` top-level static registration side effect — still present.

**What changed in priority:**
- The need for a `RenderInstructions`-style batching architecture has risen in priority as the library adds more drawable types (sprites, meshes, text, particles, debug overlays).
- The audio subsystem has become a strategic differentiator, not just a feature checkbox. BeatDetector specifically could anchor a "creative coding / audio-visual tools" identity niche.
- The Guide is now complete, making API friction more visible and actionable.

---

### 4.2 Identity continuity and look-and-feel comparison

**Does current ExoJS still feel like the same library?** Yes. The core loop — create an `Application`, subclass `Scene`, override `update` and `draw`, load assets via `Loader`, position sprites in a `Container` — is recognisably the same mental model as the old examples. The identity document's principles (explicit, honest, structured, pragmatic) are still reflected in the code.

**Where has coding style improved?**
- Class-based scenes with typed lifecycle methods (`load(loader)`, `init(loader)`, `update(delta)`, `draw(backend)`) are a clear improvement over the old `Scene.create({...})` factory. The types are stronger and autocomplete is better.
- `SceneInputs` auto-dispose removes the most common lifecycle bug (forgetting to unbind input handlers).
- `AssetManifest` and `loadBundle` are a significant improvement over ad-hoc `loader.load(Texture, { ... })` for every asset.
- The `interactive` + `draggable` flags on `RenderNode` replace what would have been manual hit-testing code.

**Where has coding style become more cumbersome?**
- Asset access boilerplate has not improved. Both old and new examples write `loader.get(Texture, 'hero')`.
- Scene stacking with separate `mode` and `input` properties is more complex than what the old examples needed (they had no scene stacking at all, so the comparison is not direct, but the added complexity is real).
- The `View` camera API is rich but verbose. A simple "follow this sprite with smooth camera" requires `view.follow(sprite, { lerp: 0.1 })` and `view.update(delta.milliseconds)` every frame — the latter is done automatically but users must know to set up the follow.

**Which divergences from earlier identity are good?**
- The scene graph (`Container`, `Drawable`, `RenderNode`) is a beneficial divergence from the old "no scene graph" stance. The identity correction ("not anti-scene-graph, anti-implicit-render-coercion") was the right framing.
- `Graphics extends Container` (as a container of `DrawableShape` children) is a beneficial divergence from the old uncertainty about whether Graphics should be a Container or a Drawable. The current model is semantically correct: shapes are drawables, graphics groups them.
- The debug subpath is a good divergence from the "one dominant path" principle — it is the right kind of intentional secondary path.

**Which divergences are questionable?**
- The `AudioManager` singleton diverges from the `Application` ownership pattern without documented rationale.
- The growing `ApplicationOptions` flat object diverges from the "structured, clear boundaries" identity.
- The particles system diverges into engine-level complexity without a correspondingly simple high-level API.

**What do the old examples reveal when compared with current examples?**
- The old `sprite.js` (33 lines) vs a current sprite example (~45 lines): the extra lines are class ceremony and explicit draw orchestration. The explicit draw is identity-aligned and worth the cost. The class ceremony is TypeScript boilerplate that could be reduced with a `Scene.define({...})` factory that returns a typed Scene class without losing type inference — but this is a nice-to-have, not essential.
- The old `container.js` used `renderManager.clear()` explicitly; the current code does not need to call `clear()` because the backend handles it. This is one area where "less explicit" is actually better.
- The old `bonfire.js` particle example used `UniversalEmitter`, `ColorAffector`, and `BlendModes.Additive`. The current particle API is conceptually similar but has more options and configuration. The complexity increase is proportional to capability increase.

---

### 4.3 Beat-matching research alignment

**Whether current ExoJS audio direction aligns with the research:** Yes, with qualifications. The `BeatDetector` implements a **Stage 1 DSP-based hybrid tracker** exactly as the research recommends: kausale spectral flux (SuperFlux-lite with lag k=3), sliding-window tempogram via autocorrelation, adaptive beat-phase tracking with snap correction, confidence from peak contrast + IBI variance + bar consistency, and parallel 3/4 + 4/4 posterior estimation with hysteresis switching. The output model (`tempo`, `beatPhase`, `nextBeatTime`, `confidence`, `tempoCandidates`, `rms`, `onsetStrength`, `bandEnergy`, `timeSignature`, `barPosition`, `lookahead`) maps almost exactly to the research's recommended output model.

**Whether live beat/rhythm analysis could become a strategic differentiator:** Absolutely. No other browser 2D runtime ships a real-time beat tracker. Pixi.js, Phaser, Three.js have no equivalent. ExoJS could own "creative coding / audio-reactive visuals / rhythm game foundation" as a niche. The `pulse`/`barPulse`/`justBeat`/`subdivisionPhase` derived getters are already a better creative-coding API than any competitor offers.

**What architectural/API work would be needed before that path becomes serious:**
1. **Extract the worklet source to a separate file** — the 643-line inline string in `BeatDetector.ts` is unmaintainable as the algorithm grows.
2. **Add microphone/live-audio input as a first-class source** — currently `MediaStream` works via duck-typing, but explicit microphone support with permission handling would make this a user-facing feature.
3. **Extract shared audio tap logic** — the duck-typing source resolution is duplicated between `AudioAnalyser` and `BeatDetector`.
4. **Consider WASM for FFT/feature extraction** — the current JS FFT in the worklet works but a WASM implementation would scale better. The research explicitly recommends WASM for Stage 2/3 expansion.
5. **Stabilise the `BeatInfo`/`UpcomingBeat`/`BarInfo`/`TempoCandidate`/`BandEnergy` interfaces** — these are the public contract for the beat-tracking feature and should be treated as stable API.

**Classification:** BeatDetector and AudioAnalyser belong in Core. WASM acceleration and advanced ML-based detection stages belong in extras or are deferred. The core value is the API surface, not the algorithm implementation.

---

## 5. Areas that should change before 0.9.0

### Must fix

| Area | Change | Rationale |
|------|--------|-----------|
| `Transformable` ownership | Convert from inheritance to owned property on `SceneNode` | Historical issue #1; impossible to undo after 1.0 |
| Loader asset access | Add `loader.assets` typed proxy or equivalent convenience API | Highest daily DX friction |
| Export tiering | JSDoc `@stable` / `@advanced` / `@internal` tags on all root exports + CI report | Prevents accidental 1.0 stability commitments for internals |
| `SceneNode.render` | Remove `render` no-op from `SceneNode`; move to `RenderNode`-only | Opus review recommendation #5; structural nodes should not have render methods |
| Worklet source extraction | Move `beatDetectorWorkletSource` to a separate `.js` file | Unmaintainable 643-line inline string; blocks audio feature evolution |

### Strongly recommended

| Area | Change | Rationale |
|------|--------|-----------|
| Scene stacking vocabulary | Merge to single `SceneMode` enum or add preset constants | Reduces cognitive load and Guide complexity |
| Verb naming | Unify on `draw()` for user-facing chain per Opus Option N1 | Aligns with identity; makes call chain readable |
| `ApplicationOptions` | Group by subsystem | Prevents config sink; makes the "first thing users see" coherent |
| Tween integration | Add `Sprite.tween()`, `View.tween()`, `Filter.tween()` entry points | Makes Tween feel like a first-class ExoJS subsystem |
| Font/text measurement | Add `TextLayout.measure(text, style)` | Critical omission for UI layout |
| AudioManager ownership | Decide: singleton or Application-owned | Architectural consistency with the rest of the ownership model |
| Audio tap extraction | Extract shared source-tapping logic from `AudioAnalyser` and `BeatDetector` | Eliminates duplicated duck-typing code |

### Opportunistic

| Area | Change | Rationale |
|------|--------|-----------|
| Fluent APIs | Standardise or remove `return this` outside Tween and View | Consistency; current partial fluence is confusing |
| BlendModes expansion | Add `Overlay`, `SoftLight`, `HardLight` | Parity with CSS blend modes and Pixi.js |
| `skewX`/`skewY` | Add to `Matrix`/`Transformable`/`SceneNode` | Low-cost, occasionally useful for 2D games |
| Render dispatch docs | Add architecture doc for the call chain | Contributor education; protects explicit-draw identity |
| Example descriptions | Replace machine-generated descriptions with manual ones | Improves example catalog discoverability |
| Backend enums | Move `ShaderPrimitives`, `BufferTypes`, `BufferUsage` to `@internal` | Remove WebGL2 constants from public API surface |

---

## 6. Areas that should probably remain stable

| Area | Why it is strong | Risk of churning it |
|------|------------------|---------------------|
| `Scene.draw(backend)` empty stub contract | Identity-aligned; tested; documented | Would break the explicit orchestration guarantee |
| `Scene.root` as structural-only | Correctly documented JSDoc; test-enforced | Would create implicit render coercion |
| Render dispatch direction (`Drawable → Runtime → Registry → Renderer`) | Correct architecture; identity-aligned | The chain direction is the right design; only verb naming needs work |
| `Container` / `Drawable` separation | Semantically correct; no inheritance lie | Would create false type relationships |
| `Signal` implementation | Clean, type-safe, snapshotted dispatch | Premature optimisation risk; current design is correct |
| `Loader` core API (`load`/`get`/`has`/`peek`/`unload`/`loadBundle`) | Typed, tested, documented | The surface is stable; only convenience additions needed |
| `View` camera | Feature-complete for 2D | No missing capabilities; tweens can enhance ergonomics additively |
| `RenderBackend` interface | Honest backend boundary | Freezing the interface now would be premature; let it evolve through 0.9.x |
| `ParticleSystem` architecture | Complex but correct (GPU instanced + CPU affectors) | Too deeply integrated to refactor; add a simpler high-level API instead |
| Rapier physics integration | Correctly scoped (optional, lazy, honest naming) | The Opus review's "Keep it. Cap it." recommendation stands |
| `MeshShader` dual-source design | Correctly acknowledges WebGL2 ≠ WebGPU | The class-based dual-source approach is the right pattern |
| `./debug` subpath | Right model for optional diagnostics | Replicating this pattern for other domains would be consistent |
| `Filter` interface | Clean composable chain with ping-pong RT reuse | The interface is stable; new filter implementations can be additive |

---

## 7. Wishlist triage

### Tilesets
**Classification:** Extras
**Why:** TileMap support with layers, autotiles, Tiled format, and multiple tilesets is a substantial feature. It appeals to a specific audience (level-based 2D games) but is not general-purpose. The architecture (data format → GPU batching → scene graph integration) is separable from core rendering. Ship as `@codexo/exojs/extras/tileset` or a separate package.
**Urgency:** Defer until after 0.9.0. **Fit:** Good — a tileset renderer on top of ExoJS's sprite batching is a natural extension.

### Physics
**Classification:** Extras (already exists as optional Rapier adapter). The lightweight collision response world (Finding #8) could be Core.
**Why:** Rapier handles full physics simulation. The collision response world handles the simpler "did things touch? push them apart" case. Keep Rapier as-is. Add collision response as a core feature since `SceneNode` already implements `Collidable`.
**Urgency:** Collision response: post-0.9.0. Rapier: stable, no changes needed.

### WebHID
**Classification:** Defer
**Why:** WebHID enables custom gamepad/joystick/arcade stick support beyond the standard Gamepad API. The current gamepad support is comprehensive for standard controllers. WebHID is niche (requires Chrome, user gesture, device-specific code). Interest would need to be demonstrated by real user demand.
**Fit:** Weak — the audience overlap between "2D game library users" and "WebHID custom controller users" is small.

### WASM
**Classification:** Core (for audio), Extras (for general compute)
**Why:** WASM is already used implicitly via Rapier's WASM build. For audio, WASM-accelerated FFT/feature extraction would benefit `BeatDetector` quality and performance. For general compute, WASM is a user concern — ExoJS should not abstract WASM loading, but the `Loader` already supports `loader.load(WebAssembly.Module, 'module.wasm')` and `Wasm` token.
**Urgency:** WASM-accelerated audio: post-0.9.0. WASM loading: already supported.

### Microphone/webcam inputs
**Classification:** Core (for existing `MediaStream` source support), Extras (for explicit `getUserMedia` helpers)
**Why:** `BeatDetector` and `AudioAnalyser` already accept `MediaStream` as a source. What's missing is a convenient way to acquire the stream — a `navigator.mediaDevices.getUserMedia({ audio: true })` wrapper with permission handling. A `Microphone` class in Extras would be appropriate.
**Fit:** Good — audio-visual creative coding is a potential differentiator. **Urgency:** Defer until after 0.9.0.

### Networking
**Classification:** Separate package or Defer
**Why:** Networking is a different product category. Real-time multiplayer requires WebSocket/RTC management, serialisation, state sync, interpolation, prediction, and reconciliation. This is an entire library's worth of scope. ExoJS should not absorb it into core or extras. If the ExoJS ecosystem grows a networking solution, it should be `@codexo/exojs-net` with ExoJS as a peer dependency.
**Fit:** Poor — networking is orthogonal to rendering/audio/input. **Urgency:** Reject for core/extras. Defer separate-package discussion until after 1.0.

### Extras strategy
**Classification:** Core governance question
**Current state:** The `./debug` subpath is the only extras. The single-import-path decision keeps everything in the root barrel.
**Recommendation:**
1. Keep the root barrel as the primary import path.
2. Use the `./debug` subpath pattern for optional subsystems that ship in the same npm package but are not part of the core import.
3. Tier root exports with `@stable` / `@advanced` / `@internal` JSDoc tags so users know the contract level of what they import from the root.
4. Candidates for future subpaths: `./extras/tileset`, `./extras/pathfinding`, `./extras/9slice`.
5. Do not split WebGL2/WebGPU backends — the auto-selection is too integrated to separate.
6. Do not split particles — the GPU renderer integration is too deep.

### 9-slice scaling
**Classification:** Extras
**Why:** 9-slice (nine-patch) scaling is a common UI pattern for scalable panels/buttons. It is a rendering feature that could be implemented as a `NineSliceSprite` extending `RenderNode`. Not essential for the core rendering pipeline.
**Urgency:** Defer until after 0.9.0. **Fit:** Good — a natural extension of the sprite rendering path.

### Pathfinding
**Classification:** Extras or separate package
**Why:** A* or similar grid-based pathfinding is useful for game development but is not a rendering concern. It could be a standalone utility that works with ExoJS's `SceneNode` positions and collision data. Better as a separate package to avoid pulling graph algorithms into a rendering library.
**Urgency:** Defer until after 0.9.0. **Fit:** Moderate — useful but not in the rendering/audio/input core.

### 3D meshes
**Classification:** Reject for core. Defer for experimentation.
**Why:** ExoJS is a 2D runtime. 3D rendering requires a fundamentally different architecture (depth buffer, perspective projection, 3D transforms, lighting, materials, shadow mapping). The `Mesh` class with custom shaders already provides a bridge for 2.5D effects (parallax, pseudo-3D, sprite billboarding). Full 3D mesh support would make ExoJS compete with Three.js/Babylon.js — a different market, a different identity, and a different complexity class. **Do not pursue.**

### Compute shaders
**Classification:** Extras
**Why:** Compute shader access would enable GPU-accelerated simulations (fluid, particle physics, cellular automata) that feed into ExoJS rendering. WebGPU supports compute shaders natively; WebGL2 does not. This is naturally backend-specific and should be exposed as an advanced/experimental API, not a core feature.
**Urgency:** Defer until after 0.9.0. **Fit:** Good for advanced users; keep behind `@advanced` or `@experimental` tiering.

### Extended Application Options
**Classification:** Core (restructuring, not expansion)
**Why:** Covered in Finding #6. The options should be grouped, not expanded. New configuration should go into the appropriate subsystem group rather than appending to a flat interface.

### Profiling / Chrome DevTools integration
**Classification:** Separate tooling work
**Why:** The debug-group labels in v0.8.3 are a good start. Deeper profiling (timeline export, pass/batch attribution, object-level inspection) is valuable but is a tooling concern, not an API stability concern. It can be built on top of the existing `RenderStats` and `RenderPassInspectorLayer` without changing the public API.
**Urgency:** Post-0.9.0.

### RenderInstructions / RenderGroup-style rendering architecture
**Classification:** Post-0.9.0 engine evolution
**Why:** This is the main architectural gap for Pixi.js-level performance. But it is an internal engine change, not a public API change. The current per-drawable submission model exposes a clean `Drawable.render(backend)` interface. A future batching architecture would keep the same public interface while changing the internal dispatch to collect render instructions before emitting GPU calls. This can and should happen after 0.9.0 without breaking the public API.

### Playground/Examples/assets/minigames/Lighting System
**Classification:** Examples/Playground work
**Why:**
1. **Higher-quality assets:** Replace current placeholder assets with polished, high-resolution assets matching the site identity. This is important for public perception. **Urgency:** Before 0.9.0.
2. **Larger examples/minigames:** Add 1-2 complete minigames that stress-test all ExoJS systems simultaneously. This serves as both a demo and an integration-test mechanism. **Urgency:** Before 0.9.0.
3. **Lighting System example:** Add a lighting/illumination example using `BlendModes`, `RenderTexture`, and custom shaders. Demonstrates the composability of ExoJS's rendering features. **Urgency:** Post-0.9.0.

---

## 8. Boilerplate and DX friction found in guide/examples

### Recurring patterns that could be simplified

1. **Asset access:** `loader.get(Texture, 'hero')` at every construction site. A `loader.assets.texture('hero')` proxy or typed manifest inference would eliminate the repeated type token.

2. **Scene class ceremony:** Every example begins with `export class MyScene extends Scene { ... }`. For simple examples, this is mostly boilerplate. The old `Scene.create({...})` factory reduced this but lost type inference. A middle ground — `Scene.define({...})` returning a typed class constructor — would help but is not urgent.

3. **Manual `draw` implementation:** Every scene must implement `draw(backend)` and call `this.root.render(backend)` or equivalent. This is intentional (explicit draw identity) but creates a boilerplate line that every scene repeats. A `Scene.autoDraw = true` opt-in flag was suggested in the Opus review and remains a valid feature request, provided it is an explicit opt-in.

4. **`app.backend` vs `app.backend.view`:** The `RenderBackend` interface exposes the `View` as `backend.view`. Users who want camera operations must write `app.backend.view.follow(...)`. A direct `app.view` proxy on `Application` would reduce indirection for the common case.

5. **`SceneParticipationPolicy` overrides:** When pushing a scene with non-default policy, users must import `PushSceneOptions` and write `app.sceneManager.pushScene(myScene, { mode: 'modal', input: 'capture' })`. The preset constants suggested in Finding #2 would reduce this to `pushScene(myScene, ScenePresets.pauseMenu)`.

6. **Font loading uncertainty:** The Guide needed to explain that text renders with a fallback font until the loaded font is available, and that there is no explicit readiness signal. `Text.ready` would eliminate this uncertainty.

7. **Custom shader verbosity:** `MeshShader` with dual GLSL+WGSL requires users to provide both shader sources (or one, with a clear error for the other backend). The API is honest about backend differences but verbose. A `MeshShader.webgl2(glsl)` / `MeshShader.webgpu(wgsl)` factory could be split for single-backend users, but the current unified class is more future-proof.

---

## 9. Proposed roadmap

### Remaining 0.8.x (one release: 0.8.5)

Focus: fix the highest-priority DX friction without redesign.

- Add `loader.assets` typed proxy
- Add `TextLayout.measure(text, style)` and `Text.ready`
- Extract `beatDetectorWorkletSource` to a separate file
- Extract shared audio tap logic from `AudioAnalyser` and `BeatDetector`
- Add `ScenePresets` constants for common scene stacking combinations
- Add `ApplicationOptions` subsystem grouping (backward-compatible — keep flat access as deprecated aliases)
- Standardise fluent `return this`: remove from scene graph mutation methods (non-breaking if no downstream code chains them)
- Add `View` convenience methods on `Application` (`app.view`, proxy to `app.backend.view`)
- Improve example descriptions from machine-generated to manual

### 0.9.0 — API consolidation

Focus: decisions that change the stable API contract before hardening.

- Resolve `SceneNode extends Transformable` → owned `transform` property
- Unify verb naming: `draw()` for user-facing chain, `submit()` for renderer
- Remove `SceneNode.render()` no-op; move render to `RenderNode` only
- Implement root export tiering (`@stable` / `@advanced` / `@internal` JSDoc + CI report)
- Merge scene stacking modes into single enum *or* finalise preset constants as the public API
- Add Tween integration entry points (`Sprite.tween()`, `View.tween()`, `Filter.tween()`)
- Resolve `AudioManager` ownership (singleton vs Application-owned)
- Add `skewX`/`skewY` to transforms
- Add `BlendModes.Overlay`/`SoftLight`/`HardLight`
- Group `ApplicationOptions` properly (breaking change from 0.8.x flat surface)

### Post-0.9.0 — engine evolution and ecosystem

Focus: features that can be built on the stable API without changing it.

- `RenderInstructions`-style batching architecture (internal engine change)
- Collision response world (`CollisionWorld` or `CollisionGroup`)
- Tileset support (`@codexo/exojs/extras/tileset` or separate package)
- 9-slice scaling (`NineSliceSprite` in extras)
- Pathfinding (extras or separate package)
- Microphone input helper (`Microphone` in extras)
- WASM-accelerated audio feature extraction (Stage 2/3 BeatDetector)
- Compute shader access (behind `@experimental` tiering)
- Profiling/chrome-tracing integration (tooling, not API)
- Larger minigame examples and lighting example
- Higher-quality assets for Playground

### Dependencies and sequencing

```
0.8.5 (DX patch)
  └─ loader.assets, Text.measure, worklet extraction, presets, AppOptions grouping
     └─ 0.9.0 (API consolidation)
          ├─ Dependent on: 0.8.5 AppOptions grouping (so 0.9.0 can declare the final shape)
          ├─ Transformable ownership UNBLOCKED
          ├─ Verb naming UNBLOCKED
          ├─ Export tiering UNBLOCKED
          └─ Scene mode vocabulary UNBLOCKED
             └─ 0.9.x (stabilisation)
                └─ 0.10.0 → 1.0.0 (if no further breakage needed)
```

The key insight: 0.8.5 should deliver the additive improvements that reduce daily friction. 0.9.0 should deliver the breaking changes that define the 1.0 contract. This keeps 0.9.0 focused and minimises churn.

---

## 10. Risks / tradeoffs

### Scope creep

**Risk:** The wishlist (tilesets, physics, networking, 3D, compute shaders, pathfinding, WebHID, 9-slice) represents a potential explosion of scope. ExoJS is a 2D runtime, not a game engine.

**Mitigation:** Use the triage in Section 7. Core = rendering + audio + input + scene graph + asset loading. Extras = opt-in subsystems shipped in the same package with lower stability. Separate packages = substantial features with their own release cadence. Defer = not now. Reject = never in ExoJS scope.

### Core bloat

**Risk:** The `BeatDetector` alone adds ~1200 lines of TypeScript plus 643 lines of inline worklet JS. `ParticleSystem` with all modules/gpu is a significant subsystem. The library is approaching an "everything runtime" identity rather than a focused 2D library.

**Mitigation:** The identity question is whether ExoJS is a "rendering library that also has audio/input/particles" or a "2D runtime for games and interactive apps." The `package.json` description says the latter. The current surface is consistent with that description. The risk is not current bloat — it is future bloat. The triage framework (Core/Extras/Separate/Defer/Reject) must be applied rigorously to new proposals.

### API churn

**Risk:** The roadmap proposes breaking changes in 0.9.0 (`Transformable` ownership, verb renaming, `SceneNode.render` removal, `ApplicationOptions` restructuring). Users who adopted ExoJS between 0.5.0 and 0.8.4 will face migration work.

**Mitigation:** ExoJS is still pre-1.0 with an explicit "API may change" notice in the README. The 0.9.0 release notes should include a migration guide. The breaking changes should be made in a single release (0.9.0), not spread across multiple releases. The pre-0.9.0 period is the right time for these changes — after 1.0, they become infeasible.

### Performance risk

**Risk:** The `BeatDetector` AudioWorklet does hand-rolled FFT in JavaScript. While it works, it is not optimised. The per-frame `Signal.dispatch()` snapshot allocation adds GC pressure.

**Mitigation:** The FFT operates on the audio rendering thread (not the main thread), so performance impact on rendering is minimal. A WASM FFT would improve it but is not blocking. The `Signal` snapshot allocation is per-dispatch, not per-frame — most signals fire infrequently. The `onFrame` signal fires every frame but typically has 1-2 listeners, making the array allocation negligible.

### Docs/examples maintenance cost

**Risk:** The Guide is now 38 chapters. Every API change in 0.8.5 and 0.9.0 requires Guide updates. The examples catalog has 24 directories and must be maintained in sync with the API.

**Mitigation:** The `scripts/sync-example-capabilities.ts` and versioned example infrastructure already exist. The Guide's source-verification pass (v0.8.4) established a baseline. Use the same verification discipline for future releases. Accept that significant API work in 0.9.0 will require a corresponding docs/examples pass.

### Premature abstraction

**Risk:** The `RenderBackend` interface, `Renderer`/`RendererRegistry` dispatcher, `Filter` chain, and `RenderPass` abstraction create multiple layers of indirection in the rendering path. Adding a `RenderInstructions` layer would add another.

**Mitigation:** Each existing abstraction has a clear purpose: `RenderBackend` isolates backend-specific code, `RendererRegistry` enables type-keyed dispatch, `Filter` enables composable post-processing, `RenderPass` enables render-to-texture workflows. None are abstractions for abstraction's sake. A future `RenderInstructions` layer would serve batching — a measurable performance need. The principle should be: add an abstraction only when it solves a concrete problem (performance, backend isolation, composability), not when it "might be useful later."

### Overspecialising toward niche features

**Risk:** The `BeatDetector` with time-signature detection, the 12 gamepad mapping classes, and the `MeshShader` dual-source design all target specific niches. Over-indexing on these could make ExoJS feel like a collection of specialised tools rather than a coherent library.

**Mitigation:** The specialised features are already implemented. The risk is adding *more* specialised features. The triage framework should reject features that serve a single niche unless they align with a deliberate differentiation strategy (audio-visual creative coding is a defensible niche; custom gamepad mapping is less so).

### Losing or diluting ExoJS identity

**Risk:** As the library grows, the identity principles (explicit, honest, structured, pragmatic) become harder to enforce consistently. The `AudioManager` singleton already contradicts the ownership model. The growing `ApplicationOptions` contradicts "structured boundaries."

**Mitigation:** Every new feature should be tested against the identity document: "Is this explicit or implicit? Is this honest about its boundaries? Does it add structure or blur it? Is it pragmatic or clever for its own sake?" The identity document itself should be reviewed and updated to reflect the current scope (e.g., "ExoJS is a 2D runtime" not "ExoJS is a rendering library").

---

## 11. Final recommendation

**ExoJS v0.8.4 is a stronger library than the historical reviews anticipated.** The 0.5.0 API decisions that were deferred have not rotted — they remain clear, actionable, and well-understood. The Guide is complete. The audio subsystem has become a genuine differentiator. The scene graph model is correct. The rendering pipeline is honest and capable.

**What to investigate next:** The `Transformable` ownership question. This is the most impactful remaining decision and blocks clean separation of structural nodes from renderable nodes. A quick spike (convert inheritance to property, run the test suite, update the Guide snippets that reference `node.x`/`node.y` → `node.transform.x`/`node.transform.y`) would reveal the real impact.

**What to build next:** The 0.8.5 DX patch. The `loader.assets` proxy, `TextLayout.measure()`, worklet source extraction, preset constants, and `ApplicationOptions` grouping are all additive or backward-compatible changes that make the library noticeably more pleasant to use. They are low-risk, high-reward, and can ship quickly.

**Whether v0.9.0 should be accelerated or delayed:** One 0.8.x release, then 0.9.0. Do not accelerate 0.9.0 — the breaking changes (`Transformable`, verb renaming, `SceneNode.render` removal, `ApplicationOptions` restructuring, scene mode vocabulary) deserve a focused release with a migration guide. Do not delay 0.9.0 indefinitely — the changes are well-understood and the library should harden its API before gaining more users.

**What to ignore for now:** Tilesets, networking, 3D meshes, pathfinding, 9-slice, WebHID. These are all valid ideas for the ExoJS ecosystem but none of them should block the API consolidation milestone. The `RenderInstructions` batching architecture should also wait — it is an internal engine optimisation, not an API concern.

**Bottom line:** ExoJS is ready to become a stable product. The path is: one DX-focused patch release to reduce friction, one API-consolidation release to make the breaking changes the library needs, then stabilise toward 1.0. The identity is intact. The architecture is sound. The surface needs smoothing — and all the rough edges are already identified.
