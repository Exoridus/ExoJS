# ExoJS v0.8.4 — Product & API Ergonomics Review

**Reviewer**: Claude Sonnet 4.6 (independent review, no prior model input)  
**Baseline**: v0.8.4  
**Date**: 2026-05-15  
**Scope**: Product identity, API ergonomics, documentation/learning curve, pre-0.9.0 recommendations

---

## 1. Executive Verdict

ExoJS at v0.8.4 is still recognizably the same strong idea — just significantly more capable. The core identity (explicit rendering, class-based lifecycle, typed resources, structural honesty) has been maintained through a period of heavy feature addition. The particle system rewrite (0.8.0) was the most ambitious change and it landed well: the new SoA/module pattern is meaningfully cleaner than the historical per-particle mutation approach. BeatDetector is a genuine category differentiator. MeshShader and DataTexture extend the rendering floor without cluttering the ceiling.

The identity question — "same strong idea, now much more capable" vs "more powerful, less coherent" — has a clear answer: **ExoJS is still coherent.** The explicit rendering contract is intact. The class-based scene lifecycle hasn't drifted. The API has grown but not sprawled. The identity documents' core claims — "ExoJS will klare Struktur und klare Kontrolle gleichzeitig" — remain true at every level of the stack.

That said, there are three friction clusters worth addressing before 0.9.0:

1. **Missing transforms**: No `skewX`/`skewY`. For a framework with a full 2D affine transform system, this is a visible gap — especially for text effects, card-flip UX, and CSS-to-canvas migration scenarios.

2. **Blend mode coverage**: Five modes (Normal, Additive, Subtract, Multiply, Screen). Defensible for games but narrow for creative coding. Three additions (Overlay, HardLight, Difference) close 95% of the real-world gap.

3. **Scene participation policy surface**: The `mode × input` 2-axis matrix is semantically correct but communicates poorly at the call site. Named presets for the 3-4 canonical combinations would eliminate the most common misread.

The remaining findings are refinements, not blockers. ExoJS is ready for a focused 0.8.5–0.8.6 polish pass followed by a 0.9.0 release candidate effort.

---

## 2. Top 10 Findings

### F1 — Scene Participation Policy: Correct Semantics, Awkward Surface

**Severity**: Medium | **Category**: API DX

The `mode × input` matrix is well-designed conceptually:
- `mode`: `'overlay' | 'modal' | 'opaque'` — controls update/draw propagation through the stack
- `input`: `'capture' | 'passthrough' | 'transparent'` — controls scene-level `handleInput` routing

But the surface is verbose and the names at the call site require holding the full 3×3 combination space in your head. The two most common patterns are HUD (overlay + transparent) and pause (overlay + capture). These should have names — either static factory methods or named constants:

```js
// Option A: namespace with named presets
pushScene(hud, ScenePolicy.hud())       // → { mode: 'overlay', input: 'transparent' }
pushScene(pause, ScenePolicy.pause())   // → { mode: 'overlay', input: 'capture' }
pushScene(modal, ScenePolicy.modal())   // → { mode: 'opaque',   input: 'capture' }

// Option B: exported constants
import { HUD_POLICY, PAUSE_POLICY, MODAL_POLICY } from '@codexo/exojs';
pushScene(hud, HUD_POLICY);
```

The guide documentation handles this well (the HUD and pause-menu recipes name the purpose before showing the options). The API reference alone leaves users to derive policy intent from axis definitions. A thin naming layer would close the gap without changing the underlying design.

---

### F2 — Skew Transforms: Visible Gap

**Severity**: Medium | **Category**: API completeness

`SceneNode` exposes: position, scale, rotation, origin, anchor. No `skewX`/`skewY`. For a 2D affine transform system, this is the only missing primitive. The `getTransform()` method returns a 3×3 matrix — the skew composition path already exists. Use cases: perspective-card UX effects, italic-sprite correction, 2D pseudo-3D overlays, CSS-to-canvas migration.

Proposed addition:

```ts
// On SceneNode:
get skewX(): number
set skewX(value: number)
get skewY(): number
set skewY(value: number)
setSkew(x: number, y: number): this  // fluent
```

Wire into the existing `SceneNodeTransformFlags` dirty system. Small implementation change, high user impact. Should be in 0.9.0.

---

### F3 — Blend Mode Coverage: Defensible but Narrow

**Severity**: Low-Medium | **Category**: API completeness

Five blend modes: Normal, Additive, Subtract, Multiply, Screen. This set is adequate for game rendering and particles. It is narrow for creative coding, UI overlay work, and audio-reactive visual design.

Missing modes with real use cases:
- **Overlay** — the most requested; contrast-boost without washing out
- **HardLight** — specular lighting effects, metallic overlays
- **Difference** — glitch aesthetics, visual debugging, color inversion tricks
- **SoftLight**, **ColorDodge**, **ColorBurn** — extended creative palette

All are implementable as WebGL2 fragment shader math. WebGPU supports them natively. Given that ExoJS now includes BeatDetector and MeshShader (both of which attract audio-reactive and creative-coding users), the five-mode set will be a friction point for these users specifically.

Recommendation: add Overlay, HardLight, Difference for 0.9.0. That brings the total to 8 and covers ~95% of real-world creative use cases without a significant maintenance burden.

---

### F4 — Signal False-Return Stop: Non-Obvious Convention

**Severity**: Low | **Category**: API legibility

`Signal.dispatch()` stops propagation when a handler returns `false`. This is a jQuery-era convention that is counterintuitive in a TypeScript codebase where most handler signatures are typed `(...args) => void`. A developer who accidentally returns `false` from an arrow function body (common in destructuring patterns, conditional expressions, etc.) will silently break dispatch to remaining handlers — no error, no warning.

The convention works, but it is underdocumented. At minimum, add a prominent callout to the Signal API reference:

> "Return `false` from a handler to stop dispatch to remaining handlers. This stops the current `dispatch()` call — subsequent calls are unaffected."

A longer-term option is a named stop mechanism as an alternative:

```js
// Current (implicit, easy to trigger accidentally):
signal.add((e) => { handle(e); return false; });

// Alternative (explicit, clearer intent):
// Pass a cancel token or expose a dispatch context
signal.add((e, ctx) => { handle(e); ctx.stop(); });
```

The current behavior is defensible and established. Before changing it, add documentation. Evaluation for a named alternative belongs in 0.9.0 planning, not as a breaking change.

---

### F5 — Loader Verbosity: Ergonomic but Verbose for the Common Case

**Severity**: Low | **Category**: DX / Boilerplate

`loader.get(Texture, 'hero')` is explicit and type-safe. The class-constructor token pattern is one of ExoJS's clean design wins — it avoids string-keyed magic maps and gives TypeScript users a typed return without casts. For power users, this is correct.

For the common case (load a texture, use it in a Sprite), the pattern has two steps where one would do:

```js
// Current — two steps:
const tex = loader.get(Texture, 'hero');
const sprite = new Sprite(tex);

// What most users would write if it existed:
const sprite = Sprite.from(loader, 'hero');
```

Recommendation: add `Sprite.from(loader, alias)` (and equivalent for other Drawables: `AnimatedSprite`, `NineSlice` if it ships). This is purely additive — it wraps the existing pattern without replacing it. Do not change `loader.get`. The typing win is worth preserving for advanced users.

Also worth documenting explicitly: "If no alias is specified in `loader.load`, the path is the alias." This is the natural default behavior but is not stated clearly anywhere in the current docs.

---

### F6 — Particle System: New API is a Major Improvement

**Severity**: Positive observation | **Category**: Architecture

The before/after comparison is stark. Old API (pre-reset): class-based emitter with `requestParticle()` / `emitParticle()` / per-particle object mutation in a per-frame callback — 50+ lines and manual type annotation for a basic fireworks effect. New API: `new ParticleSystem({ maxParticles: 5000 })` + declarative module composition + `Distribution<T>` for randomness — same effect in ~15 lines.

The SoA rewrite with auto-routing to WebGPU compute (`wgsl()` presence check) is the right architecture. The `Distribution<T>` type is clean (Constant, Range, List, WeightedList). The module separation (SpawnModule, UpdateModule, DeathModule) makes the system extensible without requiring users to understand internals.

The one remaining DX friction: debugging a particle system that "doesn't spawn" requires understanding the module chain's order of operations. A development-mode debug flag that logs which modules fired and how many particles were emitted/killed on the first frame would help new users diagnose silent misconfigurations.

---

### F7 — BeatDetector: Architecturally Sound, Category Differentiator

**Severity**: Positive observation | **Category**: Architecture / Product identity

The BeatDetector is the most ambitious single-feature addition in the 0.8.x cycle. The implementation matches the recommended pipeline from the beat-matching research: SuperFlux flux novelty → ACF tempogram → phase tracker → parallel 3/4 + 4/4 posteriors with hysteresis. The 8-beat lookahead is a sound practical choice.

The visual derived getters (`pulse`, `barPulse`, `justBeat`, `subdivisionPhase(division)`) are a DX layer above the raw mathematical state, and they are well-designed — they turn beat timing into directly renderable values without requiring users to understand phase arithmetic.

This is a category differentiator. No other browser 2D runtime has a built-in, production-quality beat detector with this level of musical awareness. It belongs prominently in the "why ExoJS" pitch.

One documentation concern: `pulse` and `barPulse` derive from beat timing, not from audio amplitude. Users coming from `AnalyserNode`-based visualizations will expect these to correlate with `rms` or `onsetStrength`. The guide (and BeatDetector API reference) should explicitly state: "These values are derived from beat phase tracking, not audio loudness. For loudness-reactive visuals, use `analyser.rms` or `analyser.onsetStrength` instead."

---

### F8 — Scene.root: Documented but Still Trips Users

**Severity**: Low | **Category**: Documentation / DX

`Scene.root: Container` exists as a structural anchor and is NOT auto-rendered. Users who add children to `root` and forget to call `this.root.render(backend)` in `draw()` get a blank screen with no error. The guide documents this clearly. The behavior is correct — explicit rendering is ExoJS's identity.

But the failure mode is silent and the friction is highest at the beginning of a user's ExoJS journey. Two improvements:

1. Add a callout to the `Scene` class-level API documentation: "Scene.root is a structural anchor. It is not automatically rendered. Call `root.render(backend)` in your `draw()` method."

2. In development mode, emit a console warning if `root` has children and `root.render()` was never called during the first N frames. This is the kind of DX guard that pays for itself in reduced support burden.

The behavior itself should not change. But the feedback loop for misuse should be tighter.

---

### F9 — Fluent Return `this`: Mostly Consistent, One Gap

**Severity**: Low | **Category**: API consistency

The fluent API (`setPosition`, `setRotation`, `setScale`, `setTint`, `setBlendMode`, etc.) is consistent across the rendering hierarchy. The Tween API is fully fluent. The gap is in filter methods on `RenderNode`:

- `addFilter(f)` — does not return `this`
- `removeFilter(f)` — does not return `this`
- `clearFilters()` — does not return `this`
- `setFilters(filters)` — does not return `this`

For a system that encourages filter composition (`new Sprite(...).addFilter(blur).addFilter(glow)`), this inconsistency is jarring. The fix is one line per method (`return this`) with no semantic impact.

---

### F10 — MeshShader Dual WGSL+GLSL: Correct Architecture, High Maintenance Cost

**Severity**: Medium (maintainability) | **Category**: Architecture / sustainability

`MeshShader` requires both GLSL (WebGL2) and WGSL (WebGPU) implementations with runtime drift detection. This is the correct architecture for a dual-backend renderer. The drift detection is a smart addition that will catch divergence before it becomes a runtime bug.

The long-term concern: as WebGPU adoption grows, maintaining two shader dialects for every `MeshShader` doubles the authoring burden indefinitely. Every new shader user must write the same logic twice in two different languages with different semantics. The guide should be explicit about this cost — not to discourage use, but to set accurate expectations.

The ExoJS roadmap should name a "WebGPU first" inflection point. Likely post-1.0, but worth planning: at what browser coverage threshold does the WebGL2 backend become a compatibility shim rather than a co-equal target? Naming that threshold now avoids a painful future negotiation.

---

## 3. API Areas Reviewed

### Application

Clean. The `BackendConfig` discriminated union (`'auto' | 'webgl2' | 'webgpu'`) is the right approach — honest about backend selection without hiding it. `ApplicationOptions` is comprehensive without being intimidating; the default path (just `canvas`) works for getting started.

`pauseOnHidden` is a thoughtful ergonomic default. The `capabilities` getter for feature detection is the right pattern for conditional WebGPU code paths.

One gap: no `resizeMode` option. Users who want a fixed-resolution game with CSS scaling (the most common game target) vs users who want native canvas resizing need different setups. This is a common first-day configuration question that currently requires manual setup. See Wishlist triage.

### SceneManager

The stack model is sound. Async push/pop with optional `FadeSceneTransition` is the right design. The Signal set (onChangeScene, onStartScene, onUpdateScene, onStopScene) covers the common observation cases.

The `_resolveParticipants()` implementation — deciding which scenes update/draw based on stacked policies — is correct but complex enough that a regression would be invisible until runtime. It should have exhaustive unit tests covering every combination of overlay/modal/opaque × capture/passthrough/transparent at each stack depth.

### Signal

See F4. The core design (typed dispatch, snapshot-safe, `clearByContext` for ownership scoping) is excellent. Snapshot-safe dispatch (bindings list copied before iteration) is the right behavior for handlers that add/remove other handlers during dispatch. The `false`-return stop is the one rough edge.

### Loader

See F5. The class-constructor token pattern (`loader.load(Texture, 'path')` / `loader.get(Texture, 'alias')`) is a genuine API win. The manifest/bundle support, background loading, and IndexedDB caching are well-designed for production use. The `LoadReturn<T>` type mapping is clean TypeScript.

The gap: Loader handles `TextAsset`, `SvgAsset`, `VttAsset` but not web fonts. Font loading via `FontFace` / CSS `@font-face` is a browser concern, not an ExoJS concern — but users should not be surprised when `new Text('Score', { fontFamily: 'MyFont' })` renders in a fallback font because the font hasn't loaded. Explicit documentation of this gap is the minimum fix.

### Scene Graph (SceneNode / RenderNode / Container / Drawable)

The historical architecture review's main recommendations have been executed:

| Recommendation | Status |
|---|---|
| Inline `Transformable` into `SceneNode` | ✅ Done (0.5.0) |
| Move `render()` to `RenderNode` only | ✅ Done (0.5.0) |
| Fix `MaskSource` type (`SceneNode | null` → union) | ✅ Done (Rectangle \| Texture \| RenderTexture \| RenderNode \| null) |
| Container children typed as `RenderNode[]` (not `SceneNode[]`) | ✅ Done |

The current hierarchy (`SceneNode → RenderNode → Container | Drawable → specific types`) is clean and semantically honest. The one remaining gap: no skew transforms (F2). Otherwise this is one of the strongest parts of the API.

### Tween System

`TweenManager.create(target).to(props, duration).easing(fn).yoyo().repeat(n).start()` is clean, fire-and-forget, and integrates naturally with the event system. The lazy start-value capture on first update is a good DX decision — it means you can configure a tween before the scene is initialized without capturing stale initial values. No real friction here.

### Particle System

See F6. The new SoA API is a major improvement over the historical per-particle mutation approach. The `Distribution<T>` system (Constant, Range, List, WeightedList) is clean. Auto-routing to WebGPU compute (when all modules have `wgsl()`) is the right architecture.

### BeatDetector

See F7. Sound implementation. The `pulse`, `barPulse`, `justBeat`, `subdivisionPhase(division)` visual getters are well-designed. `new BeatDetector({ source: music })` as the one-shot ergonomics is correct. Stabilize before 0.9.0.

### Collision

SAT, AABB, circle, ellipse, line, point — present on `SceneNode.collidesWith`. Collision response was fixed in 0.7.12. This is sufficient for most game-level collision detection. Full physics (integration, rigid bodies, constraints) is correctly absent from core.

### Blend Modes

See F3. Five modes. Defensible for games, narrow for creative use. Adding Overlay, HardLight, Difference brings the total to 8 and closes the most common creative-coding gap.

### Async Update/Render

Not supported. The RAF loop is synchronous. This is the correct design — async update/render would create frame-timing complexity for marginal benefit. Off-main-thread computation should use the Worker/AudioWorklet pattern (as BeatDetector demonstrates), not an async render loop.

### Font Loading

Loader handles `TextAsset` (raw text), `SvgAsset` (SVG images), `VttAsset` (VTT cues). Web fonts must be loaded via `FontFace` API or CSS `@font-face` before use in `Text` nodes. This gap should be explicitly documented. A `FontLoader.load('MyFont', 'src/MyFont.woff2')` helper that wraps `FontFace` would be a reasonable extras addition.

### Skew Transforms

Not present. See F2.

---

## 4. Historical Delta / Identity / Research Alignment

### Architecture Review Recommendations (pre-0.5.0) — Execution Status

The pre-0.5.0 architecture review identified five main concerns. All critical ones were executed:

| Concern | Then | Now |
|---|---|---|
| `SceneNode extends Transformable` — two classes for one concept | Separate classes | Inlined — one class |
| `SceneNode.render()` no-op | Existed, misleading | Removed; `render()` on `RenderNode` only |
| `mask: SceneNode | null` type lie | Narrow, inaccurate type | `MaskSource` union (Rectangle \| Texture \| RenderTexture \| RenderNode \| null) |
| Container children typed as `SceneNode[]` | Too broad | `RenderNode[]` — tight and correct |
| 332 root-level exports — too broad | Not audited here | Partial — still to verify |

### Post-Reset Roadmap — Release Sequence vs Reality

The post-reset roadmap projected a sequence of `0.4.x → 0.5.0 → 0.6.0 → 0.7.0 → 0.8.0 (API freeze candidate) → 0.9.0 RC → 1.0.0`. The actual trajectory has broadly followed this:

- 0.5.0: Core API decisions ✅
- 0.6.0: Consolidation ✅
- 0.7.0: Backend hardening + input system refactor ✅
- 0.8.0: Particle system rewrite; API freeze candidate entry ✅ (though features continued in 0.8.1–0.8.4)

The 0.8.x cycle was heavier on new features (BeatDetector, MeshShader, DataTexture, LutFilter, filter chain optimization) than anticipated for an "API freeze candidate" cycle. This is not necessarily wrong — the features were well-executed — but it means 0.9.0 planning should explicitly prioritize gap-closing and stabilization over continued feature additions.

### Identity Alignment

Current ExoJS vs the identity reference document:

| Principle | Status |
|---|---|
| **Explicit over implicit** | Maintained. `draw(backend)` is still the explicit orchestration point. No auto-rendering crept in. |
| **Honest over pseudo-universal** | Maintained. `BackendConfig` discriminated union is honest about backend limitations. `MeshShader` dual-dialect is honest about the dual-backend cost. |
| **One dominant path** | Maintained. Class extends Scene + explicit draw + `loader.get` + `new Sprite` is still the obvious path. No competing approaches appeared. |
| **Semantic API forms** | Mostly maintained. `Scene.root` not auto-rendering is the most common semantic surprise. |
| **Pragmatism with strictness** | Maintained. The distribution of detail between simple cases and complex cases (compute shaders, custom mesh shaders) is good. |
| **Coherent library identity** | Still coherent. BeatDetector expands what ExoJS is *for* without breaking the existing model. |

The identity question: **ExoJS is still the same strong idea, now much more capable.** The core architectural decisions have not drifted.

### BeatDetector vs Research Alignment

The live beat-matching research recommended a three-stage pipeline:

| Stage | Research Recommendation | Implementation |
|---|---|---|
| 1 (production) | SuperFlux novelty, ACF tempogram, phase tracker | ✅ Implemented |
| 2 (refinement) | Online PLP, confidence hysteresis, grid stability | ✅ Implemented (`confidence`, `gridStability`, hysteresis switching) |
| 3 (future) | Causal CRNN or particle filter for hard cases | ❌ Not implemented — appropriate to defer |

The parallel 3/4 + 4/4 posterior tracking with hysteresis switching is a sound addition not explicitly in the research document but consistent with its recommendations. The 8-beat lookahead window is a good practical choice for the browser AudioWorklet context.

The visual derived getters (`pulse`, `barPulse`, `justBeat`, `subdivisionPhase`) are beyond what the research recommended — they are a DX layer above the mathematical state, and they are well-designed.

---

## 5. Areas to Change Before 0.9.0

### Priority 1: Add Skew Transforms (F2)

One-day implementation. Add `skewX` / `skewY` to `SceneNode`, wired into the dirty-flag transform system. Missing from every 2D affine transform API is noticed.

```ts
// SceneNode additions:
get skewX(): number
set skewX(value: number)
get skewY(): number
set skewY(value: number)
setSkew(x: number, y: number): this
```

### Priority 2: Filter Methods Return `this` (F9)

One line per method. `addFilter`, `removeFilter`, `clearFilters`, `setFilters` on `RenderNode` should all return `this`. No semantic change — pure fluency consistency.

### Priority 3: Expand Blend Modes to 8 (F3)

Add Overlay, HardLight, Difference. WebGL2 fragment shader implementations are trivial (a few lines of standard mix formulas). WebGPU supports them natively. Three modes for a total of 8.

### Priority 4: Document Font Loading Gap

Add a callout to the `Text` API reference and the typography section of the guide: "Web fonts must be loaded via the browser's `FontFace` API before use. ExoJS does not manage font loading."

Optional: a `FontLoader.load(family, src)` convenience wrapper (1 day, additive, no breaking change).

### Priority 5: Named Scene Policy Presets (F1)

Add a `ScenePolicy` namespace (or exported constants) with the 3-4 canonical combinations named. Do not change the underlying `{ mode, input }` object shape. This is purely a naming/ergonomics layer.

### Priority 6: Signal Propagation Stop — Documentation (F4)

Add a prominent note to the Signal API reference documenting the `false`-return stop convention. Evaluate whether a named alternative should ship in 0.9.0 or post-1.0.

### Priority 7: Scene.root Development Warning (F8)

In development mode, emit a console warning if `root` has children and `root.render()` was never called during the first N frames of the scene. Silent blank screens are the highest-friction first-day experience.

---

## 6. Areas to Remain Stable

### Scene Lifecycle

`load(loader)` → `init(loader)` → `update(delta)` → `draw(backend)` → `handleInput(event)` → `unload(loader)` → `destroy()`. Do not touch this. It is the core ExoJS contract. Users build mental models around the lifecycle sequence. Any change is a breaking change of trust, not just API.

### Explicit Rendering Contract

`draw(backend)` as the explicit orchestration point, `Scene.root` not auto-rendered. This is ExoJS's identity. If anything, lean into it more in documentation — it is a feature, not a limitation.

### Loader Class-Constructor Token Pattern

`loader.load(Texture, 'path')` / `loader.get(Texture, 'alias')` is one of ExoJS's cleanest design decisions. The type safety is the value proposition. Do not simplify this into a string-keyed registry. Convenience constructors (`Sprite.from`) are additive and do not replace it.

### Tween API Shape

`tweens.create(target).to(props, duration).easing(fn).yoyo().repeat(n).start()` works and is consistent. Do not add complexity.

### Particle System Module Architecture

The SoA + SpawnModule/UpdateModule/DeathModule + `Distribution<T>` design is the right foundation. It has been stable since 0.8.0. Do not revisit the architecture — add modules, not structure.

### BeatDetector API Shape

`new BeatDetector({ source })` with visual getters is sound. The state accessor set is comprehensive. Stabilize before 0.9.0; do not expand it further until post-1.0.

### MeshShader Dual-Dialect Pattern

GLSL + WGSL with drift detection is the correct architecture for the dual-backend era. The complexity is inherent to the dual-backend constraint. Document it clearly rather than trying to hide it.

### Scene Stack Model

The `mode × input` semantic model is correct. The surface ergonomics need named presets (F1), but the underlying `{ mode, input }` object shape should not change.

---

## 7. Wishlist Triage

### Tilesets
**Extras package, 0.9.x**  
Tilemap rendering (TMX/Tiled support, tile batching) is a common game need but not a core responsibility. The rendering primitives in core (Sprite, RenderTexture, Container, `sortableChildren`) are sufficient to build a tilemap renderer on top. An official `@codexo/exojs-tilemaps` extras package is the right delivery vehicle. Good first extras package.

### Physics
**Extras package, post-1.0**  
Full rigid-body physics (Rapier.js or Planck.js integration) belongs in an extras package. The collision primitives in core (SAT, AABB, circle, ellipse, line, point with response) are the right floor for game-level collision. Do not pull a physics engine into core — the dependency weight and API surface are both wrong for the core bundle.

### Web APIs (WebStorage, WebRTC, Web Workers)
**Out of scope**  
The audio subsystem (BeatDetector, AudioBus, Sound, Music) is the right scope for Web API integration. WebStorage, WebRTC, and Worker management are better handled by users directly. Adding them to ExoJS would not improve DX — it would just add surface area that the browser already exposes ergonomically.

### Playground/Examples Site
**High priority, 1.0 requirement**  
The docs site with interactive Monaco playground is planned as a 1.0 requirement (per project memory). This is the top non-code priority for the 1.0 push. The full-guide content has now been written (0.8.4). The infrastructure is architecturally planned (Astro + Tailwind + Monaco). The next concrete step is to actually build it.

### Networking
**Out of scope indefinitely**  
Networking (multiplayer, WebSockets, WebRTC data channels) is a domain-specific concern with enormous complexity. Not a framework responsibility. Build examples (how to use ExoJS with a WebSocket game server), not infrastructure.

### Extras Package Pattern
**Formalize before 0.9.0**  
The `@codexo/exojs-*` extras namespace is the right design. Before the first extras package ships, define: (1) which core version range the package targets, (2) whether extras packages track core's minor version or version independently, (3) who owns support. Don't ship extras in alpha/beta — first extras package should be production-quality when it launches.

### 9-Slice Sprites
**Extras package, 0.9.x**  
9-slice rendering (for resizable UI panels, buttons, dialog boxes) is a common UI need. Implementable as a custom `Drawable` subclass with UV manipulation. Good second extras package (after tilemaps). Not core — it's a UI primitive, and users who need in-canvas UI are the minority.

### Pathfinding
**Extras package, post-1.0**  
A*/Dijkstra on tilemaps or navmeshes. Common game need, no reason to be in core. Pairs naturally with the tilemap extras package.

### 3D Meshes / Three.js Integration
**Out of scope — permanently**  
ExoJS is explicitly a 2D runtime. 3D mesh support would require a fundamentally different rendering architecture. This is not "later" — it is "never" for the current product identity. Users who need 3D should use Three.js and composite via canvas layering if needed. Attempting to add 3D to ExoJS would compromise the 2D identity without reaching feature parity with dedicated 3D engines.

### Compute Shaders (Extended)
**In scope, partially implemented — document and stabilize**  
`WebGpuStorageBuffer`, `WebGpuComputePipeline`, and particle compute auto-routing are already present. This is the right foundation. Before 0.9.0, ensure the public API surface for custom compute passes is documented. This is a differentiator for audio-reactive particle systems and generative art use cases.

### Extended ApplicationOptions
**Specific additions warranted for 0.9.0:**

```ts
resizeMode: 'none' | 'canvas' | 'fit' | 'fill'  // how canvas responds to container resize
devicePixelRatio: number | 'auto'                 // explicit HiDPI control
```

These two answer the two most common first-day configuration questions. Both are additive, non-breaking, and require no new subsystems.

---

## 8. Boilerplate / DX Friction

### Getting Started — Minimum Viable Scene

Current minimum to get a sprite on screen:

```js
const app = new Application({
    canvas: document.querySelector('canvas'),
    width: 800,
    height: 600,
});

class MyScene extends Scene {
    async load(loader) {
        loader.load(Texture, 'src/hero.png');
    }

    async init(loader) {
        this.sprite = new Sprite(loader.get(Texture, 'src/hero.png'));
    }

    draw(backend) {
        backend.clear(Color.black);
        this.sprite.render(backend);
    }
}

await app.start(new MyScene());
```

This is 15 lines for a meaningful result. That is reasonable for a class-based framework with explicit rendering. The pre-reset `Scene.create({})` factory was more concise but less explicit. The current pattern is the right tradeoff.

The one boilerplate friction worth noting: `loader.load(Texture, 'src/hero.png')` in `load()` followed by `loader.get(Texture, 'src/hero.png')` in `init()` — when no explicit alias is given, the path is the alias. This is fine behavior but is not stated clearly in the getting-started docs. A single sentence in the Loader guide ("If no alias is specified, the path becomes the alias") removes this confusion.

### The load/init Split

Separating `load` (async, for declaring what to fetch) from `init` (async, called after loading completes, for scene construction) is the right design. The two-phase pattern prevents accessing unloaded assets. But users new to the framework will try to do everything in `init` and hit "asset not found" errors from `loader.get`. The guide handles this, but the Scene API reference should lead with the split explanation.

### Error Messages from Loader

Not audited in depth, but a common DX concern: when `loader.get(Texture, 'alias')` throws because the asset isn't loaded, the error message should include the alias AND a hint about whether the asset exists in the cache under a different key. The #1 frustration with typed-loader patterns is "I loaded it, why can't I get it?" — usually a path vs alias mismatch.

### Filter Construction

```js
const blur = new BlurFilter({ radius: 8, quality: 2 });
sprite.addFilter(blur);
// vs
sprite.addFilter(new BlurFilter({ radius: 8, quality: 2 }));
```

The second form (inline) is clean but doesn't work because `addFilter` doesn't return `this` (F9). After that fix, filter construction becomes genuinely fluent.

### Input Bindings Auto-Disposal

`Scene.inputs` proxy auto-disposing bindings on scene destroy is one of the best ergonomic decisions in the 0.7.x input refactor. It means users don't need to track and remove listeners manually. This should be more prominently documented in the Scene guide — it is currently mentioned in passing in the input guide, but it removes a class of bugs that every event-based system suffers from.

---

## 9. Proposed Roadmap to 0.9.0

### 0.8.5 — Transform & Rendering Completeness (1 sprint)

- Add `skewX`/`skewY`/`setSkew` to `SceneNode` (F2)
- Make `addFilter`/`removeFilter`/`clearFilters`/`setFilters` return `this` (F9)
- Add Overlay, HardLight, Difference blend modes (F3)
- Add `resizeMode` and `devicePixelRatio` to `ApplicationOptions`

### 0.8.6 — DX & Documentation Polish (1 sprint)

- `ScenePolicy` named presets (F1)
- `Sprite.from(loader, alias)` convenience constructors for common Drawables
- Document font loading gap in `Text` API and guide
- Document `load()`/`init()` split and alias convention prominently in getting-started
- Improve `loader.get` error messages (include alias and cache state hint)
- `Scene.root` development-mode warning when children present but render not called (F8)
- Particle debug flag (log module chain on first N frames)
- Update Signal API reference with propagation-stop documentation (F4)

### 0.9.0-rc — Stabilization (no new features)

- Export audit: verify root-level exports are scoped to what users directly reference
- Full fluency audit: every public method that could return `this` does
- API reference coverage audit: every public symbol has a complete API doc entry
- Extras package contract defined in writing; `@codexo/exojs-tilemaps` enters development
- Docs site with interactive playground enters internal beta
- Performance validation: particle system at 10k (WebGL2 CPU path and WebGPU compute), filter chains at N=5
- TypeScript types audit: all public types accurate, no `any` in public surface

### 0.9.0 — Release Candidate

- No new features introduced after rc branch
- All 0.8.5/0.8.6 polish is merged
- Playground site is publicly accessible
- First extras package (`@codexo/exojs-tilemaps` or `@codexo/exojs-9slice`) is in beta
- Migration guide from 0.8.x to 0.9.0 published

---

## 10. Risks and Tradeoffs

### Risk 1: Dual-Backend Maintenance Overhead

**Risk**: Maintaining WebGL2 + WebGPU backends simultaneously doubles shader authoring and backend-specific testing. The `MeshShader` dual-dialect pattern is correct architecture but creates ongoing maintenance cost for every custom shader user.

**Mitigation**: Define a "WebGPU first" roadmap milestone with a named threshold (e.g., "when WebGPU reaches 80% global browser support"). Until then, maintain both. After that threshold, the WebGL2 backend becomes a compatibility shim rather than a co-equal target. Naming this milestone now avoids a future architectural negotiation under pressure.

**Tradeoff**: Every new rendering feature must be implemented twice until the threshold. This slows feature velocity but is necessary for production use on current browser distributions.

---

### Risk 2: Feature Scope in 0.8.x Outpaces Documentation

**Risk**: The 0.8.x cycle added BeatDetector, MeshShader, DataTexture, LutFilter, filter chain optimization, and a particle system rewrite. Each was individually justified. The cumulative surface area expansion may be outpacing example coverage and guide depth.

**Mitigation**: The 0.9.0 plan must explicitly prioritize "no new features until everything existing has a complete API reference entry and at least one guide example." The playground/example runner is critical here — interactive examples teach faster than prose.

**Tradeoff**: Users who want new features (tilesets, physics, 9-slice) will wait longer. Documentation debt is invisible to feature-requesters but is the primary factor in whether new users convert or bounce.

---

### Risk 3: Scene.root Expectation Mismatch at Scale

**Risk**: "Scene.root is not auto-rendered" is ExoJS's identity but is also the most common source of beginner confusion. As the user base grows, this will generate consistent support burden.

**Mitigation**: The development-mode warning (F8 recommendation) is the right intervention. It makes the failure mode loud without changing the behavior. Do not add `autoRenderRoot: true` as an opt-out — it would dilute the identity for minimal gain.

**Tradeoff**: A development warning adds code to the production bundle (even if minified). Keep the check behind a `__DEV__` build flag.

---

### Risk 4: BeatDetector Product Positioning

**Risk**: BeatDetector is a category differentiator, but it may cause ExoJS to be perceived as "the audio game library" — attracting audio-reactive users while making pure-game users uncertain whether ExoJS is right for them.

**Mitigation**: The docs positioning should lead with the game/interactive-experience use case and present BeatDetector as an advanced feature in the audio section. The primary pitch should remain "2D interactive experiences," with BeatDetector as evidence of how far the audio-reactive use case goes.

**Tradeoff**: BeatDetector is genuinely impressive. Under-positioning it loses differentiation. Over-positioning it narrows the perceived audience. The guide currently gets this balance right — BeatDetector is in the advanced audio section, not the hero position.

---

### Risk 5: Extras Package Ecosystem Fragmentation

**Risk**: If `@codexo/exojs-*` extras packages launch without a clear versioning and peer-dep contract, they will fragment the ecosystem. An extras package built against `exojs@0.9.0` that breaks with `exojs@0.9.1` erodes trust across the whole package family.

**Mitigation**: Define the extras package contract before the first package ships: (1) peer dep range (e.g., `exojs: >=0.9.0 <1.0.0`), (2) whether extras packages follow independent semver or track core's minor, (3) who owns support. Do not ship extras in alpha — the first public extras package should be production-quality.

**Tradeoff**: Strict versioning constraints on extras packages increase the maintenance burden per release. The alternative (loose constraints) is worse — silent breaking changes are worse than explicit peer dep failures.

---

## 11. Final Recommendation

**ExoJS is ready for a focused 2-sprint polish pass (0.8.5 + 0.8.6) followed by a 0.9.0 release candidate effort.**

The core architecture is sound. The identity is intact. The feature set is genuinely differentiated — BeatDetector, WebGPU compute particles, and dual-backend MeshShader are not features any comparable browser 2D runtime offers at this quality level. The 0.8.4 guide represents the most complete documentation pass in the project's history.

**The three things that must happen before 0.9.0:**

1. **Add skew transforms.** A one-day implementation. Its absence will be noticed by every user who needs it, and it is a visible gap in a 2D affine transform API that otherwise has everything.

2. **Expand blend modes to 8.** Not for feature completeness — for credibility with creative-coding users who will immediately ask "where's Overlay?" and draw the wrong conclusion about the framework's ambition.

3. **Make filter methods fluent.** `addFilter` not returning `this` when `setTint` returns `this` is the kind of inconsistency that silently erodes confidence in an API surface. One line per method.

**The four things that should NOT happen before 0.9.0:**

1. **Don't add physics.** Extras package, post-1.0.
2. **Don't change the scene lifecycle.** It is the foundation. Touch nothing.
3. **Don't add 3D.** ExoJS is a 2D runtime. This is not a limitation — it is an identity. "Never" is the right answer.
4. **Don't simplify the Loader.** The class-constructor token pattern is correct. Convenience constructors (`Sprite.from`) are additive; they are not replacements.

**The product identity question — answered directly:**

At v0.8.4, ExoJS is the **same strong idea, much more capable, and still recognizably ExoJS.** The explicit rendering contract is intact. The class-based lifecycle is intact. The typed resource loading is intact. The API has grown substantially but coherently. Nothing in the 0.8.x additions contradicts the design principles in the identity reference — each addition either fills a concrete need (BeatDetector: audio-reactive use case; particle rewrite: performance and expressiveness; MeshShader: custom rendering floor) or fixes a documented gap (filter chain memory, collision response, LUT support).

The challenge for 0.9.0 is not architectural — it is surface: closing the small gaps that will erode trust before the first impression, expanding the examples and playground to demonstrate the full range of capabilities, and defining the extras package pattern before the first community contribution tries to build one without guidance.

ExoJS at 1.0 should feel like what 0.8.4 already mostly is: an expert framework for interactive experiences that takes explicit rendering, typed resources, and structural honesty seriously — and now also happens to know what bar the music is on.
