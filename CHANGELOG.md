# Changelog

All notable changes to ExoJS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
is unchanged; only event *cadence* and a new `draggable` flag.

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
  app.tweens.create(sprite)
      .to({ x: 100, alpha: 0.5 }, 1.0)        // 1 second
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
  + texture re-upload. Cached glyphs are zero-cost on subsequent
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

const shape = new DrawableShape(
    new Geometry({ vertices: [0, 0, 100, 0, 50, 100], indices: [0, 1, 2] }),
    Color.red,
    RenderingPrimitives.Triangles,
);

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
