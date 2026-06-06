# Changelog

All notable changes to ExoJS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Release notes are curated at release time, not per pull request. When a version
is cut, this section is renamed to `## [x.y.z] - YYYY-MM-DD` and filled from the
merged pull requests and commits since the previous tag (each with its commit /
PR link); `pnpm release:notes` then renders that section into the published
GitHub release with a `PREVIOUS_TAG...CURRENT_TAG` compare link.

## [0.12.0] - 2026-06-06

A developer-experience release: a rebuilt guide, a `create-exo-app` scaffolder, a
more navigable playground, and more reliable docs and published types. No new
engine features — the runtime API is unchanged from 0.11.0.

### Added

- **Rebuilt guide experience.** A new information architecture with a "Start
  Here" learning path, per-chapter learning goals and prerequisites,
  Previous/Next navigation, and a Guide → Playground → API flow that links each
  concept to a runnable example and its API page. New Project Structure,
  Troubleshooting, and Deployment chapters, an Orb Dodge build walkthrough, and
  source-backed snippets that render real, type-checked code straight from the
  example sources.

- **`create-exo-app` scaffolder.** Start a typed project with
  `npm create exo-app`, choosing from three templates — `minimal`,
  `game-starter`, and `audio-reactive`. An interactive prompt guides template
  selection in a TTY;
  non-interactive environments default to `minimal`. This is the first public
  `create-exo-app` release (`0.1.0`), versioned independently of the engine.

- **Playground navigation.** A "Start Here" featured set, full-text search,
  category filtering, concrete per-example descriptions, and the Orb Dodge
  sample turn the example catalog into something browsable rather than a flat
  list.

- **`@codexo/exojs/debug` entry point.** Debug layers and overlays ship under a
  dedicated `@codexo/exojs/debug` subpath, bundled as an external-core
  `dist/exo.debug.esm.js` that imports the engine at runtime rather than
  duplicating it — ready for import-map consumption alongside the core.

### Changed

- **Docs track the real API.** Guide code blocks are type-checked against the
  engine in CI, the guides teach the current `RenderingContext` draw API, and
  the custom-shader chapter was corrected to the real `ShaderSource` +
  `MeshMaterial` model. Internal guide and API prose links are validated, and
  the API reference is regenerated deterministically so the committed pages stay
  in sync with the source. `astro check` is clean.

### Fixed

- **Published TypeScript declarations resolve for consumers.** The emitted
  `.d.ts` files shipped internal `@/…` path aliases that a consumer's TypeScript
  could not resolve, which silently dropped inherited members from the public
  types (for example, `Graphics` lost `Drawable` methods like `setPosition` and
  `rotate`). Declarations now use relative specifiers, so `tsc` resolves the
  full type surface and the starter templates type-check and build.

## [0.11.0] - 2026-06-04

### Added

- **WebGPU geometry stencil completion.** WebGPU now supports geometric stencil
  clipping across custom-material pipelines (Sprite, Mesh, Graphics), reaching
  pixel parity with WebGL2 for all default and custom material paths. (#41, #43)

- **Graphics gradient fills.** `Graphics` primitives now accept `LinearGradient`
  and `RadialGradient` fills via `fillGradient` and `strokeGradient` style
  properties. `Gradient` was promoted to a `Color`-like value object with
  `lerp()` and `toArray()` methods. A `graphics-gradient` example demonstrates
  cross-backend gradient rendering with pixel-validated test coverage.
  (#52, #53, #55, #56, #57)

- **`BitmapText` diagnostics and demo.** Added `BitmapText` rendering with BMFont
  diagnostics utilities and a `bitmap-text-basic` example demonstrating bitmap
  font rendering, character set inspection, and layout options. (#66)

- **`assert()` dev diagnostics.** Added a lightweight assertion utility
  (`assert(condition, message)`) for development-time invariant checking.
  Assertions are stripped in production builds. (#67)

- **TypeScript-first examples migration.** All 117 example files converted from
  JavaScript to TypeScript across the full examples tree: application-scenes,
  sprites-textures, input, text-fonts, scene-graph, tweens-animation, filters,
  debug-layer, audio-basics, audio-fx, beat-detection, particles, performance,
  geometry-graphics, render-targets, custom-renderers, and showcase. The
  playground example pilot added type-safe example loading.
  (#68, #69, #70, #71, #72, #73, #74, #75, #76, #77, #78, #79)

- **`@assets` import-map module.** Examples can now reference bundled assets via
  `@assets/...` import paths, with the `Loader` supporting absolute-path
  resolution for this scheme. (#65)

- **Multi-browser + dark-mode smoke support.** The example smoke test runner now
  supports dark color-scheme canvases and resolves a WebGPU feature-flag conflict
  during multi-browser runs.

### Performance

- **Render pipeline hot-path profiling.** Instrumented the render-plan path to
  identify and eliminate bottlenecks in render command processing and group
  compaction. (#80)

- **Batched transform storage writes.** `TransformBuffer` uploads are now batched
  by render group, reducing per-node `device.writeBuffer` calls and improving
  render-plan playback throughput. WebGPU transform storage is pre-reserved
  before playback to eliminate mid-frame reallocation. (#44, #45, #46, #48, #50)

### Fixed

- **GLSL reserved word.** Fixed a WebGL2 text shader that used `text` as a
  variable name (a reserved word in GLSL ES 3.00), resolving compilation failures
  on strict drivers. (#60)

- **SDF text baseline alignment.** Corrected SDF tile height computation to use
  font-level metrics, fixing vertical misalignment in multi-font and mixed-size
  text layouts. (#62, #63)

- **WebGPU mesh tint normalisation.** Mesh tint values on the WebGPU path are now
  normalised to the 0-1 range before upload, matching WebGL2 behaviour. (#54)

- **WebGPU Uint16 index-buffer alignment.** `Uint16` index-buffer writes are now
  aligned to 4-byte boundaries on WebGPU, preventing alignment violations on
  hardware that enforces `COPY_DST` buffer offset restrictions.

- **Loader `@assets/` absolute-path resolution.** The `Loader` now correctly
  resolves absolute paths when using the `@assets/` import-map scheme, fixing
  failed asset loads in playground and bundled example deployments. (#65)

- **Example runtime health.** Repaired broken examples across the catalog
  including text layout rendering, playground navigation stability, style option
  migration, and smoke test failures. (#58, #59, #61, #64)

## [0.10.0] - 2026-05-31

### Breaking — RenderingContext and Scene.draw migration

- `Scene.draw()` now receives `RenderingContext` instead of `RenderBackend`.
- Use `context.render(node)` instead of `node.render(backend)` for the high-level path.
- Use `context.backend` for advanced raw backend calls (`clear`, `setRenderTarget`, `setView`, etc.).
- `app.rendering` is the canonical high-level rendering accessor (replaces the former `app.renderer` name).
- `Application.renderTo()` remains available as a convenience wrapper.
- `RenderNode.render(backend)` remains available as an advanced/raw path, marked `@advanced`.

### Breaking — Rendering order semantics

- Removed `Container.sortableChildren`.
- `SceneNode.zIndex` is now always applied locally among siblings during render-plan playback.
- Sorting is now non-destructive to `Container.children`; render ordering no longer mutates the child array.
- Removed `SceneNode.childOrder` / `SceneNode.setChildOrder()` from the public scene-node surface.

### Breaking — Gradient and storage cleanup

- Removed `GradientDrawable` (`src/rendering/primitives/Gradient.ts`).
- Added texture-first gradients: `Gradient`, `LinearGradient`, and `RadialGradient` with `toTexture(width, height, options?)`.
- Removed `SaveStore`; replaced with `JsonStore`.
- `JsonStore` API rename: `save()` -> `set()`, `load()` -> `get()`.
- Renamed particles `Gradient` to `ColorGradient` and `GradientKey` to `ColorGradientKey` to avoid root export collisions.

### Migration notes

- Remove `container.sortableChildren = true` from user code.
- `Scene.draw(backend)` → `Scene.draw(context)`: the draw method now receives `RenderingContext` instead of `RenderBackend`.
  - `node.render(backend)` → `context.render(node)` (recommended high-level path).
  - `backend.clear()` → `context.backend.clear()` (raw accessor is still available).
  - `RenderNode.render(backend)` remains as the advanced raw path when needed.
- For custom drawables, use `Drawable` + `RendererRegistry` so rendering remains on the backend dispatch path (`backend.draw(drawable)`).
- Replace `GradientDrawable` with `new Sprite(new LinearGradient(...).toTexture(w, h))` (or `RadialGradient`).
- Replace `SaveStore` imports/usages with `JsonStore` and update calls to `set()/get()`.
- Replace particles `Gradient` imports with `ColorGradient`.

### Internal — render pass consolidation and WebGPU geometry stencil parity

- Centralized render-pass ownership inside the backends behind an internal `RenderPassCoordinator`: the WebGPU renderers, mask compositor, and shader filter now record into a single coordinator-owned `GPURenderPassEncoder` per flush instead of each opening and submitting its own. Submit/pass counts are unchanged and there is no public API change.
- The clear-vs-load decision (including `RenderTexture` content preservation across multiple passes in a frame) is now owned by the coordinator.
- WebGPU now supports geometric stencil clipping (`RenderNode.clip` with a `Geometry` `clipShape`) at pixel parity with WebGL2 for default-material `Sprite` and default-material `Mesh`/`Graphics` content (including composition with scissor rects and nested clips); it previously failed clearly. Clipping `Text`, `ParticleSystem`, custom-material `Sprite`, or custom-material `Mesh` content with a `Geometry` clipShape on WebGPU still throws a clear error at collection time (use a `Rectangle` clipShape for the scissor path, or the WebGL2 backend); `Rectangle`/bounds clips are unaffected.

## [0.9.0] - 2026-05-24

### Migration guide

- ExoJS `v0.9.0` includes pre-1.0 API consolidation changes. Migration steps and before/after examples:
  <https://exoridus.github.io/ExoJS/en/guide/migration/v0-8-x-to-v0-9-0/>

### Breaking — Public API consolidation

- `ApplicationOptions` moved from flat top-level fields to grouped `canvas`, `loader`, `rendering`, and `input` sections.
- Loader option renames: `resourcePath` → `basePath`, `requestOptions` → `fetchOptions`.
- Application scene accessor rename: `app.sceneManager` → `app.scene`.
- Active scene getter rename: `SceneManager.scene` → `SceneManager.currentScene`.
- Removed `Scene.getParticipationPolicy()` in favor of direct `scene.stackMode` access.
- Removed duplicate/alias APIs on scene objects:
  - `SceneNode`: `parentNode`, `bounds`, `globalTransform`, `localBounds`, `setCullable()`
  - `RenderNode`: `setCacheAsBitmap()`, `setFilters()`
  - `Text`: `setText()`, `setStyle()`
  - `Color`: `.red/.green/.blue/.alpha` (use `.r/.g/.b/.a`)
- `Tween.to()` now enforces numeric target keys at the TypeScript type level (`NumericKeys<T>`).

### Added / Improved

- Added skew transforms on scene nodes (`skewX`, `skewY`, `setSkew`), including bounds/hit-test correctness updates for skewed nodes.
- Added typed asset loading primitives and flows (`Asset<T>`, `Assets<M>`, `LoadingQueue`) while keeping low-level loader usage available.
- Improved tween ergonomics and lifecycle:
  - managed tweens correctly re-register on restart after eviction (`stop`/`complete`)
  - `TweenManager.sequence()` helper for chain creation
  - scene-scoped tween proxy lifecycle behavior aligned with scene disposal
- Loop/timing hardening:
  - `pauseOnHidden` resume delta-spike fix
  - internal max-delta clamp for safer simulation updates
  - `backend.stats.rawFrameDeltaMs` for profiling unclamped frame delta
- Collision/sweep documentation and response semantics were clarified and aligned to source behavior.

### Docs / API reference

- Published the v0.8.x → v0.9.0 migration guide in the docs guide tree.
- Regenerated API reference pages from the current source surface (215 API pages).
- API docs now hide internal-only methods marked for internal engine wiring.

### Build / Workspace / CI

- Workspace preparation completed for the `site` package under root npm workspaces with root-driven install/build flow.
- Consolidated root scripts for site orchestration (`site:build`, `site:build:api`) and bootstrap install.
- Removed separate `site/package-lock.json` in favor of a root lockfile workflow.
- Vendor sync scripts were hardened for both hoisted and non-hoisted dependency layouts (resolver-based Monaco and Exo vendor path discovery).
- Rollup build constants and environment-aware build modes were introduced (`production`/`development`, `__DEV__`, `__VERSION__`, `__COMMIT_SHA__`, `__BUILD_ENV__`).
- CI/release/pages workflows were aligned to root workspace installation and root-script site builds.

### Verification

- Engine checks pass at HEAD: typecheck clean, strict lint clean, tests passing (`106` suites / `1452` tests), exports verification clean.
- Site API generation and site build pass on the workspace-oriented pipeline.

## [0.8.4] - 2026-05-14

### Site / Guide

- **Full English Guide complete through Parts 3–8.** Drawing (5 chapters),
  Input (4), Audio (4), Effects (3), Advanced (5), and Recipes (8) are now
  written, editorially consistent, and source-verified against the engine
  API as shipped in v0.8.3.

- **v0.8.3 feature chapters integrated.** Audio-reactive visualization (5.5),
  Custom mesh shaders (6.4), and Render pipeline debugging (7.6) reflect the
  `BeatDetector` visual getters, `AudioAnalyser` mel/log spectrum API,
  `MeshShader` dual GLSL + WGSL class shape, and `RenderPassInspectorLayer`.

- **Full-guide editorial and source/API verification pass.** All 38 drafted
  chapters verified for internal consistency, correct API surface references,
  and accurate example cross-links. Terminology, heading conventions, and
  cross-part forward/backward references aligned in a single pass.

- **39 English Guide routes verified across dark/light and desktop/mobile
  screenshot matrix.** 156/156 captures successful (39 routes × 2 themes ×
  2 viewports).

### Release Tooling

- **`scripts/release.mjs` replaced by `scripts/release.ts`.** Script is now
  type-checked as part of the TypeScript codebase.

- **`scripts/generate-release-notes.ts`.** New standalone tool that extracts
  a version section from `CHANGELOG.md`, resolves the previous semver tag from
  git history or the changelog, fills the `.github/templates/release-notes.md`
  template, and writes the result to a specified output path. Exposed as
  `npm run release:notes`.

- **GitHub Releases now receive populated changelog-driven markdown bodies.**
  The CI release workflow calls `release:notes` and passes the rendered file
  to `gh release create --notes-file`.

- **Historical tag support.** `release:notes` can generate notes for any past
  tag (e.g., `v0.8.2`, `v0.8.3`) — useful for backfilling GitHub Release pages.

- **Windows-safe `npm pack --dry-run` in `verify:package`.** The `--cache`
  flag now points to a project-local `.npm-cache` directory, avoiding the
  cross-user npm cache permission error that affected `verify:release` on
  Windows CI.

### Verification

- Engine: typecheck clean, lint:strict 0/0, 1338/1338 tests, `verify:release` green.
- Site: 494-page build clean, `check-ts` 0 errors / 0 warnings.
- Screenshot smoke: 36/36. Guide visual matrix: 156/156 captures.

## [0.8.3] - 2026-05-10

### Engine — Rendering

- **`MeshShader` class with dual GLSL + WGSL support.** The 0.8.2
  `MeshShaderConfig` plain interface is replaced by a `MeshShader` class
  accepting `glsl: { vertex, fragment }` and/or `wgsl` source. The WebGPU
  mesh renderer now has a parallel render path for custom-shader meshes
  inside the same render pass, switching pipeline + bind groups between
  batched default draws and per-shader custom draws. New methods
  `getDeclaredUniforms()` and `detectUniformDrift()` parse uniform
  declarations from both languages for CI-style drift checking. **Breaking
  change against the 0.8.2 plain-interface shape; clean break, no
  backwards-compat shim — the 0.8.x series is pre-1.0.**

- **`DataTexture` for CPU-uploaded GPU textures.** New primitive whose
  pixels live in a CPU-side typed array. Mutate the `buffer` directly and
  call `commit()` to upload the whole array, or `commitRect(x, y, w, h)`
  for partial uploads (cheaper for ring-buffer patterns like
  spectrograms). Formats: `r8` / `r32f` / `rgba8` / `rgba32f`; TypeScript
  narrows the buffer typed-array kind from the format. Bring-your-own
  buffer via `options.data` (`Uint8Array | Float32Array | ArrayBuffer`)
  for SharedArrayBuffer / Worker / pool scenarios. Extends `Texture` so
  it's accepted everywhere a `Texture` is.

### Engine — Audio

- **`BeatDetector` visual getters for per-frame polling.** New derived
  getters `pulse`, `barPulse`, `justBeat`, `secondsSinceLastBeat` and
  method `subdivisionPhase(division)`. All pure derivations from existing
  state — no new event-handling glue required for typical "pulse on the
  beat" / "trigger on every 16th note" visuals. Mutable fields
  `pulseHalfLife` (default 0.15s), `barPulseHalfLife` (0.3s), and
  `justBeatWindow` (0.03s) tune the envelopes.

- **`AudioAnalyser` mel and log spectrum mapping.** New methods
  `getSpectrumMel` / `getSpectrumMelFloat` / `getSpectrumLog` /
  `getSpectrumLogFloat` produce perceptually-weighted or octave-uniform
  band sequences from the linear FFT bins. Filterbanks are built from
  the previously-orphaned `dsp/mel.ts` utilities and cached per
  `(bands, fMin, fMax)` combination — rebuild only on parameter change.
  Default 32 bands, 20 Hz to 20 kHz (clamped to nyquist).

- **`source` as constructor option for `AudioAnalyser` and `BeatDetector`.**
  Additive ergonomic for one-shot construction:
  `new AudioAnalyser({ source: music, fftSize: 1024 })`. The setter
  remains usable for runtime source switches.

### Engine — Debug

- **`RenderPassInspectorLayer`.** New debug layer (in the
  `@codexo/exojs/debug` subpath) that lists every `RenderNode` with an
  active filter chain each frame, showing total pass count, per-drawable
  filter sequence, bounding-box dimensions, and mask/cache flags. For
  deep per-pass inspection (intermediate render-target contents, shader
  source, uniform values), use Spector.js or Chrome DevTools' WebGPU
  panel — the engine now emits debug-group labels around filter and
  mesh-custom-shader passes (`WebGpuShaderFilter pass`,
  `MeshShader (custom)`, `WebGpuMaskCompositor pass`) so external capture
  tools display meaningful pass names.

### Site / Docs

- New guide chapter stubs: `6.4 Custom mesh shaders`,
  `5.5 Audio-reactive visualization`, `7.6 Render pipeline debugging`.
- API doc auto-regenerated for `MeshShader` and `DataTexture`.

### Verification

- Engine: 103/103 suites, 1338/1338 tests, lint:strict 0/0, typecheck clean.
- Site: build green (494 pages), check-ts 0/0.

## [0.8.2] - 2026-05-09

### Engine

- **`Mesh` accepts custom WebGL2 shaders.** New `MeshShaderConfig` + `MeshShaderUniformValue`
  exports. Supply `shader: { vertexSource, fragmentSource, uniforms }` in `MeshOptions` to
  bind a custom GLSL ES 3.00 program against the standard mesh vertex layout. Auto-bound
  uniforms (`u_projection`, `u_translation`, `u_tint`, `u_texture`) are set only when the
  shader declares them, so Shadertoy-style fullscreen passes can ignore them entirely.
  Texture uniforms claim slots 1–7. WebGL2 only in this release; the WebGPU mesh
  renderer throws a clear error pointing to the WebGL2 backend if `mesh.shader` is set.

- **Filter chain memory: ping-pong RT reuse.** `RenderNode._renderContentToTexture` now
  releases the previous step's RenderTexture immediately after each `filter.apply`, so
  the pool can hand the same memory back to the next step. Multi-filter chains drop from
  N+1 simultaneously-allocated RTs to a steady-state of 2. ~60% RT-memory reduction on
  4-filter 1080p chains. Behaviour-identical; no public API change.

### Site / Docs

- Part 2 "Core Concepts" guide section published (6 chapters, source-verified):
  Application, Scenes, Scene lifecycle, Scene graph, Coordinates and views,
  Loading and resources.
- Astro `6.3.0 → 6.3.1`, `@types/node 25.6.0 → 25.6.2` in site/.

### Verification

- Engine: 100/100 suites, 1266/1266 tests, lint:strict 0/0, typecheck clean.
- Site: build green (488 pages), check-ts 0/0, screenshot smoke 36/36.

## [0.8.1] - 2026-05-08

Three small additive features that close the remaining examples-driven API gaps from
the 0.8.0 audit, plus a long-overdue lint/format tooling consolidation and a 19-chapter
examples reorganisation.

### Added

- **`Sound` spatial falloff configuration.** `DistanceModel` type (`'linear' | 'inverse'
| 'exponential'`), plus optional `distanceModel`, `refDistance`, `maxDistance`, and
  `rolloffFactor` fields on `SoundOptions`. The four are also exposed as live property
  setters that lazy-forward to the attached `PannerNode`. New public `Sound.audioBuffer`
  getter to share one decoded buffer across multiple `Sound` instances.
- **`LutFilter`** — new colour-pipeline primitive that maps every pixel through a
  Look-Up Table texture. Supports both 1D LUTs (`N×1`, indexed by red channel — palette
  cycling, indexed-colour effects) and 3D LUTs (`N²×N` unwrapped cube with trilinear
  slice interpolation — cinematic colour grading, tone mapping, film stock emulation,
  accessibility filters). Backend selection is automatic. Static helpers
  `LutFilter.identityLut1D(size)`, `LutFilter.identityLut3D(size)`,
  `LutFilter.fromImage(image)` cover the standard DaVinci/OBS/Photoshop LUT-export
  workflows.
- **`CompressorFilter.reduction`** — public getter forwarding the live gain reduction
  in dB from the underlying `DynamicsCompressorNode`. Use as a meter source for
  visualisations or sidechain triggers.

### Examples

- Migrated `examples/public/examples/` to a 19-chapter pedagogical structure: getting
  started, application & scenes, sprites & textures, tweens & animation, input, scene
  graph, audio basics, spatial audio, filters, particles, text & fonts, geometry &
  graphics, render targets, performance, audio FX, beat detection, debug layer, custom
  renderers, showcase. Old chapter directories (`collision-detection`, `extras`,
  `particle-system`, `rendering`, `webgpu`) removed.
- New examples: `spatial-audio/falloff-curves.js`, `filters/palette-cycling.js`,
  `showcase/color-grading.js`. The compressor demo gained a live gain-reduction meter.

### Tooling

- ESLint config consolidated into a single `eslint.config.ts` driven by ESLint 10 +
  `typescript-eslint`'s type-aware checks plus `simple-import-sort`,
  `unused-imports`, `unicorn`, and `security` plugins. `lint:strict` is the
  release-gate variant, scoped to `src/**/*.ts` and run with `--max-warnings=0` (warnings
  fail the build); `lint` is the broader development view across `src`, `test`, and
  examples. Per-subsystem override blocks are documented as known deviations to tighten
  over time.
- Tightened to error: `eqeqeq`, `no-floating-promises`, `no-base-to-string`,
  `only-throw-error`, `switch-exhaustiveness-check`, `no-non-null-assertion`,
  `complexity` (cap 20). Added: `no-self-compare`, `no-unreachable-loop`,
  `default-case-last`, `prefer-promise-reject-errors`, `no-promise-executor-return`,
  `no-unmodified-loop-condition`, plus six TypeScript and six Unicorn correctness rules.
- Prettier `printWidth: 160`, `.editorconfig` matched. Engine code reformatted to
  2-space indent.

## [0.8.0] - 2026-05-07

Wholesale rewrite of the particle subsystem around a data-oriented core
plus a backend-agnostic auto-routing pipeline. The `Particle` class,
`ParticleAffector` interface, `ParticleEmitter` interface,
`ParticleOptions`, `UniversalEmitter`, and the four built-in affectors
(`ColorAffector`, `ForceAffector`, `ScaleAffector`, `TorqueAffector`)
are removed. They are replaced by SoA storage on the system,
`Distribution<T>`-based spawn configs, and per-batch
`SpawnModule` / `UpdateModule` / `DeathModule` interfaces.

Update modules now declare an optional `wgsl()` contribution — when
the system is constructed with a `WebGpuBackend` and every registered
update module is GPU-eligible (i.e. all built-ins, plus any custom
modules the author opts in), a composite WGSL compute shader is built
at first `update()`. Integration + every module body + pack-instances
all run in **one dispatch**, writing directly into the renderer's
instance vertex buffer. **No CPU readback** in the steady state.

On WebGL2 backends, or when any registered update module lacks
`wgsl()`, the system runs the existing CPU pipeline. The decision is
automatic and per-system; user code is unchanged across both paths.

### Added — Struct-of-Arrays storage

`ParticleSystem` now stores particles as parallel `Float32Array` /
`Uint32Array` / `Uint16Array` channels addressed by slot index:

```ts
system.posX[slot];
system.posY[slot];
system.velX[slot];
system.velY[slot];
system.scaleX[slot];
system.scaleY[slot];
system.rotations[slot];
system.rotationSpeeds[slot];
system.color[slot]; // packed 0xAABBGGRR
system.elapsed[slot];
system.lifetime[slot];
system.textureIndex[slot];
system.liveCount; // [0, liveCount) is the live range
```

Capacity is fixed at construction (default 4096) — no reallocations.
The integrate pass runs as one tight loop over typed arrays with no
method calls. Expiry is handled by forward-compaction (O(n) total
instead of the previous O(n²) splice loop with scattered expirations).

### Added — `Distribution<T>` family

Spawn-time random sampling and lifetime-parameterised evaluation:

| Type            | Use                                                                           |
| --------------- | ----------------------------------------------------------------------------- |
| `Constant<T>`   | Always-same value                                                             |
| `Range`         | Uniform random number in `[min, max]`                                         |
| `VectorRange`   | Per-axis random vector                                                        |
| `ConeDirection` | Random unit vector in a cone × speed range                                    |
| `CircleArea`    | Random point in/on a circle                                                   |
| `BoxArea`       | Random point in/on an AABB                                                    |
| `LineSegment`   | Random point on a segment                                                     |
| `Curve`         | Piecewise-linear keyframe scalar by lifetime ratio                            |
| `Gradient`      | Piecewise-linear keyframe color, with `evaluateRgba()` for direct u32 packing |

`Curve` and `Gradient` cache the last segment so monotonically
advancing `t` (the typical case for per-particle lifetime sampling)
is O(1) amortised.

### Added — Module pipeline

Three module bases. Each registered on a system via the corresponding
`addX` method; each runs in its declared phase per-frame.

```ts
abstract class SpawnModule {
  apply(system, dt: number): void;
}
abstract class UpdateModule {
  apply(system, dt: number): void;
}
abstract class DeathModule {
  onDeath(system, slot: number): void;
}
```

**Built-in spawn modules:**

- `RateSpawn({ rate, lifetime?, position?, velocity?, scale?, rotation?, rotationSpeed?, tint?, textureIndex? })`
  — continuous emission with sub-frame accumulator. Each property is an
  independent `Distribution<T>`.
- `BurstSpawn({ schedule, loop?, ...samePropsAsRate })` — discrete
  bursts at scheduled times. Use for explosions, level-ups,
  hit-impacts.

**Built-in update modules** (operate on the SoA arrays in tight loops):

- `ApplyForce(ax, ay)` — adds constant acceleration.
- `Drag(coefficient)` — exponential velocity damping.
- `ColorOverLifetime(gradient)` — tint sampled from a `Gradient`.
- `ScaleOverLifetime(curve)` — both axes sampled from a `Curve`.
- `RotateOverLifetime(angularAccel)` — increments `rotationSpeed`.

**Built-in death module:**

- `SpawnOnDeath(targetSystem, spawner, count?)` — sub-emitter. Forwards
  the dying particle's position to a target system's spawn module.
  Use for explosion-on-impact, end-of-life sparks, multi-stage VFX.

### Added — Backend-agnostic auto-routing GPU compute pipeline

New `src/rendering/webgpu/compute/` infrastructure:

- `WebGpuStorageBuffer` — owning wrapper over a `STORAGE | COPY_DST | COPY_SRC`
  buffer with `write()` and async `read()` helpers.
- `WebGpuComputePipeline` — `device.createComputePipeline` wrapper with
  bind-group-layout creation, dispatch helper.

New `src/particles/gpu/ParticleGpuState` — owns the GPU-side mirror
for one `ParticleSystem`. At construction time it:

1. Walks the registered update modules, collecting each module's
   `WgslContribution` (uniform field declarations + texture bindings
   - WGSL body snippet).
2. Generates a composite WGSL compute shader: SoA storage bindings +
   sim/module uniform structs + module texture bindings + a `main`
   function containing integration → all module bodies in registration
   order → pack-instances writing interleaved 24-byte instances into
   a `STORAGE | VERTEX` buffer.
3. Allocates 7 packed storage buffers (positions/velocities/scales/
   rotInfo/timing as `vec2<f32>` arrays plus color as `u32` plus the
   instance output) — fits within WebGPU's default
   `maxStorageBuffersPerShaderStage = 8` limit.
4. Allocates 1D textures for any module that declares them
   (`Curve` → 256-tap r32float; `Gradient` → 256-tap rgba8unorm) and
   uploads the lookup data once via `module.uploadTextures()`.
5. Each module's `writeUniforms()` runs every frame to update its
   slice of the shared module-uniform buffer.

The `WebGpuParticleRenderer` reads the GPU-written instance buffer
directly when `system.gpuMode` is true; CPU mode falls back to the
existing CPU-pack path. Same renderer, same vertex layout, no copy
between simulation and render.

`UpdateModule` gains optional `wgsl()`, `writeUniforms()`,
`uploadTextures()`. Built-in modules ship all three. Custom modules
that implement them get GPU acceleration; modules with only `apply()`
keep working but force their host system into CPU mode.

Opt-in is a single constructor option — no imperative toggle:

```ts
const system = new ParticleSystem(texture, {
  capacity: 8192,
  backend: app.backend, // CPU-routed on WebGL2, GPU-routed on WebGPU
});
```

The `backend` reference is duck-typed against `WebGpuBackend`; on
WebGL2 it's recorded but never used. The system's mode is locked in
at the first `update()` (when modules are introspected); adding update
modules after that throws.

### Removed — Old particle API (BREAKING)

The following symbols are deleted. Migration recipes follow the table.

| Removed                                | Replacement                                                   |
| -------------------------------------- | ------------------------------------------------------------- |
| `Particle` (class)                     | SoA arrays on `ParticleSystem` (`system.posX[slot]`, etc.)    |
| `ParticleProperties` (interface)       | None — slot-indexed arrays replace the per-particle object    |
| `ParticleEmitter` (interface)          | `SpawnModule` (abstract class)                                |
| `ParticleOptions`                      | Per-property `Distribution<T>` in the spawn module's config   |
| `UniversalEmitter`                     | `RateSpawn`                                                   |
| `ParticleAffector` (interface)         | `UpdateModule` (abstract class)                               |
| `ColorAffector`                        | `ColorOverLifetime` + `Gradient`                              |
| `ForceAffector`                        | `ApplyForce`                                                  |
| `ScaleAffector`                        | `ScaleOverLifetime` + `Curve`                                 |
| `TorqueAffector`                       | `RotateOverLifetime`                                          |
| `system.requestParticle()`             | `system.spawn(): number` (slot index, or `-1` at capacity)    |
| `system.emitParticle(p)`               | (gone — `spawn()` already commits the slot to the live range) |
| `system.updateParticle(p, dt)`         | (gone — internal to `update()`)                               |
| `system.addEmitter(e)`                 | `system.addSpawnModule(m)`                                    |
| `system.addAffector(a)`                | `system.addUpdateModule(m)`                                   |
| `system.particles` (`Array<Particle>`) | `system.posX` / `system.posY` / ... `system.liveCount`        |
| `system.graveyard`                     | (gone — no graveyard; slots are recycled in place)            |

### Migration

```ts
// Before — bonfire
const options = new ParticleOptions();
const colorAffector = new ColorAffector(new Color(194, 64, 30, 1), new Color(0, 0, 0, 0));
const emitter = new UniversalEmitter(50, options);
const system = new ParticleSystem(texture);
system.addAffector(colorAffector);
system.addEmitter(emitter);

// in update():
options.totalLifetime.copy(seconds(rand(5, 10)));
options.position.set(rand(-50, 50), rand(-10, 10));
options.velocity.set(/* ... */);

// After — bonfire
const system = new ParticleSystem(texture);
system.addSpawnModule(
  new RateSpawn({
    rate: new Constant(50),
    lifetime: new Range(5, 10),
    position: new VectorRange(-50, 50, -10, 10),
    velocity: new ConeDirection(-Math.PI / 2, Math.PI / 36, 60, 80),
  }),
);
system.addUpdateModule(
  new ColorOverLifetime(
    new Gradient([
      { t: 0, color: new Color(194, 64, 30, 1) },
      { t: 1, color: new Color(0, 0, 0, 0) },
    ]),
  ),
);
// no per-frame mutation needed.
```

```ts
// Before — gravity affector
const gravity = new ForceAffector(0, 980);
system.addAffector(gravity);

// After
system.addUpdateModule(new ApplyForce(0, 980));
```

```ts
// Before — custom affector
class AlphaFade {
  apply(particle, delta) {
    particle.tint.a = particle.remainingRatio;
    return this;
  }
  destroy() {}
}

// After
class AlphaFadeOverLifetime extends UpdateModule {
  apply(system) {
    const { color, elapsed, lifetime, liveCount } = system;
    for (let i = 0; i < liveCount; i++) {
      const remaining = 1 - elapsed[i] / lifetime[i];
      const a = (Math.max(0, Math.min(1, remaining)) * 255) & 255;
      color[i] = (color[i] & 0x00ffffff) | (a << 24);
    }
  }
}
```

```ts
// Before — direct particle creation in tests
const particle = system.requestParticle();
particle.position.set(10, 12);
particle.tint = Color.red;
system.emitParticle(particle);

// After — direct slot manipulation
const slot = system.spawn();
system.posX[slot] = 10;
system.posY[slot] = 12;
system.color[slot] = Color.red.toRgba();
system.lifetime[slot] = 1;
system.scaleX[slot] = 1;
system.scaleY[slot] = 1;
```

### Changed — `ParticleSystem` constructor: typed overloads (BREAKING)

Source material (texture / atlas frames / spritesheet) lives in
**positional arguments** — TypeScript overload signatures enforce mutual
exclusivity at compile time so you can't pass nonsense combinations like
texture-and-spritesheet-at-once. Capacity and the test-only `device`
escape hatch live in the trailing options object.

```ts
// 0.7.x:
new ParticleSystem(texture);
new ParticleSystem(texture, 4096);

// 0.8.0:
new ParticleSystem(); // untextured (1×1 white), CPU/GPU auto-routed
new ParticleSystem(spark); // simple textured particles
new ParticleSystem(spark, { capacity: 8192 }); // explicit capacity
new ParticleSystem(atlas, [r0, r1, r2]); // multi-frame atlas
new ParticleSystem(atlas, frames, { capacity: 8192 }); // atlas + capacity
new ParticleSystem(sheet); // spritesheet shorthand
new ParticleSystem(sheet, { capacity: 4096 });
```

The four overload signatures:

```ts
constructor(options?: ParticleSystemOptions);
constructor(texture: Texture, options?: ParticleSystemOptions);
constructor(texture: Texture, frames: ReadonlyArray<Rectangle>, options?: ParticleSystemOptions);
constructor(spritesheet: Spritesheet, options?: ParticleSystemOptions);
```

Compile-time errors for illegal combinations:

```ts
new ParticleSystem(spark, sheet); // ✗ no overload matches
new ParticleSystem(sheet, frames); // ✗ frames only valid with Texture
new ParticleSystem({ frames }); // ✗ frames isn't an option
```

**No `backend` option** — the renderer auto-discovers the active backend
on the first `render(backend)` call. WebGPU → GPU compute path, WebGL2 →
CPU path. Re-discovery on backend change (device-loss recovery).

### Added — Optional texture + 1×1 white default

When `texture` is omitted, the system uses a lazily-allocated 1×1
opaque-white singleton. Particles render as solid color quads driven by
the per-particle `color` channel. Useful for tech-demo magic effects,
abstract VFX, performance benchmarks.

### Added — Multi-frame atlas via `frames` / `spritesheet` options

`frames: ReadonlyArray<Rectangle>` declares per-particle frame
rectangles within the atlas texture. Each particle's `textureIndex[i]`
selects which frame to render — `RateSpawn` /
`BurstSpawn`'s `textureIndex: Distribution<number>` becomes the per-spawn
frame chooser:

```ts
const system = new ParticleSystem({
  texture: explosionAtlas,
  frames: [
    new Rectangle(0, 0, 32, 32), // index 0 — flame core
    new Rectangle(32, 0, 32, 32), // index 1 — smoke ring
    new Rectangle(64, 0, 32, 32), // index 2 — ember
  ],
});

system.addSpawnModule(
  new BurstSpawn({
    schedule: [{ time: 0, count: 60 }],
    velocity: ConeDirection.omni(120, 280),
    textureIndex: new Range(0, 2), // each spawn picks a random frame
  }),
);
```

`Spritesheet` integration via `spritesheet: sheet` extracts texture +
frames in insertion order — convenient for atlas authors who already
have a sheet from a TexturePacker / Aseprite export.

UV resolution happens once per particle per frame (CPU pack in CPU mode,
compute shader in GPU mode); the renderer reads pre-resolved UVs from
the instance buffer — no shader-side frame-array lookup overhead.

### Changed — Per-instance vertex layout: 24 → 40 bytes

The renderer's per-instance buffer now carries `uvMin: vec2` and
`uvMax: vec2` alongside the existing translation/scale/rotation/color
fields. Lets a single batch render any mix of atlas frames per instance
without indirection through a uniform array. Net cost: +67% bandwidth
on the instance buffer (still trivial — ~10 MB/s at 60 fps with 16k
particles).

The previous design used a single `u_uvBounds` uniform that pinned
every particle in a system to the same frame; the new layout is what
makes per-particle atlas selection free.

The system pre-allocates all SoA arrays at construction. Spawn modules
that want to emit beyond capacity get `-1` from `spawn()` and should
bail cleanly (the built-ins do).

### Changed — slot allocation differs between CPU and GPU mode

In CPU mode, `[0, liveCount)` is dense (forward-compaction at end of
update). `spawn()` always returns the next sequential slot.

In GPU mode, no compaction happens — readback would be required to
move slots whose authoritative position lives in GPU memory. Instead:

- Each particle has an `alive: Uint8Array` flag (1 = alive, 0 = dead).
- `spawn()` finds the first dead slot via a round-robin hint pointer
  (amortised O(1), worst case O(capacity)).
- Expiry on CPU: `alive[i] = 0`, `lifetime[i] = -1` (sentinel).
- The compute shader skips dead slots (`timing[idx].y < 0.0` → write
  zero-scale instance and return).

Custom modules iterating `[0, liveCount)` should check `system.alive[i]`
in GPU mode if they care about ignoring dead slots; mutating dead slot
data is harmless because the GPU shader skips them.

### Added — `system.aliveCount`

Returns the actual count of alive particles (slots with `alive[i] === 1`).
In CPU mode this equals `liveCount`; in GPU mode it's `≤ liveCount`.
Use for fragmentation diagnostics or UI counters.

### Performance notes

- Spawning + integrating + ColorOverLifetime/ScaleOverLifetime + drag
  on 10k particles: previously ~5 ms CPU per frame; new SoA path on
  CPU: ~0.5 ms (~10× speedup from eliminating per-particle object
  indirection). New GPU path on WebGPU: ~0.05 ms (~100× speedup from
  the previous OO baseline) — bound by the per-frame upload, not the
  compute itself.
- The crossover where GPU beats CPU sits around 1-3 k particles
  depending on hardware. For sub-1k systems CPU is still slightly
  faster (upload overhead dominates); the auto-router doesn't second-
  guess this — opt out via `backend: undefined` if you want to force
  CPU at low counts.
- 100k+ particles render and simulate cleanly on WebGPU at 60 fps in
  CI smoke tests; the bottleneck shifts from compute to texture
  bandwidth at that scale.

## [0.7.13] - 2026-05-07

Major gamepad-input refactor. Replaces the `new Input(...)` +
`inputManager.add(...)` pattern with a fluent listener API, splits the
unified `GamepadChannel` enum into disjoint `GamepadButton` /
`GamepadAxis` for type-safe button-vs-axis distinction, introduces
always-4 stable gamepad slots with disconnect-aware listeners, and adds
rumble, generic per-pad signals, slot-strategy configuration, aggregate
signed stick channels, and Joy-Con-honest mappings.

### Added — Listener API

```ts
// Per inputManager (manual unbind):
app.input.onTrigger(GamepadButton.South, () => player.jump());
app.input.onActive(GamepadAxis.LeftStickX, v => (player.x += v * 5));
app.input.onStart([Keyboard.Space, GamepadButton.South], () => fire());

// Per gamepad (slot-aware, listener survives disconnect/reconnect):
const pad = app.input.getGamepad(0);
pad.onTrigger(GamepadButton.South, () => p1.jump());

// Per scene (auto-disposed on scene unload):
this.inputs.onTrigger(Keyboard.Escape, () => this.app.sceneManager.popScene());
```

Each method returns an `InputBinding` with `.unbind()` for manual
lifecycle. Single channel or array of channels is accepted.

### Added — Always-4 gamepad slots

`InputManager.gamepads` is now a fixed
`readonly [Gamepad, Gamepad, Gamepad, Gamepad]` tuple. Each `Gamepad`
instance lives for the application's lifetime; check `pad.connected` for
hardware presence. Listeners attached when a slot is empty automatically
activate when a pad connects to that slot — no rebinding required.

Convenience accessors on `app.input`:

- `getGamepad(slot)` — readable single-slot accessor (equivalent to
  `gamepads[slot]`).
- `connectedGamepads: readonly Gamepad[]` — only the currently-attached
  pads, in slot order.
- `connectedGamepadCount: number`
- `firstConnectedGamepad: Gamepad | null`
- `hasGamepad: boolean`

Per-pad: `pad.internalIndex` returns the browser's `Gamepad.index` for
the attached hardware (or `null` when disconnected). Low-level escape
hatch — prefer `pad.slot` for stable application-side identity.

### Added — Slot strategy

`new Application({ gamepadSlotStrategy: 'sticky' | 'compact' })` —
default `'sticky'` (each pad keeps its slot through disconnects).
`'compact'` shifts higher-numbered pads down to fill gaps after a
disconnect (good for hot-seat couch coop where "the first N pads are
the N players" is the desired semantic).

In compact mode, the disconnect signal fires on the slot that _ended
up_ empty after the shift (not the slot the disconnected hardware
originally occupied), keeping `pad.connected === false` consistent with
the fired event. Slots that received a different physical pad through
the shift dispatch a separate signal:

- `pad.onPadReassigned: Signal<[fromSlot: 0 | 1 | 2 | 3]>`
- `app.input.onAnyGamepadReassigned: Signal<[Gamepad, fromSlot]>`

so player-binding code can re-resolve which `Gamepad` belongs to which
player when slots renumber.

### Added — Generic signals

Per-pad:

- `pad.onConnect: Signal<[]>`
- `pad.onDisconnect: Signal<[]>`
- `pad.onButtonDown: Signal<[GamepadButton, number]>`
- `pad.onButtonUp: Signal<[GamepadButton, number]>`
- `pad.onAxisChange: Signal<[GamepadAxis, number]>`

Aggregate across all pads:

- `inputManager.onAnyGamepadButtonDown: Signal<[Gamepad, GamepadButton, number]>`
- `inputManager.onAnyGamepadButtonUp: Signal<[Gamepad, GamepadButton, number]>`
- `inputManager.onAnyGamepadAxisChange: Signal<[Gamepad, GamepadAxis, number]>`

### Added — Vibration

```ts
if (pad.canVibrate) {
  await pad.vibrate({ duration: 200, weakMagnitude: 0.5, strongMagnitude: 1.0 });
}
pad.stopVibration();
```

Wraps the W3C `vibrationActuator.playEffect('dual-rumble')` API. Silent
no-op on platforms without haptic support — use `pad.canVibrate` to
detect availability for UI gating. Trigger-rumble (PS5 / Xbox Series
adaptive triggers) is not exposed because browser support is currently
Chrome-only and non-standard.

### Added — Aggregate axis channels

`GamepadAxis.LeftStickX`, `LeftStickY`, `RightStickX`, `RightStickY` —
signed -1..1 values that consume the full bipolar range of the physical
stick. Use these for stick-style movement input; the existing
direction-split channels (`LeftStickLeft`, `LeftStickRight`, etc.)
remain available for buttons-style 0..1 input.

```ts
// Stick-style — one binding per axis, signed value:
this.inputs.onActive(GamepadAxis.LeftStickX, x => (player.x += x * 5));

// Buttons-style — separate bindings per direction, 0..1 each:
this.inputs.onActive(GamepadAxis.LeftStickLeft, v => (player.x -= v * 5));
this.inputs.onActive(GamepadAxis.LeftStickRight, v => (player.x += v * 5));
```

### Added — `pad.hasChannel(channel)` capability check

```ts
if (pad.hasChannel(GamepadAxis.RightStickX)) {
  pad.onActive(GamepadAxis.RightStickX, v => (crosshair.x += v * 8));
}
```

Returns `true` only when the pad's mapping declares the requested
channel. Useful for graceful degradation on devices with limited
hardware (e.g. single Joy-Con without a right stick).

### Added — `Scene.inputs` proxy

Bindings created via `this.inputs.onTrigger(...)` etc. are automatically
disposed when the scene unloads. No manual cleanup tracking required.
Internally tracks each binding and calls `.unbind()` in `Scene.destroy`.

### Added — Steam Deck / Steam Virtual Gamepad / Valve fallback

New `SteamDeckGamepadMapping` covers the raw HID layout reported by the
Steam Deck (and likely future Valve hardware) when Steam Input is _not_
intercepting the device. Indices follow the SDL_GameControllerDB Linux
entry: face buttons at 3-6, D-pad at 16-19, paddles at 20-23, triggers
as analog axes 8/9.

Routing rules added to `builtInGamepadDefinitions`:

| Browser ID                                                                   | Mapping                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `28de:1102`, `28de:1142`                                                     | `SteamControllerGamepadMapping` (existing, original Steam Controller raw) |
| `28de:11ff` (Steam Virtual Gamepad — any controller via Steam Input)         | `GenericDualAnalogGamepadMapping` (W3C standard Xbox emulation)           |
| `28de:1205`                                                                  | `SteamDeckGamepadMapping` (raw Steam Deck)                                |
| Vendor `28de` (anything else from Valve, e.g. future Steam Controller 2 raw) | `SteamDeckGamepadMapping` (best-effort fallback)                          |

Enum: `GamepadMappingFamily.SteamDeck` added.

### Added — Paddle2/3/4 buttons + Touchpad2X/Y axes

The per-gamepad channel allocation is repartitioned into 32 button
slots + 32 axis slots (was 21 / 22 with mid-block axis indices). 24
named buttons (`South`-`Paddle4`) plus 8 reserved slots; 24 named axes
(stick split + aggregate + dual-touchpad XY + 4 auxiliary bipolar) plus
8 reserved slots. The reserved slots are accessible to custom mappings
without colliding with future named additions.

New named channels:

- `GamepadButton.Paddle2`, `.Paddle3`, `.Paddle4` — extra paddles
  / back buttons on Xbox Elite, PS5 Edge, Steam Deck (R4/L5/R5).
- `GamepadAxis.Touchpad2X`, `.Touchpad2Y` — secondary touchpad on
  dual-touchpad hardware (Steam Deck right pad).

User code that previously read `GamepadButton.Paddle1` etc. is
unaffected — channel **values** changed (offsets re-laid-out), but the
namespace constants resolve to the new offsets transparently.

### Added — JoyCon-honest mappings

`JoyConLeftGamepadMapping` and `JoyConRightGamepadMapping` no longer
inherit the full DualAnalog 16-axis layout. Each declares only channels
that physically exist on the device (one stick mapped to LeftStick
channels, four face buttons, SL/SR shoulders, Minus/Plus, Capture/Home,
stick-click). Right-stick channels and other phantom hardware are
intentionally absent — `pad.hasChannel(GamepadAxis.RightStickX)` returns
`false` on a solo Joy-Con.

### Changed — `app.inputManager` renamed to `app.input` (BREAKING)

For consistency with `app.audio` and parity with the brevity of
`app.tweens` / `app.loader` / `app.interaction`. All call sites that
read or wrote `app.inputManager` need a one-token rename.

```ts
// Before:
app.inputManager.onTrigger(GamepadButton.South, () => fire());
app.inputManager.gamepads[0];

// After:
app.input.onTrigger(GamepadButton.South, () => fire());
app.input.getGamepad(0);
```

### Fixed — Compact-mode disconnect ordering

In `'compact'` slot strategy, `onDisconnect` previously fired on the
slot the disconnected hardware originally occupied — _before_ the
compaction shift moved a different physical pad into that slot. User
code observing the event would see `pad.connected === true` because
the slot had been silently re-bound by the shift. Now compaction is
applied first (silent), and `onDisconnect` fires on the slot that
ended up empty (the trailing slot). Sticky behaviour is unchanged.

### Changed — Channel naming (BREAKING)

The unified `GamepadChannel` enum is split into two disjoint enums for
nominal type safety:

| Old                            | New (user-facing)            | New (internal type)                 |
| ------------------------------ | ---------------------------- | ----------------------------------- |
| `GamepadChannel.ButtonSouth`   | `GamepadButton.South`        | `GamepadButtonChannel.South`        |
| `GamepadChannel.ButtonEast`    | `GamepadButton.East`         | `GamepadButtonChannel.East`         |
| `GamepadChannel.LeftShoulder`  | `GamepadButton.LeftShoulder` | `GamepadButtonChannel.LeftShoulder` |
| `GamepadChannel.LeftStickLeft` | `GamepadAxis.LeftStickLeft`  | `GamepadAxisChannel.LeftStickLeft`  |
| ...                            | ...                          | ...                                 |

User code references the namespace mirrors (`GamepadButton.X`,
`GamepadAxis.Y`) — same `Pointer.X` / `Keyboard.Space` convention. Type
checking now rejects passing a button channel where an axis is expected
(and vice versa).

### Changed — `GamepadControl` removed (BREAKING)

`GamepadControl` is replaced by two concrete classes:

- `GamepadButton` — wraps a button index + channel, with optional
  `invert` and `threshold` options. `transformValue(v)` clamps to [0, 1].
- `GamepadAxis` — wraps an axis index + channel, with optional `invert`,
  `normalize`, `threshold`, and the new `bipolar` flag.
  `transformValue(v)` clamps to [-1, +1] and applies the pipeline.

Custom mappings construct these directly via `new GamepadButton(index, channel)`
/ `new GamepadAxis(index, channel, options)` —
`GamepadMapping.createControls()` is removed.

### Changed — `Input` class replaced by `InputBinding` (BREAKING)

`new Input(channel, { onTrigger: cb })` + `inputManager.add(input)` is
gone. Use `inputManager.onTrigger(channel, cb)` / `pad.onTrigger(...)` /
`scene.inputs.onTrigger(...)` instead. Returned `InputBinding` exposes
the same `onStart`/`onActive`/`onStop`/`onTrigger` Signals plus a
`.unbind()` method.

### Changed — `inputManager.add/remove/clear/getGamepad/onGamepadUpdated` removed (BREAKING)

The push-input-objects-into-the-manager API is fully replaced by the
factory-method API. `getGamepad(index)` is replaced by direct
`gamepads[slot]` indexing. `onGamepadUpdated` is replaced by
`onAnyGamepadButtonDown` / `onAnyGamepadButtonUp` /
`onAnyGamepadAxisChange` which carry semantic transition information
instead of firing every frame.

### Changed — `Gamepad` constructor signature (BREAKING)

```ts
// Before:
new Gamepad(index, channels, mapping);
new Gamepad(browserGamepad, channels, definition);

// After (engine-internal — InputManager handles slot allocation):
new Gamepad(slot, channels);
// followed by pad._bind(browserGamepad, definition) on connect
```

User code does not construct `Gamepad` instances directly. Reads from
`pad.info` / `pad.mapping` / `pad.connected` instead of the previous
`pad.name` / `pad.label` / `pad.vendorId` / etc. inline accessors.

### Migration guide

```ts
// Before:
import { Input, GamepadChannel, Keyboard } from '@codexo/exojs';

const jump = new Input(GamepadChannel.ButtonSouth, { onTrigger: () => player.jump() });
app.input.add(jump);

// After (any of three styles, depending on lifecycle):
import { GamepadButton, Keyboard } from '@codexo/exojs';

// Manual lifecycle
const binding = app.input.onTrigger(GamepadButton.South, () => player.jump());
binding.unbind(); // when done

// Auto-disposed on scene unload
this.inputs.onTrigger(GamepadButton.South, () => player.jump());

// Pinned to a specific pad slot
this.app.input.gamepads[0].onTrigger(GamepadButton.South, () => player.jump());
```

```ts
// Stick movement — before:
const moveLeft = new Input(GamepadChannel.LeftStickLeft);
const moveRight = new Input(GamepadChannel.LeftStickRight);
app.input.add(moveLeft);
app.input.add(moveRight);
// per frame: const x = moveRight.value - moveLeft.value;

// After (signed aggregate channel):
this.inputs.onActive(GamepadAxis.LeftStickX, x => (player.x += x * 5));
```

```ts
// Custom mapping — before:
import { GamepadMapping, GamepadChannel } from '@codexo/exojs';
const buttons = GamepadMapping.createControls([
  [0, GamepadChannel.ButtonSouth],
  [1, GamepadChannel.ButtonEast],
]);

// After:
import { GamepadButton, GamepadMapping, GamepadMappingFamily } from '@codexo/exojs';
class MyMapping extends GamepadMapping {
  public readonly family = GamepadMappingFamily.GenericDualAnalog;
  public constructor() {
    super([new GamepadButton(0, GamepadButton.South), new GamepadButton(1, GamepadButton.East)], []);
  }
}
```

## [0.7.12] - 2026-05-07

API audit cleanup pass — implements collision-response computation that was
silently returning zero/null, exports previously-internal type aliases that
callers couldn't otherwise type, and removes a handful of small API papercuts
surfaced during the JSDoc-coverage pass that landed across `0.7.x`.

### Fixed — Collision-response computation

Four collision paths were returning a `CollisionResponse` whose `projectionN`
and `projectionV` were zero vectors (or returning `null` outright), making
the response unusable for separation/sliding logic.

- **`getCollisionRectangleRectangle`** — now returns the minimum-translation
  vector (MTV) along the axis with the smaller penetration, signed by the
  centre-to-centre direction. Existing `overlap` and containment flags are
  unchanged.
- **`getCollisionCircleRectangle`** — rewritten to use the standard
  closest-point-on-rect algorithm. Previously computed distance against an
  out-of-rect anchor point, producing a wrong result whenever the circle
  centre was inside the rectangle. Normal points from rect surface toward
  circle; falls back to the smaller-exit axis when the circle centre is
  inside the rect.
- **`Ellipse.collidesWith`** — implements `Ellipse`-vs-`Rectangle` and
  `Ellipse`-vs-`Circle` via the directional ellipse-boundary equation
  `1 / sqrt((dx/rx)² + (dy/ry)²)`. Other targets (ellipse-vs-ellipse,
  ellipse-vs-polygon, ellipse-vs-line) still return `null` —
  `intersectsWith` remains the boolean fallback.
- **`Line.collidesWith`** — kept returning `null` (lines have no
  meaningful SAT response), but the JSDoc now states the contract
  explicitly so callers don't expect a vector.

`Rectangle.collidesWith` and `Circle.collidesWith` route ellipse targets to
the new functions via the existing `swap` flag.

### Fixed — Object-URL leak (re-emphasised; was 0.7.11 fix)

The 0.7.11 fix for `MusicFactory` and `VideoFactory` URL revocation is
unchanged in 0.7.12 — listing it here for completeness because the pre-1.0
audit findings memory carries a forward reference to it.

### Changed — Visibility / readonly tightening (potentially breaking)

Pre-1.0 cleanups that narrow the public surface where callers could
previously poke at internal state:

- **`GamepadMapping.buttons` / `.axes`** typed `ReadonlyArray<GamepadControl>`
  instead of `Array<GamepadControl>`. Internal `destroy()` retains the
  `length = 0` clear via a local cast. **Breaking** for callers that were
  pushing or splicing the arrays directly.
- **`View.updateTransform()` / `.updateBounds()`** changed from `public` to
  `protected`. They were never safe to call externally — invoking them
  bypassed the dirty-flag clearing in `getTransform()` / `getBounds()` and
  could cause redundant recalculation. **Breaking** if you relied on them.
- **`IndexedDbDatabase.getObjectStore()`** changed from `public` to
  `protected`. Only callers were the class's own `load`/`save`/`delete`
  methods. **Breaking** if any subclass referenced it externally.
- **`GamepadDefinitions.normalizeIds`** is no longer exported. It was an
  in-file helper that leaked through the barrel. **Breaking** for any
  caller importing it directly.
- **`GamepadPromptLayouts.buildControlChannelMap()`** renamed to
  `getControlChannelMap()` — the name now matches the behaviour (returns a
  pre-built constant; never builds anything). **Breaking** rename.

### Added — API surface

Additive changes; not breaking:

- `EqualizerFilter` now exposes runtime setters for `lowFrequency`,
  `midFrequency`, and `highFrequency` (previously only construction-time).
  Smooth ramp via `setTargetAtTime` to avoid clicks.
- `Filter` (abstract base for post-process filters) now declares a
  `destroy()` method with a no-op default. `BlurFilter` / `ColorFilter` /
  `WebGl2ShaderFilter` / `WebGpuShaderFilter` mark their existing
  implementations as `override`. Generic-filter consumers no longer need
  a cast to release filters.
- `getCollisionEllipseRectangle` and `getCollisionEllipseCircle` are
  exported from the math barrel for direct use.

### Changed — Internal cleanups

Doc-only and signature-only refactors:

- `Sprite._invalidateSubtreeTransform` / `._invalidateBoundsCascade` tagged
  `@internal` (they are `public` only because of TS friend-class limits).
- `_getDebugQuadtree` (InteractionManager) and `_walkBounds` (Quadtree)
  tagged `@internal` to mark the friend-class link to the debug layer.
- `PerformanceLayer` declares `viewMode` explicitly to match the other
  debug layers.
- `PointerStackLayer._buildLines` lost its two unused `_panelX` / `_panelY`
  parameters. Internal-only; not user-visible.
- `intersectionCirclePoly` got an inline comment explaining the
  negated-frame coordinate transform.
- `AudioAnalyserOptions` interface picked up per-field JSDoc with documented
  defaults.
- `SoundFactoryOptions.poolSize` JSDoc names the implicit `Sound` default (8).
- `ChorusFilter` lost a redundant `as AudioParam` cast.
- `Video.setupWithAudioContext` is now an arrow-bound field instead of a
  context-bound method; cleaner internally, no API change.
- `ShaderUniform.propName` uses `String.prototype.substring` instead of the
  deprecated `substr`.
- `Tween.repeat` JSDoc now ships an `@example` block clarifying that
  `repeat(2)` runs the animation three times total.
- `Line.collidesWith` documents the always-`null` behaviour as intentional.
- `RenderTarget.addDestroyListener` / `.removeDestroyListener` got JSDoc
  pointing out that `RenderTexture` (which extends `RenderTarget`) inherits
  them; the audit finding that claimed otherwise was incorrect.

## [0.7.11] - 2026-05-07

Performance pass — adds a multi-domain benchmark suite, an auto-profiler
that finds Top-3-Wins from baseline data, and three measured optimizations
those benchmarks identified. Includes a breaking change to
`InteractionManager` (the `useSpatialIndex` flag is removed; spatial
indexing is now automatic and persistent).

### Added — Performance infrastructure

- **`test/perf/` benchmark suite** covering five domains: rendering,
  audio, collision, scene-graph, interaction. Each domain has its own
  script (`npm run perf:bench:rendering`, `:audio`, `:collision`,
  `:scene-graph`, `:interaction`) plus `:all` aggregator. Output: JSON
  - Markdown to `test/perf/results/`.
- **Baseline snapshot** committed as `test/perf/results/baseline.md` —
  reference numbers at 0.7.10 for future regression detection.
- **Auto-profiler** (`npm run perf:profile`, `:gc` variant with
  `--expose-gc`) that re-runs the hottest scenarios with granular
  sub-timings, heap-delta tracking, and call counters. Writes
  `test/perf/results/findings.md` with auto-derived Top-3 Wins
  recommendations.
- Profile helpers (`SubTimingTracker`, `CallCounter`, `MemoryTracker`)
  in `test/perf/profile-runner.ts` for future ad-hoc profiling.

### Performance — Win 1: `Polygon.getNormals()` cached

Mirrors the 0.6.19 dirty-flag pattern from `Sprite.getNormals()` and the
0.7.8 work on `Circle.getNormals()`. `Polygon.getNormals()` now caches
the result and recomputes only when shape mutates. Returns the same
array reference on subsequent calls. Eliminates per-call allocation of
N `Vector` instances during SAT collision — significant for collision-
heavy scenes. Cache invalidated on `setPoints`, `setPosition`, `set`,
`copy`, and the `x` / `y` / `position` setters.

The legacy `normals` getter is now `@deprecated` — call `getNormals()`
directly. Behavior is identical; the getter just delegates.

### Performance — Win 2: `Quadtree.queryPoint()` documented buffer reuse

The `results?: Array<QuadtreeItem<T>>` parameter has been there since
0.6.16 but was undocumented. JSDoc now explicitly documents the
buffer-reuse pattern for zero-allocation hot-path queries. Added a
`Quadtree.remove(item)` method (needed internally by Win 3); also
publicly available for users who want to maintain quadtrees externally.

### Performance — Win 3: Persistent Spatial-Index (BREAKING)

`InteractionManager`'s spatial index now lives across frames and is
incrementally maintained — replaces the per-frame full rebuild. This
also makes the `useSpatialIndex` opt-in flag unnecessary and **the
flag has been removed entirely**.

**How it works now:**

- A persistent quadtree is created lazily when the first interactive
  node enters the scene.
- `Container.addChild` / `removeChild` walk subtrees and add/remove
  interactive descendants from the index.
- `RenderNode.interactive = true/false` toggles registration.
- Transform mutations on interactive nodes (position / rotation / scale)
  mark the node as "stale" via `_invalidateBoundsCascade`.
- Stale entries are lazy-updated at the start of `InteractionManager.update()`
  on the next frame, before queries are dispatched.
- When the last interactive node is removed, the quadtree is disposed
  and lifecycle returns to zero overhead.

**Practical effect:** scenes with many interactive nodes get the same
~5× faster hit-testing the old `useSpatialIndex = true` provided, but
without the per-frame rebuild cost. Mostly-static scenes (the common
case) see particularly large wins — incremental updates only fire on
actually-moved nodes.

### Changed (BREAKING)

- **`InteractionManager.useSpatialIndex` removed.** Spatial indexing is
  now automatic. Code that explicitly set the flag (`= true` or
  `= false`) gets a TypeScript error; the value should simply be
  removed. Old `useSpatialIndex = true` users get the same speedup
  automatically. Old `useSpatialIndex = false` users get a faster hit
  path with negligible mutation overhead.
- **`RenderNode.interactive` is now a getter/setter** (was a public
  field). External behavior is identical for normal usage
  (`node.interactive = true`). Any code that relied on the field's
  shape (descriptor inspection, etc.) needs to adapt. Reading the value
  is a getter call — same observable behavior.
- The `HitTestLayer` debug overlay no longer requires
  `useSpatialIndex = true` to draw quadtree quadrants; it draws them
  whenever the persistent quadtree is non-null (i.e., whenever any
  interactive node exists in the active scene).

### Migration

```ts
// Before:
app.interaction.useSpatialIndex = true; // flag opt-in

// After:
// Nothing — index is automatic. Just have at least one interactive
// node in the scene and queries use the persistent quadtree.
```

### Notes

- This release adds 30 net new tests (Polygon-cache + persistent-index
  lifecycle), removes a few `useSpatialIndex`-flag assertion tests, and
  modifies `interaction.test.ts` `TestSprite` to expose `getBounds()`
  for the persistent index. Test count: 1196 → 1212.
- The benchmark suite and auto-profiler are dev infrastructure — they
  live in `test/perf/` and are not shipped via npm (the `files` array
  in package.json controls what's packed).
- The findings.md committed alongside baseline.md is a snapshot of
  performance characteristics at 0.7.11 baseline — re-running profiles
  will overwrite locally but the committed reference remains for
  diff comparisons.
- Future perf passes can use the same auto-profiler tooling to identify
  the next round of Wins. CI-integrated regression detection is a
  future Phase 4 if there's demand.

## [0.7.10] - 2026-05-07

Closes the audio chapter. Adds the long-deferred fade transition helper,
a procedural tone generator, and four custom-DSP filter classes that
demonstrate the WorkletFilter foundation from 0.7.1. After this release,
ExoJS audio is feature-complete for the originally-planned scope.

### Added

- **`crossFade(from, to, durationMs, options?): Promise<void>`** — top-
  level helper that calls `from.fadeOut()` and `to.fadeIn()` in parallel,
  optionally auto-playing `to` if paused. Resolves after `durationMs`
  elapses. Replaces the manual `await` + dual-fade pattern documented in
  0.6.20.
- **`Envelope`** — ADSR (Attack-Decay-Sustain-Release) generator usable
  on any `AudioParam`. Schedules a gain curve via `trigger()` (attack →
  decay → sustain) and `release()` (sustain → 0). Independent of any
  specific media class — apply to oscillators, filters, or custom
  AudioParam targets.
- **`OscillatorSound`** — procedural tone generator. No AudioBuffer
  needed — each `play()` synthesizes via WebAudio's `OscillatorNode`.
  Configurable `frequency`, `type` (`sine` | `square` | `sawtooth` |
  `triangle`), `detune` (cents), optional `Envelope`. Pool semantics
  match `Sound` (default `poolSize: 8`, `SoundPoolStrategy.FirstInFirstOut`).
  Static helper `OscillatorSound.midiToFrequency(midiNote)` and
  `setNote(midiNote)` for music apps. Default-routes to `mixer.sound`.
- **`ChorusFilter`** — modulated-delay chorus / vibrato effect. Native
  WebAudio nodes only (DelayNode + Oscillator LFO + GainNodes), no
  worklet. Configurable `delayMs`, `depthMs`, `rateHz`, `wet`. Use as
  an Audio bus filter:
  ```ts
  bus.addFilter(new ChorusFilter({ rateHz: 1.5, depthMs: 5 }));
  ```
- **`PitchShiftFilter`** — granular real-time pitch shifter (WorkletFilter).
  Configurable `pitch` (0.25× to 4×), `wet`, internal `grainSize`. V1
  quality is good for ±1 octave; beyond that, audible granular artifacts.
  Higher-quality phase-vocoder pitch shifting is V2.
- **`VocoderFilter`** — classic 16-band vocoder (WorkletFilter, 2-input).
  Takes a `modulator: AudioBus` whose spectral envelope shapes the
  carrier signal (the bus the filter is attached to). Configurable
  `numBands`, `minHz`, `maxHz`, `bandQ`, `wet`, `envelopeSmoothing`.
  Per-band biquad bandpass filters + envelope follower entirely in the
  worklet for sample-accurate processing.
- **`GranularFilter`** — granular synthesis effect. Slices recent input
  audio into Hann-windowed grains and replays them with randomized
  offset and pitch. Configurable `grainSize`, `density`, `spread`,
  `pitchMin`, `pitchMax`, `wet`. Suitable for ambient textures, glitch
  effects, time-stretching, pitch clouds.

### Notes

- `OscillatorSound` does NOT support spatial audio in V1 (no
  `position` / `velocity` properties). For spatial procedural audio,
  attach the OscillatorSound to a spatial `Sound` bus or wait for a
  future enhancement. `Sound`'s spatial path covers AudioBuffer-based
  sources.
- All four custom-DSP filters extend the `WorkletFilter` base from
  0.7.1, except `ChorusFilter` which uses native nodes (sufficient for
  modulated-delay topology).
- The audio chapter as originally scoped is now closed:
  - 0.7.0 — AudioMixer + Buses + Filters + Spatial + Pool
  - 0.7.1 — AudioWorklet foundation + DuckingFilter migration
  - 0.7.2 — BeatDetector (Stage 1+2) + AudioAnalyser rewrite
  - 0.7.7 — 3/4 time-signature detection + AudioListener bugfix
  - 0.7.10 — crossFade + OscillatorSound + Envelope + 4 custom-DSP
    filters (Chorus, PitchShift, Vocoder, Granular)
- Items deferred indefinitely: HRTF binaural panning, ambisonic /
  surround output, MIDI playback, voice chat, ASR/TTS, format
  conversion, audio editor / waveform UI, custom-loudness
  normalization. These remain out-of-scope per the original audio
  modernization roadmap.

## [0.7.9] - 2026-05-07

Fixes a GLSL compile-error in the 0.7.8 shader auto-upgrade path.

### Fixed

- **`upgradeFragmentShaderToGl300()` now always prepends `precision highp
float;`** before the `out vec4 fragColor;` declaration. Previously, if
  the user's source already contained a precision declaration anywhere
  (e.g., `precision lowp float;` mid-source), the upgrader skipped its
  own injection — but the user's declaration came AFTER the
  `out vec4 fragColor;` line, which itself uses a float-typed variable.
  GLSL ES 3.00 requires precision to be declared before any float-typed
  declaration, so the compiler rejected the output with
  `0:2: '' : No precision specified for (float).`

  Multiple precision declarations are legal in GLSL ES 3.00 with
  last-precision-wins semantics. The fix always injects `precision highp
float;` at line 2 (before `out vec4 fragColor;`); the user's own
  precision declaration further down still applies to their code via
  the standard last-precision-wins rule. No semantic change for
  user-provided shader logic; previously-broken shaders with custom
  precision declarations now compile correctly.

## [0.7.8] - 2026-05-04

GLSL 1.00 → 3.00 auto-upgrade for `WebGl2ShaderFilter` (Shadertoy/ISF
shaders work out of the box) plus a code-hygiene pass — `Circle.getNormals()`
now caches via dirty-flag (matching 0.6.19's Sprite pattern), Rectangle-vs-
Rectangle collision response now reports correct `overlap` value, and the
`destroy()` audit cleans up TODO comments across 8 value classes (with
real cleanup logic added to `ObservableVector` and `Circle` where needed).

### Added

- **`upgradeFragmentShaderToGl300(source)`** — exported utility function.
  Upgrades GLSL ES 1.00 fragment shader source to 3.00 with documented
  transformations (adds `#version 300 es`, `precision highp float`,
  `out vec4 fragColor`, replaces `gl_FragColor` / `texture2D(` /
  `textureCube(` / `texture2DProj(` / `varying`). Idempotent: 3.00
  source returns unchanged. Edge cases not handled (`gl_FragData[N]`,
  `textureLod` variants, etc.) produce GLSL compile errors that the
  user must port manually.
- **`WebGl2ShaderFilterOptions.autoUpgrade: boolean`** (default `true`)
  — when enabled, the constructor passes the user's `fragmentSource`
  through `upgradeFragmentShaderToGl300()` before storing. Set to
  `false` for strict 3.00 input (legacy code becomes a compile error
  — useful for CI / linting setups that want to catch legacy shaders
  as bugs). Vertex shader source is never auto-upgraded; legacy
  vertex sources must be ported manually.

### Performance

- **`Circle.getNormals()` cached via dirty flag** (matching the 0.6.19
  pattern for `Sprite.getNormals()`). Returns a stable array of `Vector`
  references on subsequent calls; recomputes only when radius / position
  / x / y change. Reduces GC pressure in collision-detection hot paths
  (especially SAT polygon-vs-circle).
- **`Circle.getCollisionVertices()` invalidation bug fixed.** The
  cache existed since the initial commit but was never invalidated on
  position / radius changes — moving a Circle after first collision
  check returned stale vertex positions. Now invalidates correctly via
  `_verticesDirty` flag.

### Fixed

- **`getCollisionRectangleRectangle.overlap`** now returns the correct
  minimum axis overlap (`min(overlapX, overlapY)`) instead of hardcoded
  `0`. Required for any collision-response logic that pushes shapes
  apart by their overlap distance. Other collision shapes (Circle-vs-
  Circle, Circle-vs-Rectangle, polygon-via-SAT) already computed this
  correctly.

### Changed

- **`destroy()` audit complete** across 8 value classes:
  - `Vector`, `Size`, `Interval`, `Random`, `Time`, `TorqueAffector`
    — kept as no-op; `// todo` comments replaced with explanatory
    "no-op — pure value class, kept for `Destroyable` interface
    conformance" comments.
  - `ObservableVector` — `destroy()` now nulls the change callback
    to prevent leaks if the instance is held in external scope.
    Field type widened to `(() => void) | null`; all internal call
    sites already used optional-chaining, so no functional change for
    live instances.
  - `Circle` — `destroy()` now destroys all cached `Vector` instances
    in `_collisionVertices` and `_normals` arrays (added in this
    release).

### Notes

- The autoUpgrade default is `true` so Shadertoy/ISF/legacy shaders
  work without any flag. Strict-3.00 codebases can opt out per filter.
- Removed the private `Circle.getCollisionVertex` helper — its logic
  was inlined into `getCollisionVertices` for the cache-reuse pattern.
  Internal change, no external impact.

## [0.7.7] - 2026-05-04

Critical bugfix in `AudioListener` and adds 3/4 time-signature detection
to `BeatDetector`.

### Fixed

- **`AudioListener._tick()` no longer crashes in real browsers.** The
  WebAudio `AudioListener` interface does not expose a `.context`
  property — that's an undocumented quirk that does not exist in any
  spec-compliant browser. The previous `_tick()` implementation read
  `_audioListener.context.currentTime`, which crashed
  deterministically on the first frame after audio-context unlock.
  Tests passed because the jsdom mock incorrectly defined a `.context`
  property; that has been removed from the mock as well.

  **Severity**: production-critical. The bug fired in every ExoJS app
  that triggered `getAudioContext()` (i.e. any app using `Sound`,
  `Music`, `BeatDetector`, `AudioAnalyser`, or `Video` audio), because
  `AudioMixer.update()` ticks the listener every frame regardless of
  whether the user explicitly set `listener.target`.

  **Fix**: `AudioListener` now stores its `AudioContext` reference in
  a private `_ctx` field at setup time and reads `_ctx.currentTime`
  instead. Mirrors the pattern used elsewhere in the audio stack.

### Added

- **3/4 time-signature detection in `BeatDetector`** — the worklet
  now tracks parallel posteriors over 4-beat and 3-beat bar
  structures. Active time signature is selected via hysteresis:
  - **EMA confidences** (smoothing α=0.1) for each candidate
  - **Sustain-margin guard**: switching requires the alternate TS's
    confidence to exceed the active by 1.4× for ~12-16 consecutive
    beats. Bridges and breakdowns don't trigger spurious switches.
  - **Settling**: first 8 beats stay 4/4 regardless of evidence
- **`BeatDetectorOptions.enableTimeSignatureDetection: boolean`**
  (default `true`) — set to `false` to lock detection to 4/4.
- **`BeatDetector.timeSignature`** stops being hardcoded to
  `{numerator: 4, denominator: 4}` — now reflects the active
  detected TS. Public API unchanged.
- **`BeatDetector.barLength` and `barPosition`** dynamically reflect
  the active TS (3 vs 4 positions). The `lookahead` array marks
  downbeats based on the active bar length.

### Notes

- 6/8, 5/4, 7/8 and other odd time signatures are not detected.
  Default-fallback is 4/4 in all ambiguous cases.
- 3/4 detection works best on stable, percussive 3/4 material
  (waltz-feel music). Performance on Jazz / Rubato / Free-form
  remains weak — consistent with Stage 1+2 limitations from 0.7.2.
- The mock-cleanup means existing test fixtures that relied on
  `audioContext.listener.context` had to be updated; the production
  path no longer reads that property at all.

## [0.7.6] - 2026-05-04

Closes the remaining WebGPU / WebGL2 backend parity gaps and cleans up
vestigial backend API. Adds device-loss / context-loss recovery signals
on both backends, unifies them under `Application.onBackendLost`, moves
`setCursor` to Application, and removes dead-code throws from WebGPU.

### Added

- **`Application.onBackendLost: Signal<[]>`** — unified signal that
  fires when either backend's GPU context is lost (WebGl2 context-lost
  event or WebGpu device-lost promise). User code listens once and
  doesn't care which backend they're on. Useful for showing a "GPU
  driver issue, please reload" dialog.
- **`WebGl2Backend.onContextLost: Signal<[]>`** — backend-specific
  signal mirroring the existing `webglcontextlost` handler.
- **`WebGl2Backend.onContextRestored: Signal<[]>`** — backend-specific
  signal mirroring the existing `webglcontextrestored` handler.
- **`WebGpuBackend.onDeviceLost: Signal<[GPUDeviceLostInfo]>`** —
  WebGPU's `device.lost` promise is now subscribed at initialization;
  resolution dispatches this signal with the loss info. Note: WebGPU
  device loss is irrecoverable on the same device — user code must
  reload, retry, or recreate the application to recover. V1 only
  signals; user decides response strategy.
- **`WebGpuBackend.deviceLost: boolean`** — getter for current
  device-loss state.
- **`WebGpuBackend.clearColor: Color`** + **`setClearColor(color)`** —
  persistent clear color, matching WebGl2's API. `clear()` without
  arguments uses the persistent color.
- **`Application.setCursor(cursor)`** + **`cursor` property** — moved
  here from `WebGl2Backend`. Accepts CSS cursor strings or a
  `Texture` / `HTMLImageElement` / `HTMLCanvasElement` (converted to
  a `url(...)` cursor). Sets `canvas.style.cursor` directly.

### Changed (BREAKING)

- **`WebGl2Backend.setCursor()` and `cursor` getter removed.** Use
  `app.setCursor(...)` or `app.cursor = ...` instead. Cursor is a DOM
  concern, not a backend concern; this corrects the misplacement.
- **`WebGpuBackend.setShader()` removed.** Was a vestigial throw with
  no callers. WebGPU's pipeline-based architecture doesn't fit the
  imperative `setShader` pattern. Custom shaders go through
  `WebGpuShaderFilter` (since 0.7.4).
- **`WebGpuBackend.setVao()` removed.** VAOs are a WebGL concept;
  WebGPU uses bind groups + pipelines. Method had no callers.
- **`WebGpuBackend.setTexture()` and `setRenderTarget()` no-longer-
  throwing on RenderTarget subclass guards.** Throws were unreachable
  because `RenderTexture` is the only `RenderTarget` subclass. The
  guards are gone; the type system already prevents misuse.
- **`WebGpuBackend.setBlendMode()` no-longer-throwing**. Internal
  renderers call this during their pipeline setup; the previous throw
  for unrecognized modes was unreachable (covered all 5 valid blend
  modes). Method now silently returns; the actual blend logic lives in
  the pipeline-creation paths inside `WebGpuBlendState` and the
  individual renderers.

### Migration

```ts
// Before:
app.backend.setCursor('pointer');
const cursor = app.backend.cursor;

// After:
app.setCursor('pointer'); // or
app.cursor = 'pointer';
const cursor = app.cursor;
```

```ts
// New: react to backend loss
app.onBackendLost.add(() => {
  showReloadDialog();
});

// Or backend-specific:
if (app.backend.backendType === RenderBackendType.WebGpu) {
  (app.backend as WebGpuBackend).onDeviceLost.add(info => {
    console.error('GPU device lost:', info.message, info.reason);
  });
}
```

### Notes

- Device-loss is irrecoverable on WebGPU (the lost device cannot be
  reused; recovery requires creating a fresh device, which means
  re-initializing the application). V1 dispatches the signal and stops;
  the user's app code decides whether to reload, retry, or fall back.
- `setBlendMode` could be removed entirely in a future cleanup if the
  pipeline-creation path is the only place blend state is set, but it
  remains as a no-op for now to preserve internal call sites.

## [0.7.5] - 2026-05-04

Expands the debug overlay with three new layers: `BoundingBoxesLayer`,
`HitTestLayer`, and `PointerStackLayer`. Adds a master visibility switch
on `DebugOverlay`. Layers can now opt into world-space rendering for
overlays that need to align with scene content. F2 / F3 / F4 keys are
hardcoded to toggle the new layers (matching the existing F1 for
Performance).

### Added

- **`BoundingBoxesLayer`** — renders AABB outlines for every visible
  RenderNode in the active scene. Color cycles through HSL hue based
  on `zIndex` (`hue = (zIndex * 30) % 360`), so layered nodes are
  visually distinct. Toggle via F2 or
  `debug.layers.boundingBoxes.visible = true`.
- **`HitTestLayer`** — outlines for `interactive` nodes only, with
  state-based colors:
  - **Magenta** (idle interactive)
  - **Yellow** (currently hovered, via `app.interaction.getHoveredNode()`)
  - **Cyan** (captured by an active drag, via the new
    `getCapturedNodes()` accessor)
  - When `useSpatialIndex` is enabled on InteractionManager,
    additionally draws faint quadtree quadrant outlines.
  - Toggle via F3.
- **`PointerStackLayer`** — fixed top-right text panel listing all
  RenderNodes in the active scene whose `contains(worldX, worldY)`
  matches the primary pointer position. Sorted by `zIndex`
  descending (top of stack first). Limited to 10 entries to avoid
  overflow. Useful for debugging "why isn't this clickable" — see
  exactly what's stacked under the cursor. Toggle via F4.
- **`DebugOverlay.visible: boolean`** (default `true`) — master gate
  that suppresses all layer rendering when `false` while preserving
  individual layer states. Restoring `debug.visible = true` brings
  layers back without rewiring.
- **`DebugLayer.viewMode: 'screen' | 'world'`** — abstract getter
  (default `'screen'`); subclasses override. The DebugOverlay groups
  layers by viewMode and swaps `backend.view` accordingly: world-mode
  layers render in the active scene's view (matching scene
  coordinates), screen-mode layers render in canvas-pixel space.
- **`InteractionManager.getCapturedNodes(): ReadonlyArray<RenderNode>`** —
  returns the nodes currently captured by active drags. Used by
  HitTestLayer; also generally useful.
- **`InputManager.getPrimaryPointerPosition()`** — returns the canvas-
  pixel position of the primary pointer (or null if none active).

### Notes

- F2 / F3 / F4 are hardcoded for V1 (matching F1 from 0.6.17). A
  `keybindings: false` opt-out comes when there's concrete demand.
- BoundingBoxes color cycle is intentionally simple (`hue = z * 30 % 360`).
  Adapts to any z range without per-frame normalization. If two nodes
  share zIndex, they share color — that's fine, the layer's purpose is
  visualizing depth differences.
- World-mode layers (BoundingBoxes, HitTest) render BEFORE screen-mode
  layers (Performance, PointerStack) in each frame, so text panels
  appear on top of outlines.

## [0.7.4] - 2026-05-04

Renames `ShaderFilter` → `WebGl2ShaderFilter` and adds `WebGpuShaderFilter`
— full backend-specific custom shader support. Custom post-process
shaders now work on both WebGL2 (GLSL) and WebGPU (WGSL) backends with
explicit, type-safe class names matching the rest of the codebase
(WebGl2Backend / WebGpuBackend, WebGl2SpriteRenderer / WebGpuSpriteRenderer,
etc.).

### Added

- **`WebGpuShaderFilter`** — full WGSL fragment shader support on the
  WebGPU backend. API mirrors `WebGl2ShaderFilter` — accepts WGSL source,
  exposes a mutable `uniforms` map, applies as a post-process Filter via
  `node.filters = [filter]`. Internally creates GPUShaderModules,
  bind-group layouts, render pipeline, and fullscreen-quad vertex buffer
  using the same patterns as `WebGpuMaskCompositor`.
- **WGSL auto-bindings** in `@group(0)`:
  - `@binding(0) var<uniform> uResolution: vec2<f32>` — output dimensions
  - `@binding(1) var uTexture: texture_2d<f32>` — input texture
  - `@binding(2) var uSampler: sampler` — linear sampler
- **User uniforms** in `@group(1)` — packed into a uniform buffer with
  16-byte alignment per slot (per WGSL alignment rules; vec3 is 16-byte
  aligned, not 12). Texture uniforms get separate bind group entries.
- **WGSL default vertex shader** when omitted — fullscreen pass-through
  with a `vUv: vec2<f32>` varying.

### Changed (BREAKING)

- **`ShaderFilter` → `WebGl2ShaderFilter`** — the class was always
  WebGL2-only; the name now reflects that. Same API otherwise.
- **`ShaderFilterOptions` → `WebGl2ShaderFilterOptions`**.
- **`wgsl` option removed from `WebGl2ShaderFilterOptions`** — was
  reserved API surface for future WGSL support, now superseded by the
  separate `WebGpuShaderFilter`.
- **Backend guard messages updated**:
  - `WebGl2ShaderFilter` on WebGPU: `'WebGl2ShaderFilter requires the
WebGL2 backend. Use WebGpuShaderFilter on WebGPU.'`
  - `WebGpuShaderFilter` on WebGL2: `'WebGpuShaderFilter requires the
WebGPU backend. Use WebGl2ShaderFilter on WebGL2.'`

`ShaderFilterUniformValue` (the polymorphic uniform value type) is
**unchanged** and shared between both backends — same value shapes
(number / tuples / TypedArrays / Texture).

### Migration

```ts
// Before (0.7.3):
import { ShaderFilter } from '@codexo/exojs';
const filter = new ShaderFilter({ fragmentSource: glsl, uniforms: { ... } });

// After (0.7.4):
import { WebGl2ShaderFilter } from '@codexo/exojs';
const filter = new WebGl2ShaderFilter({ fragmentSource: glsl, uniforms: { ... } });

// New on WebGPU:
import { WebGpuShaderFilter } from '@codexo/exojs';
const filter = new WebGpuShaderFilter({ fragmentSource: wgsl, uniforms: { ... } });
```

### Notes

- Two separate classes (rather than one polymorphic class with both
  shader sources) reflects the reality that GLSL and WGSL are entirely
  different languages with different binding models. Users writing a
  custom shader inherently know their backend; the explicit class name
  matches that mental model.
- 0.7.3 is effectively replaced — it shipped with the wrong name and a
  WebGPU stub. Window of exposure was minutes; this is corrective.
- WGSL alignment rules differ from GLSL std140: vec3 occupies 16 bytes
  (not 12). The user's WGSL struct must declare members accordingly.
- Performance for fullscreen pixel-shader rendering is equivalent on
  both backends — choose based on browser support, ecosystem
  familiarity (GLSL has more tutorials / Shadertoy), or future-proofing
  preference (WebGPU is the long-term direction).

## [0.7.3] - 2026-05-04

Adds `ShaderFilter` — a high-level Filter subclass that renders the input
through a user-provided GLSL fragment shader. Unlocks custom post-process
effects: visualizers, demoscene shaders, glitch/scanline/dithering passes,
LUT color grading, chromatic aberration, etc.

### Added

- **`ShaderFilter`** — accepts a fragment shader source string + uniforms,
  applies it as a post-process filter on any `RenderNode` via
  `node.filters = [shaderFilter]`. Internally lazy-compiles the shader on
  first apply, allocates a per-instance fullscreen-quad vertex buffer,
  and uses the existing `RenderTargetPass` orchestration shared with
  built-in filters like `BlurFilter`.
- **Auto-bound uniforms** for the user shader:
  - `uniform sampler2D uTexture` — the filter's input
  - `uniform vec2 uResolution` — output dimensions
  - `in vec2 vUv` (varying) — 0..1 UVs across the quad
- **`ShaderFilter.uniforms`** — mutable map for user uniforms. Set values
  via property assignment; flushed before each apply():
  ```ts
  filter.uniforms.uTime = performance.now() / 1000;
  filter.uniforms.uColor = [1, 0.5, 0, 1]; // vec4
  ```
- **Polymorphic uniform values**: scalar `number`, tuple `[a, b]` /
  `[a, b, c]` / `[a, b, c, d]`, `Float32Array` / `Int32Array`, or
  `Texture` / `RenderTexture` (auto-bound to a sampler slot).
- **Default vertex shader** when `vertexSource` is omitted — pass-through
  fullscreen quad. User can supply a custom vertex shader for warps /
  vertex displacement effects.
- **`wgsl` option** in `ShaderFilterOptions` — reserved API surface for
  WebGPU support landing in a future release.

### Notes

- **WebGL2-only in V1.** Constructor accepts `wgsl` source, but `apply()`
  on the WebGPU backend throws `'ShaderFilter does not yet support the
WebGPU backend. WGSL support is planned for a future release. Use the
WebGL2 backend for now.'` Document this limitation; reasoning: WebGPU
  requires a separate WGSL pipeline implementation that's substantial
  on its own. Coming when there's concrete user demand.
- `fragmentSource` is required at construction. Constructor throws if
  missing.
- Internally reuses the existing `Shader` + `WebGl2ShaderProgram`
  infrastructure — no new public Backend methods added.
- Vertex buffer is per-instance (4 vertices × 16 bytes = 64 bytes per
  filter). Pooling across instances was considered but rejected for V1
  to avoid cross-instance lifecycle coupling.

### Usage

```ts
import { ShaderFilter } from '@codexo/exojs';

const filter = new ShaderFilter({
  fragmentSource: `#version 300 es
        precision highp float;
        in vec2 vUv;
        uniform sampler2D uTexture;
        uniform vec2 uResolution;
        uniform float uTime;
        out vec4 outColor;
        void main() {
            vec2 uv = vUv;
            uv.x += sin(uv.y * 10.0 + uTime) * 0.01;  // wavy distort
            outColor = texture(uTexture, uv);
        }
    `,
  uniforms: {
    uTime: 0,
  },
});

sprite.filters = [filter];

app.onFrame.add(delta => {
  filter.uniforms.uTime = performance.now() / 1000;
});
```

## [0.7.2] - 2026-05-04

Adds `BeatDetector` (Stage 1+2: causal DSP hybrid tracker with bar-aware
state model) and rewrites `AudioAnalyser` with a polymorphic source
setter and convenience helpers. **Breaking change** to AudioAnalyser
API — see migration below. Pure-additive on BeatDetector.

### Added

- **`BeatDetector`** — Stage 1+2 beat tracker via AudioWorkletNode.
  Causal DSP pipeline: log-mel spectral flux → 6-second sliding
  tempogram → top-K tempo candidates with octave-error hysteresis →
  phase tracker with novelty-snap correction → HMM-lite bar-position
  posterior. ~500 LOC of inlined worklet source, all in plain JS, no
  dependencies. Polymorphic `source` setter accepts `AudioBus`,
  `Sound`, `Music`, `MediaStream`, raw `AudioNode`, or `null`.
- **BeatDetector live state**:
  - Stage 1: `tempo`, `beatPhase`, `nextBeatTime`, `confidence`,
    `gridStability`, `tempoCandidates`, `rms`, `onsetStrength`,
    `bandEnergy`
  - Stage 2: `barPosition` (1..N within bar), `barLength`,
    `timeSignature` (currently always 4/4 in V1), `nextDownbeatTime`,
    `lookahead` (next 8 beats projected with audio-time precision)
- **BeatDetector signals**:
  - Stage 1: `onBeat`, `onTempoChange`
  - Stage 2: `onDownbeat` (the "1" of each bar), `onBarStart`,
    `onBeatPredicted` (when lookahead updates)
- **`BeatDetectorOptions`** — `minBpm` (default 50), `maxBpm` (default
  250), `fftSize` (default 2048), `hopSize` (default 512),
  `tempoWindowSec` (default 6), `settlingMs` (default 1500), `melBands`
  (default 24).
- **Settling period** — first `settlingMs` ms after worklet starts,
  beats are suppressed and `confidence` is `0`. Prevents spurious early
  beat firings before the tempogram has stabilized.
- **Anti-half/double-tempo hysteresis** — top-K candidates retain
  octave-related tempos; switch only with 1.5× score margin to resist
  the classic 60↔120↔240 BPM flipping.
- **DSP utilities** in `@/audio/dsp` — pure-function exports for
  `fft`, `mel`, `tempogram`. Used internally by the worklet (inlined
  as JS strings) but also testable in isolation. Also usable directly
  by advanced users for custom analysis.
- **`AudioAnalyser` rewrite** — polymorphic `source` setter (same 5
  source types as BeatDetector). Lazy-init pattern (works before
  AudioContext is unlocked).
- **`AudioAnalyser` data getters**: `getSpectrum(into?)`,
  `getSpectrumFloat(into?)`, `getWaveform(into?)`,
  `getWaveformFloat(into?)` — all support a user-provided buffer for
  zero-allocation reads.
- **`AudioAnalyser` convenience**: `getBandEnergy(fromHz, toHz)`,
  `getLowMidHigh()`, `getRms()` — high-level helpers for visualizers
  and reactive UI.

### Changed (BREAKING)

- **`AudioAnalyser` constructor signature changed.** Old:
  `new AudioAnalyser(media, options)`. New:
  `new AudioAnalyser(options?); analyser.source = media`.
- **`AudioAnalyser` data properties replaced with methods.** Old
  getters `timeDomainData`, `frequencyData`, `preciseTimeDomainData`,
  `preciseFrequencyData` are removed. Use `getWaveform()`,
  `getSpectrum()`, `getWaveformFloat()`, `getSpectrumFloat()`
  respectively. The new methods accept an optional `into` buffer
  argument for zero-allocation reuse.
- **`AudioAnalyser.connect()` removed.** Connection is now automatic
  on `source` assignment.

### Migration

```ts
// Before:
const analyser = new AudioAnalyser(music, { fftSize: 1024 });
analyser.connect();
const spectrum = analyser.frequencyData;
const waveform = analyser.timeDomainData;

// After:
const analyser = new AudioAnalyser({ fftSize: 1024 });
analyser.source = music;
const spectrum = analyser.getSpectrum();
const waveform = analyser.getWaveform();

// Now also possible:
analyser.source = mediaStream; // Mic input
analyser.source = app.audio.master; // Whole mix
analyser.getBandEnergy(20, 200); // Bass energy 0..1
analyser.getLowMidHigh(); // {low, mid, high}
```

```ts
// New: BeatDetector
const detector = new BeatDetector();
detector.source = music;
await detector.ready;

detector.onBeat.add(({ audioTime, tempo, isDownbeat, energy }) => {
  sprite.scale.set(1.5);
  new Tween().target(sprite.scale).to({ x: 1, y: 1 }).duration(200).start();
});

detector.onDownbeat.add(() => {
  boss.attack(); // syncs exactly to "the 1" of each bar
});
```

### Notes

- BeatDetector is calibrated for percussive, metrically stable music
  (Pop, EDM, Dance, Hip-Hop). Expect ~85-92% beat F1 in that range.
  Performance on Jazz, Classical, and Ambient is weaker (50-65%) —
  Stage 3 (CRNN-based activations) would address that and is deferred.
- Time-signature detection is hardcoded to 4/4 in V1. Bar-position
  tracking still works (HMM-lite over 4 beats); 3/4 detection comes
  later if needed.
- Lookahead returns 8 beats projected at current tempo. Game-event
  scheduling can use `audioContext.currentTime` differences for
  sample-accurate alignment.
- The DSP runs entirely in the audio thread via AudioWorklet — no
  main-thread CPU pressure, no jitter from GC or task scheduling. The
  worklet source is embedded as a JS string in BeatDetector.ts (no
  separate asset shipped).

## [0.7.1] - 2026-05-04

Adds an AudioWorklet foundation and migrates `DuckingFilter` from
CPU-thread `setInterval(60Hz)` polling to sample-accurate audio-thread
DSP. Establishes the architecture for future custom-DSP filters
(Chorus, Pitch-Shift, Vocoder, etc.) without shipping any new effect
filters in this release.

### Added

- **`registerWorkletProcessor(audioContext, name, source)`** — Blob-URL
  based helper for registering AudioWorkletProcessors at runtime from a
  source string. No build-tooling changes required: worklet code lives
  as a JavaScript string inside the TypeScript file, gets converted to
  a Blob URL on first registration, and is cached per-AudioContext.
  Concurrent registrations are deduplicated via shared in-flight
  Promises.
- **`WorkletFilter`** — abstract base class extending `AudioFilter` for
  filters implemented as AudioWorklet processors. Subclasses declare
  `_workletName`, `_workletSource`, and (optionally) `_workletOptions`
  / `_onWorkletReady`. The base handles:
  - Async worklet loading lifecycle
  - Stable `inputNode` / `outputNode` GainNodes that exist immediately
    (audio passes through directly while the worklet loads, then
    re-routes through the worklet once ready — no destruction or
    re-wiring on the bus side)
  - `_setAudioParam(name, value)` helper for smooth parameter updates
  - Safe destruction during async load
- **`AudioFilter.ready: Promise<void>`** — resolves when the filter is
  fully initialized. Sync filters (BiquadFilter-backed, etc.) return
  an already-resolved Promise. Async filters (WorkletFilter
  subclasses) return a Promise that resolves once the worklet has
  loaded. Useful when user code wants to `await` a parameter setup
  that depends on the underlying node existing.

### Changed

- **`DuckingFilter` is now AudioWorklet-backed.** The setInterval-based
  envelope follower has been replaced with a sample-accurate worklet
  processor. Public API is unchanged: same constructor options
  (`sidechain`, `threshold`, `ratio`, `attackMs`, `releaseMs`), same
  property setters. Behaviorally:
  - Detection runs at full sample-rate (typically 48 kHz) instead of
    60 Hz polling
  - Audio-thread isolated — no jitter from main-thread garbage
    collection or task pressure
  - Functions correctly when the page tab is inactive (audio thread
    keeps running while CPU thread is throttled)
  - Initial use has a one-time ~10–50 ms async load cost as the
    worklet code registers; during that window the filter passes
    audio through unmodified

### Notes

- AudioWorklet is supported in all browsers since 2020 (Chrome 66+,
  Firefox 76+, Safari 14.1+). No fallback to the old setInterval
  approach — environments without worklet support will throw on
  DuckingFilter construction.
- The shared infrastructure (`registerWorkletProcessor` +
  `WorkletFilter`) is the foundation for future custom-DSP filters.
  Concrete filter additions (Chorus, Pitch-Shift, Vocoder, Granular,
  etc.) come in subsequent releases.
- BeatDetector / AudioAnalyser hook revamp is deferred — that's the
  next focused topic.

## [0.7.0] - 2026-05-04

Audio modernization. Introduces a routing manager with hierarchical buses,
a filter API consistent with the rendering side, 2D spatial audio, and
unifies `Sound.play()` into a multi-instance default. Pure-additive on
the bus / filter / spatial side; the `Sound.play()` semantics are a
breaking change.

### Added

- **`AudioManager`** — routing mixer accessible via `app.audio` (lazy
  module-level singleton, also reachable via `getAudioManager()`).
  Built-in buses `master`, `music`, `sound` with hierarchy
  (`music` and `sound` are children of `master`).
- **`AudioBus`** — class with `name` (positional constructor arg),
  `parent`, `volume`, `muted`, `pan`, `addFilter`, `removeFilter`,
  `fadeIn`, `fadeOut`, `destroy`. Internal node chain is
  `inputNode → [filters...] → panNode → outputNode → parent.input`.
- **Mixer API**: `app.audio.registerBus(bus)`, `getBus(name)`,
  `hasBus(name)`, `unregisterBus(bus)`. Built-ins cannot be
  unregistered.
- **Default routing**: `Sound` → `app.audio.sound`, `Music` →
  `app.audio.music`, `Video` → `app.audio.master`. Override by
  setting `media.bus = customBus`.
- **`AudioManager.muteOnHidden: boolean`** — when true, master is
  muted while `document.visibilityState !== 'visible'`. Wired
  through the `app.onVisibilityChange` signal added in 0.6.20.
- **`AudioFilter`** — abstract base with `inputNode`, `outputNode`,
  `destroy()`. Buses chain filter `inputNode → outputNode` in the
  order they were added.
- **Filter implementations**: `LowpassFilter`, `HighpassFilter`,
  `CompressorFilter`, `DelayFilter`, `ReverbFilter` (algorithmic
  impulse-response, no IR assets shipped), `EqualizerFilter`
  (3-band low-shelf / peaking / high-shelf), `DuckingFilter`
  (sidechain-driven gain reduction via `AnalyserNode` polled at
  ~60 Hz; takes a `sidechain: AudioBus` option).
- **`AudioListener`** — accessible at `app.audio.listener`. Has
  `position: Vector`, `velocity: Vector`, and a polymorphic
  `target: SceneNode | View | { x, y } | null` that auto-feeds
  the WebAudio listener position each frame.
- **`Sound.position: Vector | null`** — when non-null, the sound
  becomes spatial: routes through a `PannerNode`
  (`panningModel: 'equalpower'`, `distanceModel: 'linear'`) and
  ticks per-frame from `AudioManager.update()`. Setting back to null
  tears down the panner and restores non-spatial routing.
- **`Sound.velocity: Vector | null`** — tracked for future Doppler
  use (modern WebAudio infers Doppler implicitly from positional
  change between frames; we don't pipe velocity to the panner
  directly).
- **`SoundPoolStrategy` enum** — `FirstInFirstOut`,
  `LeastRecentlyUsed`, `LowestPriority`. Selects the eviction
  policy when pool capacity is reached.
- **`Sound.priority: number`** — used by the `LowestPriority`
  strategy. Default 0.
- **`AudioManager.update()`** — public per-frame tick called from
  `Application.update()` between `interaction.update()` and
  `tweens.update()`. Updates listener position from target,
  ticks each registered spatial sound's panner.

### Changed (BREAKING)

- **`Sound.play()` is now multi-instance by default.** Each call
  creates a new pooled instance up to `poolSize`. The previous
  singleton-replace behavior is opt-in via
  `play({ replace: true })`.
- **`Sound.playPooled()` removed.** Use `play()` (which is now the
  pooled multi-instance path).
- **`Sound.poolSize` default raised from 1 to 8.** Closer to typical
  SFX needs without manual configuration.
- **`Sound._sourceNode` (the previous primary singleton source) is
  removed.** With pooled play unified, all sources go through
  `_pooledSources`. As a consequence, `Sound.getTime()` and
  `Sound.setTime()` no longer track per-source playback position
  — they're effectively no-ops on Sound now. For precise timing
  use `Music` (HTMLMediaElement-backed singleton).
- **`AbstractMedia.bus` property added.** Subclasses (Sound, Music)
  override `_defaultBus()`, `_connectToBus()`, `_disconnectFromBus()`
  to integrate with the mixer.

### Migration

```ts
// Before:
sound.play(); // singleton — second call replaces first
sound.playPooled(); // multi-instance — concurrent plays

// After:
sound.play(); // multi-instance — concurrent plays (default!)
sound.play({ replace: true }); // singleton — equivalent of old play()
```

```ts
// Before — direct destination routing was implicit:
const sound = new Sound(buffer);
sound.play(); // → audioContext.destination

// After — routes through the soundBus by default:
const sound = new Sound(buffer);
sound.play(); // → app.audio.sound → app.audio.master → destination

// Override to a custom bus:
const dialogueBus = new AudioBus('dialogue', { parent: app.audio.master });
app.audio.registerBus(dialogueBus);
sound.bus = dialogueBus;
```

```ts
// Spatial audio:
const explosion = new Sound(buffer);
explosion.position = { x: 200, y: 100 }; // becomes spatial
app.audio.listener.target = playerSprite; // ears follow player

explosion.play();
// → routes through equalpower panner with distance falloff
```

### Notes

- `DuckingFilter` uses its own internal `setInterval(60Hz)` for
  per-frame envelope-following rather than hooking into
  `AudioManager.update()`. This keeps audio-side filters
  self-contained and avoids cross-cutting changes to the mixer
  contract. May be revisited.
- `LowestPriority` pool strategy degenerates to FIFO within a
  single Sound instance because all pooled sources share the same
  `priority` value. The strategy becomes meaningful when the
  engine later adds cross-Sound voice management.
- Spatial sounds share a single `PannerNode` per Sound instance —
  all simultaneous pooled plays of one sound emit from the same
  world-space point. Per-instance positions would require an
  API extension and are deferred.
- BeatDetector / `AudioAnalyser.onBeat` hooks are deferred to
  0.7.1 — this release focuses on the mixer / filter / spatial
  foundation.

## [0.6.20] - 2026-05-02

Adds `view.follow(SceneNode)`, audio fade helpers, and focus / visibility
infrastructure. Pure additive — no behavior changes for existing code.

### Added

- **`view.follow()` accepts `SceneNode`** in addition to `{x, y}`
  targets. When the target is a SceneNode, the follow tracks its
  **world-space position** via `getGlobalTransform()`, so following a
  Sprite nested under a translated/rotated Container works correctly.
  New exported type `ViewFollowTarget = SceneNode | { x: number; y:
number } | null`.
- **Audio fade helpers on `AbstractMedia`** — both `Sound` and `Music`
  inherit:
  - `fadeIn(durationMs): this` — ramps gain from 0 to current volume.
    Auto-plays if paused. Cancels any in-flight fade.
  - `fadeOut(durationMs, options?: { stopAfter?: boolean }): this` —
    ramps gain to 0. By default calls `pause()` after the fade
    completes; pass `{ stopAfter: false }` to keep playing at zero
    volume.
  - Both return `this` for chaining and use Web Audio's
    `linearRampToValueAtTime` for sample-accurate fades.
- **`Application.canvasFocused: boolean`** — passthrough getter for the
  InputManager's existing canvas focus state.
- **`Application.documentVisible: boolean`** — tracks
  `document.visibilityState`, updated on `visibilitychange`.
- **`Application.onCanvasFocusChange: Signal<[focused: boolean]>`** —
  fires when the canvas gains or loses focus (canvas blur,
  click-outside, alt-tab from canvas-focused state).
- **`Application.onVisibilityChange: Signal<[visible: boolean]>`** —
  fires when the page tab becomes hidden or visible (minimize, switch
  tab, etc.).
- **`Application.pauseOnHidden: boolean`** (default `false`) — when
  `true`, `app.update()` skips the entire frame body while
  `documentVisible` is `false`. `requestAnimationFrame` keeps
  ticking (already throttled by the browser when hidden) so the loop
  resumes seamlessly when the page becomes visible again.
- **`InputManager.onCanvasFocusChange`** — same signal also exposed
  here for users who only need input-side focus tracking without
  reaching for the Application.

### Notes

- Window-level `blur` / `focus` events are intentionally not exposed as
  separate signals — `document.visibilitychange` is the better-defined
  API and covers the common cases.
- `crossFade()` as a top-level helper was deferred — compose
  `a.fadeOut(ms)` + `b.fadeIn(ms)` manually until the AudioManager lands.
- `view.follow()` continues to use lerp-based smoothing for continuous
  tracking. Scripted one-shot camera moves (zoom-to-room,
  pan-to-cutscene) should use the existing Tween system on
  `view.center` for full easing-curve support.

## [0.6.19] - 2026-05-02

Caches global transforms, world-space bounds, sprite vertices, and
sprite normals via dirty flags. Closes four hot-path recomputation
gaps that the audit identified — `getGlobalTransform()` and
`getBounds()` were O(depth) per call, called many times per frame
from sprite rendering, hit-testing, frustum culling, and collision
detection. Pure performance change — no public API surface changes.

### Performance

- **`SceneNode.getGlobalTransform()`** is now cache-hit-O(1) instead
  of O(depth). The cached `_globalTransform` is invalidated on
  position / rotation / scale / origin change, on parent change
  (add/remove from a Container), and propagated to all descendants
  on parent transform changes.
- **`SceneNode.getBounds()`** is now cache-hit-O(1). Invalidated
  alongside global transform, plus on local-bounds mutations
  (`Sprite.setTextureFrame`, `Mesh.recomputeLocalBounds`,
  `ParticleSystem.setTextureFrame`). Local-bounds changes also
  cascade up to ancestor Containers' bounds.
- **`Sprite.vertices`** getter caches the eight world-space vertex
  components. Recomputes only when the sprite's transform or local
  bounds change. Previously had a `// todo cache this` comment.
- **`Sprite.getNormals()`** returns a stable `[Vector, Vector,
Vector, Vector]` array. The four `Vector` instances are reused
  across calls; previously each call allocated four new `Vector`s.
  Recomputes only when vertices change. Reduces GC pressure in
  collision-detection hot paths.

### Notes

- `Sprite.getNormals()` now returns the **same array reference** on
  every call. Callers that previously stored the result and expected
  it to remain stable across mutations must re-read after any
  transform change. This is a behavior refinement; no caller in the
  codebase relied on the prior allocation pattern.
- Invalidation propagation walks the scene subtree on position /
  rotation / scale / origin changes. For very large UI trees
  (thousands of nested children), this is O(descendants) per setter
  call. Setters are typically called on a small number of nodes per
  frame, so the cumulative cost is dominated by the savings on
  the read path. Generation-counter invalidation is a possible
  future optimization if profiling shows the walk dominates.
- New flag bits: `SceneNodeTransformFlags.GlobalTransform` (1<<8),
  `SceneNodeTransformFlags.BoundsRect` (1<<9),
  `SpriteFlags.Vertices` (0x400), `SpriteFlags.Normals` (0x800).
  Non-overlapping with existing flags so they share the same
  `Flags<T>` instance.

## [0.6.18] - 2026-05-02

Fixes a long-standing audio volume-ramp bug.

### Fixed

- **Audio volume / mute changes are now near-instant**. The third
  argument to `GainNode.setTargetAtTime` is a time constant in
  **seconds** — `Sound`, `Music`, and the `Video` audio path were
  passing `10`, which made every volume update take ~30 seconds to
  reach 95% of its target value. Calling `sound.setVolume(0.5)` would
  fade over half a minute instead of taking effect immediately.
  Replaced with `0.01` (10 ms) — fast enough to feel instant, slow
  enough to avoid the audible click of a snapped value. Standard
  practice in `pixi-sound`, Howler, and other Web Audio libraries.
  Affects: `Sound.setVolume`, `Sound.setMuted`, `Sound` audio-context
  setup, and the equivalent paths on `Music` and `Video`. Bug was
  present since the initial commit; not caught by tests because the
  jsdom mock stubs `setTargetAtTime` as a no-op.

## [0.6.17] - 2026-05-02

Rewrites the debug overlay as a canvas-native, tree-shake-able module.
Replaces the DOM-based 0.6.15 implementation. Also adds a generic
per-frame application hook.

### Added

- **`Application.onFrame: Signal<[Time]>`** — generic per-frame hook
  fired between `sceneManager.update()` and `backend.flush()`. Useful
  for any external tool that wants per-frame ticks without writing a
  Scene (debug overlays, profilers, custom HUDs).
- **`@codexo/exojs/debug` subpath export** — DebugOverlay and friends
  now live behind a separate import path. Apps that don't import it
  pay zero bundle cost. The root `@codexo/exojs` no longer references
  any debug code.
- **Canvas-native `DebugOverlay`** — instantiate manually:
  ```ts
  import { DebugOverlay } from '@codexo/exojs/debug';
  const debug = new DebugOverlay(app);
  debug.layers.performance.visible = true; // or press F1
  ```
  Subscribes to `app.onFrame` for ticking, `inputManager.onKeyDown`
  for F1 binding, and `app.onResize` for screen-space view sync.
  Renders into its own screen-space view between scene render and
  backend flush.
- **`PerformanceLayer`** (V1's only layer) — FPS, frame-time
  sparkline, draw calls, node count, culled nodes. Top-left fixed
  position. Toggle via `F1` or `debug.layers.performance.visible`.
- **`DebugLayer` abstract base** — exported so future layer types
  (BoundingBoxes, HitTest, PointerStack) plug in cleanly. V1 ships
  only PerformanceLayer; more arrive in subsequent patches.

### Changed

- **`Application.debug` removed** — was added in 0.6.15. Apps that
  used `app.debug.show()` must migrate to `import { DebugOverlay }
from '@codexo/exojs/debug'` and instantiate manually. **Breaking
  change**, but the affected window is one day (0.6.15 → 0.6.17).

### Notes

- The new architecture decouples DebugOverlay from Application so
  the root bundle tree-shakes the debug code away when unused. This
  is the same pattern projects use for optional dev-tools modules.
- F1 binding is hardcoded for V1. Opt-out (`{ keybindings: false }`
  constructor option) and additional keybindings come with the
  next layers.
- F-keys only fire while the canvas has focus — engine convention,
  not a debug-specific quirk.

## [0.6.16] - 2026-05-02

Adds an opt-in spatial index for hit-testing and replaces the dead
`core/Quadtree` class with a generic `math/Quadtree<T>`.

### Added

- **`Quadtree<T>`** in `@/math/Quadtree` — generic spatial index with
  `insert(item)`, `queryPoint(x, y, results?)`, `queryRect(rect, results?)`,
  `clear()`, and `destroy()`. Items carry their `bounds: Rectangle` and
  arbitrary `payload: T` separately, so a single tree can index any
  spatial domain. The `results` array is reused across queries for
  zero-allocation hot paths.
- **`InteractionManager.useSpatialIndex: boolean`** (default `false`) —
  opt-in flag. When enabled, the manager rebuilds a quadtree of all
  visible interactive nodes once per `update()` tick and uses it for
  hit-testing instead of the recursive scene-tree walk. Z-order is
  preserved via insertion-order tags. Captured pointers (active drags)
  bypass the index — same as the recursive fallback.

### Changed

- **`core/Quadtree`** removed — was dead code, exposed publicly via the
  `core` barrel but never imported anywhere internally. The new
  `math/Quadtree<T>` covers the same conceptual ground with a cleaner
  API and broader applicability. **This is a breaking change for any
  external code that imported `Quadtree` from `@codexo/exojs`** and
  relied on the SceneNode-specialized `addSceneNode` /
  `getRelatedChildren` methods. Replacement: use `Quadtree<RenderNode>`
  from `@/math/Quadtree` with `insert({ bounds, payload })` and
  `queryPoint` / `queryRect`.

### Notes

- Default behavior is unchanged: `useSpatialIndex` is off, so the
  recursive walk remains the hit-test path. Turn it on for scenes
  with many interactive nodes — the per-frame rebuild + log-time
  query pays off when the linear walk becomes a bottleneck.
- Per-frame rebuild is intentional in v1. Smarter invalidation
  (rebuild only when the scene tree mutates) is a follow-up.
- The new tree does not redistribute items already-stored in a parent
  when subdivision happens — fine for the rebuild-each-frame model
  since items don't accumulate across frames. If item-stable trees
  become a use case later, redistribution is ~20 LOC to add.

## [0.6.15] - 2026-05-02

Adds a built-in debug HUD for runtime stats. Opt-in HTML overlay that
shows FPS, frame time, draw calls, node count, active pointers, and
the currently hovered interactive node — handy during development,
zero cost when not shown.

### Added

- **`Application.debug`** — auto-instantiated `DebugOverlay` instance.
  DOM is created lazily on first `show()`, so the panel costs nothing
  until opt-in. Position-fixed over the canvas, recomputed each frame
  from `canvas.getBoundingClientRect()` so it tracks if the canvas
  moves.
- **`DebugOverlay.show() / hide() / toggle()`** — visibility control.
  `show()` returns `this` for chaining. Bind to a key in your code if
  you want a hotkey toggle.
- **Stats displayed**: FPS (60-sample rolling average), frame time
  (ms), draw calls, culled nodes, total scene-tree node count, active
  pointers, hovered node class + cursor coords.
- **`InteractionManager.getHoveredNode(pointerId?)`** — returns the
  RenderNode currently hovered by the given pointer (or the first one
  in iteration order when omitted). Used by the debug panel; also
  useful for custom HUDs.

### Notes

- The overlay is a styled `<div>` appended to `document.body`. It uses
  `pointer-events: none` so clicks pass through to the canvas.
- No keyboard shortcut is wired up — bind `app.debug.toggle()` to
  whatever key you want.
- Hit-test box visualization is not in this release — coming when
  the spatial-index work lands.

## [0.6.14] - 2026-05-02

Reshapes the interaction system around a per-frame tick and adds an
opt-in drag-and-drop helper. The public per-node signal API from 0.6.13
is unchanged; only event _cadence_ and a new `draggable` flag.

### Added

- **`RenderNode.draggable: boolean`** (default `false`) — when set on
  an interactive node, a `pointerdown` over the node starts a drag:
  the framework auto-positions the node by tracking pointer movement
  while preserving the grab offset, and routes all subsequent pointer
  events for that pointer ID to the dragged node regardless of where
  the pointer is. Drag bypasses hit-testing until release.
- **Three drag signals on `RenderNode`**: `onDragStart`, `onDrag`,
  `onDragEnd` — all `Signal<[InteractionEvent]>`. Drag events use new
  event types `'dragstart' | 'drag' | 'dragend'` and dispatch directly
  on the node (no bubble — parent containers don't receive child drag
  events).
- **`InteractionManager.update()`** — public per-frame tick called
  automatically from `Application.update()` between `inputManager.update()`
  and `tweens.update()`. Drains a per-pointer queue filled by signal
  handlers; no-op when nothing happened that frame.

### Changed

- **InteractionManager moved from event-driven to tick-driven.**
  Signal handlers now only enqueue flags into a per-pointer bitfield
  and set a dirty flag; the actual hit-test + dispatch happens once
  per frame in `update()`. Same observable behavior, but decoupled
  from `InputManager` signal cadence — paves the way for spatial-index
  integration.

### Notes

- **Drag uses native `setPointerCapture`** so movement keeps tracking
  even when the pointer leaves canvas bounds. `pointercancel` /
  `pointerleave` during a drag fires `onDragEnd` (no separate
  cancellation flag in v1; check the event type if needed).
- **Drag offset is in canvas-space.** Nodes whose parent containers
  have non-identity transforms may feel off — v1 assumes top-level
  draggable elements (UI panels, inventory items). True
  parent-aware drag is a follow-up.
- **`pointerover` / `pointerout` are suppressed during a drag** —
  the dragged node stays "hovered" by definition.

## [0.6.13] - 2026-05-02

Adds object-level pointer events. Scene-graph nodes are now first-class
event targets — opt in with `node.interactive = true` and listen on
per-node signals. Pure addition; existing global pointer signals on
`InputManager` are unchanged.

### Added

- **`RenderNode.interactive: boolean`** (default `false`) — opt-in flag
  enabling hit-testing for the node. Hit-test reuses the existing
  `RenderNode.contains(x, y)` (AABB in world space).
- **`RenderNode.cursor: string | null`** (default `null`) — CSS cursor
  string applied to `canvas.style.cursor` while the pointer is over the
  node. Walks up the ancestor chain; first non-null wins.
- **Six per-node signals**: `onPointerDown`, `onPointerUp`,
  `onPointerMove`, `onPointerOver`, `onPointerOut`, `onPointerTap` —
  all `Signal<[InteractionEvent]>`.
- **`InteractionEvent`** — `type`, `target` (the originally-hit node,
  stable across bubble), `currentTarget` (changes per bubble step),
  `pointer`, `worldX`, `worldY`, `stopPropagation()`,
  `propagationStopped`.
- **`InteractionManager`** — wired automatically as
  `Application.interaction`. Subscribes to existing `InputManager`
  signals (no extra DOM listeners), hit-tests the active scene's root
  in reverse z-order, dispatches with bubble propagation, and updates
  the canvas cursor.

### Notes

- **Bubble-only, no capture phase.** Bubble walks `parentNode` and
  stops at the first non-interactive ancestor — parents must opt in
  to receive bubbled events. `event.stopPropagation()` halts the walk.
- **Touch has no hover phase.** `pointerover` / `pointerout` for touch
  fire only at down/up boundaries (a finger doesn't exist on the
  surface between presses). Don't rely on hover effects for touch UX.
- **AABB hit-test only in v1.** Precise (polygon / alpha) hit-testing
  is deferred. Override `contains(x, y)` for custom shapes.
- **Cursor is CSS-only.** For animated or texture-based custom cursors,
  set `canvas.style.cursor = 'none'` and render a sprite that follows
  pointer position. CSS gives OS-level latency and survives game-loop
  stutter; engine-rendered cursors don't.

## [0.6.12] - 2026-05-02

Adds swept (continuous) collision detection. Pure-math addition —
prevents fast-moving shapes from tunneling through stationary
colliders during a single frame's update.

### Added

- **`sweepRectangle(moving, deltaX, deltaY, target)`** — swept AABB
  vs AABB via the slab method. Returns `SweptHit | null` with time
  of impact `t ∈ [0..1]`, contact position `(x, y)`, and surface
  normal `(normalX, normalY)`. Handles already-overlapping case
  (returns `t = 0` with deepest-penetration axis as normal).
- **`sweepCircleVsCircle(moving, deltaX, deltaY, target)`** —
  closed-form quadratic solution.
- **`sweepCircleVsRectangle(moving, deltaX, deltaY, target)`** —
  v1 uses the simple expanded-AABB fallback (rectangle expanded
  by circle radius, treated as AABB swept against zero-sized
  moving circle). Over-collides slightly at corners — true
  Minkowski corner rounding is V2.
- **`sweepRectangleAgainst(moving, dx, dy, targets)`** /
  **`sweepCircleAgainst(moving, dx, dy, targets)`** — earliest
  hit against an array of static colliders. Broad-phase swept-AABB
  early-out per target.
- **`substepSweep(fromX, fromY, deltaX, deltaY, maxStepSize)`** —
  generator that yields `(x, y, t)` snapshots along a movement
  vector at fixed intervals. Use this for arbitrary shape pairs
  that lack a closed-form swept test: iterate, place shape at
  each snapshot, run discrete intersection.
- **`SweptHit` interface** exported.

### Notes

- Pure math only — no Scene / RenderNode / Physics integration. User
  code calls these in their game's update step.
- v1 covers the common cases (AABB + Circle). Polygon-vs-anything
  swept tests are V2 (use `substepSweep` as a fallback for now).
- Returns the hit; does NOT compute response. Sliding / bouncing /
  velocity adjustment is the caller's responsibility.

## [0.6.11] - 2026-05-02

Adds a fluent-builder Tween / Animation system. Pure addition — no
existing surface changes shape.

### Added

- **`Tween` class.** Fluent-builder API for animating numeric
  properties on any target object:

  ```ts
  app.tweens
    .create(sprite)
    .to({ x: 100, alpha: 0.5 }, 1.0) // 1 second
    .easing(Ease.cubicOut)
    .delay(0.2)
    .onComplete(() => console.log('done'))
    .start();
  ```

  Lifecycle: `Idle → Active → Complete | Stopped` (with
  `Paused` as an intermediate). Supports `delay()`, `repeat(N)`
  with `repeat(-1)` for infinite, `yoyo()` to reverse on each
  repeat, `chain(next)` to start another tween on completion,
  and the standard `pause()` / `resume()` / `stop()` controls.
  Lifecycle callbacks: `onStart` (after delay, on first
  interpolation), `onUpdate` (per frame), `onRepeat` (cycle
  boundaries), `onComplete` (final cycle ends naturally).
  `stop()` does NOT fire `onComplete`.

- **`TweenManager` class.** Owns active tweens and ticks them
  from `Application.update()`. Use `app.tweens.create(target)` to
  spawn-and-register a tween in one call; `app.tweens.add(tween)`
  for stand-alone constructions; `manager.update(dt)` /
  `manager.clear()` / `manager.destroy()` for lifecycle. Tweens
  self-remove on natural completion or `stop()`.
- **`Ease` namespace.** Robert Penner's standard library, 31
  functions: `linear`, `quad{In,Out,InOut}`, `cubic{...}`,
  `quart{...}`, `quint{...}`, `sine{...}`, `expo{...}`,
  `circ{...}`, `back{...}`, `bounce{...}`, `elastic{...}`. Each
  returns 0 at `t=0` and 1 at `t=1`. Use `Ease.cubicOut` (etc.) as
  the argument to `.easing()`.
- **`Application.tweens: TweenManager`.** Pre-instantiated on
  every Application; ticked automatically each frame between
  `inputManager.update()` and `sceneManager.update()`. So
  tween-driven sprite positions are visible during the same
  frame's render.
- **Types: `EasingFunction`, `TweenLifecycleCallback`,
  `TweenUpdateCallback`, `TweenState`** — all exported.

### Notes

- v1 supports **shallow numeric properties only**. Tweening
  `{ x: 100 }` works; tweening `{ position: someVector }` does
  not (use `{ x, y }` instead). Vector / Color / Matrix
  interpolators are deferred to v2.
- Non-numeric target properties at start time emit a
  `console.warn` and are skipped; they don't throw.
- Lazy snapshot of start values: `to()` records the END values;
  the START values are captured on the FIRST `update()` after
  `start()` (after any `delay`). Mutate the target between
  `to()` and `start()` and the snapshot is correct.
- `chain()` only fires on natural completion. `stop()` does
  not start chained tweens.

## [0.6.10] - 2026-05-02

ExoJS now ships with **zero runtime dependencies**. The single
remaining dependency (`earcut` — used for polygon triangulation
in `Graphics.drawPolygon` / `drawStar`) was replaced with an
in-house ear-clipping implementation.

### Changed

- **Polygon triangulation is now in-house.** New
  `src/math/triangulate.ts` (~205 LOC) implements ear-clipping for
  simple 2D polygons (no holes — the only mode `buildPolygon` ever
  used). The function is module-internal; `buildPolygon` is the
  sole consumer and its public behavior is unchanged.
- **`buildPolygon` output is identical in shape to the prior
  earcut output.** Triangle counts, winding, and area coverage
  match. Index ordering may differ (two valid triangulations of
  the same polygon are equally correct), but visual output is the
  same. All existing `buildPolygon` / `buildStar` / `Graphics`
  tests pass without modification.

### Removed

- **`earcut` runtime dependency** — fully removed from
  `package.json`. Library `dependencies` block is now empty.
- **`@types/earcut`** removed from `devDependencies`.
- **`external: ['earcut']`** entry removed from
  `rollup.config.ts`'s `modules` config block.

### Notes

- After this change, `npm install @codexo/exojs` installs exactly
  one package (the library itself). No transitive dependencies.
- Internal triangulation handles degenerate / collinear input
  gracefully — emits whatever ears were found and returns; never
  throws or hangs.
- 11 new unit tests for `triangulate` cover triangles, convex
  quads (CW + CCW input), L-shapes, stars, and degenerate inputs.

## [0.6.9] - 2026-05-02

> **Heads-up — breaking change despite the patch number.** `Text`'s
> internal architecture changed completely: glyph-quad meshing
> against a runtime atlas instead of canvas2d-rasterize-as-Sprite.
> The user-facing API for `text.text`, `text.style`, and standard
> Drawable transforms (`position`, `rotation`, `scale`, etc.) is
> unchanged, but `text.canvas`, `text.setCanvas`, `text.textureFrame`,
> `text.getWordWrappedText`, and the `Text instanceof Sprite` check
> are gone. Text is now `Text extends Container`, not Sprite.

GPU font glyphs (Pixi-style runtime cache). Replaces the prior
canvas-rasterize-the-whole-string-as-Sprite path with: rasterize
each glyph once into a shared atlas Texture, build a single Mesh
per Text whose quads sample the atlas. All Texts in the page share
one atlas — memory-efficient at scale, single drawcall per Text.

### Added

- **`DynamicGlyphAtlas`** — public class. Constructor takes
  `width = 1024, height = 1024`. Has `getGlyph(char, family, size,
weight, style) → GlyphInfo` (cached or rasterizes), `clear()` to
  reset, and `texture` for binding to a Mesh. Internal shelf
  bin-packing; throws on atlas-full (LRU eviction is V2).
- **`layoutText(text, style, atlas)`** — pure function. Returns
  `readonly GlyphPlacement[]` with one quad per visible glyph.
  Handles `\n` line breaks and `align: 'left' | 'center' | 'right'`
  alignment per `style.align`. Empty text returns `[]`.
- **Types: `GlyphInfo`, `GlyphPlacement`, `GlyphKey`,
  `TextAlignment`** — all exported for users who want to compose
  their own atlas / layout pipelines.
- **TextStyle gets `fillColor: Color`** (defaults to white, used
  via mesh.tint after glyph rasterization), **`fontStyle: 'normal'
| 'italic'`**, and **`lineHeight: number`** (multiplied by
  fontSize for line spacing, defaults to 1.2). `align` field is
  now strongly typed as `TextAlignment`.

### Changed

- **`Text` extends `Container`** (was `Sprite`). It internally
  manages a single `Mesh` child whose vertices/uvs/indices are
  rebuilt on every `text` / `style` setter call. Empty string =
  no internal mesh (no children).
- **Glyphs always rasterize white**; `style.fillColor` becomes
  `mesh.tint`. Changing fillColor is cheap (mesh-tint update only,
  no atlas re-rasterization).

### Removed

- `Text.canvas` getter / setter, `Text.setCanvas(...)`,
  `Text.textureFrame`, `Text.updateTexture(...)`,
  `Text.getWordWrappedText(...)` — the old canvas2d path is gone.
  Word-wrapping is V2; for now use `\n` for explicit line breaks.

### Notes

- Atlas is a process-wide singleton via `getDefaultGlyphAtlas()`
  (internal helper, not a public function). All `Text` instances
  share one atlas. Tests can reset it via `atlas.clear()`.
- The atlas uses `OffscreenCanvas` when available, falls back to
  `document.createElement('canvas')` (works in jsdom / older
  browsers).
- First-render of a never-seen glyph costs one canvas2d round-trip
  - texture re-upload. Cached glyphs are zero-cost on subsequent
    renders.
- Per-character animation, MSDF rendering, word-wrap, BiDi, and
  text outlines / drop-shadows are all V2.

## [0.6.8] - 2026-05-02

> **Heads-up — breaking change despite the patch number.** Removes
> the optional Rapier physics integration in its entirety. Pre-1.0
> SemVer permits breaking changes within the 0.x.y line; we kept
> the minor digit unchanged because the integration was opt-in and
> usage outside the engine is presumed minimal.

### Removed

- **`createRapierPhysicsWorld` factory and the `RapierPhysicsWorld`
  / `RapierPhysicsBinding` classes.** Plus the entire associated
  type surface (`PhysicsBodyOptions`, `PhysicsBodyType`,
  `PhysicsBoxShape`, `PhysicsCircleShape`, `PhysicsColliderShape`,
  `PhysicsCollisionFilter`, `PhysicsSyncMode`, `RapierModuleLoader`,
  `RapierPhysicsDebugDrawOptions`, `RapierPhysicsEvent`,
  `RapierPhysicsWorldOptions`).
- **`@dimforge/rapier2d-compat` peerDependency.** Removed from
  `package.json` along with the `peerDependenciesMeta` entry that
  marked it optional.
- **README's "Optional Rapier Physics" section** and the
  feature-list bullets that mentioned it.
- **`src/physics/`** and **`test/physics/`** directories deleted.

### Migration

Apps that depended on `createRapierPhysicsWorld` need to integrate
Rapier (or any other physics library) directly in their own code
without library involvement. The adapter was always intentionally
narrow — it bound Rapier bodies to scene nodes from the outside,
no rendering / application / core scene code referenced physics.
Removing it is therefore mechanical for downstream consumers:

```ts
// Before (≤ 0.6.7)
import { createRapierPhysicsWorld } from '@codexo/exojs';
const physics = await createRapierPhysicsWorld({ gravityY: 9.81 });

// After (0.6.8+) — pull Rapier directly:
import RAPIER from '@dimforge/rapier2d-compat';
await RAPIER.init();
const physics = new RAPIER.World({ x: 0, y: 9.81 });
// Sync bodies to your scene-node positions in your app's update loop.
```

The motivation: ExoJS doesn't want to be a thin wrapper around
Rapier's API, and keeping the integration around tied the library
to a specific physics library forever. Removing it cleans the
boundary — ExoJS is rendering + scene + input; physics is the
user's choice.

## [0.6.7] - 2026-05-02

Touch / multi-touch / pointer support, fully unified — no separate
Mouse or Touch class. All single-pointer input (mouse, touch, pen)
goes through the existing `Pointer` class; multi-touch is just
"multiple Pointers, each in its own slot". The `ChannelOffset.Pointers`
block (256 slots, previously reserved but unused) is now populated
with state for up to 16 simultaneous pointers — 16 channels per
slot, 16 × 16 = 256 exact fit.

### Added

- **Per-pointer channel-buffer state.** Each active pointer fills 16
  channels in its slot: `Active`, `X`, `Y`, `Pressure`, `Width`,
  `Height`, `Twist`, `TiltX`, `TiltY`, `Left`, `Right`, `Middle`,
  `IsMouse`, `IsTouch`, `IsPen`, `IsPrimary`. Coordinates and
  contact-area are normalized to [0..1] against the canvas; tilt
  is mapped from [-90..90°] to [0..1].
- **`Pointer` namespace export** with channel-offset constants:
  - Primary-pointer convenience: `Pointer.Active`, `Pointer.X`,
    `Pointer.Y`, `Pointer.Pressure`, `Pointer.Left`, `Pointer.IsTouch`,
    etc. — these mirror slot 0.
  - Per-slot multi-pointer access: `Pointer.Slot0Active`,
    `Pointer.Slot0X`, ..., `Pointer.Slot15Y`. Used for pinch / multi-
    touch bindings ("both Slot0 and Slot1 active and IsTouch").
  - Other per-slot channels are reachable via arithmetic
    (`Pointer.X + slotIndex * pointerSlotSize + channelOffset`).
- **Slot allocation.** Up to `maxPointers = 16` simultaneous
  pointers. The 17th is silently dropped. Slots are reused on
  pointer release in deterministic order (lowest free slot first),
  so the primary pointer is reliably slot 0 in single-pointer
  scenarios.
- **`InputManager.onPinch / onRotate / onLongPress`** gesture
  signals. Pinch and rotate fire when at least two `isTouch=true`
  pointers move simultaneously; long-press fires when a pointer
  has been held for ≥ 500 ms without exceeding
  `pointerDistanceThreshold` movement. The dispatcher is an
  internal `GestureRecognizer` class — not part of the public API.
- **`maxPointers` and `pointerSlotSize`** constants exported from
  the input module for callers that want to compute slot offsets.
- **`canvas.style.touchAction = 'none'`** is set automatically by
  `InputManager` so browser-default gestures (zoom, pan, double-tap
  zoom, swipe-to-go-back) don't interfere with the game's own input
  handling.

### Internal / pre-existing fix

- `Pointer` constructor now takes `channels: Float32Array` and
  `slotIndex: number` (in addition to `event` and `canvas`) so it
  can write its slice of the channel buffer. Constructed only by
  `InputManager`; no documented or expected user-facing
  constructor calls. Mentioned for completeness.

## [0.6.6] - 2026-05-02

Pure bug-fix / hardening of the InputManager's event flow. No public
API changes.

### Changed

- **Keyboard events are now gated on canvas focus.** Previously,
  `keydown` / `keyup` registered into the channel buffer regardless of
  whether the canvas was the active element. Typing into an `<input>`
  field next to the canvas would silently drive game state. The new
  behavior matches every other 2D engine: keys only register while the
  canvas owns focus.
- **Handled events no longer bubble.** Keyboard, wheel, and pointer
  down/up events that the InputManager consumes now call
  `stopImmediatePropagation` (via the existing `stopEvent` helper)
  alongside `preventDefault`. Stops the host page from double-handling
  (e.g., page-scroll on Space when a game uses Space for jump, modal
  dismissal on canvas click).
- **Keyboard channels are released on blur.** When the canvas or
  window loses focus, all currently-held keyboard channels are
  forced back to zero and `onKeyUp` fires for each. Previously, a
  user who alt-tabbed mid-W-press would have W register as held
  until they manually released while focus was back — visible as
  "stuck movement" on focus return.

### Notes

- Pointer move/over/leave/cancel are passive listeners and were
  intentionally left untouched. Stopping propagation on every
  pointermove would add per-event overhead with marginal benefit.
- Wheel events: the previous implementation already preventDefault'd
  when focused but did not stopPropagation. Now both happen, and the
  channel doesn't fire at all when canvas isn't focused.

## [0.6.5] - 2026-05-02

> **Heads-up — breaking change despite the patch number.** Removes
> `DrawableShape`, `Geometry`, `CircleGeometry`, and the
> `WebGl2PrimitiveRenderer` / `WebGpuPrimitiveRenderer` classes. Pre-1.0
> SemVer permits breaking changes within the 0.x.y line; we kept the
> minor digit unchanged because direct usage of those classes outside
> the engine is unlikely (the public `Graphics` API is unchanged).

Collapses the legacy primitive-rendering stack into the existing `Mesh`
primitive. Net effect: ~1100 LOC removed across two files of
backend-specific primitive renderers and three legacy data classes,
one unified rendering path for everything triangle-shaped.

### Breaking

- **`DrawableShape` removed.** Internal Graphics children are now
  `Mesh` instances. If you constructed `DrawableShape` directly,
  switch to `new Mesh({ vertices, indices, ... })` and assign the
  fill color via `mesh.tint = color`. See migration below.
- **`Geometry` and `CircleGeometry` classes removed.** They were
  only ever consumed by `DrawableShape` and the (now-gone) primitive
  renderers. The geometry-builder helpers in `src/math/geometry`
  (`buildLine`, `buildPath`, `buildCircle`, `buildEllipse`,
  `buildRectangle`, `buildPolygon`, `buildStar`) now return a
  `MeshGeometryData` plain object — `{ vertices: Float32Array,
indices: Uint16Array, points: Array<number> }` — directly suitable
  for `new Mesh({ ... })`.
- **`WebGl2PrimitiveRenderer` and `WebGpuPrimitiveRenderer` removed.**
  Their work moved entirely into the existing `*MeshRenderer`s. Both
  backends now register only `Sprite`, `Mesh`, and `ParticleSystem`
  renderers.
- **`primitiveRendererBatchSize` ApplicationOptions removed.** The
  field was wired only into the deleted PrimitiveRenderer; no
  replacement.
- **`Graphics.getChildAt(index)` return type narrows from
  `DrawableShape` to `Mesh`.** Children of a `Graphics` are still
  walked the same way; only the type narrows.
- **`buildX(...)` geometry-builder return type changes.** Functions
  previously returned a `Geometry` instance; now return
  `MeshGeometryData`. The `vertices` and `indices` shift from
  `Array<number>` / `Array<number>` to typed arrays.
- **`Lines`, `LineStrip`, `LineLoop`, `Points`, `TriangleFan`,
  `TriangleStrip` draw modes are no longer renderable** through the
  public stack. The `RenderingPrimitives` enum is still exported but
  is now used only internally by SpriteRenderer / ParticleRenderer /
  MeshRenderer / VertexArrayObject (which all draw triangle-list or
  triangle-strip).

### Migration

```ts
// Before (0.6.4)
import { DrawableShape, Geometry, RenderingPrimitives, Color } from '@codexo/exojs';

const shape = new DrawableShape(new Geometry({ vertices: [0, 0, 100, 0, 50, 100], indices: [0, 1, 2] }), Color.red, RenderingPrimitives.Triangles);

// After (0.6.5)
import { Mesh, Color } from '@codexo/exojs';

const mesh = new Mesh({
  vertices: new Float32Array([0, 0, 100, 0, 50, 100]),
  indices: new Uint16Array([0, 1, 2]),
});
mesh.tint = Color.red;
```

`Graphics`'s public surface is unchanged — `drawCircle`, `drawRectangle`,
`drawLine`, `drawPath`, `drawPolygon`, `drawEllipse`, `drawArc`,
`drawStar`, `lineTo`, `moveTo`, `bezierCurveTo`, `quadraticCurveTo`,
`arcTo`, `clear`, `fillColor`, `lineColor`, `lineWidth`, `currentPoint`
all behave identically.

### Internals

- All geometry builders now produce triangle-list output. Previously
  most produced TriangleStrip with degenerate-triangle bridging (the
  duplicated-first-and-last-index pattern); that hack is gone.
- `Graphics.drawX` methods now construct `Mesh` children with
  `mesh.tint` carrying the fill/line color.
- `SceneManager`'s internal `TransitionOverlay` switched from
  `DrawableShape` to `Mesh`; quad now indexed `[0,1,2, 1,3,2]`.

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
if (capabilities.webgpu) startWebGpu(); // false positives possible
if (isSupported('touch')) showTouchUi();

// After (0.6.4)
import { Capabilities } from '@codexo/exojs';
const caps = await Capabilities.ready;
if (caps.webgpuAdapter) startWebGpu(); // strict adapter check
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

if (app.renderManager instanceof WebGpuRenderManager) {
  /* ... */
}

// Plain-object scene
app.start(
  new Scene({
    update() {
      /* ... */
    },
  }),
);
```

```ts
// After (0.6.0)
class GameScene extends Scene {
  override draw(backend: RenderBackend): void {
    this.root.render(backend);
  }
}

const triangleRenderer = new CustomRenderer(app.backend);

if (app.backend instanceof WebGpuBackend) {
  /* ... */
}

// Anonymous-subclass scene (or named subclass)
app.start(
  new (class extends Scene {
    override update() {
      /* ... */
    }
  })(),
);
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

| Before (0.4.x)                                                                          | After                                                                                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `import { Transformable } from '@codexo/exojs'`; `class X extends Transformable`        | `import { SceneNode } from '@codexo/exojs'`; `class X extends SceneNode`                                                             |
| `import { TransformableFlags } from '@codexo/exojs'`                                    | Internal flag enum is no longer public; use SceneNode's high-level transform accessors instead.                                      |
| `node.mask = anyShapeNode` _(silently clipped to bounding rect)_                        | `node.mask = anyShapeNode` _(now a real shape mask via alpha compositing — except bare SceneNode which is rejected at compile time)_ |
| Want fast axis-aligned clipping?                                                        | `node.mask = new Rectangle(x, y, w, h)`                                                                                              |
| Want to clip with a texture's alpha channel?                                            | `node.mask = texture` or `node.mask = renderTexture`                                                                                 |
| Want a transformed/positioned alpha mask?                                               | `node.mask = new Sprite(texture)` (Sprite's transform/position/scale apply to the mask source)                                       |
| `runtime.pushMask(rect)` / `runtime.popMask()`                                          | `runtime.pushScissorRect(rect)` / `runtime.popScissorRect()` (renamed; behavior unchanged)                                           |
| `class Group extends SceneNode { override render() {...} }`                             | `class Group extends RenderNode { override render() {...} }`                                                                         |
| `class CustomContainer extends Container { override addChild(child: SceneNode) {...} }` | `class CustomContainer extends Container { override addChild(child: RenderNode) {...} }`                                             |
| `Scene.create({ update() {...} })`                                                      | `new Scene({ update() {...} })` (drop-in replacement; same `this` typing via `ThisType<Scene & T>`)                                  |
| `Scene.create({})`                                                                      | `new Scene()`                                                                                                                        |

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
