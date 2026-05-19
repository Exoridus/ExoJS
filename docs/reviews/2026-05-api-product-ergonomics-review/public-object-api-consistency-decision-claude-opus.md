# Public Object API Consistency Decision Review

**Date:** 2026-05-19  
**Scope:** ExoJS v0.9.0 pre-release API ergonomics pass  
**Authority:** Current source (`src/`) read directly; prior review documents not used as authority  
**Status:** Decision-grade — actionable before 0.9.0

---

## 1. Executive Verdict

**Yes — ExoJS should standardize this before 0.9.0.**

The existing API is approximately 70–75% coherent and has most of the right instincts. The remaining 25% is accumulated surface duplication: computed-read properties sitting alongside `get*()` methods, single-value `set*()` methods alongside property setters that cover the same state, and a handful of exact duplicate property names. These create genuine learnability costs: users cannot predict which form is canonical, autocomplete surfaces redundant names, and docs must explain two paths for every duplicated pair.

**Recommended overall policy (one paragraph):** ExoJS should apply a domain-specific tier policy. Stored mutable state that users touch frequently in game logic — transforms, visibility, audio levels — lives as getter/setter properties (with side effects: clamping, dirty-flagging, observer notification). Lazy-computed results that involve cache rebuilds — bounds, global transforms — are `get*()` methods only; no property alias. Multi-argument atomic setters like `setPosition(x, y)` stay as methods and return `this` for fluent chains; single-value setters that duplicate a property without adding compound arguments or chaining value should be removed. DSL builders (Tween) are always fluent and always methods. Destructive lifecycle (`destroy()`) is always `void`.

---

## 2. Current-State Diagnosis

### What ExoJS already does well

- **Transform properties are correct.** `x`, `y`, `rotation`, `scale`, `origin`, `anchor`, `visible`, `zIndex`, `cullable` are all getter/setter accessors with appropriate side effects (dirty-flagging, cache invalidation, sort-dirty marking). This is the right shape.
- **Compound setters exist and return `this`.** `setPosition(x, y)`, `setScale(x, y)`, `setOrigin(x, y)`, `setAnchor(x, y)`, `move(x, y)`, `rotate(degrees)` are all justified multi-argument or relative operations that return `this`. The ergonomics of `node.setPosition(100, 200).setRotation(45)` work correctly.
- **Tween is a well-designed DSL.** Every configuration method returns `this`, lifecycle methods return `this`, state is exposed as read-only properties (`target`, `state`, `progress`). `chain()` returning the *next* tween rather than `this` is intentional and correctly documented.
- **AudioBus is the best-shaped runtime class.** Properties for live mutable state (`volume`, `muted`, `pan`), methods for operations (`addFilter`, `removeFilter`, `fadeIn`, `fadeOut`), `destroy()` is `void`. No redundant duplicates.
- **TextStyle is clean.** All properties use getter/setter with dirty-flag, no method duplicates.
- **Container child management is consistent.** All `addChild*`, `removeChild*`, `swapChildren`, `setChildIndex` return `this`.
- **View is more consistent than SceneNode for computed reads.** View exposes `getBounds()`, `getTransform()`, `getInverseTransform()` as methods with no property aliases. This is the correct reference model.
- **Signal, Clock, Timer, AbstractVector all follow clean patterns.** Mutations return `this`, queries return values, `destroy()` is `void`.

### Where the style is currently mixed or redundant

**Category 1: Computed-read properties alongside `get*()` methods**

`SceneNode` exposes all three of:
```ts
// Property delegates to method — identical observable behavior:
get bounds(): Rectangle { return this.getBounds(); }       // lazy cache rebuild
get globalTransform(): Matrix { return this.getGlobalTransform(); }  // lazy cache rebuild
get localBounds(): Rectangle { return this.getLocalBounds(); }  // trivial stored rect
```
alongside `getBounds()`, `getGlobalTransform()`, `getLocalBounds()`. `View` only exposes `getBounds()` and correctly omits the property alias. The duplicates on `SceneNode` make the API look inconsistent with its own camera class.

**Category 2: Single-value `set*()` methods with no compound arguments**

```ts
// Each of these duplicates a property accessor with no additional arity or value:
SceneNode.setCullable(bool)       // duplicate of cullable setter
RenderNode.setCacheAsBitmap(bool) // duplicate of cacheAsBitmap setter
```

**Category 3: Property-as-thin-facade over method**

Several classes implement `property setter → method call` where the method is the real implementation:
```ts
// In SceneNode/View:
set rotation(r)       { this.setRotation(r); }
public setRotation(d) { ... return this; }

// In RenderNode:
set filters(f)           { this.setFilters(f); }
set cacheAsBitmap(v)     { this.setCacheAsBitmap(v); }

// In Drawable:
set tint(t)      { this.setTint(t); }
set blendMode(m) { this.setBlendMode(m); }

// In Text:
set text(v)  { this.setText(v); }
set style(s) { this.setStyle(s); }

// In Sprite:
set texture(t)      { this.setTexture(t); }
set textureFrame(f) { this.setTextureFrame(f); }  // NOTE: method has extra resetSize param
```

These create an implicit policy question: which is canonical? The answer is not obvious from the API surface alone.

**Category 4: Exact duplicate property names**

```ts
// SceneNode exposes identical getter/setter pairs under two names:
get parent(): Container | null      { return this._parentNode; }
set parent(p)                        { this._parentNode = p; }

get parentNode(): Container | null  { return this._parentNode; }
set parentNode(p)                    { this._parentNode = p; }
```

**Category 5: Naming aliases on value types**

`Color` exposes four redundant alias pairs: `r/red`, `g/green`, `b/blue`, `a/alpha`. Identical state, four extra properties.

`AbstractVector` exposes `direction/angle` and `length/magnitude` alias pairs. Less problematic but adds surface noise.

**Category 6: `return this` inconsistency within a family**

`TweenManager.update(deltaSeconds)` returns `this`. `Tween.update(deltaSeconds)` returns `void`. Tick methods in the same animation subsystem have different return types for the same semantic operation.

**Category 7: Timer.limit asymmetry**

`Timer.limit` has a setter but no getter. Asymmetric properties are a learnability surprise.

**Category 8: Scene partially duplicates stackMode**

`Scene.stackMode` is a direct read/write property. `getParticipationPolicy()` returns `{ mode: this._stackMode }` — a wrapper object for the same field. `setParticipationPolicy({ mode: ... })` exists for extensibility but currently only wraps `stackMode`. Minor surface noise.

---

## 3. Conventions and Standards

### Idiomatic TypeScript / JavaScript class APIs

TypeScript encourages getter/setter accessors for state with side effects and plain fields for trivial data. Methods with `return this` for builder patterns are idiomatic and well-understood. The `set*()` naming convention for methods is common but carries a mild Java connotation; idiomatic TypeScript prefers property assignment for simple state mutations.

The key TypeScript convention: **a getter/setter property is a promise that reads and writes are cheap.** A `get*()` method signals that computation may occur. Violating this — `get bounds()` that may rebuild a dirty cache — confuses readers.

### Browser DOM conventions

DOM APIs primarily use properties for live state (`element.className = 'foo'`, `el.style.opacity = '0.5'`). Computed layout values use methods: `getBoundingClientRect()`, `getComputedStyle()`. This is the canonical model: **direct state → property; computed result → `get*()`**.

### Game-engine / runtime conventions

Three.js: position/rotation/scale as plain public fields with `.set()` for compound mutation; `getWorldBoundingBox()` as explicit method; no property aliases for computed results. Phaser 3: similar property-heavy model for live state, methods for compound operations. PixiJS: mix of both; `getBounds()` method (no property), `setBlendMode()` alongside `blendMode` property.

### What matters for ExoJS specifically

ExoJS's stated identity is TypeScript-first, explicit without boilerplate, game/runtime-friendly. This means:
- Properties for live game-loop state (read/write frequently in `update()` loops) — this is what the DOM model confirms.
- Methods for initialization chains (setup code where fluent reads well) — this is where `return this` provides value.
- `get*()` for anything involving a cache or non-trivial computation — this is where the "explicit without boilerplate" identity pays off; hiding computation behind property syntax is the opposite of explicit.

---

## 4. Policy Options Evaluated

### Option A — Preserve mixed style, only fix obvious duplicates

**Verdict: Insufficient.** This leave `bounds`/`getBounds()`, `globalTransform`/`getGlobalTransform()` permanently ambiguous. The systemic rule question is never answered. Users writing docs/examples will continue choosing between forms at random.

### Option B — Property-first runtime API, methods only for compound/action operations

**Verdict: Partially correct, incomplete.** Removes redundant `set*()` methods correctly. But taken strictly, it would eliminate `setTint()`, `setBlendMode()`, `setTexture()` — methods that are genuinely useful for setup chains. A pure property-first model degrades ergonomics for initialization code:
```ts
// Property-only form is less readable in constructor-time setup:
const sprite = new Sprite(texture);
sprite.x = 100;
sprite.y = 200;
sprite.tint = Color.red;
sprite.blendMode = BlendModes.Add;
```

Option B also fails to resolve the `bounds`/`getBounds()` question — it would imply collapsing to `bounds`, hiding computation.

### Option C — Method-first mutating API

**Verdict: Rejected.** This would require `node.setVisible(false)` instead of `node.visible = false`, `node.setZIndex(1)` instead of `node.zIndex = 1`. This is the Java pattern ExoJS explicitly wants to avoid. It makes the game-loop hot path verbose.

### Option D — Domain-specific tier policy

**Verdict: Correct answer.** Different API families have different correct shapes. The policy is explicit and answerable for any new API question. See Section 5 for the full rule set.

---

## 5. Recommended Final Policy

### Rule 1: Plain public fields

**Use when:** The field carries trivial data with no side effects, no validation, no observer callbacks, and no caching.

**Examples:** `Vector.x`, `Vector.y`, `Matrix.a/b/c/d/x/y`, `OscillatorSound.frequency`, `OscillatorSound.type`, `Mesh.vertices` (readonly).

**Do not use** plain fields for state that requires clamping, dirty-flagging, or notification.

---

### Rule 2: Getter/setter accessors

**Use when:** The state has any of: validation/clamping, dirty-flag propagation, cache invalidation, observer callbacks, or object-identity-preserving copy semantics.

**Examples:** `SceneNode.rotation` (dirty-flags, normalizes), `SceneNode.zIndex` (triggers sort-dirty on parent), `AudioBus.volume` (clamps 0..2, updates Web Audio gain), `ObservableVector.x/y` (fires callback), `Color.r/g/b/a` (masks to byte range), `Container.sortableChildren` (sets sort-dirty).

**Properties must be cheap to read.** A getter that checks a dirty flag and computes/caches the result is fine IF the computation is O(1) (looking up a cached value). A getter that rebuilds a cache for the first time is borderline — prefer `get*()` in that case.

---

### Rule 3: `get*()` methods

**Use when:** The return value is lazily computed or involves non-trivial cache reconstruction triggered by dirty-flags that may cascade from distant mutations.

**Examples:** `getBounds()` (rebuilds from dirty flag, cascades from child mutations), `getGlobalTransform()` (rebuilds combining ancestor chain), `getInverseTransform()` (matrix inversion), `getTransform()` (rebuilds from dirty components), `getNormals()` (deferred from vertex mutations).

**Do NOT expose a property alias.** A property `bounds` that delegates to `getBounds()` hides the work signal and creates a dual-surface question. `View` already applies this rule correctly — copy it everywhere.

**Arguments:** `get*()` methods may take optional out-parameter arguments for write-into-existing patterns (e.g., `project(axis, result?)`). This is acceptable and used by the collision system.

---

### Rule 4: `set*()` methods

**Use when at least one of:**
1. **Multi-argument compound atomic setter:** `setPosition(x, y)`, `setScale(x, y)`, `setOrigin(x, y)`, `setAnchor(x, y)`. These are NOT redundant with a property because the property is a single `ObservableVector` reference, not two scalars.
2. **Single-value method commonly used in setup chains:** `setRotation(degrees)` — routinely chained after `setPosition()`. `setTint(color)` and `setBlendMode(mode)` — routinely chained in initialization.
3. **Parameter variation:** `setTextureFrame(frame, resetSize?)` — the `resetSize` parameter cannot be expressed through a property setter alone.

**Do NOT create** a `set*()` method that:
- Accepts one value and has no parameter variations
- Is not commonly chained in practice
- Has a property accessor that already covers the same state

**Examples to remove:** `setCullable(bool)`, `setCacheAsBitmap(bool)`, `setFilters(readonly Filter[])` (the property setter handles bulk-replace), `setText(str)`, `setStyle(style)`.

**All `set*()` methods return `this`.**

---

### Rule 5: Command methods (action verbs)

Semantic operations that change state in a way described better by a verb than a property assignment:

- **`move(x, y)`, `rotate(degrees)`** — relative delta operations. Different semantics from `setPosition`/`setRotation`. Return `this`.
- **`addChild`, `removeChild`, `addFilter`, `removeFilter`, `clearFilters`** — collection mutations. Return `this`.
- **`follow(target, options?)`, `shake(intensity, duration)`** — behavioral configurations that take rich option bags or trigger temporal effects. Return `this`.
- **`play()`, `pause()`, `stop()`, `resume()`, `start()`** — lifecycle transitions. Return `this` (they are part of fluent setup chains and repeated calls in game logic).
- **`fadeIn(ms)`, `fadeOut(ms)`** — temporal audio operations. Return `this`.
- **`destroy()`** — always `void`. Destructive, non-reversible, nothing to chain to.
- **`update(delta)`** — frame-tick methods. Return `void`. They are called by framework infrastructure, not user chains. Applies to both `Tween.update()` and `TweenManager.update()`.

---

### Rule 6: `return this` policy tiers

| Tier | Return | Examples |
|------|--------|---------|
| Always fluent | `this` | Compound mutators, DSL builders, collection mutations, lifecycle transitions |
| Frame-tick methods | `void` | `Tween.update()`, `TweenManager.update()` |
| Queries / lookups | typed value | `getBounds()`, `getChildIndex()`, `has()`, `contains()` |
| Destructive lifecycle | `void` | `destroy()` everywhere |
| `chain()` in Tween | `Tween` (next tween) | Special case — returning `next` enables chaining chain-builds |

---

## 6. System-by-System Audit

### 6.1 SceneNode

**Current state:**

| Surface | Type | Status |
|---------|------|--------|
| `x`, `y` | getter/setter | ✓ Correct |
| `rotation` | getter/setter (calls `setRotation`) | ✓ Keep both (property + method for chains) |
| `position`, `scale`, `origin`, `anchor` | getter/setter (ObservableVector copy) | ✓ Correct |
| `visible`, `zIndex`, `cullable` | getter/setter | ✓ Correct |
| `parent` | getter/setter | ✓ Keep |
| `parentNode` | getter/setter | ✗ **Remove — exact duplicate of `parent`** |
| `childOrder` | getter only | ✓ Correct |
| `isAlignedBox` | getter | ✓ Correct |
| `bounds` property | getter → `getBounds()` | ✗ **Remove — property delegates to method, hides work** |
| `globalTransform` property | getter → `getGlobalTransform()` | ✗ **Remove — same reason** |
| `localBounds` property | getter → `getLocalBounds()` | ✗ **Remove — same reason** |
| `setPosition(x, y)` | method, `this` | ✓ Keep (compound) |
| `setRotation(degrees)` | method, `this` | ✓ Keep (chains: `setPosition(100, 200).setRotation(45)`) |
| `setScale(x, y)` | method, `this` | ✓ Keep (compound) |
| `setOrigin(x, y)` | method, `this` | ✓ Keep (compound) |
| `setAnchor(x, y)` | method, `this` | ✓ Keep (compound) |
| `move(x, y)` | method, `this` | ✓ Keep (relative delta operation) |
| `rotate(degrees)` | method, `this` | ✓ Keep (relative delta operation) |
| `setCullable(bool)` | method, `this` | ✗ **Remove — single bool, no compound, no chaining use case** |
| `setChildOrder(order)` | method, `this` | **Marginal — used internally by Container; consider making `@internal`** |
| `getBounds()` | method, `Rectangle` | ✓ Keep — canonical form |
| `getGlobalTransform()` | method, `Matrix` | ✓ Keep — canonical form |
| `getLocalBounds()` | method, `Rectangle` | ✓ Keep — canonical form |
| `getTransform()` | method, `Matrix` | ✓ Keep |
| `updateTransform()` | method, `this` | Keep as `this` for internal chaining use in `getTransform()` |
| `updateBounds()` | method, `this` | Keep as `this` for overrideable update chain |
| `updateParentTransform()` | method, `this` | Keep as `this` |
| `destroy()` | method, `void` | ✓ Correct |

**`_invalidate*` methods returning `void`:** Correct — these are internal `@internal` hooks, not user-facing.

---

### 6.2 RenderNode

| Surface | Type | Status |
|---------|------|--------|
| `interactive` | getter/setter (registers with manager) | ✓ Correct |
| `draggable` | plain public field | ✓ Correct (no side effects) |
| `cursor` | plain public field | ✓ Correct |
| `onPointerDown` etc. | `readonly Signal` fields | ✓ Correct |
| `filters` getter | returns array ref | ✓ Keep |
| `filters` setter | calls `setFilters()` | ✗ **Remove setter. Property getter is fine; bulk-replace via `clearFilters()` + `addFilter()` or direct array operations** |
| `setFilters(readonly Filter[])` | method, `this` | ✗ **Remove — `filters = [...]` covers it once the setter is made direct** |
| `addFilter(filter)` | method, `this` | ✓ Keep — distinct operation, not covered by property |
| `removeFilter(filter)` | method, `this` | ✓ Keep |
| `clearFilters()` | method, `this` | ✓ Keep |
| `mask` | getter/setter | ✓ Correct (validation: rejects self-as-mask) |
| `cacheAsBitmap` | getter/setter (calls `setCacheAsBitmap`) | ✓ Keep getter; **make setter direct** (do not delegate to method) |
| `setCacheAsBitmap(bool)` | method, `this` | ✗ **Remove — single bool, property covers it** |
| `invalidateCache()` | method, `this` | ✓ Keep (used in chains: `return this.invalidateCache()`) |
| `render(backend)` | abstract method, `this` | ✓ Keep |
| `destroy()` | method, `void` | ✓ Correct |

**Note on `filters`:** The `filters` property getter correctly exposes the live array. The setter was a convenience for `node.filters = [f1, f2]` which is a valid use case. If `setFilters` is removed, the setter should be kept but made direct (not delegating to a method that no longer exists). Alternatively, keep `setFilters` as the batch-replace method and remove only the property setter — making `setFilters` the only batch-replace path. Either approach is acceptable; the key is that only ONE canonical batch-replace API exists.

---

### 6.3 Drawable

| Surface | Type | Status |
|---------|------|--------|
| `tint` getter | returns Color ref | ✓ Keep |
| `tint` setter | calls `setTint()` | **Keep** (common in game loop: `sprite.tint = currentColor`) |
| `setTint(color)` | method, `this` | **Keep** (common in setup chains: `sprite.setTint(Color.red).setBlendMode(...)`) |
| `blendMode` getter | returns enum value | ✓ Keep |
| `blendMode` setter | calls `setBlendMode()` | **Keep** (direct assignment in logic) |
| `setBlendMode(mode)` | method, `this` | **Keep** (fluent chains) |
| `render(backend)` | method, `this` | ✓ Correct |

**Decision for `tint`/`blendMode`:** Keep both property and method. These two are the justified exception to the "no duplicate" rule because:
1. The property setter (`sprite.tint = liveColor`) is genuinely useful in per-frame game logic where you want a simple assignment.
2. The method form (`sprite.setTint(color).setBlendMode(...)`) is genuinely useful in setup chains.
3. Both are semantically distinct use patterns, not just two spellings of the same thing.

The implementation where property setter calls the method is the correct inversion: method is canonical, property is convenience alias.

---

### 6.4 Tween

| Surface | Type | Status |
|---------|------|--------|
| `target` | getter | ✓ Correct |
| `state` | getter | ✓ Correct |
| `progress` | getter (eased 0..1) | ✓ Correct |
| `to(props, duration)` | method, `this` | ✓ Keep |
| `delay(seconds)` | method, `this` | ✓ Keep |
| `easing(fn)` | method, `this` | ✓ Keep |
| `repeat(count)` | method, `this` | ✓ Keep |
| `yoyo(enabled?)` | method, `this` | ✓ Keep |
| `onStart(cb)` | method, `this` | ✓ Keep |
| `onUpdate(cb)` | method, `this` | ✓ Keep |
| `onComplete(cb)` | method, `this` | ✓ Keep |
| `onRepeat(cb)` | method, `this` | ✓ Keep |
| `start()` | method, `this` | ✓ Keep |
| `pause()` | method, `this` | ✓ Keep |
| `resume()` | method, `this` | ✓ Keep |
| `stop()` | method, `this` | ✓ Keep |
| `chain(next)` | method, returns `Tween` (next) | ✓ Correct by design — see below |
| `update(delta)` | method, `void` | ✓ Correct |

**`Tween.chain(next)` returning `next` is correct** and should remain. The semantic is:
```ts
// Returns 'next' so you can chain further .chain() calls:
tween1.chain(tween2).chain(tween3)
// Resulting sequence: tween1 → tween2 → tween3
```
Returning `this` here would be wrong: it would mean `.chain(next)` returns `tween1`, and subsequent `.chain(...)` calls would create multiple parallel chains off `tween1`. The current `return next` implementation is intentional and must be prominently documented.

**`TweenManager.update()` currently returns `this`.** Under the final policy (tick methods return `void`), this should return `void` for consistency with `Tween.update()`. This is a low-risk internal change.

---

### 6.5 AudioBus

AudioBus is already the best-shaped runtime class. No changes needed.

| Surface | Type | Status |
|---------|------|--------|
| `name` | readonly public field | ✓ |
| `parent` | getter | ✓ |
| `volume` | getter/setter (clamps, updates Web Audio) | ✓ |
| `muted` | getter/setter (updates Web Audio) | ✓ |
| `pan` | getter/setter (clamps, updates Web Audio) | ✓ |
| `inputNode` | getter (Web Audio node ref) | ✓ |
| `addFilter(filter)` | method, `this` | ✓ |
| `removeFilter(filter)` | method, `this` | ✓ |
| `fadeIn(ms)` | method, `this` | ✓ |
| `fadeOut(ms, opts?)` | method, `this` | ✓ |
| `destroy()` | method, `void` | ✓ |

---

### 6.6 Other Important APIs

**AbstractMedia / Sound / Music / OscillatorSound**

`AbstractMedia` has a justified use of `property setter → abstract method` because subclasses must override the implementation. The properties (`volume`, `loop`, `playbackRate`, `currentTime`, `muted`, `playing`) are convenience facades over the abstract methods. This is appropriate for abstract base classes where the implementation differs per subclass.

One notable item: `currentTime` uses `set currentTime(v) { this.setTime(v); }` while `getTime()` is the underlying abstract method. This inconsistency between `get currentTime()` / `set currentTime()` (property name) and `getTime()` / `setTime()` (method name) is a surface impurity. Consider: `currentTime` is the canonical property name (matches the DOM `HTMLMediaElement.currentTime` API, which ExoJS's Media interface likely mirrors intentionally). Keep as-is.

`OscillatorSound` uses plain public fields for `frequency`, `detune`, `type`, `envelope`, `poolSize`, `poolStrategy`, `priority`. This is correct — these are configuration values with no side effects needed, and they are read on `play()`.

**Sprite**

`setTextureFrame(frame, resetSize?)` is a justified method because `resetSize` is a meaningful second parameter that the property setter cannot express. Keep both:
- `textureFrame` setter → `setTextureFrame(frame, true)` (default behavior)
- `setTextureFrame(frame, false)` → for animation frames where size must stay constant

`setTexture(texture)` and `texture` setter: the method does `updateSource()` + `resetTextureFrame()` + `invalidateCache()`. The property setter delegates to the method. These share the same body. Keeping the method for chaining (`sprite.setTexture(tex).setPosition(...)`) and the property for direct assignment is justified given `setTexture` does non-trivial work beyond simple storage.

**Text**

`setText(str)` and `setStyle(style)` should be removed. `text` and `style` property setters are sufficient and direct assignment is the common pattern. Neither is routinely chained. After removing the methods:
```ts
// Becomes the only canonical form:
myText.text = 'Hello World';
myText.style = new TextStyle({ fontSize: 24 });
```

**Color**

`Color.red/green/blue/alpha` are exact aliases for `r/g/b/a` with identical getter/setter bodies. These should be removed. The short names `r/g/b/a` are idiomatic for color components in every GPU and game context. The long aliases add surface noise without functional benefit.

`AbstractVector.angle` aliases `direction`, `magnitude` aliases `length`. These are low-priority but ideally removed for a clean 1.0 surface. Before 0.9.0 is acceptable; the cost is minor.

**Timer**

`Timer.limit` has a setter but no getter. This is asymmetric and surprising — the user cannot read back the configured limit. Add a getter, or accept the asymmetry with a clear doc note. A getter is correct here.

**Scene**

`Scene.getParticipationPolicy()` returns `{ mode: this._stackMode }`. This currently wraps only `stackMode`, making it redundant. If `setParticipationPolicy` is intended for future extensibility, keep it but add a note. `getParticipationPolicy()` is the weaker half — its current return value is equivalent to `{ mode: this.stackMode }` which callers can construct themselves. Consider removing `getParticipationPolicy()` and leaving `setParticipationPolicy` for batch-update extensibility.

**View**

View is already mostly correct. The one inconsistency: `setRotation(degrees)` alongside `rotation` getter/setter follows the same justified pattern as SceneNode (rotation is routinely used in chains: `view.setZoom(2).setRotation(15).setCenter(x, y)`). Keep both.

**Matrix**

`Matrix.translate()`, `Matrix.rotate()`, `Matrix.scale()` return `Matrix` rather than `this`. This is a minor typing inconsistency — they should return `this` to properly participate in subclass chains. Low priority but correct to fix.

**Rectangle**

`Rectangle.getBounds()` returns `this.clone()` — a new Rectangle copied from self. This is semantically different from `SceneNode.getBounds()` (which returns the cached bounds computed from the subtree). The naming overlap is confusing but acceptable given the different class hierarchies.

`Rectangle.setPosition(x, y)` and `Rectangle.setSize(w, h)` are justified compound setters.

**Graphics**

`clear()` returns `this`. Under the tiered policy, `clear()` is a state-reset operation (not lifecycle `destroy()`), so returning `this` is acceptable. Keep.

---

## 7. Concrete Change Recommendations

### Must Change Before 0.9.0

| Area | Current API | Proposed API | Priority | Reason | Breaking Cost |
|------|-------------|--------------|----------|--------|---------------|
| SceneNode | `parentNode` getter/setter | Remove | P0 | Exact duplicate of `parent` | Low — `parentNode` appears to be internal plumbing, not user-facing |
| SceneNode | `bounds` property | Remove | P0 | Delegates to `getBounds()`, hides computation, inconsistent with View | Low — use `getBounds()` |
| SceneNode | `globalTransform` property | Remove | P0 | Same reason | Low — use `getGlobalTransform()` |
| SceneNode | `localBounds` property | Remove | P0 | Same reason | Low — use `getLocalBounds()` |
| SceneNode | `setCullable(bool)` | Remove | P0 | Single bool, no compound args, no chaining use case, property exists | Low — use `cullable` property |
| RenderNode | `setCacheAsBitmap(bool)` | Remove; make `cacheAsBitmap` setter self-contained | P0 | Same reasoning | Low — use `cacheAsBitmap` property |
| Color | `red/green/blue/alpha` properties | Remove all four | P0 | Identical aliases; `r/g/b/a` are idiomatic and sufficient | Low — `r/g/b/a` are the shorter, idiomatic form |
| Timer | `limit` setter-only | Add `limit` getter | P0 | Asymmetric — user cannot read back configured limit | None (additive) |

### Worth Changing If Low Effort

| Area | Current API | Proposed API | Priority | Reason | Breaking Cost |
|------|-------------|--------------|----------|--------|---------------|
| Text | `setText(str)` | Remove | P1 | Duplicate of `text` setter; no chaining use case | Low — use `text =` |
| Text | `setStyle(style)` | Remove | P1 | Duplicate of `style` setter | Low — use `style =` |
| RenderNode | `setFilters(filters)` | Remove; keep `filters` property setter direct | P1 | Property covers bulk replace | Low |
| TweenManager | `update()` returns `this` | Return `void` | P1 | Tick method; inconsistent with `Tween.update() → void` | None if callers don't chain |
| AbstractVector | `angle` alias | Remove | P2 | Alias of `direction`; surface noise | Low |
| AbstractVector | `magnitude` alias | Remove | P2 | Alias of `length`; surface noise | Low |
| Scene | `getParticipationPolicy()` | Remove | P2 | Returns wrapper object for `stackMode`; redundant | Low |
| Matrix | `translate/rotate/scale` | Return `this` instead of `Matrix` | P2 | Should be chainable in subclass contexts | None (subtype widening) |

### Keep As-Is (Explicitly Justified)

| Surface | Reason |
|---------|--------|
| `rotation` property + `setRotation()` | Both justified: property for game-loop direct assignment; method for fluent chains |
| `setPosition(x,y)`, `setScale(x,y)`, `setOrigin(x,y)`, `setAnchor(x,y)` | Multi-argument compound setters; non-redundant |
| `move(x,y)`, `rotate(degrees)` | Relative delta operations; semantically distinct from direct setters |
| `tint` property + `setTint()` | Both patterns genuinely used (loop assignment + setup chains) |
| `blendMode` property + `setBlendMode()` | Same reasoning |
| `setTexture()` + `texture` setter | Method does more (updateSource, resetFrame, invalidate); justified |
| `setTextureFrame(frame, resetSize?)` + `textureFrame` setter | Method has `resetSize` param; justified dual surface |
| `Tween.chain()` returning `Tween` (not `this`) | Correct by design for chained tween sequences |
| `Tween.update()` returning `void` | Correct; tick method |
| `AudioBus` (entire class) | Reference model; no changes needed |
| `TextStyle` (entire class) | Clean getter/setter with dirty-flag; no changes needed |

### Defer

| Surface | Notes |
|---------|-------|
| AbstractMedia `volume/loop/muted/playbackRate` setter-over-abstract-method pattern | Justified for abstract class hierarchy |
| `OscillatorSound.frequency/type/detune` as plain fields | Correct for data-class with no side effects |
| Color `r/g/b/a` vs. keeping as getter/setters with `set` | Already correct (bitmasking validation) |
| `Scene.stackMode` vs `setParticipationPolicy` cleanup beyond removing `getParticipationPolicy` | Low priority |

---

## 8. Breaking-Change Assessment

**Migration impact:** ExoJS has effectively no established external user base before 0.9.0. All breaking changes carry near-zero migration cost. No shims are warranted or worth the complexity.

**Doc/example impact:** Any existing documentation or examples that use `node.bounds`, `node.globalTransform`, `node.localBounds`, `setCullable()`, `setCacheAsBitmap()`, `setText()`, `setStyle()` or `Color.red/green/blue/alpha` must be updated to use the surviving canonical form. This is a mechanical find-and-replace operation, not a conceptual redesign.

**Shim policy:** None. Per the `project-pre-1.0-no-backcompat` memory, pre-1.0 API renames are clean breaks. No warnOnce, no deprecated aliases.

**Risk:** Low. The removed surfaces are strict subsets of still-surviving surfaces (property for property duplicates, method for method duplicates). No behavior is lost; only spelling changes.

---

## 9. Alignment with ExoJS Identity

**Does this make ExoJS feel more intentional and TypeScript-native?**

Yes, specifically:

1. **Removing computed-read property aliases** (`bounds`, `globalTransform`, `localBounds`) in favor of `get*()` methods makes the contract explicit: reading these values involves cache-aware computation. The property form hid that contract. This is more honest, not more verbose.

2. **Removing single-value `set*()` duplicates** (`setCullable`, `setCacheAsBitmap`) removes Java-style verbosity that served no ergonomic purpose. TypeScript property assignment is idiomatic; `node.cullable = false` reads naturally.

3. **Keeping compound setters** (`setPosition`, `setScale`) and **commonly-chained setters** (`setRotation`, `setTint`, `setBlendMode`) respects that ExoJS setup code genuinely benefits from fluent chains. This is not Java verbosity; it is runtime-friendly initialization ergonomics.

4. **The Tween DSL remains untouched.** Its fully-fluent DSL is an ExoJS design strength.

5. **AudioBus as the reference model** confirms the policy already works well in practice: properties for live state, methods for operations, `destroy()` is void.

The net effect: the API surface becomes smaller, more predictable, and more aligned with how a TypeScript-native developer expects to interact with objects. Users will be able to apply a simple mental model ("property for state, `get*()` for computed, `set*()` method for compound or chains") to every new class they encounter.

---

## 10. Final Decision

**Implement before 0.9.0.**

The P0 changes (Section 7, "Must Change") are mechanically straightforward, carry near-zero migration cost, and resolve the most visible systemic inconsistencies. The P1 changes are easy enough that they should be bundled into the same pass. P2 items are optional cleanup that can be deferred if time is constrained.

The specific order of operations:

1. Remove `SceneNode.parentNode`, `bounds`, `globalTransform`, `localBounds`, `setCullable()`
2. Remove `RenderNode.setCacheAsBitmap()` and make `cacheAsBitmap` setter self-contained; remove `setFilters()` and make property setter direct
3. Remove `Color.red/green/blue/alpha`
4. Add `Timer.limit` getter
5. Remove `Text.setText()`, `Text.setStyle()`
6. Change `TweenManager.update()` to return `void`

Each item is independently shippable. There are no cross-item dependencies.

**The final policy statement in one sentence:** In ExoJS, mutable state is a property, lazy-computed results are `get*()` methods, multi-argument or commonly-chained mutations are `set*()` methods returning `this`, DSL builders are always fluent, and `destroy()` is always `void`.
