# Transform Skew / 2D Affine Completeness Decision Review

**Date:** 2026-05-20  
**Reviewer:** Claude Sonnet 4.6  
**Scope:** `src/core/SceneNode.ts`, `src/math/Matrix.ts`, `src/core/Bounds.ts`,
`src/rendering/sprite/Sprite.ts`, `src/rendering/webgl2/WebGl2SpriteRenderer.ts`,
`src/rendering/webgl2/glsl/sprite.vert`, collision/SAT pipeline

---

## 1. Executive Verdict

**Skew has already been implemented.** The most recent commit
(`feat: Text.ready, TweenManager.sequence(), skew transforms, worklet extraction`)
added `skewX`, `skewY`, and `setSkew(x, y)` to `SceneNode`. The feature is
structurally complete: dirty-flag integration, transform recomputation,
`isAlignedBox` gating, and rendering all work correctly under skew.

**One confirmed bug** must be fixed before 0.9.0: `Sprite.contains()` uses
`rotation % 90 === 0` as its AABB fast-path gate but does not check skew,
producing incorrect point-in-quad results for skewed sprites at axis-aligned
rotations. The fix is one line: replace the guard with `this.isAlignedBox`.

**Zero test coverage** for skew exists. A minimum test suite for the transform
computation and `isAlignedBox` semantics is required before 0.9.0.

The chosen API shape — scalar degree properties `skewX`/`skewY` with
`setSkew(x, y)` — is correct and needs no change.

---

## 2. Current Transform Architecture Audit

### SceneNode

`src/core/SceneNode.ts` (521 lines) is the authoritative transform container.

**Fields (lines 82–83):**
```ts
protected _skewX = 0;
protected _skewY = 0;
```

**Public API (lines 203–262):**
```ts
get skewX(): number          // degrees
set skewX(degrees: number)   // calls _setSkewDirty() on change
get skewY(): number
set skewY(degrees: number)
setSkew(x: number, y: number = x): this
```

**Dirty-flag bit (line 38):**
```ts
Skew = 1 << 5,  // 0x020
```

`SceneNodeTransformFlags.Transform` (line 39) includes `Skew`, so
`getTransform()` lazy recomputation is triggered when skew changes.

**Dirty-flag propagation (lines 508–512):**
```ts
private _setSkewDirty(): void {
  this.flags.push(SceneNodeTransformFlags.Skew);
  this._invalidateSubtreeTransform();   // descendants' GlobalTransform + BoundsRect
  this._invalidateBoundsCascade();      // own BoundsRect + ancestor Containers
}
```

Identical cascade pattern to `_setRotationDirty()` and `_setScalingDirty()` — correct.

**`isAlignedBox` (line 231):**
```ts
public get isAlignedBox(): boolean {
  return this.rotation % 90 === 0 && this._skewX === 0 && this._skewY === 0;
}
```

Correctly gates AABB fast-paths only when the node is truly axis-aligned.

**Transform computation (lines 287–325):**

```ts
public updateTransform(): this {
  if (flags.has(Rotation)) {
    _cos = Math.cos(degreesToRadians(_rotation));
    _sin = Math.sin(degreesToRadians(_rotation));
  }

  if (flags.has(Rotation | Scaling | Skew)) {
    const { x, y } = _scale;

    if (_skewX !== 0 || _skewY !== 0) {
      const shearX = Math.tan(degreesToRadians(_skewX));
      const shearY = Math.tan(degreesToRadians(_skewY));

      _transform.a =  x * _cos + shearX * _sin;
      _transform.b =  y * _sin + shearY * _cos;
      _transform.c = -x * _sin + shearX * _cos;
      _transform.d = -shearY * _sin + y * _cos;
    } else {
      _transform.a =  x * _cos;
      _transform.b =  y * _sin;
      _transform.c = -x * _sin;
      _transform.d =  y * _cos;
    }
  }

  // Translation with origin offset
  if (_rotation || _skewX !== 0 || _skewY !== 0) {
    _transform.x = ox * -_transform.a - oy * _transform.b + _position.x;
    _transform.y = ox * -_transform.c - oy * _transform.d + _position.y;
  } else {
    _transform.x = ox * -_scale.x + _position.x;
    _transform.y = oy * -_scale.y + _position.y;
  }
}
```

**Composition order:** Rotation + Scale + Skew are fused into a single 2×2
submatrix. The shear is applied as `tan(angle)` factors woven into the RS
combination, which is the standard PixiJS/Pixi convention. The effective order
is: origin-adjusted translation → rotate-scale-shear combined. This matches
the CSS `transform: rotate(r) scaleX(sx) skewX(k)` decomposition convention.

**Global transform (lines 368–380):**  
`getGlobalTransform()` copies the local transform then post-multiplies the
parent's global transform via `Matrix.combine()`. The full affine matrix
(including skew components) propagates to every descendant correctly.

### Matrix Math

`src/math/Matrix.ts` is a standard mutable 3×3 row-major affine matrix.
Layout: `| a b x | c d y | e f z |`. The `a/d` are the cosine/scale diagonal,
`b/c` are the sine/shear off-diagonal. Skew is fully representable in this
matrix without any structural change: it already lives in `b` and `c`.

`Matrix.combine()` performs full 3×3 multiplication, correctly composing any
affine transform including shear. No changes to Matrix are required.

### Bounds

`src/core/Bounds.ts` accumulates min/max coordinates. Its `addRect(rect, transform)`
path calls `rect.transform(matrix, result)` (from `Rectangle.ts`), which
transforms all four corners of the rectangle through the affine matrix and
returns the AABB of the result. This is correct: a skewed rectangle becomes a
parallelogram; the AABB correctly encloses it. Bounds computation under skew
is numerically correct.

### Collision Assumptions

**`SceneNode` (base class, non-Sprite) — conservative AABB for SAT:**

When `!isAlignedBox`, `SceneNode.intersectsWith()` and `.collidesWith()` call
`intersectionSat(this, target)`, which dispatches to `this.getNormals()` and
`this.project()`. The base SceneNode implements these by delegating to
`getBounds()` (the AABB). This means the SAT test is performed using AABB
normals — it is an AABB test, not a precise rotated/skewed quad test.

This is a pre-existing limitation (rotation also suffers from it on bare
SceneNode). It is not a new defect introduced by skew. Concrete types like
`Sprite` override these methods.

**`Sprite` — exact SAT under skew (correct):**

`Sprite.getNormals()` derives normals from actual world-space `vertices` (line
222–246). `Sprite.project()` projects the actual four vertex positions (line
253–261). Both access `this.vertices`, which reads the global transform matrix
including skew components. These overrides are numerically correct under skew.

### Rendering Backends

`WebGl2SpriteRenderer` packs `getGlobalTransform()` fields `a, b, x, c, d, y`
directly into the per-instance buffer (lines 126–133). The vertex shader
expands them as:
```glsl
worldX = a_transformAB.x * localX + a_transformAB.y * localY + a_transformAB.z;
worldY = a_transformCD.x * localX + a_transformCD.y * localY + a_transformCD.z;
```

This is the correct general affine application. Skew appears as off-diagonal
values in `b`/`c`, which the shader already handles. No shader or backend
changes are needed for skew.

---

## 3. Why Skew Matters — or Does Not

Skew's primary value is **visual and expressive**, not structural:

- **Pseudo-3D perspective tricks** — slanting floors, walls, or shadows with
  no custom shader required. A 30° skewX on a horizontal strip creates a
  convincing oblique projection effect.
- **UI squash/slant effects** — lean buttons, callout boxes, parallax title
  cards. Widely used in game menus and motion graphics.
- **Squash/stretch animation** — scale captures volume change; skew captures
  directional deformation and shear-push effects that feel physically grounded.
- **Impact / momentum effects** — a character sprite leaning into a run,
  leaning back on deceleration.
- **Text/title-card animation** — italicizing or slanting text without a
  custom font or shader.

**Without skew**, users can approximate these only with custom Mesh geometry or
shaders. The mesh path is verbose and non-reactive to the scene graph (no
dirty-flag cascade, no bounds update). Shaders add driver overhead and require
GLSL knowledge.

**Mature comparable 2D scene graphs** (PixiJS v8, Phaser 3.x, Flash/Animate)
expose `skewX`/`skewY` as first-class transform properties. Their absence in
an otherwise complete transform model is noticed by experienced users switching
from those ecosystems.

For ExoJS at v0.9.0 — a pre-release milestone aimed at feature completeness
before 1.0.0 stabilization — skew is a justified inclusion. It is a primitive
that rounds out the affine transform model without pulling in new subsystem
complexity.

---

## 4. Design Options Evaluated

### A. No Skew

The transform model without skew exposes: position / rotation / scale / origin / anchor.
A user needing a slanted effect must either:
- Apply a skew-equivalent transformation to a `Mesh` mesh manually.
- Write a custom vertex shader.
- Pre-skew the source asset.

Verdict: **rejected**. Skew was already added. More importantly, omitting it
would be a visible gap against comparable engines and would force unnecessary
complexity onto users for common visual effects.

### B. `skewX` / `skewY` Scalar Properties

```ts
node.skewX = 15;      // degrees
node.skewY = 0;
node.setSkew(15, 0);  // compound setter
```

This is what was implemented. Degree units are consistent with `rotation`.
The compound setter `setSkew(x, y)` is consistent with `setScale`, `setPosition`,
`setOrigin`. The scalar properties are consistent with how `rotation` is
exposed (not as a vector).

**Assessment:** correct shape. Skew is semantically a two-component angular
quantity, but the useful mutation pattern is usually atomic (set both axes
together). Scalar properties with a compound setter are the right ergonomic choice.

### C. `skew: ObservableVector`

```ts
node.skew.x = 15;
node.skew.y = 0;
```

**Rejected.** Every other `ObservableVector` property (`position`, `scale`,
`origin`, `anchor`) serves a use case where per-axis independent mutation is
valuable — moving along one axis only, binding an animation target to a single
component. Skew has no analogous per-axis use case. The `.x` / `.y` naming on
a property called `skew` is also less immediately clear than `skewX` / `skewY`
which matches every other 2D engine's naming convention.

Adding an `ObservableVector` for skew would also require a new heap allocation
(the vector object) and a callback reference, whereas scalar properties carry
zero overhead beyond the `if` guard on change. Consistency with `rotation`
(scalar, degrees) is the right model.

### D. Generic Affine / Custom Matrix Override

```ts
node.transformMatrix = customMatrix;
```

**Rejected.** The existing architecture deliberately separates semantic
transform components (position, rotation, scale, skew) from the composed
matrix. Allowing raw matrix override bypasses the dirty-flag system, invalidates
bounds semantics, and exposes the homogeneous row maintenance concern to users.
There is no evidence in the codebase that this was ever considered, and the
implementation complexity (bounds, collisions, global transform cascade) would
be substantial with little benefit over simply expressing the desired transform
as a combination of the provided primitives.

---

## 5. Recommended Public API

**The API as implemented is correct. No changes needed.**

```ts
// Scalar properties — degrees, consistent with rotation
node.skewX = 15;        // shears along X: positive leans top-right
node.skewY = -5;        // shears along Y: positive leans left-edge down
node.setSkew(15, -5);   // compound setter, chainable: this
node.setSkew(10);       // skewX = skewY = 10 (matches setScale/setOrigin convention)

// Read-back
const kx = node.skewX;  // number, degrees
const ky = node.skewY;
```

**Units:** degrees. Consistent with `rotation`. Internally converted to
radians, then to slope via `Math.tan()`.

**Composition order:** Rotation, scale, and skew are fused into the 2×2
submatrix in a single pass. The combined formula is equivalent to:
`M = translate(pos) × scale(sx, sy) × rotate(r) × skew(kx, ky) × translate(-origin)`
where skew is applied as the shear matrix
`| 1       tanKx |`
`| tanKy   1     |`.

**Interaction with parent transforms:** Global transform composes correctly via
`Matrix.combine()`. Skew in a parent propagates to children through the normal
global-transform cascade — no special handling needed.

**Interaction with anchor:** `anchor` drives `origin`, which is applied as a
pre-translate before the rotation/scale/skew step. Origin offset under skew is
computed correctly in `updateTransform()` using the composed `a/b/c/d` values.

**Interaction with bounds:** `Bounds.addRect(localBounds, globalTransform)` →
`Rectangle.transform(matrix)` transforms all four corners — correct under skew.

---

## 6. Implementation Impact

### SceneNode

**Status: complete.**

- New private fields: `_skewX`, `_skewY` — done.
- Dirty flag bit: `SceneNodeTransformFlags.Skew = 1 << 5` — done.
- `_setSkewDirty()` with full cascade — done.
- `SceneNodeTransformFlags.Transform` includes `Skew` — done.
- Getters/setters with change guard — done.
- `setSkew(x, y)` compound setter — done.
- `isAlignedBox` gated on `_skewX === 0 && _skewY === 0` — done.
- `updateTransform()` shear computation via `Math.tan()` — done.

### Matrix

**Status: complete. No changes needed.**

The 3×3 affine matrix already supports arbitrary shear in the `b`/`c` slots.
`Matrix.combine()` performs full multiplication, preserving shear through
parent-child composition. No new methods are required.

`Matrix` does not expose a dedicated `skew()` helper method (unlike `rotate()`
and `scale()`). This is acceptable — the method would rarely be called directly
since skew is set at the SceneNode level. It is a minor omission, not a gap.

### Bounds / Collision / Interaction

**Bounds: correct.** `Rectangle.transform(matrix)` applies the full affine
matrix to all four corners and returns the AABB. Correct under skew.

**`Sprite.contains()`: BUG — must fix before 0.9.0.**

`src/rendering/sprite/Sprite.ts` line 269:
```ts
// Current (wrong for skewed sprites):
if (this.rotation % 90 === 0) {

// Correct:
if (this.isAlignedBox) {
```

When `skewX !== 0 || skewY !== 0` and `rotation % 90 === 0`, the node
is **not** an axis-aligned box, but the current guard takes the AABB fast
path anyway. `getBounds().contains(x, y)` tests against the AABB of the
skewed quad, which over-approximates: points in the AABB corners but outside
the actual parallelogram return `true` incorrectly.

The exact quad test below the guard (`dotA/lenA/dotB/lenB`) is correct for
any convex quadrilateral, including parallelograms. The only change needed is
the guard condition.

**Base SceneNode SAT collision: pre-existing AABB approximation.**

`SceneNode.getNormals()` → `getBounds().getNormals()` (AABB normals).
`SceneNode.project()` → `getBounds().project()` (AABB projection).
SAT on a bare SceneNode uses AABB normals regardless of rotation or skew.
This is a conservative over-approximation (false positives possible, no false
negatives). It predates skew and is outside the scope of this decision.
`Sprite` overrides both methods with exact vertex-based implementations.

**InteractionManager:** uses `getBounds()` for quadtree hit-testing, which is
AABB. This is the correct approximation for spatial indexing. Precise
point-in-quad is performed by `contains()` — the bug above affects pointer
hit-testing for skewed sprites. Fixing `contains()` also fixes interaction
accuracy.

### Rendering Backends

**Status: complete. No changes needed.**

WebGL2: `WebGl2SpriteRenderer` packs `getGlobalTransform().{a, b, x, c, d, y}`
into the per-instance buffer. The vertex shader applies the affine transform
generically. Skew flows through as off-diagonal values in `b`/`c`.

WebGPU: same architecture — `getGlobalTransform().toArray()` is consumed as a
`mat3` uniform. Full affine, no decomposition.

Particle system: passes `getGlobalTransform()` as a matrix uniform; particle
SoA data does not decompose transforms. Skew in a `ParticleSystem`'s transform
is correctly applied to the system's world transform.

**cacheAsBitmap / filters:** Both use `getBounds()` to size the offscreen
render texture. The AABB bounds are correct (and necessarily conservative) for
caching skewed content.

### Tests / Docs / Examples

**Tests: none exist — must add before 0.9.0.**

There are no test files in `src/` (`Glob('**/*.test.ts', 'src/')` returns
empty). Skew also has no coverage anywhere else. Minimum required test cases:

1. `setSkew(30, 0)` → `_transform.a/b/c/d` match expected shear-rotation-scale
   formula at known angles.
2. `skewX = 0, skewY = 0` → `updateTransform()` takes the non-skew fast path
   (same result as zero rotation).
3. `isAlignedBox` returns `false` when `skewX !== 0` even at `rotation = 0`.
4. `isAlignedBox` returns `true` only when `rotation % 90 === 0 && skewX === 0
   && skewY === 0`.
5. Dirty-flag propagation: setting `skewX` marks `Transform`, `GlobalTransform`,
   and `BoundsRect` dirty.
6. `Sprite.contains()` after fix: point inside AABB but outside parallelogram
   returns `false` for a skewed sprite.

**Docs:** The transform API guide (if one exists) should document `skewX`,
`skewY`, and `setSkew`. The `isAlignedBox` semantics note should mention that
skew breaks axis-alignment.

**Examples:** A skew animation example (tween `skewX` to simulate perspective
lean, squash/stretch) would demonstrate practical use.

---

## 7. Product Relevance and Comparison Context

| Use case | Value without skew | Value with skew |
|---|---|---|
| Pseudo-3D floor/wall | Mesh required | `setSkew()` in one line |
| UI slant effects | Pre-skew asset or shader | Property animation |
| Squash/stretch (full) | Scale only (flat-feeling) | Scale + skew (directional) |
| Impact / lean | Position offset approximation | Exact shear deformation |
| Text slant animation | Custom font or shader | `skewX` tween on Text node |

PixiJS v8, Phaser 3, Adobe Animate, and most Flash-lineage frameworks expose
`skewX`/`skewY` as first-class properties. Users migrating from those
ecosystems will look for them immediately. Their absence in a 0.9.0 changelog
would register as a gap.

The feature is lightweight: it adds two scalar fields and a few branches in
`updateTransform()`. The implementation cost is low; the expressive ROI is high.

---

## 8. Recommendation Table

| Area | Status | Verdict |
|---|---|---|
| `skewX` / `skewY` scalar properties | Implemented | Keep — correct API |
| `setSkew(x, y)` compound setter | Implemented | Keep |
| Degree units (consistent with `rotation`) | Implemented | Keep |
| `SceneNodeTransformFlags.Skew` dirty bit | Implemented | Keep |
| `isAlignedBox` skew gate | Implemented | Keep |
| Transform computation (`Math.tan` shear) | Implemented | Keep |
| Global transform cascade | Implemented | Keep |
| Bounds under skew | Correct | Keep |
| Rendering backends (WebGL2, WebGPU) | Correct, no changes | Keep |
| **`Sprite.contains()` guard** | **Bug (line 269)** | **Must fix before 0.9.0** |
| Skew test coverage | None | **Must add before 0.9.0** |
| `skew: ObservableVector` API option | Not implemented | Reject |
| Generic `transformMatrix` override | Not implemented | Reject |
| `Matrix.skew()` helper method | Not present | Additive later (low priority) |
| Transform guide docs update | Not done | Additive before 0.9.0 |

---

## 9. Breaking-Change and Migration Assessment

Skew properties default to `0`. Existing code that does not set skew observes
identical behavior. The feature is purely additive.

The `Sprite.contains()` fix (replacing `rotation % 90 === 0` with `isAlignedBox`)
is a behavior change only when skew is non-zero. It is a correctness fix, not
a breaking change. Code that never sets skew is unaffected.

---

## 10. Direct Answers Table

| Question | Answer |
|---|---|
| Should skew be exposed as `skewX`/`skewY`, `skew: ObservableVector`, both, or not at all? | `skewX`/`skewY` scalar properties only — already implemented, correct |
| Should there be `setSkew(x, y): this`? | Yes — already present |
| Should skew units be degrees, radians, or slope? | Degrees — consistent with `rotation`, implemented correctly |
| Exact composition order? | Fused rotate-scale-skew → `a = sx·cos + tanKx·sin`, etc. Origin pre-translate applied after; parent post-multiplied via `Matrix.combine()` |
| How does skew interact with origin? | Origin offset computed using composed `a/b/c/d` values — correct in `updateTransform()` |
| How does skew interact with parent transforms? | Normal global-transform cascade via `Matrix.combine()` — correct |
| How should `isAlignedBox` change? | Already correct: `rotation % 90 === 0 && _skewX === 0 && _skewY === 0` |
| Collision/hit-testing correct under skew? | `Sprite` SAT: correct. `Sprite.contains()`: bug (one-line fix). Base SceneNode: AABB approximation (pre-existing, not new) |
| Are bounds correct under skew? | Yes — `Rectangle.transform(matrix)` applies full affine to all four corners |
| Is this a must-have pre-0.9.0 feature? | Yes — already implemented. The bug fix and tests are the 0.9.0 obligation |

---

## 11. Final Recommendation

**Add skew before 0.9.0 — decision is moot: it has been added.**

The implementation is structurally sound. Two items remain before 0.9.0:

**1. Fix `Sprite.contains()` (one line):**

```ts
// src/rendering/sprite/Sprite.ts  line 269
// Before:
if (this.rotation % 90 === 0) {
// After:
if (this.isAlignedBox) {
```

This corrects point-in-quad testing and interactive hit-testing for skewed
sprites at axis-aligned rotations.

**2. Add skew test coverage.**

Minimum: transform matrix values at known angles, `isAlignedBox` semantics,
dirty-flag propagation, and the `contains()` edge case above (once fixed).

Everything else — transform computation, dirty flags, global transform cascade,
bounds, rendering — is already correct and requires no changes.
