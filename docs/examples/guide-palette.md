# ExoJS Examples — Guide Palette

A structured learning path for the playground. Each section builds on the previous; readers can stop after any section and have a complete mental model for that scope.

---

## Design principles

- No comments in example code — names and structure carry meaning.
- Max ~100 lines for feature examples; max ~200 lines for advanced/multi-concept examples.
- One concept per example; no kitchen-sink demos.
- New examples live alongside existing ones until they are verified superior, then the old entry is removed.

---

## Language tracks

Each example is tagged **JS**, **TS**, or **Both**:

| Tag | Pattern | When to use |
|-----|---------|-------------|
| `JS` | `Scene.create()` with dynamic `this._field` state | Quick playground demos; existing examples |
| `TS` | `new class extends Scene { private field!: Type }` or named class | Typed scene state, guide examples, richer IntelliSense |
| `Both` | A paired JS + TS version | High-traffic examples where both audiences land |

The playground currently runs JS only. TS track entries are implementation targets for when a TS transpilation pipeline is added. See [js-ts-example-strategy.md](js-ts-example-strategy.md) for full rationale and code patterns.

All existing examples are `JS`. New examples should be marked with their intended track; paired examples are only worth the effort for sections 1–3 where beginner traffic is highest.

---

## Category order

```
1. Core                  — Application, canvas, Scene, update loop
2. Rendering             — Sprites, textures, containers, text, Graphics
3. Masks                 — Rectangle, RenderNode, Texture masks
4. Render Textures       — Offscreen targets, effects pipelines
5. Filters               — BlurFilter, ColorFilter
6. Input                 — Pointer, keyboard, Gamepad
7. Animation             — Timers, tweens, animated sprites
8. Particles             — ParticleSystem, emitters, affectors
9. Assets                — Loader, caching strategies, asset factories
10. Audio               — Music, Sound, AudioAnalyser
11. Physics              — Rapier2D, bodies, constraints
12. WebGPU               — GPU-specific features and stress tests
13. Extras               — Audio visualisation, benchmark, custom renderers
```

---

## Proposed palette

### 1 · Core

| # | Slug | Title | Learning goal | Lines | Status | Lang |
|---|------|-------|---------------|-------|--------|------|
| 1.1 | `core/hello-canvas` | Hello Canvas | Create `Application`, append canvas, start a scene | ~25 | **new** | Both |
| 1.2 | `core/update-loop` | Update Loop | `update(delta)` timing, `delta.seconds`, frame counter | ~35 | **new** | Both |
| 1.3 | `core/multi-scene` | Multi-Scene | `SceneManager`, transition between two scenes | ~60 | **new** | JS |

### 2 · Rendering

| # | Slug | Title | Learning goal | Lines | Status | Lang |
|---|------|-------|---------------|-------|--------|------|
| 2.1 | `rendering/sprite` | Sprite | Load texture, position, anchor, rotate | ~35 | **exists** | JS |
| 2.2 | `rendering/spritesheet` | Spritesheet | Atlas frames, `Spritesheet`, frame selection | ~45 | **exists** | JS |
| 2.3 | `rendering/container` | Container | Group nodes, inherit transforms | ~50 | **exists** | JS |
| 2.4 | `rendering/graphics` | Graphics | `drawCircle`, `drawRectangle`, fill/stroke colors | ~50 | **new** (replaces nothing) | JS |
| 2.5 | `rendering/display-text` | Display Text | `Text`, font loading, `setText` | ~40 | **exists** | JS |
| 2.6 | `rendering/blendmodes` | Blend Modes | `BlendModes` enum, sprite blending | ~55 | **exists** | JS |
| 2.7 | `rendering/tinted-sprites` | Tinted Sprites | `setTint(Color)`, dynamic color | ~40 | **exists** | JS |
| 2.8 | `rendering/view-handling` | View Handling | `View` pan/zoom, camera follow | ~55 | **exists** | JS |
| 2.9 | `rendering/display-svg` | Display SVG | SVG asset loading, `SvgAsset` | ~40 | **exists** | JS |
| 2.10 | `rendering/display-video` | Display Video | `Video` drawable, play/pause | ~45 | **exists** | JS |

### 3 · Masks

| # | Slug | Title | Learning goal | Lines | Status | Lang |
|---|------|-------|---------------|-------|--------|------|
| 3.1 | `rendering/masks` | Masks | `Rectangle` scissor + `Graphics` alpha-composite, side by side | ~55 | **implemented** | JS |
| 3.2 | `rendering/masks-render-node` | RenderNode Mask | Complex `Graphics` shape as mask, animated transform | ~55 | **new** | JS |
| 3.3 | `rendering/masks-texture` | Texture Mask | Alpha-texture mask stretched to node bounds | ~45 | **new** | JS |

### 4 · Render Textures

| # | Slug | Title | Learning goal | Lines | Status |
|---|------|-------|---------------|-------|--------|
| 4.1 | `rendering/render-to-texture` | Render To Texture | `RenderTexture`, `RenderTargetPass`, reuse as sprite | ~60 | **exists** |
| 4.2 | `rendering/render-texture-ping-pong` | Ping-Pong Effect | Two `RenderTexture`s, iterative blur/accumulation | ~80 | **new** |

### 5 · Filters

| # | Slug | Title | Learning goal | Lines | Status |
|---|------|-------|---------------|-------|--------|
| 5.1 | `rendering/filters-blur` | Blur Filter | `BlurFilter`, `setFilters`, intensity animation | ~45 | **new** |
| 5.2 | `rendering/filters-color` | Color Filter | `ColorFilter`, brightness/contrast/saturation sliders | ~55 | **new** |

### 6 · Input

| # | Slug | Title | Learning goal | Lines | Status |
|---|------|-------|---------------|-------|--------|
| 6.1 | `input/pointer` | Pointer | `onPointerDown`, `onPointerMove`, cursor sprite follow | ~45 | **new** |
| 6.2 | `input/keyboard` | Keyboard | `Input.keyboard`, key-held movement | ~50 | **new** |
| 6.3 | `input/gamepad` | Gamepad | `Gamepad`, axis/button polling, prompt overlays | ~70 | **exists** |

### 7 · Animation

| # | Slug | Title | Learning goal | Lines | Status |
|---|------|-------|---------------|-------|--------|
| 7.1 | `rendering/animated-sprite` | Animated Sprite | `AnimatedSprite`, frame sequences, playback speed | ~45 | **new** |
| 7.2 | `rendering/timer` | Timer | `Timer`, one-shot and repeating, cancellation | ~40 | **new** |

### 8 · Particles

| # | Slug | Title | Learning goal | Lines | Status |
|---|------|-------|---------------|-------|--------|
| 8.1 | `particle-system/bonfire` | Bonfire | `ParticleSystem`, `UniversalEmitter`, affectors | ~70 | **exists** |
| 8.2 | `particle-system/fireworks` | Fireworks | Burst emitter, `ColorAffector`, scale decay | ~90 | **exists** |

### 9 · Assets

| # | Slug | Title | Learning goal | Lines | Status |
|---|------|-------|---------------|-------|--------|
| 9.1 | `rendering/asset-loading` | Asset Loading | `loader.load(Type, { key: path })`, `loader.get` | ~40 | **new** |
| 9.2 | `rendering/caching` | Cache Strategy | `CacheFirstStrategy`, offline fallback | ~60 | **new** |

### 10 · Audio

| # | Slug | Title | Learning goal | Lines | Status |
|---|------|-------|---------------|-------|--------|
| 10.1 | `extras/audio-visualisation` | Audio Visualisation | `AudioAnalyser`, FFT bins, canvas bar chart | ~90 | **exists** |

### 11 · Physics

| # | Slug | Title | Learning goal | Lines | Status |
|---|------|-------|---------------|-------|--------|
| 11.1 | `collision-detection/rectangles` | Collision Detection | Math-only AABB, no physics engine | ~60 | **exists** |
| 11.2 | `physics/rigid-bodies` | Rigid Bodies | `RapierPhysicsWorld`, gravity, restitution | ~80 | **new** |

### 12 · WebGPU

Existing WebGPU examples remain. New suggestions:

| # | Slug | Title | Learning goal | Lines | Status |
|---|------|-------|---------------|-------|--------|
| 12.1+ | `webgpu/*` | (existing) | GPU-specific features | varies | **exists** |

### 13 · Extras

| # | Slug | Title | Learning goal | Lines | Status |
|---|------|-------|---------------|-------|--------|
| 13.1 | `extras/benchmark` | Benchmark | Sprite stress test, `Stats` overlay | ~60 | **exists** |

---

## Implementation priority

Implement in this order. Each item unlocks a coherent "next section" of the guide:

1. **`rendering/masks`** — done (Rectangle + Graphics mask, side by side).
2. **`core/hello-canvas`** — minimal entry point, easiest to write, opens the guide. Target: `Both` track.
3. **`core/update-loop`** — teaches the game loop; referenced by every subsequent example. Target: `Both` track.
4. **`rendering/graphics`** — fills the gap between sprite and advanced rendering.
5. **`rendering/masks-render-node`** — shows the RenderNode mask path with animated Graphics shape.
6. **`input/pointer`** and **`input/keyboard`** — high user demand, short to implement.
7. **`rendering/animated-sprite`** and **`rendering/timer`** — complete the animation section.
8. **`rendering/filters-blur`** and **`rendering/filters-color`** — natural follow-up after render textures.
9. **`physics/rigid-bodies`** — depends on Rapier being available.

Add `Both` track versions of 1.1 and 1.2 once the TS transpilation pipeline exists. Until then, JS versions serve both audiences.

---

## Notes

- "Replaces later" means the old example stays until the new one is reviewed and merged; then the old slug is removed from the catalog.
- Line budgets exclude blank lines and import statements.
- All new examples must import from `@codexo/exojs` (not the legacy `exojs` identifier).
- Lang tag `TS` means the implementation target is TypeScript using the patterns in [js-ts-example-strategy.md](js-ts-example-strategy.md). No TS examples exist yet in the playground.
