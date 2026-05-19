# Tween System API/Product Decision Review

**Date:** 2026-05-19
**Scope:** ExoJS v0.9.0 pre-release — Tween system API and product ergonomics pass
**Authority:** Current source (`src/animation/`), tests (`test/animation/`), examples, site docs — all read directly
**Status:** Decision-grade — actionable before 0.9.0

---

## 1. Executive Verdict

**Apply a narrow pre-0.9.0 cleanup pass.**

The Tween system is fundamentally well-designed and ExoJS-native. The fluent DSL shape, manager integration, scene-proxy auto-cleanup, easing library, and callback model are all correct and should ship as-is. However, one genuine behavioral bug — restarted managed tweens silently become unmanaged after their first completion — must be fixed before 0.9.0. Two supporting cleanup items (dead code in repeat handling, `@internal` method surfacing in docs) should be bundled into the same pass. A TypeScript type improvement for `to()` is strongly recommended given the TypeScript-first mandate.

Nothing requires a redesign. The total scope of work is small.

---

## 2. Current-State Audit

### 2.1 API Shape (Confirmed Against Source)

The canonical flow from source:

```ts
app.tweens.create(sprite.position)
    .to({ x: 200 }, 1.5)
    .easing(Ease.cubicInOut)
    .delay(0.2)
    .repeat(1)
    .yoyo()
    .onStart(...)
    .onUpdate(...)
    .onRepeat(...)
    .onComplete(...)
    .start();
```

**Read-only properties:** `target: T`, `state: TweenState`, `progress: number` (eased 0..1, direction-adjusted for yoyo)

**Fluent builder methods (all return `this`):** `to()`, `delay()`, `easing()`, `repeat()`, `yoyo()`, `onStart()`, `onUpdate()`, `onComplete()`, `onRepeat()`

**Lifecycle methods (all return `this`):** `start()`, `pause()`, `resume()`, `stop()`

**Special:** `chain(next: Tween): Tween` — returns `next`, not `this`, enabling `a.chain(b).chain(c)`

**Frame-driver:** `update(deltaSeconds: number): void`

**Internal (should not surface in docs):** `_attachManager(manager: TweenManager): void`

### 2.2 Manager Integration

- `Application.tweens` is a `TweenManager` — public, readonly field initialized at construction
- `Application.update()` calls `this.tweens.update(frameDelta.seconds)` — seconds, consistent with particle system
- `TweenManager` methods: `create<T>(target): Tween<T>`, `add(tween)`, `remove(tween)`, `clear()`, `update(delta): void`, `destroy(): void`
- `TweenManager.update()` returns `void` (correct; tick-method policy from prior review is already applied)
- `Scene.tweens` is a lazy-initialized `SceneTweens` proxy that:
  - forwards `create()/add()` to `app.tweens`
  - tracks tween references in a `Set<Tween>` for bulk-stop on scene destroy via `_disposeAll()`
  - throws if accessed before the scene is attached to an Application

### 2.3 Lifecycle Model

```
Idle → Active ⇄ Paused
Active → Complete (natural, all repeats exhausted)
Active | Paused → Stopped (via stop())
```

- `start()`: resets `_elapsed`, `_delayElapsed`, `_startValues`, `_startFired`, `_direction`, `_repeatCount`; sets Active. **Does NOT re-register with manager.**
- `pause()` / `resume()`: guarded state transitions; no-ops from wrong states
- `stop()`: Active/Paused → Stopped; calls `_manager?.remove(this)`; `onComplete` does NOT fire
- `_complete()`: sets Complete; calls `_manager?.remove(this)`; fires `onComplete`; calls `_chained?.start()`

**Critical gap identified:** After `complete()` or `stop()`, the tween is evicted from the manager. The `_manager` field reference is retained. Calling `start()` again sets internal state to Active but the manager no longer drives the tween. This is confirmed by source inspection and is contradicted by the `tween-basics.js` example, which relies on ping-pong restarts via `onComplete` callbacks (see §4.1).

### 2.4 Typing Model

```ts
// Current:
to(properties: Partial<Record<keyof T, number>>, duration: number): this
```

`keyof T` includes all keys of the target object, including non-numeric ones. Non-numeric properties passed to `to()` are detected at runtime in `_captureStartValues()` via `typeof val !== 'number'`, logged via `console.warn`, and skipped. TypeScript does not prevent non-numeric keys from being passed at compile time. The test file itself uses an `as never` cast to test this path, signaling awareness of the gap.

### 2.5 Behavior Semantics (Source-Verified)

| Behavior | Detail |
|----------|--------|
| Duration/delay unit | Seconds |
| Start-value capture | Lazy — first `update()` after delay expires (not at `to()` or `start()`) |
| `repeat(N)` semantics | N = additional cycles after the first; total runs = N+1 |
| `repeat(-1)` | Infinite — tested with 100+ cycles |
| `yoyo()` | Default `enabled = true`; reverses `_direction` flag per cycle |
| `onStart` | Fires once per tween lifecycle (not per repeat cycle) |
| `onRepeat` | Fires at cycle boundary, before next cycle; NOT on final completion |
| `onComplete` | Natural completion only; NOT on `stop()` |
| `onUpdate` argument | Eased progress (0..1), direction-adjusted for yoyo |
| `progress` getter | Returns `this._easing(t)` where `t` is direction-adjusted; `0` during delay phase |
| Overflow carry | Delta past cycle end carries into next cycle (prevents frame-rate timing drift) |

---

## 3. What Already Works Well

| Feature | Assessment |
|---------|-----------|
| Fluent DSL shape | Clean, consistent, ExoJS-native |
| `chain(next)` returns `next` | Correct for sequence building; well-documented inline |
| Easing library | Full Robert Penner set (30+ functions); `backIn/Out`, `elasticIn/Out`, `bounceIn/Out` included |
| Lazy start-value capture | Prevents common mutation-between-config-and-start bugs |
| Scene-bound tween proxy | Auto-cleanup on scene destroy is excellent ergonomics; lazy-initialized to avoid allocation |
| Manager snapshot during update | `[...this._tweens]` snapshot prevents mid-iteration corruption from callbacks adding/removing tweens |
| `TweenState` enum | 5 clear states with string values; the test file imports and asserts on them directly |
| `stop()` does not fire `onComplete` | Correct semantic; "interrupted" vs "completed" distinction is important for game logic |
| `yoyo()` with default parameter | `yoyo()` (no argument) and `yoyo(true)` both work |
| `repeat(-1)` infinite | Standard convention; tested |
| `onUpdate` receives eased t | Consistent with `progress` getter; direction-adjusted for yoyo |
| Manual `new Tween(target)` + `add()` | Valid standalone path; tested; documented |
| `update()` returns `void` | Consistent tick-method policy; already applied |
| `clear()` returns `this` | Correct; `clear()` is an action verb, not a tick or destructor |
| Overflow carry across cycle boundary | Prevents visible frame-rate-dependent timing glitches at cycle boundaries |
| Test coverage | 19+ tests covering interpolation, delay, easing, repeat, yoyo, pause/resume, stop, chain, callbacks, lazy snapshot, non-numeric warning |

---

## 4. Main Frictions and Gaps

### 4.1 Critical Bug: Restart After Complete/Stop Breaks Manager Tracking

**Source location:** `src/animation/Tween.ts:199–209` (`start()`), `src/animation/Tween.ts:380–391` (`_complete()`)

After `_complete()` fires, the tween calls `this._manager?.remove(this)`. The `_manager` field is cleared from the manager's `_tweens` array but the tween's own `_manager` reference is retained. If `start()` is then called on this tween, it resets all internal state and sets `_state = TweenState.Active` — but it is no longer in the manager's update loop. The tween advances internally only if the caller manually calls `tween.update()`.

**Reproduction from `examples/tweens-animation/tween-basics.js`:**

```js
const forward = app.tweens.create(pos).to({ x: 680 }, 1.2);
const backward = app.tweens.create(pos).to({ x: 120 }, 1.2);

forward.onComplete(() => backward.start()).start();
backward.onComplete(() => forward.start()); // <-- BROKEN after first cycle
```

**Trace:**

1. Init: both `forward` and `backward` are registered in manager (Idle state)
2. `forward.start()` → Active; manager drives it
3. `forward` completes → removed from manager → `onComplete` fires → `backward.start()` called
4. `backward.start()` → Active; `backward` is still in manager (was Idle, never removed) ✓
5. `backward` completes → removed from manager → `onComplete` fires → `forward.start()` called
6. `forward.start()` → Active internally... but `forward` is no longer in manager ✗

Animation silently stops after one round trip. There is no error, no warning.

**Fix:** In `start()`, call `this._manager?.add(this)`. `TweenManager.add()` already has a dedup guard (`this._tweens.includes(tween)`), so re-adding a tween that was evicted is safe. Tweens that were never managed (`_manager === null`) are unaffected.

```ts
public start(): this {
    this._state = TweenState.Active;
    this._elapsed = 0;
    this._delayElapsed = 0;
    this._startValues = null;
    this._startFired = false;
    this._direction = 1;
    this._repeatCount = this._repeatTotal;
    this._manager?.add(this); // re-register if previously evicted
    return this;
}
```

### 4.2 Dead Code in Repeat Cycle Handler

**Source location:** `src/animation/Tween.ts:324–329`

```ts
// Reset elapsed for next cycle; carry overflow.
const overflow = this._elapsed - this._duration;
this._elapsed = overflow > 0 ? Math.min(overflow, this._duration) : 0;
this._startFired = false; // allow onStart to re-fire next cycle? No — spec says once.
// Actually spec says onStart fires when actual interpolation begins.
// ... [multi-line comment debate] ...
this._startFired = true;
```

The `_startFired = false` assignment is immediately overwritten by `_startFired = true` two lines later. The inline comment documents the abandoned design consideration that produced it. The `false` line is dead code. The final decision was already made: `onStart` fires once per lifecycle. Remove the `false` assignment and the preceding comment block.

### 4.3 `_attachManager` Surfaces in Generated API Docs

**Source location:** `site/src/content/api/tween.mdx:41`

The generated API doc lists `_attachManager(manager: TweenManager): void` as a public method. The source file has `@internal` on it but the doc generator is not filtering it. The underscore prefix signals internal intent but the doc exposure contradicts it. The generated doc surface should not include `@internal` methods.

### 4.4 `to()` Type Does Not Prevent Non-Numeric Keys at Compile Time

**Source location:** `src/animation/Tween.ts:98`

```ts
// Current signature:
public to(properties: Partial<Record<keyof T, number>>, duration: number): this
```

`keyof T` for a `Sprite` target includes `texture`, `parent`, `visible`, `filters`, and every other non-numeric property. TypeScript accepts `tween.to({ texture: someTexture as unknown as number }, 1)` without complaint. The runtime guard catches this but only via `console.warn` — a silent skip in production.

The `test/animation/tween.test.ts` file uses `as never` to test the non-numeric path, itself signaling awareness that the type is incomplete:

```ts
const tween = new Tween(target).to({ x: 100, label: 999 } as never, 1.0)
```

A `NumericKeys<T>` utility type closes this gap at compile time.

### 4.5 `progress` Returns 0 During Delay Phase

**Behavior:** While `state === Active` and `_delayElapsed < _delay`, `progress` returns 0 (since `_elapsed` is 0). This is technically correct but can surprise users who observe `state === 'active'` with `progress === 0` and conclude the tween is broken. Not a bug — a documentation gap. Worth a single sentence in the `progress` getter JSDoc.

---

## 5. Comparison and Scope Boundary

### What ExoJS Tween Is

A property interpolator: given a target object, a property map, and a duration, animate those numeric properties over time with easing, delay, repeat, yoyo, callbacks, and linear sequencing. This is the correct scope for a game-runtime animation primitive.

### Comparison Frame

| System | Character | ExoJS Relationship |
|--------|-----------|-------------------|
| **tween.js** | Fluent DSL, similar property-map approach; less TypeScript-native; no manager integration | Close in spirit; ExoJS is more integrated |
| **GSAP** | Timeline-heavy, full animation authoring framework, scrubbing, plugins | ExoJS must NOT become this |
| **Godot Tween** | Scene-node integrated; auto-cleanup when owning node is freed | ExoJS `SceneTweens` proxy mirrors this concept correctly |
| **Phaser Tween** | Manager-driven, property map; per-scene tween managers | Closest overall to ExoJS in structure |
| **Unity DOTween** | `.DOMove()` extension methods; sequence chaining | ExoJS's target model is cleaner for a TS library |

### What ExoJS Core Should Own

- Single-target numeric property interpolation
- Easing (all standard curves)
- Delay, repeat, yoyo
- Lifecycle callbacks (start, update, repeat, complete)
- Linear sequencing via `chain()`
- Manager-driven or standalone update
- Scene-scoped auto-cleanup

### What ExoJS Core Should NOT Try to Become

- A GSAP-style timeline/sequence orchestrator with labels, scrubbing, and seek
- A multi-target batching system (`tweenAll([s1, s2, s3], ...)`)
- A Bezier path-following animation system
- A keyframe animation editor or playhead model
- A declarative CSS-transition replacement
- A stagger system (achievable via delays; dedicated helper is Extras territory)

---

## 6. Decision Areas

### 6.1 Creation Flow

**`app.tweens.create(target).to({...}, duration).start()` is the right canonical pattern.** The three-step chain (bind → configure → activate) is deliberate: `create()` establishes manager binding, `to()` configures the animation target, `start()` activates it. The explicit `start()` call allows pre-configuring tweens and starting them conditionally — a pattern used extensively in the examples.

**Should there be a shorthand `app.tweens.to(target, props, duration)`?**

Useful for the trivial fire-and-forget case. But it introduces a parallel creation API surface, blurs the distinction between manager registration and tween configuration, and provides no advantage over the current three-step chain for anything beyond the simplest case. The chaining examples (`tween-chains.js`, `tween-from-array.js`) all need the full form anyway.

**Verdict:** Keep current pattern as canonical. No shorthand for 0.9.0. Add later if real usage patterns justify it.

**Should standalone `new Tween(target)` remain public/documented?**

Yes. Valid for unit testing, off-screen calculations, and usage outside an Application lifecycle. `manager.add(tween)` for opting in is clean. Keep it.

### 6.2 Time Units

**Keep seconds.**

The evidence:
- `Application.update()` passes `frameDelta.seconds` to `TweenManager.update()`
- `ParticleSystem` uses `delta.seconds` for its own loop
- Tween durations in all examples use sub-2-second values (0.35, 0.6, 0.8, 1.2) — these read naturally as seconds; the millisecond equivalents (350, 600, 800, 1200) are less readable
- Game-runtime animation conventions (Unity, Godot, GSAP) all default to seconds for animation durations

The one inconsistency: `AudioBus.fadeIn(milliseconds)` and `InputBinding.threshold` use milliseconds. These are domain-appropriate — Web Audio and browser input APIs are inherently ms-native. Animation durations are not. No normalization is warranted; the domains are different.

A typed `Time` object for durations would be consistent with how `Timer` and `Clock` accept `Time` values — but the allocation overhead per `to()` call and the verbosity (`to({ x: 200 }, new Time(1.5, Time.seconds))`) make it a non-starter. Raw `number` in seconds is correct here.

**Decision: Keep seconds. No change.**

### 6.3 Target Typing

**Improve `to()` to `NumericKeys<T>` before 0.9.0.**

**Proposed type utility:**

```ts
type NumericKeys<T> = {
    [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never
}[keyof T];
```

The `-?` removes optional modifiers from the check, and `NonNullable` handles `x?: number` correctly (`NonNullable<number | undefined>` = `number`, which extends `number` → true).

**Revised `to()` signature:**

```ts
public to(properties: Partial<Record<NumericKeys<T>, number>>, duration: number): this
```

**Benefits:**
- Catches `to({ texture: t }, 1)` at compile time instead of silently at runtime
- Self-documenting: the type communicates "numeric properties only"
- Pre-existing runtime guard in `_captureStartValues()` remains as safety net for JS callers

**Edge cases assessed:**
- `x?: number` — handled by `NonNullable`
- Getter-only number properties — TypeScript `keyof T` includes them; tween write fails at runtime regardless of typing; ExoJS targets (`ObservableVector.x/y`, `SceneNode.rotation`) all have setters; this is not a practical concern
- Plain objects `{ x: 0, name: 'hello' }` — `NumericKeys` correctly produces `'x'`; `name` is excluded

**Migration cost:** Zero for correct code. Any call passing non-numeric keys was already a runtime bug; the type change promotes it to a compile-time error. The test file's `as never` cast is the only expected update.

**Should this block 0.9.0?** Yes — ExoJS is explicitly a TypeScript-first library. A visible type gap on the primary configuration method is a quality signal.

### 6.4 Sequencing and Composition

**`chain()` is sufficient for 0.9.0.**

The examples demonstrate the real expressiveness of `chain()`:

- `tween-chains.js`: 4-segment square path via `a.chain(b); b.chain(c); c.chain(d)` + `onComplete` restart
- `tween-from-array.js`: N-waypoint path built in a loop via `prev.chain(next)` — clean, programmatic

**Parallel tweens** are trivially supported today: start multiple tweens simultaneously. The manager drives all of them concurrently. No parallel API needed.

A `Sequence` or `Timeline` abstraction would add: named steps, playhead seeking, group-level pause/resume, stagger. All of these are GSAP-territory capabilities. ExoJS should not pull in that scope.

**Decision:** `chain()` is sufficient for 0.9.0. Sequence/Timeline is a valid future Extra. Reject for core.

### 6.5 Lifecycle Controls

**The `start()` fix (M1) resolves the only real lifecycle gap.**

**`stop()` vs `cancel()` naming:** `stop()` is the correct verb — it matches `start()`, `pause()`, `resume()` and communicates "interrupt without finishing." A `cancel()` alias would add surface with no semantic addition. Keep `stop()`.

**`reset()` / `restart()` methods:** Once M1 is applied, calling `start()` on a Complete/Stopped tween correctly restarts it (resets all internal state and re-registers with the manager). `restart()` would be a named alias for this exact operation. Adding an alias adds documentation surface without adding capability. Document the restart behavior on `start()` instead.

**State machine documentation:** The current docs describe the state model as one-directional (`Idle → Active → Complete/Stopped`). After M1, `start()` becomes a valid transition from any state. The JSDoc on `start()` should document that calling it after completion or stop will restart the tween.

**Callbacks as methods vs Signals:** `onStart(callback)` is correct per the DSL builder convention. Signals would imply multiple listeners and more complex lifecycle contract. Single-callback-per-event is the right shape for a per-tween animation primitive.

### 6.6 Manager API

**Current surface is sufficient.**

| Proposed API | Decision | Reason |
|--------------|----------|--------|
| `has(tween): boolean` | Reject | `remove()` is idempotent; no practical use case for checking first |
| `removeAll(target)` | Additive later | Useful "cancel all tweens for this sprite" pattern; O(n) scan is fine; not blocking |
| `app.tweens.to(target, props, duration)` | Additive later | Convenience shorthand; not needed now |

**Idle tween accumulation:** `create()` registers tweens in Idle state immediately. Idle tweens remain in the `_tweens` array until started+completed or cleared. Each frame, `tween.update()` is called on them but returns immediately (guard: `if (this._state !== TweenState.Active) return`). At typical game scale (tens to low hundreds of tweens), this is negligible. Not actionable.

**`clear()` semantics:** `clear()` removes all tweens without firing callbacks and leaves tween states unchanged. This is correct behavior for "tear everything down immediately." It returns `this` (action verb, not tick or destructor). Consistent.

### 6.7 TypeScript Typing

Covered in §6.3. Additional item:

**`chain<U extends object>(next: Tween<U>): Tween<U>`** — The current signature `chain(next: Tween): Tween` loses the generic parameter of `next`. If `next` is `Tween<Position>`, the returned `Tween` is unparameterized, losing type information for subsequent calls. Fix:

```ts
public chain<U extends object>(next: Tween<U>): Tween<U> {
    this._chained = next;
    return next;
}
```

This is a non-breaking improvement (widens return type). Low priority but correct. Classify as additive later — the type gap only matters when calling methods on the returned tween using its specific target type.

### 6.8 Runtime and Performance

No material concerns at typical game scale.

| Aspect | Assessment |
|--------|-----------|
| `_captureStartValues()` | O(k) where k = property count; called once per tween lifecycle after delay; no per-frame allocation |
| `_applyProgress()` | O(k) per frame; pure arithmetic; no allocation |
| Manager update snapshot | `[...this._tweens]` creates one array copy per frame; at hundreds of tweens this is measurable but not a practical concern for 2D game scenes |
| `console.warn` in `_captureStartValues()` | Called once per tween (not per frame); not a hot path |
| Overflow carry | Correct for frame-rate-independent timing; the `Math.min` clamp on overflow prevents glitches at very low frame rates |
| `_direction` flip for yoyo | Single arithmetic operation per cycle boundary; negligible |

No changes recommended.

---

## 7. Concrete Recommendations

### 7.A Keep As-Is

| Feature | Reason |
|---------|--------|
| Fluent DSL builder shape | Correct, ExoJS-native, established across all examples |
| `chain(next)` returns `next` | Correct by design; enables `a.chain(b).chain(c)` sequence construction |
| Seconds for duration/delay | Game-native; consistent with particle system; readable at sub-2s values |
| `repeat(-1)` for infinite | Standard convention; well-tested |
| `yoyo(enabled = true)` | Ergonomic default; common usage pattern |
| Callback registration as builder methods | Consistent with DSL convention; correct per API-consistency policy |
| `TweenState` enum (5 states) | Complete and correctly named |
| `SceneTweens` proxy | Excellent ergonomics; auto-cleanup on scene destroy; no changes needed |
| `onComplete` does not fire on `stop()` | Correct semantic; "interrupted" vs "completed" distinction |
| `new Tween(target)` + `manager.add()` | Valid standalone path; supported and tested |
| `update()` returns `void` | Tick-method policy; already correctly applied |
| Manager update snapshot | Correct for callback-safe iteration |
| Easing library (all 30+ Penner functions) | Complete; `Ease.linear` as default is correct |

### 7.B Must Change Before 0.9.0

| # | Area | Current | Proposed | Reason | Migration Cost | Blocks 0.9.0 |
|---|------|---------|----------|--------|----------------|--------------|
| **M1** | `Tween.start()` | Does not re-register with manager after eviction | Add `this._manager?.add(this)` before activating | Ping-pong restart pattern silently broken; `tween-basics.js` example produces incorrect behavior after first cycle | None — only adds correct behavior for previously-broken case | Yes |
| **M2** | `Tween.update()` repeat handler | `_startFired = false; ... _startFired = true` (dead code) | Remove `this._startFired = false` line and preceding comment block | Dead code from abandoned design decision; confusing to read; no behavior change | None | No (bundle with M1) |
| **M3** | Generated API doc | `_attachManager` appears in `tween.mdx` members list | Filter `@internal` methods from doc generator output | Public API surface should not expose internal plumbing | None | No (bundle with M1) |
| **M4** | `Tween.to()` type | `Partial<Record<keyof T, number>>` | `Partial<Record<NumericKeys<T>, number>>` with `NonNullable` wrapper | Catch non-numeric property references at compile time; TypeScript-first project obligation | Zero for correct code; test file `as never` cast becomes unnecessary | Yes |

**Complete implementation of M1:**

```ts
// src/animation/Tween.ts

public start(): this {
    this._state = TweenState.Active;
    this._elapsed = 0;
    this._delayElapsed = 0;
    this._startValues = null;
    this._startFired = false;
    this._direction = 1;
    this._repeatCount = this._repeatTotal;
    this._manager?.add(this); // re-register if previously evicted after completion/stop
    return this;
}
```

**Complete implementation of M4:**

```ts
// src/animation/Tween.ts (add before class, or in types.ts)

type NumericKeys<T> = {
    [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never
}[keyof T];

// Updated signature in Tween<T>:
public to(properties: Partial<Record<NumericKeys<T>, number>>, duration: number): this
```

### 7.C Strongly Recommended but Additive Later

| Feature | Description | Why Not Now |
|---------|-------------|-------------|
| `app.tweens.to(target, props, duration)` shorthand | One-call convenience for fire-and-forget animations | Not blocking; current three-step pattern is clean; add if real usage patterns justify |
| `chain<U>` generic fix | `chain<U extends object>(next: Tween<U>): Tween<U>` preserves type of chained tween | Low impact; most usage chains to untyped targets |
| `SceneTweens.remove(tween)` | Remove specific tween from scene tracking without stopping | Marginal gap; `stop()` is almost always the right action |
| `TweenManager.removeAll(target)` | Cancel all tweens for a given target object | Useful "clean up this sprite's tweens" pattern; not blocking |
| Document restart semantics | Explicit doc note on `start()` that calling it after Complete/Stopped restarts and re-registers | Needed after M1; low effort |
| `progress` during delay doc note | "Returns 0 while delay has not yet elapsed even though state is Active" | Prevents user confusion; one sentence |

### 7.D Reject / Defer

| Idea | Decision | Reason |
|------|----------|--------|
| Timeline/Sequence abstraction | **Reject for core** | Pulls toward GSAP; `chain()` covers the practical game need; Timeline is an Extras-level feature |
| Color-specific tween helper (`tweenColor()`, etc.) | **Reject** | `Color.r/g/b/a` are numeric getter/setter pairs; `tweens.create(sprite.tint).to({ r: 255 }, 0.5)` already works naturally today |
| Millisecond migration | **Reject** | Seconds are correct for game animation context; no benefit justifies the breaking change |
| Multi-target batch API | **Reject** | Start multiple tweens; the manager drives them concurrently; no batch API needed |
| Bezier path / spline tweening | **Defer to Extras** | Out of scope for a property interpolator; requires path representation and arc-length parameterization |
| Keyframe (multi-step) tweening | **Defer to Extras** | Build via `chain()`; a dedicated keyframe primitive is Extras territory |
| Stagger helper | **Defer to Extras** | Achievable today via `delay(i * interval)` in a loop; dedicated API is additive, not core |
| Property path strings (`"position.x"`) | **Reject** | Too magical; targeting `sprite.position` directly and tweening `x` is clean and explicit |
| Signal-based callbacks | **Reject** | Methods are correct for DSL builders; Signal would imply multi-listener contract inappropriate for per-tween events |

---

## 8. Breaking-Change Assessment

All four M-changes are additive or fix-only:

| Change | Breaking? | Migration Required |
|--------|-----------|-------------------|
| M1: `start()` re-registers with manager | Not breaking — adds behavior for a previously-broken case | None. No correct code depended on the broken restart behavior. |
| M2: Remove dead `_startFired = false` | Not breaking — zero behavior change | None. |
| M3: Filter `_attachManager` from docs | Not breaking — removes internal method from public docs | None. `_attachManager` should not have been in user code. |
| M4: `NumericKeys<T>` for `to()` | Technically breaking for TypeScript callers passing non-numeric keys | Any such call was already a runtime bug caught by `console.warn`. Promotes a runtime error to a compile-time error. Zero migration cost for correct code. |

Pre-1.0 policy applies (per `project-pre-1.0-no-backcompat` memory): clean breaks, no shims, no `warnOnce`.

**Doc and example impact:**

- `tween-basics.js` has two issues: (1) the ping-pong restart pattern was silently broken and is fixed by M1 — no code change needed in the example; (2) it uses `this._text.setText('...')` which will be removed in the public-API-consistency pass — the example will need updating when that pass ships.
- `tween.mdx`: `_attachManager` entry removed once M3 is applied.
- `Tween.start()` JSDoc: update to document restart semantics after M1.

---

## 9. ExoJS Identity Alignment

**Tween is substantially identity-aligned today. M1 + M4 complete it.**

Evaluating against the six identity pillars:

**TypeScript-first:** The current type gap in `to()` is the one visible failure. `NumericKeys<T>` resolves it. After M4, the type signature is self-documenting and compile-time safe.

**Explicit without unnecessary boilerplate:** `create().to().start()` is explicit about when activation occurs. Lazy start-value capture means the configuration and start moments are deliberately separable. No implicit magic.

**Browser-first 2D runtime:** The target model works naturally with ExoJS's own types — `ObservableVector` (`sprite.position`, `sprite.scale`), `Color` channels (`sprite.tint.r`), `SceneNode.rotation` directly on `this._sprite`, `AudioBus.volume`. No special adapter code needed for any of them. This is verified in `tween-with-yoyo.js` where `tweens.create(this._sprite).to({ rotation: 20 }, 0.8)` directly targets the sprite's rotation getter/setter.

**Game/interactive-app practical:** `chain()`, `yoyo()`, `repeat(-1)`, `onComplete`, and scene-bound auto-cleanup are all practical game patterns. The system covers what game code actually needs without unnecessary abstraction.

**Not a full animation framework:** The scope boundary is correctly held. The system does not attempt timeline authoring, keyframe editing, or path following. GSAP is for animation authoring; ExoJS Tween is for runtime game logic animation. These serve different purposes and must remain separate.

**Composable with ExoJS subsystems:** Any object with numeric properties is tweenable — `ObservableVector.x/y`, `Color.r/g/b/a`, `Sprite.rotation`, `View.zoom` (if numeric), audio bus values. No special integration code or adapter pattern required.

---

## 10. Final Recommendation

**Apply a narrow pre-0.9.0 cleanup pass.**

**The four-item pass (M1–M4):**

| Item | Change | Effort |
|------|--------|--------|
| M1 | `start()` re-registers with manager | One line added |
| M2 | Remove dead `_startFired = false` and comment | Two lines removed |
| M3 | Filter `@internal` from doc generator | Doc config change |
| M4 | `NumericKeys<T>` type constraint on `to()` | One utility type + signature update |

All four items are independently shippable with no cross-item dependencies.

After this pass:

- The one genuine behavioral bug is closed
- The type surface matches the TypeScript-first mandate
- The internal method no longer pollutes the public docs
- The dead code confusion is removed

The rest of the system — DSL shape, timing model, target model, easing library, sequencing via `chain()`, manager lifecycle, scene proxy — is correct and should ship without changes.

**Tween will be identity-aligned and production-ready for v0.9.0 after this four-item pass.**

---

## 11. Direct Answers to Specific Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Should duration and delay stay in seconds? | **Yes.** Game-native, consistent with particle system, readable. |
| 2 | Should `Tween.to(...)` become more strongly typed to numeric keys only? | **Yes, before 0.9.0.** `NumericKeys<T>` with `NonNullable` wrapper. This is M4. |
| 3 | Is `app.tweens.create(target).to(...).start()` the right canonical pattern? | **Yes.** Keep as-is. |
| 4 | Should there be a shorthand `app.tweens.to(...)` convenience API? | **Not for 0.9.0.** Add later if usage patterns justify it. |
| 5 | Should core support timelines/sequences beyond `chain()`? | **No.** `chain()` is sufficient. Timeline/Sequence is Extras territory. |
| 6 | Should color tweening get a dedicated API? | **No.** Works today via `tweens.create(sprite.tint).to({ r: 255, g: 0 }, 0.5)`. Document this. |
| 7 | Should there be `reset()` / `restart()` / `cancel()`? | **No aliases needed.** Fix `start()` to re-register (M1); document that it restarts. `stop()` covers `cancel()`. |
| 8 | Is manager lifetime/removal behavior clean enough? | **Yes, after M1.** Auto-eviction on complete/stop is correct. `clear()` and `destroy()` are correctly shaped. |
| 9 | Should standalone/manual `new Tween(target)` remain public/documented? | **Yes.** Valid path for testing, off-screen use, and non-Application contexts. |
| 10 | Does Tween already feel sufficiently ExoJS-native? | **Yes, with M1 and M4.** The one behavioral gap and one type gap are the only things preventing "yes" unconditionally today. |
