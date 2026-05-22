# Pre-v0.9.0 API/Product Synthesis Review

**Date:** 2026-05-20  
**Reviewer:** Claude Opus (claude-sonnet-4-6 + claude-opus-4-7 synthesis pass)  
**Authority:** Current source at HEAD (`main`), all completed decision reports, original broad review outputs  
**Test suite at time of review:** 1 423 tests, 105 suites — all passing

---

## 1. Executive Verdict

**The API/product review phase is complete. ExoJS is ready for v0.9.0 milestone and release planning.**

Seven focused decision passes have resolved every major API concern raised by the original broad review. All decisions are implemented in source. All major documentation and example surfaces have been updated. The test suite is at 1 423 passing tests — 49 more than the ApplicationOptions migration checkpoint — reflecting new coverage for skew transforms, signal count, and related additions.

Three minor items require attention before tagging: one small commit to land the unstaged collision documentation fixes, one decision on two P2 surface aliases in `AbstractVector`, and one decision on `Scene.getParticipationPolicy()`. None of these warrant a new focused decision pass. They are mechanical closure tasks.

**No further API decision passes are needed before v0.9.0.**

---

## 2. Areas Fully Closed

### 2.1 Loader / Assets

**Status: Fully resolved — source, tests, docs.**

All items from the review and the post-implementation Codex verification are implemented:

| Item | Evidence |
|------|----------|
| `Asset<T>`, `Assets<M>` typed references | `src/resources/Asset.ts`, `Assets.ts` |
| `LoadingQueue` with per-item progress | `src/resources/LoadingQueue.ts` |
| Typed asset handler registration | `src/resources/AssetDefinitions.ts` + `Loader.ts` |
| `CacheStore` / `CacheStrategy` | `NetworkOnlyStrategy`, `CacheFirstStrategy` |
| `getIdentityKey` config-sensitive identity | `src/resources/Loader.ts:1043–1047` |
| `context.fetch*` IDB store names added | commit `159404d` — `IndexedDbStore` default schema |
| `unload(asset)` honors `getIdentityKey` | commit `159404d` |
| `concurrency`, `cacheStrategy` exposed in `LoaderOptions` | via `ApplicationOptions.loader` |
| Loader API fully documented | `site/src/content/api/loader-options.mdx`, `loader.mdx` |

The two blocking correctness issues from the Codex final verification report were both resolved in commit `159404d` before the ApplicationOptions pass.

---

### 2.2 ApplicationOptions

**Status: Fully resolved — source, docs, 112 examples migrated.**

Hybrid grouped redesign shipped as a single clean break:

| Area | Outcome |
|------|---------|
| `canvas` group (`element`, `width`, `height`, `pixelRatio`, `tabIndex`, `imageRendering`) | Implemented |
| `loader` group (direct re-export of `LoaderOptions`) | Implemented |
| `rendering` group (`debug`, `webglAttributes`, batch sizes) | Implemented |
| `input` group (`gamepadDefinitions`, `gamepadSlotStrategy`, `pointerDistanceThreshold`) | Implemented |
| `resourcePath` → `loader.basePath` rename | Complete — zero public references to old name remain |
| `requestOptions` → `loader.fetchOptions` rename | Complete |
| `cacheStrategy`, `concurrency` now reachable at construction | Implemented (were previously invisible through `ApplicationOptions`) |
| `pixelRatio` / `imageRendering` / `tabIndex` added | Implemented — previously entirely user-responsibility |
| `clearColor`, `backend` remain top-level | Confirmed correct |
| All 112 `.js` example files updated | Verified — 0 old-shape references in public docs |
| 5 new API pages (`application-options.mdx`, `canvas-application-options.mdx`, etc.) | Shipped |
| Guide chapters (`application.mdx`, `loading-and-resources.mdx`) updated | Verified |
| `npm run typecheck`, lint, test, site build all pass after migration | Verified: 1 374 tests at migration time |

**`fpsLimit` / `backgroundFpsLimit`:** Proposed in the ApplicationOptions addendum but explicitly rejected for pre-0.9.0 by the focused Application Loop decision review. Neither property exists in the current source, which is correct per that decision.

---

### 2.3 Public Object API Consistency

**Status: P0 + P1 items fully resolved in source. P2 items explicitly deferred.**

Policy settled: *mutable state → getter/setter property; lazy-computed results → `get*()` method only; multi-argument or commonly-chained mutations → `set*()` returning `this`; frame-tick methods → `void`; `destroy()` → always `void`.*

Implemented changes (verified in source):

| Item | Status |
|------|--------|
| `SceneNode.parentNode` removed | ✓ — only `parent` survives |
| `SceneNode.bounds`, `.globalTransform`, `.localBounds` property aliases removed | ✓ — `getBounds()`, `getGlobalTransform()`, `getLocalBounds()` are canonical |
| `SceneNode.setCullable(bool)` removed | ✓ |
| `RenderNode.setCacheAsBitmap(bool)` removed | ✓ |
| `RenderNode.setFilters(filters)` removed | ✓ |
| `Color.red/green/blue/alpha` aliases removed | ✓ — `r/g/b/a` survive |
| `Text.setText(str)` removed | ✓ |
| `Text.setStyle(style)` removed | ✓ |
| `TweenManager.update()` → `void` | ✓ |
| `Timer.limit` getter added | ✓ |

**Deferred P2 items (explicitly not blocking 0.9.0, pre-1.0 nice-to-have):**

- `AbstractVector.angle` alias for `direction` — still present; documented as `/** Alias for direction. */`
- `AbstractVector.magnitude` alias for `length` — still present
- `Scene.getParticipationPolicy()` — still present alongside `setParticipationPolicy`; returns `{ mode: this._stackMode }`

These were classified P2 in the decision report. They are low-value removals with near-zero migration cost that can close in a 0.9.0 or 0.9.x cleanup. **A decision on these two surface noise items is the only remaining mechanical task from this area.**

---

### 2.4 Tween System

**Status: Fully resolved — source and tests. Doc `@internal` filtering: resolved.**

All four M-items from the Tween decision report are implemented:

| Item | Evidence |
|------|----------|
| M1: `Tween.start()` re-registers with manager after eviction | `src/animation/Tween.ts:224` — `this._manager?.add(this)` |
| M2: Dead `_startFired = false` line removed | Confirmed absent |
| M3: `_attachManager` not surfaced in public docs | Confirmed — `_attachManager` no longer appears in generated API pages |
| M4: `NumericKeys<T>` constraint on `to()` | `src/animation/Tween.ts:6–10`, `to()` signature at line 110 |
| `TweenManager.sequence([])` added | `src/animation/TweenManager.ts:43` |
| `SceneTweens` auto-dispose proxy on `Scene.tweens` | `src/core/Scene.ts:56–181` |

The `tween-basics.js` ping-pong restart pattern (previously silently broken after one round trip) is now correct.

---

### 2.5 Application Loop / Timing

**Status: Fully resolved in source.**

| Item | Evidence |
|------|----------|
| `pauseOnHidden` delta-spike fix | `src/core/Application.ts:370–372` — `_frameClock.restart()` in early-return path |
| `maxDeltaMs` internal clamp (100 ms default) | `src/core/Application.ts:89`, `378` |
| `rawFrameDeltaMs` exposed in `backend.stats` | `src/core/Application.ts:383` |
| Update/render two-phase separation confirmed | `SceneManager.update()` explicit phase separation in place |
| Fixed timestep: deferred | Correct — no concrete physics requirement exists |
| `fpsLimit` / `backgroundFpsLimit`: rejected for pre-0.9.0 | Correct — browser scheduling defeats background rate limiting; raw `pauseOnHidden` is the right primitive |
| Async `update()`/`draw()` dev-mode warning | `src/core/SceneManager.ts:235–246` — `instanceof Promise` guard with `console.warn` |

---

### 2.6 Transform Completeness / Skew

**Status: Fully resolved — source, tests, docs.**

| Item | Evidence |
|------|----------|
| `skewX`, `skewY`, `setSkew(x, y)` added | `src/core/SceneNode.ts:203–262` |
| `SceneNodeTransformFlags.Skew = 1 << 5` dirty bit | Confirmed |
| `isAlignedBox` gates on `_skewX === 0 && _skewY === 0` | `src/core/SceneNode.ts:231` |
| `Sprite.contains()` bug fixed | `src/rendering/sprite/Sprite.ts:269` — `if (this.isAlignedBox)` replaces `rotation % 90 === 0` |
| Transform computation correct (Math.tan shear, fused RS+Skew) | `src/core/SceneNode.ts:287–325` |
| WebGL2 / WebGPU rendering correct under skew | Unchanged — `getGlobalTransform()` `a/b/c/d` already handles off-diagonal shear |
| Skew test coverage added | commit `0896d9f` — 105 test suites now include skew tests |
| `scene-graph.mdx` documents `skewX`, `skewY`, `setSkew` | Lines 73–92, confirmed |
| `scene-node.mdx` updated | staged cleanup in current working tree |

---

### 2.7 Collision Detection / Response

**Status: Source changes complete and correct; awaiting a single commit.**

The collision review identified three narrow pre-0.9.0 actions. All three are implemented in the current working tree (unstaged in `src/math/Collision.ts`, `src/math/collision-detection.ts`, and `site/src/content/guide/advanced/collision-detection.mdx`):

| Item | Status |
|------|--------|
| Stale JSDoc on `getCollisionRectangleRectangle` claiming `projectionN`/`projectionV` are zero vectors | **Fixed** — now correctly describes the MTV computation |
| `Collidable.collidesWith` null-ambiguity documented | **Fixed** — JSDoc lists both cases and names unsupported pairs |
| Collision guide expanded with `projectionV` separation recipe | **Done** — full recipe with separation, directional classification, two-way split |
| Swept collision exposed in guide | **Done** — `sweepRectangle`, `sweepCircleVsCircle`, `sweepCircleVsRectangle`, batch helpers, `substepSweep`, anti-tunneling recipe |
| Supported-pair matrix documented | **Done** — table of pairs supporting `collidesWith` response |

These changes have not been committed. They are otherwise complete — source and guide both look correct. A single commit closes this area.

**No new API surface was added.** `CollisionWorld`, collision events, response helpers like `separate()`, and physics integration are correctly deferred to post-0.9.0 / physics planning.

---

## 3. Original Concerns Reconciliation

| Original concern | Current status | Evidence | Further action? |
|-----------------|----------------|----------|----------------|
| Scene / overlay scene handling | **Resolved** — `SceneStackMode = 'overlay' \| 'modal' \| 'opaque'` with full docs | `src/core/Scene.ts:91`, `scenes.mdx:79–87` | None |
| `handleInput` boolean return — design fragility | **Resolved by removal** — the entire input-routing system was removed (`9675097`); scenes no longer route input via return values | `src/core/Scene.ts` — no `handleInput`; `b97f552` removes stale docs | None |
| Signals performance / runners | **Resolved** — `88156a2` refactored signals to direct function pointers with dispatch-guard, removing context allocations | `src/core/Signal.ts` | None |
| Loader typing ergonomics | **Resolved** — `Asset<T>`, `Assets<M>`, `LoadingQueue`, typed manifests | Multiple commits | None |
| Scene graph ergonomics | **Resolved** — Public Object API pass removed duplicates, settled property-vs-method policy | commit `5104730` | P2 aliases (see §2.3) |
| BlendMode completeness | **Partially resolved** — Normal/Additive/Subtract/Multiply/Screen/Darken/Lighten. Overlay/HardLight/Difference absent | `src/rendering/types.ts` | Post-0.9.0 creative rendering pass |
| Async functions in update/render | **Resolved** — dev-mode `instanceof Promise` warning in `SceneManager.update()` | `src/core/SceneManager.ts:235–246` | None |
| Font loading / Text.ready | **Resolved** — `Text.ready: Promise<void>` implemented | `src/rendering/text/Text.ts:128` | None |
| skewX / skewY | **Fully resolved** | See §2.6 | None |
| Rendering performance / profiling | **Partially resolved** — `rawFrameDeltaMs` stat exposed; deep profiling tooling deferred | `Application.ts:383` | Post-0.9.0 |
| Tilemap support | **Deferred intentionally** | final-maintainer-synthesis §9 | Extras post-0.9.0 |
| Physics support | **Deferred intentionally** | All decision reports confirm | Extras / physics planning |
| WebHID / microphone / webcam / WASM / networking | **Deferred intentionally** | 3/3 original reviewers | Post-0.9.0 or Extras |
| ExoJS Extras packaging boundary | **Deferred intentionally** | final-maintainer-synthesis §9 | Post-0.9.0 governance decision |
| Extended ApplicationOptions | **Fully resolved** | See §2.2 | None |
| Collision usability / reaction model | **Fully resolved** | See §2.7 | Commit unstaged changes |
| `new Sprite(loader.get(Texture, 'hero'))` ergonomics | **Resolved** — `Assets<M>` typed maps remove per-site type token repetition | `src/resources/Assets.ts` | None |
| `return this` policy inconsistency | **Resolved** — explicit tier policy, P0+P1 surfaces cleaned up | commit `5104730` | P2 deferred (AbstractVector) |
| Identity alignment after reset | **Confirmed intact** — 3/3 original reviewers and all subsequent passes confirm identity is coherent | All decision reports §ExoJS Identity sections | None |
| Scene.root silent blank-screen trap | **Resolved** — dev-mode warning added | `src/core/SceneManager.ts:288–289` | None |
| `View.screenToWorld()` / `worldToScreen()` boilerplate | **Resolved** | commit `3c59135` | None |
| `TweenManager.sequence()` for safe chaining | **Resolved** | commit `0a50c3f`; `TweenManager.ts:43` | None |
| Scene stacking preset constants | **Not added as named constants** — `SceneStackMode` type string union is in place; docs are clear; preset constants were deferred | `src/core/Scene.ts:91`, `scenes.mdx` | Optional post-0.9.0 convenience export |

---

## 4. Remaining True Pre-v0.9.0 Risks

There are no blocking API or architectural risks. The only remaining pre-release tasks are mechanical:

### 4.1 Unstaged collision changes — must commit

The following working-tree changes are complete and correct but not yet committed:

- `src/math/collision-detection.ts` — stale JSDoc removed
- `src/math/Collision.ts` — null-ambiguity clarification in `collidesWith` JSDoc
- `site/src/content/guide/advanced/collision-detection.mdx` — full expansion with response recipes and swept section
- `site/src/content/api/scene-node.mdx` — minor cleanup (staged)

These changes are already verified against the decision report. They need a commit. No further review is needed.

### 4.2 P2 surface aliases — two small decisions

`AbstractVector.angle` and `AbstractVector.magnitude` are aliases that were classified P2 in the public API review. The review noted them as "ideally removed before 1.0; P2 means optional now." They do not break anything. The choice is:
- Remove them now as part of the v0.9.0 breaking-change batch (trivial, clean)
- Leave them as documented aliases and schedule removal for 0.9.x or 1.0

Similarly, `Scene.getParticipationPolicy()` returns a wrapper around `stackMode`. It is used in the scene API docs but adds no value beyond `scene.stackMode` itself. One sentence to decide: remove now or defer to 1.0.

**These are not a focused decision pass — they are a 5-minute editorial decision.**

### 4.3 `fpsLimit` / `backgroundFpsLimit` non-implementation is correct

Neither property was added, which is correct per the Application Loop decision review (§6.2–6.3). The review explicitly rejected `backgroundFpsLimit` as a concept and deferred `fpsLimit` to post-0.9.0. The ApplicationOptions addendum proposed both but was superseded by the more focused loop review. The source reflects the right decision.

---

## 5. Topics Intentionally Deferred

### Rendering

| Topic | Decision | Notes |
|-------|----------|-------|
| BlendMode Overlay / HardLight / Difference | Deferred | Not blocking; "optional if low risk" in final-maintainer-synthesis; small impl effort but no demonstrated game need |
| `fpsLimit` (render-only limiter) | Deferred | Post-0.9.0; add when concrete user demand exists; belongs in `rendering` or `loop` group |
| `backgroundFpsLimit` | **Rejected** | Browser throttling defeats it; `pauseOnHidden` is the correct primitive |
| Fixed-timestep loop | Deferred | Requires concrete physics integration requirement to justify; current variable-step with `maxDeltaMs` is sufficient |
| RenderInstructions / batching architecture | Deferred | Internal engine optimization post-0.9.0 |
| Profiling tooling / DevTools integration | Deferred | `rawFrameDeltaMs` provides the stat foundation; UI tooling is a separate investment |

### Gameplay / Runtime

| Topic | Decision | Notes |
|-------|----------|-------|
| `CollisionWorld` / collision registry | Deferred | Must be co-designed with physics; `Quadtree<T>` is the user-accessible spatial primitive now |
| `onCollisionEnter/Stay/Exit` events | Deferred | Requires `CollisionWorld` — impossible without a registry |
| Fixed-step physics (Box2D style) | Deferred | Post-0.9.0; physics integration will add a fixed-step sub-loop inside the RAF tick |
| Tilemap / TileMap rendering | Extras | `@codexo/exojs/extras/tileset` track |
| 9-Slice sprite primitive | Extras | `@codexo/exojs/extras/9slice` track |
| Scene stacking preset constants | Optional | `SceneStackMode` string union + docs are sufficient; named constants (`ScenePresets.hud` etc.) are a convenience, not a structural gap |

### Platform APIs

| Topic | Decision | Notes |
|-------|----------|-------|
| WebHID / gamepad extras | Deferred | Custom gamepad mappings are already configurable; first-class WebHID out of scope |
| Microphone / live audio capture helpers | Extras / post-0.9.0 | Current `MediaStream` duck-typing suffices; dedicated helpers are additive |
| Webcam / getUserMedia | Extras | Out of core scope |
| WASM audio (BeatDetector Stage 2/3) | Deferred | Post-0.9.0 audio optimization |
| Networking / WebSocket / WebRTC | **Rejected for core** | Separate package `@codexo/exojs-networking` track; after 1.0 |

### Tooling / Profiling

| Topic | Decision | Notes |
|-------|----------|-------|
| Deep profiling overlay / flame charts | Deferred | `rawFrameDeltaMs` lays the stat foundation; UI investment is post-0.9.0 |
| Export tiering / `@stable/@advanced/@internal` CI enforcement | Deferred | Documentation governance task, not API design |
| DevTools Chrome extension integration | Post-0.9.0 | `PerformanceLayer` covers immediate needs |

### Package Architecture / Extras

| Topic | Decision | Notes |
|-------|----------|-------|
| Extras subpath governance | Deferred | Must define peer-dependency range, support ownership, quality bar before first Extras release |
| `@codexo/exojs/extras/collision` | Post-0.9.0 | `CollisionWorld` co-designed with physics |
| `@codexo/exojs-pathfinding` | Separate package post-0.9.0 | Purely algorithmic, no render concern |
| Playground / site Monaco integration | 1.0 requirement | Committed in project docs plan |

---

## 6. Is Another Focused API Pass Still Needed?

**No.**

The original final-maintainer-synthesis listed four design passes required before implementation could begin (Scene Input Propagation, ApplicationOptions, Loader Accessor, Fluent Policy). All four have been resolved:

| Pass | Outcome |
|------|---------|
| Scene Input Propagation API | **Resolved by removal** — `handleInput` routing removed entirely; cleaner than `event.consume()` |
| ApplicationOptions structure | **Fully implemented** — grouped hybrid design shipped |
| Loader Accessor / typing ergonomics | **Fully implemented** — `Asset<T>`, `Assets<M>`, `LoadingQueue` |
| Fluent / `return this` policy | **Implemented** — explicit policy, P0+P1 surfaces cleaned |

The two remaining mechanical decisions (AbstractVector P2 aliases, `Scene.getParticipationPolicy()`) do not warrant a full review pass. They are editorial choices about minor surface noise that can be decided in a single conversation.

The seven focused decision passes produced 17 distinct implementation commits across source, tests, and docs. The review cycle has served its purpose.

---

## 7. Immediate Recommendation

**Choice 3: API/product review phase is complete; move to v0.9.0 milestone/release planning.**

The API surface is clean, consistent, and well-documented. The test suite is healthy at 1 423 passing tests. The remaining pre-v0.9.0 work is:

1. Commit the unstaged collision changes (one commit, already written)
2. Decide on P2 surface aliases (5-minute editorial decision)
3. Write the 0.8.x → 0.9.0 migration guide
4. Define the v0.9.0 milestone scope and changelog
5. Tag and release

No new focused API review pass is warranted. No substantial implementation work remains inside the review scope.

---

## 8. Proposed Pre-v0.9.0 Closure Plan

This is the concrete final sequence from here to milestone readiness:

### Step 1 — Commit collision changes (today)

```
git add src/math/Collision.ts src/math/collision-detection.ts
git add site/src/content/guide/advanced/collision-detection.mdx
git add site/src/content/api/scene-node.mdx
git commit -m "docs(collision): fix stale JSDoc, document null ambiguity, add response recipes and swept section"
```

No new source API surface. Verification: `npm test` (collision tests already passing), `npm run typecheck`.

### Step 2 — Resolve P2 surface items (one pass, ~30 min)

Decide and implement:
- Remove `AbstractVector.angle` and `AbstractVector.magnitude` aliases (or document them as stable aliases and close the item)
- Remove `Scene.getParticipationPolicy()` (or leave it; the decision is the work)

If removed: update the scene API docs (`site/src/content/api/scene.mdx`) and run `npm test` to confirm no breakage.

### Step 3 — v0.9.0 migration guide

Write `docs/migration/0.8-to-0.9.md` covering:
- `ApplicationOptions` flat → grouped (most impactful)
- `resourcePath` → `loader.basePath`, `requestOptions` → `loader.fetchOptions`
- `width`/`height` → `canvas.width`/`canvas.height`
- Removed API surfaces (see §2.3 removal list)
- `Text.setText()` / `setStyle()` → property assignment
- `SceneNode.bounds` → `getBounds()`, `globalTransform` → `getGlobalTransform()`, `localBounds` → `getLocalBounds()`
- Any P2 items resolved in Step 2

### Step 4 — Define v0.9.0 milestone scope

Decide which, if any, of the following constitute part of the v0.9.0 release (all optional):
- BlendMode Overlay/HardLight/Difference (small addition, "optional if low risk" per final-maintainer-synthesis)
- Scene stacking preset constants (cosmetic convenience)
- `fpsLimit` as a mutable property on Application (loop review explicitly deferred — respect that decision)

**Recommendation:** Ship v0.9.0 with what exists. None of these additions change anything for users who have been waiting for API stabilization. Scope creep at this stage extends the timeline without closing the milestone.

### Step 5 — Final validation before tag

```
npm run typecheck
npm run lint:strict
npm test
cd site && npm run check-ts && npm run build
```

All four must pass cleanly. Current state: all four pass.

### Step 6 — Tag v0.9.0

Semantic version: `0.9.0` marks the API consolidation milestone. Changelog should include the migration guide reference and the full list of breaking changes since `0.8.4`.

---

## 9. Final Verdict

> **API/product review phase is complete; move to v0.9.0 milestone/release planning.**

The API surface is in its best shape since the project began. The ExoJS identity — TypeScript-first, explicit without boilerplate, browser-first, low magic, honest subsystem boundaries — is coherent across every public interface. The six weeks of focused review work have resolved every major ergonomic concern identified by three independent reviewers. What remains is the mechanical work of shipping: commit, document, tag.

**ExoJS is ready for v0.9.0.**
