# Final Public API Surface Sweep — Pre-v0.9.0

**Date:** 2026-05-20  
**Reviewer:** Claude Opus (source-verified against current main)  
**Scope:** AbstractVector aliases, Scene.getParticipationPolicy(), Application subsystem naming, Collision surface polish  
**Source authority:** `src/math/AbstractVector.ts`, `src/math/PolarVector.ts`, `src/core/Scene.ts`, `src/core/SceneManager.ts`, `src/core/Application.ts`, `src/math/Collision.ts`, `src/math/swept-collision.ts`, `src/math/index.ts`, `site/src/content/api/*.mdx`, `examples/`

---

## A. Executive Verdict

**Yes — a tiny cleanup is worth doing before v0.9.0, but it is minimal.**

Exactly three source touches are warranted:

1. **Remove `Scene.getParticipationPolicy()`** from `Scene.ts`, update `SceneManager._resolveParticipationPolicy()` to read `scene.stackMode` directly, remove from `scene.mdx`.
2. **Rename `app.sceneManager` → `app.scene`** on `Application`, with a companion rename of `SceneManager.scene` → `SceneManager.currentScene` to avoid the `app.scene.scene` compound.
3. **Fix the stale JSDoc comment on `getCollisionRectangleRectangle`** that falsely claims `projectionN` and `projectionV` are zero vectors (already identified in the prior collision review, not yet applied).

Everything else reviewed below is either already clean, already resolved, or not worth touching before v0.9.0.

---

## B. Findings by Area

### 1. Vector Aliases

#### `AbstractVector.angle`

**What it is:**  
A public getter/setter computing direction as `Math.atan2(this.x, this.y)` — angle measured from the positive Y-axis, clockwise. The setter rotates the vector to the new angle while preserving `length`.

**Is it computed or stored?** Computed on read from `(x, y)`. Cheap — a single `atan2` call.

**Is the setter intuitive?** Yes for the use case it serves: "rotate this vector to face direction θ while keeping its speed/length." The Y-axis origin convention is unusual (math standard is X-axis) but is documented explicitly in the JSDoc.

**Internal usage:**  
`PolarVector.fromVector()` (`src/math/PolarVector.ts:24`) reads `vector.angle` to preserve direction when converting to polar form. `ObservableVector.set length` reads `this.angle` to rescale while preserving direction. Both uses are internal to the math subsystem.

**External usage:**  
Zero. No examples, no test files, no docs outside `AbstractVector.ts` itself reference `.angle`.

**Is `angle` exported?**  
`AbstractVector` itself is not in `src/math/index.ts` — only `Vector` and `ObservableVector` are exported. `angle` is accessible on `Vector` and `ObservableVector` instances through inheritance but is not surfaced as a top-level math export.

**Docs state:**  
The generated `vector.mdx` Properties section lists only `x`, `y`, `one`, `zero` — the inherited AbstractVector properties (`angle`, `length`, `lengthSq`, etc.) are absent. This is a docs-generation gap, not an API gap.

**Is there a competing canonical API?**  
No. `angle` is the only way to read or set vector direction without decomposing manually. `PolarVector.phi` covers the same concept for polar-form vectors.

**Recommendation:** **Keep as-is.** `angle` fills a real need (PolarVector depends on it; direction-preserving rescaling is a legitimate operation). The API is clean. The only action is a docs fix: the vector.mdx Properties section should list `angle`, `length`, and `lengthSq` alongside `x` and `y`.

---

#### `AbstractVector.magnitude`

**What it is:**  
**It does not exist.** There is no `magnitude` property on `AbstractVector`, `Vector`, or `ObservableVector`. The synthesis review listed this as a P2 question to resolve, but the property was never added.

**Current API:**  
- `length` — Euclidean magnitude, getter/setter
- `lengthSq` — squared magnitude, getter/setter (avoids `sqrt` for comparisons)

Both names are present and used. `PolarVector` uses `radius` for magnitude (correct for polar convention).

**Recommendation:** **Nothing to decide.** `magnitude` was a concern from an earlier API state or a potential alias that was never implemented. The current API with `length` and `lengthSq` is clean and unambiguous. No change needed.

---

### 2. Scene Participation

#### `Scene.getParticipationPolicy()`

**What it does:**  
```ts
public getParticipationPolicy(): SceneParticipationPolicy {
    return { mode: this._stackMode };
}
```
Returns a one-field object wrapping the same value as `scene.stackMode`.

**Who calls it?**  
`SceneManager._resolveParticipationPolicy()` at `src/core/SceneManager.ts:368`:
```ts
const scenePolicy = scene.getParticipationPolicy();
const mode = overrides.mode ?? scenePolicy.mode ?? 'overlay';
```
This is internal to the engine. The `scenePolicy.mode` access is equivalent to `scene.stackMode`.

**Is it used in examples?** Zero example files reference it.  
**Is it tested directly?** Zero test files reference it.  
**Is it in docs?** Yes — `site/src/content/api/scene.mdx:44` lists it in the Methods section.

**Does `stackMode` already cover the use case?**  
Yes. `scene.stackMode` is a direct read/write property. Any user inspecting scene participation policy can read `scene.stackMode` directly — no wrapper object needed.

**Prior review verdict:**  
The public-object-api-consistency review (P2 table) classified it as "Remove — Returns wrapper object for `stackMode`; redundant."

**Recommendation:** **Remove before v0.9.0.** This is the clearest P2 item in the entire sweep. The method adds no capability. Its single internal caller (SceneManager) can read `scene.stackMode` directly. The removal is a clean break (pre-1.0, no compatibility shims per project policy). Source impact: 5 lines removed from `Scene.ts`; 1 line changed in `SceneManager.ts`; 1 entry removed from `scene.mdx`.

Note: `setParticipationPolicy()` is different — it is the fluent API for batch-setting scene mode, especially useful with `PushSceneOptions`. It should stay.

---

### 3. Application Subsystem Naming

**Concern stated in review brief:** Whether `app.inputManager` and `app.audioManager` should become `app.inputs` / `app.audio`.

**Finding: The concern is a false alarm.** The current `Application` source already uses:

| Property | Type | Name |
|---|---|---|
| `app.canvas` | `HTMLCanvasElement` | noun |
| `app.loader` | `Loader` | noun |
| `app.input` | `InputManager` | short form already |
| `app.interaction` | `InteractionManager` | noun |
| `app.sceneManager` | `SceneManager` | Manager suffix |
| `app.tweens` | `TweenManager` | domain plural |
| `app.audio` | `AudioManager` (getter) | short form already |
| `app.backend` | `RenderBackend` | noun |
| `app.capabilities` | `Capabilities` | noun |

`inputManager` and `audioManager` were renamed to `input` and `audio` in a prior pass. The properties `app.input` and `app.audio` are already the canonical short forms.

**The remaining inconsistency:** `app.sceneManager` is the only `*Manager`-suffixed public property. All others use domain nouns.

**Should `app.sceneManager` become `app.scene`?**  
Yes — it follows the same rule as the prior renames:

```
inputManager  →  input
audioManager  →  audio
sceneManager  →  scene
```

`app.scene.setScene(...)`, `app.scene.pushScene(...)`, `app.scene.popScene()` all read naturally.

**The one complication:** `SceneManager` already exposes a `scene` getter returning `Scene | null` (the current top-of-stack scene). Renaming `Application.sceneManager` → `Application.scene` without touching this getter would produce `app.scene.scene` — an awkward compound.

**Resolution:** Rename `SceneManager.scene` → `SceneManager.currentScene` simultaneously.

```ts
app.scene.currentScene   // Scene | null — active scene (top of stack)
app.scene.scenes         // readonly Scene[] — full stack
app.scene.setScene(...)
app.scene.pushScene(...)
app.scene.popScene()
```

`currentScene` is explicit and unambiguous. It pairs cleanly with `scenes` (plural for the full stack). The slight repetition in `app.scene.currentScene` (word "scene" twice in the access path) is a worthwhile tradeoff for clarity — it is not a stutter like `app.scene.scene` would have been.

**Why not `app.scenes` (plural)?**  
`SceneManager.scenes` is the getter for the full stack array. `app.scenes` as the manager name would make `app.scenes.scenes` the access path to that array — worse than the original problem.

**Recommendation:** **Rename `app.sceneManager` → `app.scene` with companion rename `SceneManager.scene` → `SceneManager.currentScene`.** Pre-1.0 clean break. No compatibility shims.

---

### 4. Collision API Surface Polish

#### Names

`intersectsWith` / `collidesWith` — the two-tier API is semantically correct and readable. No rename warranted.

`CollisionResponse` — appropriate type name, well-documented fields.

`projectionN` / `projectionV` — the prior review noted these as potentially opaque. Evaluating against the actual JSDoc in `src/math/Collision.ts`:

```ts
/** Unit normal of the minimum-translation axis. */
readonly projectionN: Vector;
/** Minimum-translation vector: `projectionN` scaled by `overlap`. */
readonly projectionV: Vector;
```

The JSDoc is adequate. The naming follows a consistent pattern (both prefixed with `projection`, distinguished by `N` for normal and `V` for vector). Aliases like `normal` / `separation` would add API surface without meaningful clarity gain — the `projection` prefix is load-bearing because it distinguishes these from other potential `normal` concepts (surface normal, polygon normal). **Keep as-is.**

#### Response fields

`CollisionResponse` fields are complete and documented. The null-ambiguity concern from the prior review (is `null` from `collidesWith` "no overlap" or "unsupported pair"?) is **already addressed** in the current source JSDoc:

```ts
/**
 * Returns `null` in two cases:
 * - the shapes do not overlap, **or**
 * - the specific shape-pair combination does not support response generation
 *   (e.g. `Line` against any shape, `Ellipse` against `Ellipse` or `Polygon`).
 */
```

This was apparently fixed between the prior collision review and now. No further action needed.

#### Swept helpers

**Key finding:** `sweepCircleVsRectangle` is **already V2** (full Minkowski rounded-rectangle formulation with exact corner arc tests). The prior collision review noted it as V1 with a TODO, but the implementation has since been updated. The current code tests all four flat faces and all four corner arcs independently, returning the earliest valid hit — eliminating the corner over-collision of the simpler expanded-AABB approach. This is materially better than the prior review indicated.

All swept helpers are exported from `src/math/index.ts` via `export * from './swept-collision'`:
- `SweptHit` (interface)
- `sweepRectangle`
- `sweepCircleVsRectangle`
- `sweepCircleVsCircle`
- `sweepRectangleAgainst`
- `sweepCircleAgainst`
- `substepSweep`

All exported correctly from the public entrypoint. No internalization needed.

#### Stale JSDoc — critical fix still needed

The `getCollisionRectangleRectangle` internal function in `src/math/collision-detection.ts` still carries a JSDoc comment claiming:

> "Note: `projectionN` and `projectionV` are zero vectors in this implementation — only `overlap` and containment flags are meaningful."

This comment is **incorrect.** The implementation computes `projectionN` and `projectionV` correctly from the minimum-penetration axis. This was identified in the prior collision review as the most significant code-quality issue. It has not yet been applied. This must be fixed before v0.9.0.

#### Export / null semantics summary

No API surface changes needed. The only action is the JSDoc fix above and docs recipes (guide content, not source API).

---

## C. Consolidated Recommendation Table

| Area | Current API | Action | Before v0.9.0? | Reason |
|---|---|---|---|---|
| `AbstractVector.angle` | `get angle(): number` / `set angle(a)` | Keep as-is | — | Only direction API; used by PolarVector; well-documented. Missing from vector.mdx — docs gap only. |
| `AbstractVector.magnitude` | Does not exist | Nothing to do | — | `length` is the canonical term. Property was never added. |
| `Scene.getParticipationPolicy()` | `getParticipationPolicy(): SceneParticipationPolicy` | **Remove** | Yes | Returns `{ mode: this._stackMode }` — a redundant wrapper around `stackMode`. Zero external usage. Internal caller can read `scene.stackMode` directly. |
| `app.inputManager` | Does not exist — already `app.input` | Nothing to do | — | Already resolved in prior pass. |
| `app.audioManager` | Does not exist — already `app.audio` | Nothing to do | — | Already resolved in prior pass. |
| `app.sceneManager` | `sceneManager: SceneManager` | **Rename → `app.scene`** | Yes | Follows same rule as `inputManager→input`, `audioManager→audio`. Companion rename `SceneManager.scene→currentScene` avoids `app.scene.scene` compound. |
| `SceneManager.scene` getter/setter | `get scene(): Scene \| null` | **Rename → `currentScene`** | Yes | Avoids `app.scene.scene` after the Application rename. `currentScene` / `scenes` pair is clean. |
| `projectionN` / `projectionV` | Fields on `CollisionResponse` | Keep as-is | — | Already documented clearly. Aliases would add surface without clarity gain. |
| `collidesWith` null ambiguity | JSDoc on `Collidable.collidesWith` | Already fixed | — | Current source already documents the two null cases and lists unsupported pairs. |
| `sweepCircleVsRectangle` V1 | `sweepCircleVsRectangle(...)` | Already V2 | — | Full Minkowski rounded-rectangle with corner arcs already implemented. Prior review's V1 concern is resolved. |
| `getCollisionRectangleRectangle` JSDoc | Stale comment claiming projectionN/V are zero | **Fix comment** | Yes | Comment is factually wrong and actively misleads. Must be removed/rewritten before v0.9.0. |

---

## D. Implementation Impact

### Source files touched

**`src/core/Scene.ts`**  
Remove `getParticipationPolicy()` method (5 lines). No other changes.

**`src/core/SceneManager.ts`**  
Two changes:

1. `_resolveParticipationPolicy()` (line 368): replace  
```ts
const scenePolicy = scene.getParticipationPolicy();
const mode = overrides.mode ?? scenePolicy.mode ?? 'overlay';
```  
with  
```ts
const mode = overrides.mode ?? scene.stackMode ?? 'overlay';
```

2. Rename `get scene()` / `set scene()` → `get currentScene()` / `set currentScene()`. The setter calls `void this.setScene(scene)` — behavior unchanged, only the property name changes.

**`src/math/collision-detection.ts`**  
Remove or rewrite the stale JSDoc comment on `getCollisionRectangleRectangle`. The correct behavior: `projectionN` is the unit normal of the minimum-penetration axis; `projectionV` is `projectionN` scaled by `overlap`.

**`src/core/Application.ts`**  
Rename property declaration and constructor assignment: `sceneManager` → `scene`.

### Docs files touched

**`site/src/content/api/application.mdx`**  
Rename `sceneManager: SceneManager` → `scene: SceneManager` in the Properties list.

**`site/src/content/api/scene-manager.mdx`** (if it exists)  
Update `scene` getter/setter entry to `currentScene`.

**`site/src/content/api/scene.mdx`**  
Remove `getParticipationPolicy(): SceneParticipationPolicy` from the Methods list.

**`site/src/content/api/vector.mdx`** (docs gap, not API gap)  
Add `angle`, `length`, and `lengthSq` to the Properties section. These are currently absent because the docs generator only picks up properties declared directly on `Vector`, not inherited from `AbstractVector`.

### Tests likely needed

**`sceneManager` → `scene` rename:** Test files use `app.sceneManager` as mock key and in assertions. All references must be updated to `app.scene`. Grep confirms ~10 test files reference `sceneManager` — mechanical find-and-replace, no logic changes.

**`SceneManager.scene` → `currentScene`:** Any test accessing `sceneManager.scene` must be updated to `sceneManager.currentScene`. The `scene` setter path (used as shorthand for `setScene`) must also be updated.

**`getParticipationPolicy()` removal:** Grep confirmed zero direct test references. No test cleanup needed.

**Stale JSDoc fix:** No test change — this is a comment-only fix. The rectangle-rectangle collision behavior itself is correct and already tested.

---

## E. Final Decision

> **Option 1 — Implement a final tiny API cleanup pass before v0.9.0.**

The pass consists of exactly:

1. **Remove `Scene.getParticipationPolicy()`** — source: `Scene.ts` (remove 5 lines) + `SceneManager.ts` (inline 1 line) — docs: `scene.mdx` (remove 1 entry)
2. **Rename `app.sceneManager` → `app.scene`** — source: `Application.ts` (property declaration + constructor) + `SceneManager.ts` (rename `scene` getter/setter → `currentScene`) — tests: mechanical symbol replace across ~10 test files — docs: `application.mdx`
3. **Fix stale `getCollisionRectangleRectangle` JSDoc** — `collision-detection.ts` (rewrite/remove comment)
4. **Update `vector.mdx` Properties** to include inherited `angle`, `length`, `lengthSq` — docs only, no source change

The scope is explicitly bounded. No other source API surfaces need changing before v0.9.0. The remaining gaps (collision response recipes, swept collision guide mention) are docs work, not API work, and belong in the migration guide and examples pass.

The collision system is more complete than the prior review indicated: `sweepCircleVsRectangle` is already V2, and the `collidesWith` null-ambiguity JSDoc was already updated. The primary remaining code-quality debt is the stale comment on the rectangle-rectangle collision function.

---

*Verified source state: `src/math/AbstractVector.ts` (no `magnitude`; `angle` present); `src/math/PolarVector.ts` (uses `vector.angle`); `src/core/Scene.ts:215` (`getParticipationPolicy` present, trivial wrapper); `src/core/SceneManager.ts:368` (sole caller of `getParticipationPolicy`); `src/core/SceneManager.ts:118` (`get scene()` / `set scene()` present — rename target → `currentScene`); `src/core/Application.ts` (`input`, `audio` already short-form; `sceneManager` the only `*Manager` name — rename target → `scene`); `src/math/swept-collision.ts` (V2 Minkowski implementation confirmed); `src/math/Collision.ts` (null-ambiguity JSDoc already present).*
