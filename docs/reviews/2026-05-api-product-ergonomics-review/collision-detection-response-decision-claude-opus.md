# Collision Detection / Collision Response API Decision Review

**Date:** 2026-05-20  
**Reviewer:** Claude Opus (source-verified against current main)  
**Scope:** Collision detection, collision response, swept collision, spatial indexing, registry/world question, event API, physics boundary  
**Source authority:** `src/math/Collision.ts`, `src/math/collision-detection.ts`, `src/math/swept-collision.ts`, `src/math/Rectangle.ts`, `src/math/Circle.ts`, `src/math/Ellipse.ts`, `src/math/Line.ts`, `src/math/Polygon.ts`, `src/math/Quadtree.ts`, `src/core/SceneNode.ts`, `src/rendering/sprite/Sprite.ts`, `examples/showcase/rectangles-collision.js`

---

## 1. Executive Verdict

**The collision system is significantly stronger than its reputation suggests.** Both discrete detection and continuous/swept detection are implemented and production-capable. The `CollisionResponse` struct contains everything a user needs for simple separation. The only genuine gaps before v0.9.0 are:

1. A **stale, incorrect JSDoc comment** on `getCollisionRectangleRectangle` that falsely tells users the separation vector is a zero vector (it is not).
2. **Zero documented recipes** for how to react to a collision response — no "push player out of wall" example exists.
3. **The null ambiguity** in `collidesWith`: the same `null` return value means both "shapes do not overlap" and "pair is unsupported."

No new API surface, no collision world, no event system, and no physics layer are needed before v0.9.0. This is a narrow documentation and correctness-comment cleanup, not an architectural gap.

---

## 2. Current Collision API Audit

### 2.1 Detection Surface

The `Collidable` interface (`src/math/Collision.ts`) defines the full collision contract:

```ts
interface Collidable {
  readonly collisionType: CollisionType;
  intersectsWith(target: Collidable): boolean;
  collidesWith(target: Collidable): CollisionResponse | null;
  contains(x: number, y: number): boolean;
  getNormals(): Vector[];
  project(axis: Vector, interval?: Interval): Interval;
}
```

`CollisionType` discriminant tags: `Point`, `Line`, `Rectangle`, `Circle`, `Ellipse`, `Polygon`, `SceneNode`.

Implemented by: `Rectangle`, `Circle`, `Ellipse`, `Line`, `Polygon`, `SceneNode` (and transitively `Sprite` with overrides for exact quad collision).

**Two-tier API is correct and explicit:**
- `intersectsWith` — fast boolean, no allocation beyond the algorithm itself
- `collidesWith` — full response with MTV; null when no overlap or pair unsupported

Both are symmetrically available on all shape types. The naming is clear and idiomatic.

### 2.2 Response Surface

`CollisionResponse` (`src/math/Collision.ts`):

```ts
interface CollisionResponse {
  readonly shapeA: Collidable;
  readonly shapeB: Collidable;
  readonly overlap: number;       // penetration depth
  readonly shapeAinB: boolean;    // shapeA fully inside shapeB
  readonly shapeBinA: boolean;    // shapeB fully inside shapeA
  readonly projectionN: Vector;   // unit normal of minimum-translation axis
  readonly projectionV: Vector;   // projectionN * overlap — the separation vector (MTV)
}
```

The `projectionV` field is the minimum-translation vector: applying `shapeA.move(response.projectionV.x, response.projectionV.y)` separates the two shapes with minimum displacement. This is the key field for gameplay collision response.

### 2.3 Supported Pair Matrix — `intersectsWith` (boolean)

All pairs are implemented for the boolean test. No pair throws or silently fails.

| Caller      | Rect | Circle | Ellipse | Polygon | Line | Point | SceneNode |
|-------------|------|--------|---------|---------|------|-------|-----------|
| Rectangle   | ✓    | ✓      | ✓ poly  | ✓ SAT   | ✓    | ✓     | ✓ AABB/SAT|
| Circle      | ✓    | ✓      | ✓ poly  | ✓ Vor.  | ✓    | ✓     | ✓ AABB    |
| Ellipse     | ✓    | ✓      | ✓ poly  | ✓ poly  | ✓    | ✓     | ✓ AABB    |
| Polygon     | ✓    | ✓ Vor. | ✓ poly  | ✓ SAT   | ✓    | ✓     | ✓ AABB    |
| Line        | ✓    | ✓      | ✓       | ✓       | ✓    | ✓     | ✓ AABB    |
| SceneNode   | ✓    | ✓      | ✓       | ✓       | ✓    | ✓     | ✓ AABB/SAT|

Legend: "poly" = polygon approximation; "Vor." = Voronoi-region classification; "SAT" = Separating Axis Theorem; "AABB" = axis-aligned bounding box test.

### 2.4 Supported Pair Matrix — `collidesWith` (response)

Gaps exist. `null` is returned for both "no overlap" and "unsupported pair."

| Caller          | Rect     | Circle   | Ellipse  | Polygon  | Line | Point | SceneNode         |
|-----------------|----------|----------|----------|----------|------|-------|-------------------|
| Rectangle       | ✓ MTV    | ✓        | ✓ approx | ✓ SAT    | null | null  | ✓ AABB or SAT     |
| Circle          | ✓        | ✓        | ✓ approx | ✓ Vor.   | null | null  | ✓ (vs. AABB)      |
| Ellipse         | ✓ approx | ✓ approx | **null** | **null** | null | null  | ✓ (vs. AABB)      |
| Polygon         | ✓ SAT    | ✓ Vor.   | **null** | ✓ SAT    | null | null  | ✓ SAT             |
| Line            | null     | null     | null     | null     | null | null  | null (always)     |
| SceneNode/Sprite| ✓        | ✓ SAT    | ✓ (aligned only) | ✓ SAT | null | null | ✓ AABB or SAT |

**Notable asymmetry — rotated SceneNode vs. Ellipse:** When `isAlignedBox = false`, `SceneNode.collidesWith` dispatches Ellipse to `default: return null`. But when `isAlignedBox = true`, it delegates to `getBounds().collidesWith(target)` which is `Rectangle.collidesWith`, which does handle Ellipse. So an aligned sprite vs. ellipse works; a rotated sprite vs. ellipse returns null. This matches `intersectsWith` (which uses AABB for circle/ellipse regardless of rotation) but is inconsistent within `collidesWith`.

### 2.5 Precision Guarantees

| Type        | Precision              | Notes |
|-------------|------------------------|-------|
| Rectangle   | Exact AABB             | Only axis-aligned; no rotation support at shape level |
| Circle      | Exact for circle-circle; SAT polygon approx (32 segments) for cross-type SAT | `Circle.collisionSegments` is configurable |
| Ellipse     | Polygon approximation for boolean; directional boundary formula for response | Not exact for curved boundary |
| Polygon     | Exact SAT (convex only) | Must be convex — no concave polygon support |
| Line        | Exact intersection     | Boolean only; no response |
| SceneNode   | AABB when aligned (exact for the bounding box); SAT quad when rotated (exact for the parallelogram) | |
| Sprite      | Exact rotated quad via 4 world-space vertices | Overrides `getNormals()` and `project()` for exact collision, not AABB |

**False positives are possible** for pairs involving ellipses (polygon approximation). All SAT paths for convex shapes are exact.

### 2.6 Bonus Discovery: Swept Collision (`src/math/swept-collision.ts`)

This file was not mentioned in the review brief but is part of the collision system and materially affects the assessment.

```ts
interface SweptHit {
  t: number;        // fraction of move at impact (0 = already overlapping)
  x: number;        // hit position X
  y: number;        // hit position Y
  normalX: number;  // contact normal X (away from target)
  normalY: number;  // contact normal Y
}

sweepRectangle(moving, deltaX, deltaY, target): SweptHit | null
sweepCircleVsRectangle(moving, deltaX, deltaY, target): SweptHit | null  // V1: Minkowski expansion
sweepCircleVsCircle(moving, deltaX, deltaY, target): SweptHit | null     // exact quadratic
sweepRectangleAgainst(moving, deltaX, deltaY, targets[]): SweptHit | null  // batch, earliest hit
sweepCircleAgainst(moving, deltaX, deltaY, targets[]): SweptHit | null     // batch version
substepSweep(fromX, fromY, deltaX, deltaY, maxStepSize): IterableIterator  // generic fallback
```

`sweepRectangle` handles the already-overlapping case (returns `t = 0` with the deepest-penetration axis normal, so callers can resolve immediately without a separate discrete test). The batch helpers include a swept-AABB broadphase skip.

`sweepCircleVsRectangle` is documented as V1 (Minkowski expansion, known corner over-collide) with a V2 TODO. `sweepCircleVsCircle` is exact.

**This means ExoJS already has continuous collision detection for the most common gameplay pairs.** This is a material asset that belongs in docs.

---

## 3. What Already Works Well

### 3.1 Two-tier API is semantically correct

The `intersectsWith` / `collidesWith` split is exactly right: fast boolean for spatial queries, full response only when needed. The naming is readable and the contract is clear in the interface JSDoc.

### 3.2 `projectionV` is the separation vector

`CollisionResponse.projectionV` is the minimum-translation vector. The basic response pattern:

```ts
const response = player.collidesWith(wall);
if (response !== null) {
  player.move(response.projectionV.x, response.projectionV.y);
}
```

...works today for every supported pair. No helper method is needed.

### 3.3 Sprite exact-quad collision is properly implemented

`Sprite` overrides `getNormals()` and `project()` to operate on its actual four world-space vertices (computed lazily from the global transform matrix). `contains()` uses a cross-product sign test that handles rotated and skewed quads, including mirrored (negative-scale) quads. The `isAlignedBox` fast-path gates to cheaper AABB only when `rotation % 90 === 0 && skewX === 0 && skewY === 0` — this is exactly correct after the recent skew implementation.

### 3.4 Normal and vertex caches are well-managed

All shapes use dirty-flag caching for normals and (where applicable) vertices. Invalidation is triggered by position/size/rotation changes. `Sprite` invalidates on `_invalidateSubtreeTransform` and `_invalidateBoundsCascade`.

### 3.5 SceneNode/Sprite as Collidable is the right design

Making `SceneNode` implement `Collidable` directly (rather than having a separate `Hitbox` component) is ergonomic for a TypeScript-first engine at this scope. Users do not need to manage separate collision shapes for most uses.

### 3.6 Swept collision covers the most important gameplay pairs

`sweepRectangle` (AABB vs AABB) and `sweepCircleVsCircle` are exact. The batch helpers with broadphase skip are sufficient for moderate scene counts without a collision world. `substepSweep` provides an escape hatch for arbitrary shape pairs.

### 3.7 Quadtree is generic and public

`Quadtree<T>` is a well-implemented persistent spatial index. It supports `insert`, `remove`, `queryPoint`, `queryRect`, `clear`. Users who need spatial acceleration for their own collision loops can use it today without engine changes.

---

## 4. Main Frictions and Gaps

### 4.1 Stale, incorrect JSDoc comment on `getCollisionRectangleRectangle`

**This is the most significant code-quality issue found in the review.**

The function-level JSDoc says:

> "Note: `projectionN` and `projectionV` are zero vectors in this implementation — only `overlap` and containment flags are meaningful."

The current implementation:

```ts
if (overlapX < overlapY) {
  overlap = overlapX;
  normalX = centerBx < centerAx ? -1 : 1;
  normalY = 0;
} else {
  overlap = overlapY;
  normalX = 0;
  normalY = centerBy < centerAy ? -1 : 1;
}

const projectionN = rectA.position.clone().set(normalX, normalY);
const projectionV = rectA.position.clone().set(normalX * overlap, normalY * overlap);
```

`projectionN` and `projectionV` are **not zero vectors** — they are computed correctly with the minimum-penetration-axis normal and the full MTV. This comment was accurate at some earlier point and was not updated when the implementation was completed. Any developer reading this JSDoc today would incorrectly believe they cannot use the MTV for rectangle-rectangle separation. This must be corrected before v0.9.0.

### 4.2 `null` conflation: "no overlap" vs. "unsupported pair"

`collidesWith` returns `null` for two distinct reasons:
1. The shapes do not overlap (correct behavior).
2. The shape pair is not implemented (`Ellipse` vs. `Polygon`, `Line` vs. anything, etc.).

A user who calls `ellipse.collidesWith(polygon)` receives `null` and cannot distinguish "they are not touching" from "this pair is not supported." The `intersectsWith` call may return `true` for the same pair, leading to confusion.

**Proposed fix (narrow):** Document this explicitly. Consider whether `collidesWith` should be renamed `getCollisionResponse` to signal it may intentionally return null, or add a JSDoc note listing unsupported pairs. No new API surface is required — clear documentation suffices.

### 4.3 Zero documented recipes for collision response

The only collision example (`examples/showcase/rectangles-collision.js`) demonstrates tinting based on `shapeAinB/shapeBinA`. It does not show:
- How to push a node out of a wall using `projectionV`
- How to use `projectionN` for directional detection (ground vs. wall)
- How to use swept collision for tunneling-safe movement

This is the largest docs gap before v0.9.0.

### 4.4 Swept collision is invisible

`src/math/swept-collision.ts` exists and is functional, but there is no example, no guide mention, and the file is not called out anywhere. A user implementing top-down movement will write discrete detection and not know swept detection is available.

### 4.5 Rotated SceneNode vs. Ellipse response gap

`SceneNode.collidesWith` with `target.collisionType === CollisionType.Ellipse` falls through to `default: return null` when the node is rotated. This means a rotated Sprite colliding with an Ellipse trigger zone gets no response even though `intersectsWith` returns true. The workaround is to test via `Ellipse.collidesWith(sceneNode)` instead, which does dispatch through `getCollisionEllipseRectangle(this, node.getBounds())` — but this still uses the AABB. The asymmetry is confusing.

### 4.6 Polygon.project allocates on every call

```ts
public project(axis: Vector, result: Interval = new Interval()): Interval {
  const normal = axis.clone().normalize();
  const projections = this._points.map(point => normal.dot(point.x, point.y));
  ...
}
```

This allocates a `Vector` clone and a `projections` array every time `project` is called. For a SAT test with N normals, this is 2N allocations. The other shape implementations (`Rectangle`, `Sprite`, `Circle`) do not allocate in their `project` methods. This is a performance inconsistency worth noting, but not a v0.9.0 blocker.

---

## 5. CollisionResponse Adequacy

### 5.1 What the response contains

| Field | Value | Use |
|-------|-------|-----|
| `shapeA` | Collidable reference | Know which shape was the caller |
| `shapeB` | Collidable reference | Know which shape was the target |
| `overlap` | Scalar penetration depth | Distance to separate |
| `projectionN` | Unit normal (MTV direction) | Directional info: floor/wall/ceiling detection |
| `projectionV` | MTV = projectionN × overlap | Separation vector — apply directly to move |
| `shapeAinB` | boolean | Full containment — useful for trigger volumes, pickup detection |
| `shapeBinA` | boolean | Full containment (reverse) |

### 5.2 What's missing

| Field | Needed for | Assessment |
|-------|-----------|------------|
| `contactPoint` | Impulse-at-point physics, edge-case collision FX | Not needed pre-physics |
| Velocity data | Bounce, restitution | Belongs in physics layer |
| Entry/exit state | `onCollisionEnter/Exit` | Requires registry — out of scope |
| Multiple contact points | Broad-body physics | Not needed pre-physics |

### 5.3 Assessment per gameplay pattern

**Push player out of wall (top-down / platformer):**
```ts
const r = player.collidesWith(wall);
if (r) player.move(r.projectionV.x, r.projectionV.y);
```
Works today. `projectionV` is the correct vector.

**Directional classification (floor vs. wall):**
```ts
const r = player.collidesWith(surface);
if (r) {
  const isFloor = r.projectionN.y < -0.5;  // normal points up
  const isWall = Math.abs(r.projectionN.x) > 0.5;
}
```
Works today. `projectionN` provides the contact normal.

**Trigger volumes / overlap detection:**
```ts
const overlapping = player.intersectsWith(trigger);
// or:
const r = player.collidesWith(trigger);
if (r?.shapeAinB) { /* player fully inside trigger */ }
```
Works today for most pair types. `shapeAinB`/`shapeBinA` are clean containment flags.

**Simple bounce:**
```ts
const r = player.collidesWith(wall);
if (r) {
  // Reflect velocity against normal
  const dot = velocity.x * r.projectionN.x + velocity.y * r.projectionN.y;
  velocity.x -= 2 * dot * r.projectionN.x;
  velocity.y -= 2 * dot * r.projectionN.y;
  // Separate
  player.move(r.projectionV.x, r.projectionV.y);
}
```
Works today. No engine change needed.

**Anti-tunneling (fast-moving objects):**
```ts
const hit = sweepRectangle(playerBounds, deltaX, deltaY, wall);
if (hit) {
  // Move to contact point
  player.setPosition(hit.x, hit.y);
  // Optionally slide: remove normal component from remaining movement
}
```
Works today via `swept-collision.ts`. Not documented.

**Verdict:** `CollisionResponse` contains enough data for practical gameplay reactions for v0.9.0. Contact point and velocity data correctly do not exist — those belong to a physics layer.

---

## 6. How Users Should React to Collisions

### 6.1 Current pattern

The current idiomatic pattern is:

```ts
// Boolean fast-path first
if (player.intersectsWith(wall)) {
  // Full response only when needed
  const response = player.collidesWith(wall);
  if (response !== null) {
    player.move(response.projectionV.x, response.projectionV.y);
  }
}
```

Or, when the boolean gate is not needed (sparse scene, few objects):

```ts
const response = player.collidesWith(wall);
if (response !== null) {
  player.move(response.projectionV.x, response.projectionV.y);
}
```

This is workable. The API is discoverable once a user finds `projectionV`. The blocker is that zero documentation exists showing this pattern.

### 6.2 Should ExoJS add `response.separate(node)` or `resolveCollision(node, response)`?

**Recommendation: No, not before v0.9.0.**

`player.move(r.projectionV.x, r.projectionV.y)` is already three tokens. A helper method like `response.separate(player)` offers marginal ergonomic gain. It also introduces a question of responsibility: which object moves — shapeA, shapeB, or both by half? The raw vector is more flexible for game-specific solutions (e.g. only resolve Y axis for a platformer).

The correct fix is a documented recipe, not a new API.

### 6.3 Direction of concern for v0.9.0

Write one recipe showing:
- How to separate using `projectionV`
- How to classify the surface using `projectionN`
- How to use swept collision for tunneling-safe movement

These belong in docs, not in new API surface.

---

## 7. Registry/World Options Evaluated

### Option A — No world; keep pairwise explicit queries only (current state)

**Pros:**
- No hidden global state
- No registration ceremony
- Composable with any user architecture
- Quadtree is already available for users who need spatial acceleration

**Cons:**
- O(n²) user loops for many-vs-many (users must write the outer loop)
- No group/layer filtering built in

**Assessment:** Sufficient for most ExoJS use cases at v0.9.0 scale. Most 2D games have <100 dynamic collidables. Above that, users can build their own loop using `Quadtree`.

### Option B — Add a standalone `CollisionWorld` with explicit registration/query

```ts
const world = new CollisionWorld();
world.add(player, { group: 'actors' });
world.add(wall, { group: 'solid' });

for (const hit of world.query(player, 'solid')) { ... }
```

**Pros:**
- Solves the O(n²) user loop problem cleanly
- Group/layer filtering is a legitimate convenience
- Could internally use `Quadtree` for spatial acceleration

**Cons:**
- Significant overlap with what a future `PhysicsWorld` would own — adds an API that may need to be deprecated or merged
- Requires lifecycle decisions: when does an object get removed? What happens when a node is destroyed?
- Premature for v0.9.0 unless there is a concrete use case that cannot be served by manual loops
- The design is not trivial — group semantics, update vs. query separation, static vs. dynamic objects all need decisions

**Assessment:** This is the right long-term answer but the wrong pre-0.9.0 commitment. Its design should be informed by the physics layer planning it will eventually integrate with.

### Option C — Scene-owned collision registry (`scene.collisions`)

**Pros:**
- Lifecycle managed by scene — automatic cleanup on scene destroy

**Cons:**
- Tight coupling to scene graph creates a dependency from math/collision into scene lifecycle
- Harder to use across scene boundaries or in non-scene contexts
- Adds API surface to `Scene` for a feature that may belong to a separate layer

**Assessment:** Worse than Option B. Scene coupling is not warranted for a utility that is conceptually independent of the scene graph.

### Option D — Defer all registry/response layers until physics planning

**Pros:**
- No premature API commitment
- Quadtree is already usable by users who need spatial acceleration now
- Physics layer will naturally define the right ownership model for collision registration
- `sweepRectangleAgainst` / `sweepCircleAgainst` batch helpers already provide a thin multi-target layer

**Cons:**
- Users doing many-vs-many must write their own loops; no bundled convenience

**Assessment:** Correct for v0.9.0. ExoJS is explicit without needless boilerplate — a collision world that duplicates what a future physics layer should own is needless boilerplate.

**Decision: Option D.** Provide clear documentation that `Quadtree` is the intended spatial acceleration primitive for user-built collision worlds. Document the batch sweep helpers. Commit to `CollisionWorld` only as part of physics planning.

---

## 8. Collision Events Decision

**`onCollisionEnter`, `onCollisionStay`, `onCollisionExit` — rejected for v0.9.0 and deferred.**

These events require:
1. A registry that tracks every active object pair every frame
2. Previous-frame collision state per pair to compute enter/exit transitions
3. A callback or signal mechanism to fire events

Without a `CollisionWorld` registry, implementing these events requires hidden global state — a pattern ExoJS explicitly avoids. Implementing them on top of the current pairwise API would either require users to register objects (making the API not simpler than a manual loop) or scan all objects (requiring O(n²) global state).

There is also no meaningful "stay" state without a fixed timestep: in a variable-step RAF loop, "stay" would fire every frame between enter and exit, which is correct — but the semantics need to be defined alongside physics planning where fixed-step may become relevant.

**Decision:** No collision events before physics planning is complete. When `CollisionWorld` exists, `onCollisionEnter/Stay/Exit` become a natural addition on top of the per-frame query loop.

---

## 9. Physics Boundary

### What collision core owns and should keep owning

| Feature | Status | Notes |
|---------|--------|-------|
| Discrete detection (boolean) | Done | All pairs |
| Discrete detection (MTV/response) | Done | Most pairs |
| Penetration depth | Done | `overlap` |
| Contact normal / separation vector | Done | `projectionN`, `projectionV` |
| Containment flags | Done | `shapeAinB`, `shapeBinA` |
| Swept/CCD for rect-rect | Done | `sweepRectangle` |
| Swept/CCD for circle-circle | Done | `sweepCircleVsCircle` |
| Swept/CCD for circle-rect | Done (V1) | `sweepCircleVsRectangle` |
| Batch sweep against target array | Done | `sweepRectangleAgainst`, `sweepCircleAgainst` |
| Substep generator for arbitrary pairs | Done | `substepSweep` |
| Spatial index primitive | Done | `Quadtree<T>` |

### What belongs in a future physics layer

| Feature | Notes |
|---------|-------|
| Velocity integration | Physics owns motion |
| Restitution/bounce coefficient | Physics tuning |
| Mass / inertia | Physics simulation |
| Force accumulation | Physics simulation |
| Constraint solving | Physics simulation |
| Fixed timestep | Physics pre-condition; already deferred |
| Gravity / force fields | Physics simulation |
| Collision world / registry | Physics infrastructure |
| `onCollisionEnter/Stay/Exit` | Requires registry |

### Would adding a collision response layer now help or hinder later physics?

It would hinder. A `CollisionWorld` built today without physics in mind would either duplicate physics infrastructure later or constrain the physics design to be compatible with the earlier collision-world API. The current variable-step RAF model also does not commit to deterministic per-frame collision processing in a way that a physics layer would require.

The separation is clean: collision core is math, physics is simulation. Keep them separate until physics is designed.

---

## 10. Docs/Recipe Gaps

### Must before v0.9.0

| Gap | Severity | Action |
|-----|----------|--------|
| **Stale JSDoc on `getCollisionRectangleRectangle`** claiming projectionN/projectionV are zero vectors | Critical | Remove or rewrite the comment; they are not zero vectors |
| **No recipe for separation using `projectionV`** | High | Add to guide or examples |
| **`collidesWith` null ambiguity** not documented | Medium | Add JSDoc note listing unsupported pairs explicitly (Ellipse↔Ellipse, Ellipse↔Polygon, Line↔any, Point↔any, rotated SceneNode↔Ellipse) |
| **Swept collision exists but is invisible** | Medium | Add to guide; add at least one example |
| **No recipe for directional classification** (`projectionN` for floor/wall/ceiling) | Medium | Add to guide |

### Nice to have (post-0.9.0)

| Gap | Notes |
|-----|-------|
| Top-down wall blocking recipe | Complete worked example |
| Trigger zone recipe | Explain `shapeAinB` pattern |
| Simple bounce recipe | Velocity projection against `projectionN` |
| Collision pair matrix table in docs | What `collidesWith` supports vs. not |
| `Quadtree` usage guide for user-built collision loops | Spatial acceleration without CollisionWorld |
| `sweepCircleVsRectangle` V2 (corner accuracy) | Technical debt; document the V1 limitation |

---

## 11. Comparison / Scope Boundary

**PixiJS:** Rendering-focused, no collision system. ExoJS is already significantly more complete than PixiJS at the collision layer.

**Phaser (Arcade Physics):** `collide()` and `overlap()` on groups; automatic separation; velocity-coupled. The collision world and physics simulation are fused. ExoJS deliberately decouples detection from physics — this is the correct tradeoff for a runtime that will have an optional physics layer later. Phaser's approach makes the physics opinionated and hard to replace.

**Godot:** Collision shapes as separate `CollisionShape` nodes attached to `KinematicBody`/`Area2D`. The scene-component model. ExoJS taking `SceneNode implements Collidable` directly is simpler and appropriate at ExoJS' current scope. When physics arrives, a Godot-style body/area separation may make sense.

**Lightweight custom engines:** Typically provide pairwise explicit queries similar to ExoJS' current model, plus a spatial hash or quadtree. ExoJS has the quadtree; what it lacks is the integration recipe.

**What ExoJS is unusually strong at:**
- The two-tier boolean/MTV API is cleaner than most equivalent custom engines
- Sprite exact-quad collision (including skewed) is more precise than most 2D engines
- Swept collision (rarely pre-built in custom engines at this scale) is already present

**What ExoJS is unusually incomplete at:**
- Zero example code for collision response patterns
- The swept collision layer is invisible

---

## 12. Concrete Recommendations

### Keep As-Is

- `Collidable` interface and `CollisionType` discriminant — correct
- `CollisionResponse` field set — sufficient; do not add contact point pre-physics
- `intersectsWith` / `collidesWith` naming and two-tier design — correct
- `Sprite.getNormals()` / `project()` exact-quad overrides — correct
- `SceneNode.isAlignedBox` fast-path — correct
- `Quadtree<T>` as a public generic utility — correct
- `sweepRectangle`, `sweepCircleVsCircle`, batch helpers — keep and promote to docs
- No collision world, no registry, no events — correct for now

### Must Change Before v0.9.0

1. **Remove or rewrite the stale JSDoc comment on `getCollisionRectangleRectangle`.**  
   Current: "Note: `projectionN` and `projectionV` are zero vectors in this implementation."  
   Correct behavior: Both are computed with the minimum-penetration-axis normal and the full MTV. The comment was written before the implementation was completed and was never updated. This is a documentation bug that actively misleads users about the most important use case.

2. **Add a JSDoc note to `Collidable.collidesWith` listing unsupported pairs.**  
   Make explicit that `null` means either "no overlap" or "pair not implemented." List the known unsupported combinations.

3. **Add at least one worked example showing collision separation using `projectionV`.**  
   The existing `rectangles-collision.js` example only tints sprites — it does not show users how to use the collision response for gameplay. A minimal example:
   ```js
   const r = boxA.collidesWith(boxB);
   if (r) boxA.move(r.projectionV.x, r.projectionV.y);
   ```

4. **Expose `swept-collision.ts` in the guide.**  
   Add at minimum a short section noting that swept collision functions exist, what pairs they support, and when to use them over discrete detection.

### Additive Later (Post-0.9.0)

- `Polygon.project` should be rewritten to avoid per-call allocation (clone + map)
- `sweepCircleVsRectangle` V2 with proper corner handling (the current V1 limitation is documented internally but not externally)
- A `CollisionWorld` class designed together with physics planning
- `onCollisionEnter/Stay/Exit` built on top of `CollisionWorld`
- Contact point field on `CollisionResponse` (if needed by physics)
- Rotated SceneNode ↔ Ellipse response (currently returns null; could use polygon approximation like `intersectsWith` does)
- More collision examples (trigger zones, top-down blocking, bounce, platformer ground detection)

### Reject / Defer

- `CollisionWorld` or `scene.collisions` before v0.9.0 — premature; must be co-designed with physics
- `onCollisionEnter/Stay/Exit` before registry exists — requires hidden global state
- Velocity, restitution, mass, or gravity in any collision API — belongs to physics
- Fixed timestep for collision processing — belongs to physics planning
- A `resolveCollision(node, response)` helper method — the raw `projectionV` is already ergonomic enough; a helper adds API surface without meaningful gain and introduces ambiguity about which node moves

---

## 13. Direct Answers Table

| # | Question | Answer |
|---|----------|--------|
| 1 | Is current collision detection API easy enough to use? | **Yes for boolean; yes for response once discovered.** The API surface is correct. The friction is zero documentation on how to use `projectionV`. |
| 2 | Does `CollisionResponse` provide enough data for practical gameplay reactions? | **Yes.** `projectionV` gives the separation vector, `projectionN` gives the contact normal for directional classification, `shapeAinB`/`shapeBinA` handle trigger volumes. Contact point and velocity belong to physics. |
| 3 | Should ExoJS add collision response helpers before v0.9.0? | **No.** `player.move(r.projectionV.x, r.projectionV.y)` is sufficient. Add a documented recipe instead. |
| 4 | Should ExoJS add a `CollisionWorld` / registry before v0.9.0? | **No.** Defer until physics planning. Document `Quadtree` as the user-accessible spatial primitive. |
| 5 | Should collision events (`enter/stay/exit`) exist? | **Not before a registry exists.** Requires a `CollisionWorld`. Defer. |
| 6 | Is current supported-pair behavior coherent and sufficiently documented? | **Coherent but undocumented.** The null-ambiguity (no overlap vs. unsupported pair) needs a JSDoc note. Unsupported pairs should be listed. |
| 7 | How should users implement top-down wall blocking today? | `const r = player.collidesWith(wall); if (r) player.move(r.projectionV.x, r.projectionV.y);` — or use `sweepRectangle(playerBounds, dx, dy, wall)` for tunneling-safe movement. This needs a doc recipe. |
| 8 | What should be deferred to a future physics system? | Velocity integration, restitution, mass, forces, gravity, constraint solving, fixed timestep, `CollisionWorld`, collision events. |
| 9 | Should collision-related docs/examples expand before v0.9.0? | **Yes — this is the primary v0.9.0 action.** Fix the stale JSDoc comment; add a separation recipe; expose the swept collision layer in docs. |
| 10 | Final verdict | **Apply a narrow pre-0.9.0 collision cleanup.** The APIs are largely correct; the gaps are documentation and one stale comment. |

---

## 14. Final Recommendation

> **Apply a narrow pre-0.9.0 collision cleanup.**

The ExoJS collision system is materially more complete than its current documentation implies. Discrete detection covers all shape pairs for boolean queries. MTV response covers most pairs. Swept/CCD covers the critical gameplay pairs. The `Quadtree` is usable for spatial acceleration today.

The three actions before v0.9.0 are strictly bounded:

1. **Fix the stale JSDoc comment** on `getCollisionRectangleRectangle` (one-line correction).
2. **Clarify the null-ambiguity** in `Collidable.collidesWith` JSDoc (list unsupported pairs).
3. **Write a collision response recipe** (one example showing `projectionV`-based separation) and **add a swept-collision mention** in the guide.

None of these require new API surface. No `CollisionWorld`, no response helpers, no events, no physics integration is warranted before v0.9.0.

The collision system is ready for v0.9.0 modulo the documentation debt above. The detection API is already easy to use. The response data is already sufficient. The user story that was missing was not a missing API — it was a missing recipe.
