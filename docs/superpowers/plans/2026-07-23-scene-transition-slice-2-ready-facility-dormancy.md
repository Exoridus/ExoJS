# Scene transition & lifecycle — Slice 2: `Ready` state & facility dormancy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a genuine `SceneState.Ready` checkpoint between `Preparing` and `Active` (`SceneScope.prepare()` now ends in `Ready`; a separate `SceneScope.activate()` step — called exactly where `activate()` is called today — commits `Ready`/`Suspended` → `Active`), make every scene-bound facility (`SceneInputs`, `SceneInteraction`, `SceneAudio`, `SceneTweens`) dormant (registrations accepted, zero application-wide runtime effect) while the owning scope is not `Active`, replace `Scene.onLoad`/`Scene.onUnload` with `Scene.onActivate`/`Scene.onSuspend`, and give lifecycle signal dispatch a dedicated exception-isolating path so a throwing listener can never abort a state transition or corrupt a `Signal`'s bookkeeping. This is spec sections §2, §2.1, §2.2, §2.2.1, §4.1, §4.2.

**Architecture:** `SceneState` gains a `Ready` member (fully prepared, never yet activated; not suspend-eligible — a discarded `Ready` scope goes through `destroy()` directly, never `suspend()`). `Signal` gains `dispatchIsolated(onError, ...params)`, a dispatch path that wraps every listener call individually, reports throws through a caller-supplied `onError` callback instead of letting them propagate, and guarantees its `_dispatching`/pending-removes bookkeeping via `finally` — used for every lifecycle signal (`Scene.onActivate`/`onSuspend`, `SceneDirector.onStateChange`/`onChangeScene`/`onStartScene`/`onStopScene`). Each scene-bound facility that reaches an app-wide subsystem (`SceneInteraction` → `InteractionManager`, `SceneTweens` → `TweenManager`) now consults the owning scope's live state at the moment a registration is made: while not `Active`, the registration is tracked locally but never forwarded to the app-wide subsystem (or, where the object may already be live, is immediately paused) — then flushed/reattached the moment the scope becomes `Active` (fresh activation or retention restore, both funnelling through the same flush logic). `SceneAudio`'s existing `PendingVoice` buffering (already `Preparing`-gated) widens to cover `Ready` and `Suspended` too, and gains an explicit reject path for `Destroying`/`Destroyed`. `SceneInputs` needs only a one-line addition (`Ready` joins its existing dispatch-time `gatedStates` blocklist) since its dormancy is already dispatch-time gated, not registration-time gated. `TweenSequencer` gains a small `_attachManager()` method (mirroring the one `Tween` already has) so `SceneTweens` can construct a sequencer without a manager while dormant and bind the real one later at flush.

**Tech Stack:** TypeScript (strict), Vitest. Builds on `origin/main @ b5aad1a3` (this worktree's base) plus PR #402/#403 (scene-pause flag separation, `onStateChange` coverage). Assumes Slice 1 (`Scene<Data, AppLike>`, registry typing) lands independently — this slice does not touch the `Scene` generic parameter list or the `app` getter, only its lifecycle-signal region and `_teardownInternals()`.

## Global Constraints

- Clean breaks only — no deprecated aliases, no shims (pre-1.0 policy).
- **Scope boundary, not an oversight:** this slice does NOT touch `SceneDirector`'s navigation orchestration shape — no rename of `setScene`/`restoreScene`/`releaseScene`, no atomic commit boundary, no removal of `_rollbackSwitch()`/the optimistic `_activeScope` reassignment. `_prepareScene()` still calls `scope.prepare(data)` then the caller still calls `newScope.activate()` immediately afterward, exactly as synchronously-sequenced as today — this slice only inserts a real `Ready` checkpoint into that existing sequence. Slice 3 owns restructuring the orchestration itself.
- **Known, deliberate, temporary inconsistency (documented, not fixed here):** after this slice, `_rollbackSwitch()`'s catch-block callers (`setScene`/`restoreScene`) become effectively unreachable in practice, because their only throw source — `_handleOutgoingScope()`'s `onStopScene`/`onStateChange` dispatches — is converted to non-throwing isolated dispatch by this same slice (§2.2.1). `_rollbackSwitch()` itself is left in place, unchanged, for Slice 3 to formally remove ("no `_rollbackSwitch()`" is explicitly Slice 3's job per the 8-slice breakdown). Likewise, a `Ready` scope discarded via the existing `newScope.destroyFailedActivation()` call in `setScene()`'s catch block skips `unload()` — spec §3.5.1's "Ready-scope cleanup" (normal `destroy()`, with `unload()`) is the eventual correct behavior, but wiring that in requires the abort/claim machinery Slice 3+ introduces. Both are noted inline in the affected files' JSDoc/comments so a future reader doesn't mistake them for accidental gaps.
- **Facility dormancy invariant (spec §4.2, applied uniformly):** a scene-bound facility may accept registrations while its owning scope is not `Active` (`Preparing`, `Ready`, `Suspended`), but must not produce an application-wide runtime effect until the scope is `Active`. `Suspended` is included deliberately — a *new* registration made while already suspended (not just while `Preparing`/`Ready`) must also buffer, not attach.
- **`SceneLoader` is the one deliberate exception** — untouched by this slice. Loader claims and background asset loading already keep working through every non-terminal state; nothing here changes that.
- A never-attached registration released before its owning scope ever activates (or while suspended) must never call the corresponding app-wide detach/remove function at all — not attach-then-immediately-detach, a true no-op (spec §4.2's explicit test invariant).
- JSDoc conventions: see `[[feedback-jsdoc-conventions]]` memory — every public export gets a doc comment; `@internal` for engine-only surface.
- `pnpm docs:api:generate` must be run and committed before the final push (push-gated) — `Scene.onActivate`/`Scene.onSuspend` are new public exports.
- Every task ends green on its own scoped test command before moving to the next. Full-repo `pnpm typecheck`/`pnpm lint`/`pnpm test:core` runs are reserved for the final task (Task 11) — earlier tasks use targeted `pnpm vitest run <file>` commands per the user's own stated preference for narrow verification during iteration.
- `examples/application-scenes/scene-lifecycle.ts`/`.js` reference the removed `Scene.onLoad`/`onUnload` — fixed in Task 8 as part of the same commit that removes the signals (left broken even transiently would fail `pnpm lint`/`pnpm typecheck:examples`, and there is no reason to defer a 15-line, mechanical fix to Slice 8).

---

## File Structure

```text
src/core/
├── SceneState.ts               (modified) — Ready state, canSuspend/canRestore doc updates
├── Signal.ts                   (modified) — dispatchIsolated()
├── Scene.ts                    (modified) — remove onLoad/onUnload, add onActivate/onSuspend
├── SceneScope.ts                (modified) — Ready checkpoint in prepare(); activate()/restore()/
│                                                suspend() reordered to spec §2.1; facility
│                                                constructor wiring (getState for interaction/tweens)
└── SceneDirector.ts             (modified) — isolated dispatch at every lifecycle Signal call site,
                                                 _reportLifecycleError() helper
    scene/
    ├── SceneInputs.ts            (modified) — Ready added to the existing gatedStates blocklist
    ├── SceneAudio.ts             (modified) — Ready/Suspended widen the PendingVoice gate;
    │                                            Destroying/Destroyed reject
    ├── SceneInteraction.ts       (modified) — getState ctor param; per-entry `attached` flag
    │                                            replaces the single `_suspended` boolean
    └── SceneTweens.ts            (modified) — getState ctor param; cold-buffering for
                                                  create()/add()/createSequencer()

src/animation/
└── TweenSequencer.ts            (modified) — _attachManager() (mirrors Tween._attachManager)

examples/application-scenes/
├── scene-lifecycle.ts           (modified) — onLoad/onUnload → onActivate/onSuspend
└── scene-lifecycle.js           (modified) — hand-mirrored to match (normally auto-generated;
                                                 the generator is a separate site-package build
                                                 out of this slice's scope — Slice 8 re-verifies it)

test/core/
├── scene-state.test.ts          (modified) — Ready-related guard assertions
├── signal.test.ts               (modified) — dispatchIsolated tests
├── scene-scope.test.ts          (modified) — Ready checkpoint, onActivate/onSuspend,
│                                                facility-activation-order tests
└── scene-director.test.ts       (modified) — isolated-dispatch tests; two now-obsolete
                                                 rollback tests rewritten (§2.2.1); two
                                                 onStateChange-count assertions updated for the
                                                 new Preparing→Ready→Active split
    scene/
    ├── scene-inputs.test.ts       (modified) — Ready row added to the availability matrix
    ├── scene-audio.test.ts        (modified) — Ready/Suspended/Destroying/Destroyed dormancy
    ├── scene-interaction.test.ts  (modified) — ctor getState param (18 call sites); new
    │                                             dormancy tests
    └── scene-tweens.test.ts      (modified) — ctor getState param; new cold-buffering tests
```

---

## Task 1: `SceneState.ts` — the `Ready` state

**Files:**

- Modify: `src/core/SceneState.ts`
- Test: `test/core/scene-state.test.ts`

**Interfaces:**

- Produces: `SceneState.Ready` (new enum member, string value `'ready'`). `canSuspend`/`canRestore`/`canDestroy` signatures unchanged — only their JSDoc gains a note about `Ready`. Consumed by every later task in this plan.

- [ ] **Step 1: Write the failing test**

Add to `test/core/scene-state.test.ts`, inside the existing `describe('SceneState guards', ...)` block:

```ts
  test('canSuspend is false for Ready — a scope that never activated has nothing live to suspend', () => {
    expect(canSuspend(SceneState.Ready)).toBe(false);
  });

  test('canRestore is false for Ready', () => {
    expect(canRestore(SceneState.Ready)).toBe(false);
  });

  test('canDestroy is true for Ready', () => {
    expect(canDestroy(SceneState.Ready)).toBe(true);
  });
```

And update the existing string-enum test:

```ts
  test('is a string enum (never const enum) — values are readable at runtime', () => {
    expect(SceneState.Preparing).toBe('preparing');
    expect(SceneState.Ready).toBe('ready');
    expect(SceneState.Active).toBe('active');
    expect(SceneState.Suspended).toBe('suspended');
    expect(SceneState.Destroying).toBe('destroying');
    expect(SceneState.Destroyed).toBe('destroyed');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene-state.test.ts`
Expected: FAIL — `SceneState.Ready` is `undefined`.

- [ ] **Step 3: Implement**

Replace the full contents of `src/core/SceneState.ts`:

```ts
/**
 * Lifecycle state of one {@link Scene} activation, owned by its internal
 * `SceneScope` and exposed read-only via {@link Scene.state}. State is
 * read-only from user code — it changes only in response to director-driven
 * lifecycle events: preparation, activation, retention (suspend/restore),
 * and teardown. Pause is not a state — it is an orthogonal flag that only
 * applies while `Active`; see {@link Scene.paused}.
 *
 * | State | fixed/update | draw | input & interaction | meaning |
 * |---|---:|---:|---|---|
 * | `Preparing` | no | no | registrations accepted, dispatch gated | `load()`/`init()` running |
 * | `Ready` | no | no | registrations accepted, dispatch gated | fully prepared, never yet activated |
 * | `Active` (not paused) | yes | yes | active | live |
 * | `Active` (paused) | no | yes | pause-policy filtered | live, simulation frozen |
 * | `Suspended` | no | no | registrations accepted, dispatch gated | previously active, retained |
 * | `Destroying` / `Destroyed` | no | no | disabled | permanent teardown |
 */
export enum SceneState {
  /** `load()` or `init()` is running. Facilities accept registrations, but nothing dispatches, ticks, or plays yet. */
  Preparing = 'preparing',
  /**
   * Fully prepared (`load()`/`init()` both completed) but never yet
   * activated — a genuine, cold checkpoint between preparation and going
   * live. Facilities keep accepting registrations (definition §4.2), but
   * still nothing dispatches, ticks, plays, or produces any
   * application-wide runtime effect. Transient for an ordinary activation
   * (immediately followed by {@link SceneScope.activate}); can be
   * longer-lived for a pre-warmed scene in a later slice. Not
   * suspend-eligible — see {@link canSuspend}: a `Ready` scope that is
   * discarded before ever activating is torn down via `destroy()` directly,
   * never via {@link SceneScope.suspend}.
   */
  Ready = 'ready',
  /** Normal visible scene: fixed/update/draw all run, input and interaction dispatch normally — unless {@link Scene.paused} is set, which freezes fixed/update. */
  Active = 'active',
  /** Retained but inactive: no fixed/update/draw, no scene input or interaction dispatch. */
  Suspended = 'suspended',
  /** Permanent teardown is in progress. */
  Destroying = 'destroying',
  /** Terminal state — permanent teardown has completed. */
  Destroyed = 'destroyed',
}

/**
 * `true` when the scene can be suspended for retention (`Active` →
 * `Suspended`). Deliberately excludes `Ready`: a scope that finished
 * preparing but was never activated has nothing live to suspend — it is
 * discarded via `destroy()` instead (see {@link SceneState.Ready}).
 */
export function canSuspend(state: SceneState): boolean {
  return state === SceneState.Active;
}

/** `true` when the scene can be restored from retention (`Suspended` → `Active`). */
export function canRestore(state: SceneState): boolean {
  return state === SceneState.Suspended;
}

/** `true` when the scene can begin permanent teardown — anything other than an already-destroying or already-destroyed scene. */
export function canDestroy(state: SceneState): boolean {
  return state !== SceneState.Destroying && state !== SceneState.Destroyed;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/scene-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/SceneState.ts test/core/scene-state.test.ts
git commit -m "feat(core): add SceneState.Ready"
```

---

## Task 2: `Signal.ts` — `dispatchIsolated()`

**Files:**

- Modify: `src/core/Signal.ts`
- Test: `test/core/signal.test.ts`

**Interfaces:**

- Produces: `Signal.dispatchIsolated(onError: (error: unknown) => void, ...params: Args): this`. Consumed by Task 8 (`Scene.onActivate`/`onSuspend`) and Task 9/10 (`SceneScope`/`SceneDirector` lifecycle dispatch sites).

Verified against the current file (`src/core/Signal.ts:104-119`): `dispatch()` has no `try`/`catch` around the listener loop, never reaches `this._dispatching = false` if a listener throws (no `finally`), and never processes `_pendingRemoves` in that case either — exactly the three defects spec §2.2.1 names.

- [ ] **Step 1: Write the failing tests**

Add to `test/core/signal.test.ts`, as a new top-level `describe` block:

```ts
describe('dispatchIsolated', () => {
  it('calls onError and continues to the remaining listeners when one throws', () => {
    const signal = new Signal();
    const calls: string[] = [];
    const errors: unknown[] = [];
    const failure = new Error('listener boom');

    signal.add(() => calls.push('a'));
    signal.add(() => {
      throw failure;
    });
    signal.add(() => calls.push('c'));

    signal.dispatchIsolated(error => errors.push(error));

    expect(calls).toEqual(['a', 'c']);
    expect(errors).toEqual([failure]);
  });

  it('a throwing onError itself never propagates out of dispatchIsolated', () => {
    const signal = new Signal();

    signal.add(() => {
      throw new Error('listener boom');
    });

    expect(() =>
      signal.dispatchIsolated(() => {
        throw new Error('onError boom');
      }),
    ).not.toThrow();
  });

  it('a handler returning false still short-circuits the remaining listeners (unaffected by isolation)', () => {
    const signal = new Signal();
    const calls: string[] = [];

    signal.add(() => {
      calls.push('a');

      return false;
    });
    signal.add(() => calls.push('b'));

    signal.dispatchIsolated(() => {});

    expect(calls).toEqual(['a']);
  });

  it('_dispatching is always cleared via finally, even after a throw — a later dispatch is not corrupted', () => {
    const signal = new Signal();
    const calls: string[] = [];

    signal.add(() => {
      throw new Error('first dispatch boom');
    });

    signal.dispatchIsolated(() => {});

    signal.add(() => calls.push('second-dispatch-listener'));
    signal.dispatch();

    expect(calls).toEqual(['second-dispatch-listener']);
  });

  it('a listener removing itself mid-dispatch (via isolated dispatch) is still deferred correctly', () => {
    const signal = new Signal();
    const calls: string[] = [];
    let selfRemoving: () => void;

    selfRemoving = () => {
      calls.push('self');
      signal.remove(selfRemoving);
    };

    signal.add(selfRemoving);
    signal.add(() => calls.push('other'));

    signal.dispatchIsolated(() => {});
    expect(calls).toEqual(['self', 'other']);
    expect(signal.has(selfRemoving)).toBe(false);

    calls.length = 0;
    signal.dispatchIsolated(() => {});
    expect(calls).toEqual(['other']);
  });

  it('returns this for chaining', () => {
    const signal = new Signal();

    expect(signal.dispatchIsolated(() => {})).toBe(signal);
  });

  it('is a no-op (does not call onError) when there are no listeners', () => {
    const signal = new Signal();
    const onError = vi.fn();

    signal.dispatchIsolated(onError);

    expect(onError).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/signal.test.ts`
Expected: FAIL — `signal.dispatchIsolated is not a function`.

- [ ] **Step 3: Implement**

In `src/core/Signal.ts`, add immediately after the existing `dispatch()` method (before `destroy()`):

```ts
  /**
   * Notify every registered listener in registration order, isolating each
   * listener's exceptions individually instead of letting the first throw
   * abort the whole dispatch — used for lifecycle signals
   * (`Scene.onActivate`/`onSuspend`, `SceneDirector.onStateChange`/
   * `onChangeScene`/`onStartScene`/`onStopScene`) where a listener must
   * never be able to abort a state transition that already happened, or
   * silently prevent every listener registered after it from running.
   *
   * A throwing listener is reported to `onError` (itself guarded — a
   * throwing `onError` callback never propagates back into this dispatch)
   * and dispatch continues to the remaining listeners. A handler returning
   * `false` still short-circuits the rest of the dispatch exactly as
   * {@link Signal.dispatch} does — that contract is unaffected; only a
   * *throw* is isolated. `_dispatching`/pending-removes bookkeeping is
   * guaranteed via `finally`, so a throw here can never corrupt a later
   * `dispatch()`/`add()`/`remove()` call on this Signal the way an
   * unguarded throw inside {@link Signal.dispatch} would.
   */
  public dispatchIsolated(onError: (error: unknown) => void, ...params: Args): this {
    const length = this._handlers.length;

    if (!length) {
      return this;
    }

    this._dispatching = true;

    try {
      for (let i = 0; i < length; i++) {
        let result: void | boolean;

        try {
          result = this._handlers[i]!(...params);
        } catch (error) {
          try {
            onError(error);
          } catch {
            // A throwing onError listener must never propagate back into
            // the lifecycle dispatch that triggered it.
          }

          continue;
        }

        if (result === false) {
          break;
        }
      }
    } finally {
      this._dispatching = false;

      if (this._pendingRemoves !== null) {
        for (const handler of this._pendingRemoves) {
          const index = this._handlers.indexOf(handler);

          if (index !== -1) {
            removeArrayItems(this._handlers, index, 1);
          }
        }

        this._pendingRemoves = null;
      }
    }

    return this;
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/signal.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/Signal.ts test/core/signal.test.ts
git commit -m "feat(core): Signal.dispatchIsolated for exception-isolated lifecycle dispatch"
```

---

## Task 3: `SceneInputs.ts` — gate `Ready`

**Files:**

- Modify: `src/core/scene/SceneInputs.ts`
- Test: `test/core/scene/scene-inputs.test.ts`

**Interfaces:**

- No signature change. `SceneInputs`'s dormancy is already dispatch-time gated (`whenPolicyAllows` reads live state on every dispatch, not at bind time), so this is a one-line addition to the existing blocklist.

Verified (`InteractionManager.update()`, `src/input/InteractionManager.ts:303-304`) that the app-wide interaction dispatch gate is already `state !== Active` (an inverse check, not an allowlist) — it already treats `Ready` correctly with zero changes needed. `SceneInputs.gatedStates`, by contrast, is an explicit blocklist and does need `Ready` added.

- [ ] **Step 1: Write the failing test**

Add two rows to the existing table-driven test in `test/core/scene/scene-inputs.test.ts` (`describe('SceneInputs — when policy availability matrix', ...)`), in the `test.each([...])` array:

```ts
    ['active', SceneState.Ready, false, false],
    ['always', SceneState.Ready, false, false],
```

(Insert alongside the existing `SceneState.Preparing`/`SceneState.Suspended` rows — same table, same assertion shape.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene/scene-inputs.test.ts`
Expected: FAIL — with `state = Ready`, `whenPolicyAllows` does not gate (since `gatedStates` doesn't contain it yet), so `onActive` fires when it shouldn't.

- [ ] **Step 3: Implement**

In `src/core/scene/SceneInputs.ts`, change:

```ts
const gatedStates = new Set<SceneState>([SceneState.Preparing, SceneState.Suspended, SceneState.Destroying, SceneState.Destroyed]);
```

to:

```ts
const gatedStates = new Set<SceneState>([SceneState.Preparing, SceneState.Ready, SceneState.Suspended, SceneState.Destroying, SceneState.Destroyed]);
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/scene/scene-inputs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/scene/SceneInputs.ts test/core/scene/scene-inputs.test.ts
git commit -m "fix(core): gate SceneInputs dispatch during Ready"
```

---

## Task 4: `SceneAudio.ts` — widen the `PendingVoice` gate

**Files:**

- Modify: `src/core/scene/SceneAudio.ts`
- Test: `test/core/scene/scene-audio.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `SceneAudio.play()`'s behavior widens (same public signature). New private helper `_createDeadVoice(options)`. Consumed by Task 9 (`SceneScope.restore()` gains a `this.audio._flushPending()` call — already exists as a method, no signature change).

Per spec §4.2: `Preparing`/`Ready`/`Suspended` → `PendingVoice` (buffered); `Active` → real `Voice` immediately; `Destroying`/`Destroyed` → reject (dev-mode lifecycle error; production falls back to an inert, already-`ended` stand-in rather than crashing a teardown path).

- [ ] **Step 1: Write the failing tests**

Add to `test/core/scene/scene-audio.test.ts`, as a new `describe` block after the existing `describe('SceneAudio — Preparing gate', ...)`:

```ts
describe('SceneAudio — dormancy gate widens to Ready/Suspended, rejects Destroying/Destroyed', () => {
  test('play() during Ready buffers a PendingVoice, same as Preparing', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Ready);

    const pending = audio.play(fakePlayable);

    expect(app.audio.play).not.toHaveBeenCalled();
    expect(pending.ended).toBe(false);
  });

  test('play() during Suspended buffers a PendingVoice (a new registration while already dormant, not just Preparing/Ready)', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Suspended);

    const pending = audio.play(fakePlayable);

    expect(app.audio.play).not.toHaveBeenCalled();
    expect(pending.ended).toBe(false);
  });

  test('_flushPending() started during Suspended starts for real once flushed', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Suspended);

    audio.play(fakePlayable);
    audio._flushPending();

    expect(app.audio.play).toHaveBeenCalledTimes(1);
  });

  test('play() during Destroying, in dev builds, throws a lifecycle error and never buffers or plays', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Destroying);

    expect(() => audio.play(fakePlayable)).toThrow(/destroy/i);
    expect(app.audio.play).not.toHaveBeenCalled();
  });

  test('play() during Destroyed, in dev builds, throws a lifecycle error', () => {
    const voice = makeVoice();
    const app = createAppStub(voice);
    const audio = new SceneAudio(app, () => SceneState.Destroyed);

    expect(() => audio.play(fakePlayable)).toThrow(/destroy/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene/scene-audio.test.ts`
Expected: FAIL — `Suspended`/`Destroying`/`Destroyed` currently fall through to `this.add(this._app.audio.play(...))` (the "real voice immediately" branch), since today's check is only `=== SceneState.Preparing`.

- [ ] **Step 3: Implement**

In `src/core/scene/SceneAudio.ts`, replace the `play()` method:

```ts
  public play(source: Playable, options?: SceneAudioPlayOptions): Voice {
    if (this._getState() === SceneState.Preparing) {
      const pending = new PendingVoice(() => this._app.audio.play(source, options ?? {}), options ?? {});

      this._pending.add(pending);
      this._tracked.set(pending, pending.when);

      return pending;
    }

    return this.add(this._app.audio.play(source, options), options);
  }
```

with:

```ts
  /**
   * Play `source` through the application audio manager and track the
   * resulting {@link Voice} for scene-lifetime cleanup. While the scope is
   * `Preparing`, `Ready`, or `Suspended`, returns a {@link PendingVoice}
   * stand-in immediately and defers the real `app.audio.play(...)` call
   * until (re)activation — including a call made while already `Suspended`
   * (definition §4.2: a new registration while dormant must buffer, not
   * play for real, regardless of how the scope became dormant). While
   * `Destroying`/`Destroyed`, rejects instead: a dev build throws a clear
   * lifecycle error (playback requested during permanent teardown can
   * never be scheduled); a production build returns an inert, already-
   * `ended` stand-in rather than crashing a teardown path.
   */
  public play(source: Playable, options?: SceneAudioPlayOptions): Voice {
    const state = this._getState();

    if (state === SceneState.Destroying || state === SceneState.Destroyed) {
      if (__DEV__) {
        throw new Error(
          'SceneAudio.play() was called while the owning scene is being destroyed (state is "destroying"/"destroyed") — playback requested during permanent teardown can never be scheduled.',
        );
      }

      return this._createDeadVoice(options ?? {});
    }

    if (state !== SceneState.Active) {
      const pending = new PendingVoice(() => this._app.audio.play(source, options ?? {}), options ?? {});

      this._pending.add(pending);
      this._tracked.set(pending, pending.when);

      return pending;
    }

    return this.add(this._app.audio.play(source, options), options);
  }

  /**
   * Production-build fallback for {@link SceneAudio.play} called during
   * `Destroying`/`Destroyed`: an already-cancelled {@link PendingVoice}
   * whose `_createReal` callback is never invoked (a cancelled voice is
   * never flushed) — inert, but Voice-shaped, so calling code that doesn't
   * dev-guard its `play()` calls doesn't crash mid-teardown.
   */
  private _createDeadVoice(options: SceneAudioPlayOptions): Voice {
    const dead = new PendingVoice(() => {
      throw new Error('SceneAudio: a dead voice (created during Destroying/Destroyed) must never be flushed.');
    }, options);

    dead.stop();

    return dead;
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/scene/scene-audio.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/scene/SceneAudio.ts test/core/scene/scene-audio.test.ts
git commit -m "fix(core): widen SceneAudio's PendingVoice gate to Ready/Suspended, reject Destroying/Destroyed"
```

---

## Task 5: `TweenSequencer.ts` — `_attachManager()`

**Files:**

- Modify: `src/animation/TweenSequencer.ts`

**Interfaces:**

- Produces: `TweenSequencer._attachManager(manager: TweenManager): void` (`@internal`, mirrors the existing `Tween._attachManager`). Consumed by Task 6 (`SceneTweens.createSequencer()`'s cold path).

Today `TweenSequencer._manager` is `private readonly`, set once in the constructor — there is no way to construct a manager-less sequencer and bind a real manager to it later, unlike `Tween` (which already supports exactly that via `_attachManager`). This is the "small supporting change" the task orientation notes anticipated.

No dedicated test for this task alone — it has no independent observable behavior until Task 6 exercises it (constructing a manager-less sequencer, calling `.start()` on it, confirming nothing ticks, then calling `_attachManager()` and confirming it now does). Verified by `pnpm typecheck` only here.

- [ ] **Step 1: Implement**

In `src/animation/TweenSequencer.ts`, change:

```ts
  private readonly _manager: TweenManager | null;
```

to:

```ts
  private _manager: TweenManager | null;
```

Add, immediately after the constructor:

```ts
  /**
   * Attach this sequencer to a manager after construction — used by
   * `SceneTweens` to bind a cold (buffered) sequencer, constructed without
   * a manager while its owning scope was dormant, once the scope becomes
   * `Active`. Mirrors {@link Tween._attachManager}.
   * @internal
   */
  public _attachManager(manager: TweenManager): void {
    this._manager = manager;
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean (no behavior change yet — nothing calls `_attachManager` until Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/animation/TweenSequencer.ts
git commit -m "feat(animation): TweenSequencer._attachManager (mirrors Tween._attachManager)"
```

---

## Task 6: `SceneTweens.ts` — cold-buffering dormancy

**Files:**

- Modify: `src/core/scene/SceneTweens.ts`
- Test: `test/core/scene/scene-tweens.test.ts`

**Interfaces:**

- Consumes: `TweenSequencer._attachManager` (Task 5), `SceneState` (Task 1).
- Produces: `SceneTweens` constructor gains a required second parameter `getState: () => SceneState` (breaking change to an internal-only constructor — every call site is `SceneScope`, updated in Task 9). `create()`/`add()`/`createSequencer()` behavior widens (same public signatures). `restore()`'s existing behavior widens to also flush cold-buffered entries — consumed by Task 9 (`SceneScope.activate()` now also calls `this.tweens.restore()`, not only `SceneScope.restore()`).

**Design (spec §4.2 — "create(), add(), createSequencer(), and Tween.start() must not participate in the manager's update loop until Active"):**
- `create()` while not `Active`: construct a bare `new Tween(target)` **without** attaching it to the app-wide manager (skip `this._app.tweens.create()` entirely) — track it in a new `_cold` set. Since `Tween.start()`'s `this._manager?.add(this)` is a no-op when `_manager` is `null`, a synchronous `create().to(...).start()` call made entirely within a dormant `init()` produces zero application-wide effect. At the next `Active` transition, every cold tween is attached for real via `this._app.tweens.add(tween)`, in whatever state it's currently in.
- `createSequencer()` while not `Active`: construct `new TweenSequencer()` with no manager (same reasoning — `TweenSequencer.start()`'s `this._manager?.addTicker(this)` no-ops), tracked in a new `_coldSequencers` set, bound to the real manager via `_attachManager()` (Task 5) at the next `Active` transition.
- `add()` while not `Active`: the tween may already be genuinely live (constructed via `app.tweens.create()` directly and handed here) — transferring ownership means pausing it immediately if it's currently `Active`-state (mirrors the existing `suspend()`/`restore()` pause idiom exactly), tracked in a new `_coldPaused` set, resumed at the next `Active` transition only if still in the exact state this left it in. The tween is still attached to the manager immediately (harmless once paused — `Tween.update()` no-ops for a non-`Active`-state tween regardless of whether it's present in the manager's array).
- **Known, accepted, pre-existing-class limitation (not introduced by this change):** a caller who retains their own direct reference to a tween handed to `add()` can still call `.start()`/`.resume()` on it directly, bypassing the facade — exactly the same limitation the existing retention `suspend()`/`resume()` already has for any externally-held `Voice`/`Tween` reference. Not solvable without proxying every returned object; documented, not fixed, here.

- [ ] **Step 1: Write the failing tests**

First, update every existing `new SceneTweens(app)` call site in `test/core/scene/scene-tweens.test.ts` to `new SceneTweens(app, () => SceneState.Active)` (the constructor is about to gain a required second parameter, and every existing test exercises the "live" facade — passing `Active` keeps their current behavior/assertions unchanged). Add the import:

```ts
import { SceneState } from '#core/SceneState';
```

Then add a new `describe` block at the end of the file:

```ts
describe('SceneTweens — dormancy (create/add/createSequencer while not Active)', () => {
  test('create() while Ready does not call app.tweens.create — the tween is never attached to the app-wide manager', () => {
    const app = createAppStub(makeStubTween());
    const tweens = new SceneTweens(app, () => SceneState.Ready);
    const target = { x: 0 };

    const tween = tweens.create(target);

    expect(app.tweens.create).not.toHaveBeenCalled();
    expect(tween).toBeInstanceOf(Tween);
  });

  test('a real Tween created and started while Ready produces no application-wide effect until activation', () => {
    const app = createAppStub(makeStubTween());
    let state: SceneState = SceneState.Ready;
    const tweens = new SceneTweens(app, () => state);
    const target = { x: 0 };

    const tween = tweens.create(target).to({ x: 100 }, 1);

    tween.start();
    tween.update(0.5); // manual update — proves the app-wide manager never drives it

    // The real app-wide manager was never told about this tween at all.
    expect(app.tweens.add).not.toHaveBeenCalled();

    state = SceneState.Active;
    tweens.activate();

    expect(app.tweens.add).toHaveBeenCalledWith(tween);
  });

  test('activate() attaches every cold tween to the app-wide manager, in whatever state it is currently in', () => {
    const app = createAppStub(makeStubTween());
    let state: SceneState = SceneState.Ready;
    const tweens = new SceneTweens(app, () => state);

    const idleTween = tweens.create({});

    state = SceneState.Active;
    tweens.activate();

    expect(app.tweens.add).toHaveBeenCalledWith(idleTween);
  });

  test('add() while Suspended pauses an already-Active tween immediately and resumes it on activate() only if still Paused', () => {
    const running = makeStubTween('active');
    const app = createAppStub(makeStubTween());
    let state: SceneState = SceneState.Suspended;
    const tweens = new SceneTweens(app, () => state);

    tweens.add(running as never);

    expect(running.pause).toHaveBeenCalledTimes(1);

    state = SceneState.Active;
    tweens.activate();

    expect(running.resume).toHaveBeenCalledTimes(1);
  });

  test('add() while Suspended does not resume a tween the caller stopped in the meantime', () => {
    const running = makeStubTween('active');
    const app = createAppStub(makeStubTween());
    let state: SceneState = SceneState.Suspended;
    const tweens = new SceneTweens(app, () => state);

    tweens.add(running as never);
    running.state = 'stopped'; // caller stopped it directly while still dormant

    state = SceneState.Active;
    tweens.activate();

    expect(running.resume).not.toHaveBeenCalled();
  });

  test('createSequencer() while Ready constructs without a manager — start() does not tick', () => {
    const sequencer = makeStubSequencer();
    const app = createAppStub(makeStubTween(), sequencer as never);
    let state: SceneState = SceneState.Ready;
    const tweens = new SceneTweens(app, () => state);

    const created = tweens.createSequencer();

    expect(app.tweens.createSequencer).not.toHaveBeenCalled();
    expect(created).toBeInstanceOf(TweenSequencer);

    state = SceneState.Active;
    tweens.activate();
  });

  test('create()/add()/createSequencer() delegate immediately, as before, once Active', () => {
    const stubTween = makeStubTween();
    const stubSequencer = makeStubSequencer();
    const app = createAppStub(stubTween, stubSequencer as never);
    const tweens = new SceneTweens(app, () => SceneState.Active);

    tweens.create({});
    tweens.createSequencer();

    expect(app.tweens.create).toHaveBeenCalledTimes(1);
    expect(app.tweens.createSequencer).toHaveBeenCalledTimes(1);
  });
});
```

Add the two missing imports at the top of the file (`Tween`/`TweenSequencer` as value imports, needed by `toBeInstanceOf` and the cold-construction path under test):

```ts
import { Tween } from '#animation/Tween';
import { TweenSequencer } from '#animation/TweenSequencer';
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene/scene-tweens.test.ts`
Expected: FAIL — `SceneTweens` constructor doesn't accept a second argument yet (and even ignoring that, `create()`/`add()`/`createSequencer()` don't consult it).

- [ ] **Step 3: Implement**

Replace the full contents of `src/core/scene/SceneTweens.ts`:

```ts
import { Tween } from '#animation/Tween';
import { type TweenSequencer as TweenSequencerType } from '#animation/TweenSequencer';
import { TweenSequencer } from '#animation/TweenSequencer';
import { TweenSequencerState } from '#animation/TweenSequencer';
import { TweenState } from '#animation/types';
import type { Application } from '#core/Application';
import { SceneState } from '#core/SceneState';
import type { Destroyable } from '#core/types';

/** Availability of a tracked tween/sequencer relative to the owning scene's pause state. Default `'always'`. */
export type SceneTweenAvailability = 'active' | 'paused' | 'always';

/** Options accepted by every `SceneTweens` tracking method. */
export interface SceneTweenOptions {
  /**
   * Availability relative to {@link SceneDirector.pause}/{@link SceneDirector.resume}.
   * `'always'` (default) ignores scene pause entirely — today's behavior.
   * `'active'` freezes the moment the scene pauses, resumes when it resumes.
   * `'paused'` is the mirror image: runs only while the scene is paused.
   *
   * Applied only at the scene's pause/resume transitions, not re-checked at
   * creation time — an item created while the scene is already paused starts
   * running immediately and is only corrected at the next pause/resume cycle.
   */
  when?: SceneTweenAvailability;
}

/**
 * Scene-bound tween facade. Tweens and sequencers created or added here are
 * automatically stopped when the owning scene ends permanently. Access via
 * {@link Scene.tweens}.
 *
 * While the owning scope is not `Active` (`Preparing`, `Ready`, or
 * `Suspended`), `create()`/`createSequencer()` construct their result
 * without attaching it to the application-wide `TweenManager` at all, so a
 * synchronous `.start()` call made while dormant produces zero
 * application-wide effect (definition §4.2) — the manager only begins
 * driving it once the scope becomes `Active` and this facade flushes it in.
 * `add()` (which may be handed an already-live tween) instead pauses it
 * immediately if needed, resuming it on activation only if it is still in
 * the exact state this left it in — the same idiom already used by
 * {@link SceneTweens.suspend}/{@link SceneTweens.restore} for retention.
 */
export class SceneTweens implements Destroyable {
  private readonly _tweens = new Map<Tween, SceneTweenAvailability>();
  private readonly _sequencers = new Map<TweenSequencerType, SceneTweenAvailability>();
  private readonly _cold = new Set<Tween>();
  private readonly _coldPaused = new Set<Tween>();
  private readonly _coldSequencers = new Set<TweenSequencerType>();
  private _suspendedTweens: Set<Tween> | null = null;
  private _suspendedSequencers: Set<TweenSequencerType> | null = null;
  private _frozenTweens: Set<Tween> | null = null;
  private _thawedTweens: Set<Tween> | null = null;
  private _frozenSequencers: Set<TweenSequencerType> | null = null;
  private _thawedSequencers: Set<TweenSequencerType> | null = null;

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
  ) {}

  /**
   * Create a {@link Tween} targeting `target`, tracked for scene-lifetime
   * cleanup. While the owning scope is not `Active`, the tween is
   * constructed directly (not through `app.tweens.create`) so it is never
   * attached to the application-wide manager until activation — see the
   * class doc.
   */
  public create<T extends object>(target: T, options?: SceneTweenOptions): Tween<T> {
    const when = options?.when ?? 'always';

    if (this._getState() !== SceneState.Active) {
      const tween = new Tween(target);

      this._tweens.set(tween, when);
      this._cold.add(tween);

      return tween;
    }

    const tween = this._app.tweens.create(target);

    this._tweens.set(tween, when);

    return tween;
  }

  /**
   * Track an already-created {@link Tween} (e.g. built via
   * `app.tweens.create(...)`) for scene-lifetime cleanup. Passing a tween
   * that is already running transfers runtime ownership to this facade —
   * while the owning scope is not `Active`, that means pausing it
   * immediately (mirrors {@link SceneTweens.suspend}'s own pattern),
   * resumed on activation only if it is still in the exact state this left
   * it in. Returns `this` for chaining.
   */
  public add(tween: Tween, options?: SceneTweenOptions): this {
    const when = options?.when ?? 'always';

    this._app.tweens.add(tween);
    this._tweens.set(tween, when);

    if (this._getState() !== SceneState.Active && tween.state === TweenState.Active) {
      tween.pause();
      this._coldPaused.add(tween);
    }

    return this;
  }

  /**
   * Create a {@link TweenSequencer}, tracked for scene-lifetime cleanup
   * exactly like {@link SceneTweens.create} — auto-stopped on scene
   * teardown and suspended/restored across retention. While the owning
   * scope is not `Active`, constructed without a manager (same reasoning as
   * {@link SceneTweens.create}) and bound to the real one at activation.
   */
  public createSequencer(options?: SceneTweenOptions): TweenSequencerType {
    const when = options?.when ?? 'always';

    if (this._getState() !== SceneState.Active) {
      const sequencer = new TweenSequencer();

      this._sequencers.set(sequencer, when);
      this._coldSequencers.add(sequencer);

      return sequencer;
    }

    const sequencer = this._app.tweens.createSequencer();

    this._sequencers.set(sequencer, when);

    return sequencer;
  }

  /**
   * Pause every tracked tween/sequencer that is currently running, recording
   * exactly that set so {@link SceneTweens.restore} can reinstate it.
   * Reserved for retention suspension.
   * @internal
   */
  public suspend(): void {
    const runningTweens = new Set<Tween>();

    for (const tween of this._tweens.keys()) {
      if (tween.state === TweenState.Active) {
        tween.pause();
        runningTweens.add(tween);
      }
    }

    this._suspendedTweens = runningTweens;

    const runningSequencers = new Set<TweenSequencerType>();

    for (const sequencer of this._sequencers.keys()) {
      if (sequencer.state === TweenSequencerState.Active) {
        sequencer.pause();
        runningSequencers.add(sequencer);
      }
    }

    this._suspendedSequencers = runningSequencers;
  }

  /**
   * Called by `SceneScope` whenever this scope becomes `Active` — a fresh
   * activation flushing whatever was created while `Ready` (or a still-cold
   * `Suspended` registration), or a retention restore reinstating whatever
   * {@link SceneTweens.suspend} paused. Both converge on the same
   * operation: attach every cold tween/sequencer to the app-wide manager
   * (in whatever state it's currently in), then resume exactly the set
   * `suspend()` paused and exactly the set `add()` paused while dormant —
   * each only if still in the exact state this facade left it in.
   * @internal
   */
  public restore(): void {
    for (const tween of this._cold) {
      this._app.tweens.add(tween);
    }

    this._cold.clear();

    for (const sequencer of this._coldSequencers) {
      sequencer._attachManager(this._app.tweens);
    }

    this._coldSequencers.clear();

    if (this._suspendedTweens !== null) {
      for (const tween of this._suspendedTweens) {
        if (tween.state === TweenState.Paused) {
          tween.resume();
        }
      }

      this._suspendedTweens = null;
    }

    if (this._suspendedSequencers !== null) {
      for (const sequencer of this._suspendedSequencers) {
        if (sequencer.state === TweenSequencerState.Paused) {
          sequencer.resume();
        }
      }

      this._suspendedSequencers = null;
    }

    for (const tween of this._coldPaused) {
      if (tween.state === TweenState.Paused) {
        tween.resume();
      }
    }

    this._coldPaused.clear();
  }

  /**
   * Alias for {@link SceneTweens.restore}, used by `SceneScope.activate()`
   * for the fresh-activation edge (`Ready`/`Suspended` → `Active`) — kept as
   * a distinctly-named entry point so call sites read naturally regardless
   * of which transition triggered them; both do the identical work. @internal
   */
  public activate(): void {
    this.restore();
  }

  /**
   * Apply the `when` pause policy for every tracked tween/sequencer:
   * `'active'` items currently running are frozen; `'paused'` items
   * currently frozen are woken up early (they exist specifically for the
   * paused state). Called by {@link SceneScope.pause}. Does not touch a
   * `'paused'` item that happens to already be running — see the `when`
   * option's own doc, a documented, accepted limitation.
   * @internal
   */
  public pause(): void {
    const frozenTweens = new Set<Tween>();
    const thawedTweens = new Set<Tween>();

    for (const [tween, when] of this._tweens) {
      if (when === 'active' && tween.state === TweenState.Active) {
        tween.pause();
        frozenTweens.add(tween);
      } else if (when === 'paused' && tween.state === TweenState.Paused) {
        tween.resume();
        thawedTweens.add(tween);
      }
    }

    this._frozenTweens = frozenTweens;
    this._thawedTweens = thawedTweens;

    const frozenSequencers = new Set<TweenSequencerType>();
    const thawedSequencers = new Set<TweenSequencerType>();

    for (const [sequencer, when] of this._sequencers) {
      if (when === 'active' && sequencer.state === TweenSequencerState.Active) {
        sequencer.pause();
        frozenSequencers.add(sequencer);
      } else if (when === 'paused' && sequencer.state === TweenSequencerState.Paused) {
        sequencer.resume();
        thawedSequencers.add(sequencer);
      }
    }

    this._frozenSequencers = frozenSequencers;
    this._thawedSequencers = thawedSequencers;
  }

  /**
   * Undo {@link SceneTweens.pause}: resumes everything it froze, re-freezes
   * everything it woke up early — each only if still in the state this
   * facade left it in, so a tween/sequencer the caller paused or resumed
   * manually in between is left alone. Called by {@link SceneScope.resume}.
   * @internal
   */
  public resume(): void {
    if (this._frozenTweens !== null) {
      for (const tween of this._frozenTweens) {
        if (tween.state === TweenState.Paused) {
          tween.resume();
        }
      }

      this._frozenTweens = null;
    }

    if (this._thawedTweens !== null) {
      for (const tween of this._thawedTweens) {
        if (tween.state === TweenState.Active) {
          tween.pause();
        }
      }

      this._thawedTweens = null;
    }

    if (this._frozenSequencers !== null) {
      for (const sequencer of this._frozenSequencers) {
        if (sequencer.state === TweenSequencerState.Paused) {
          sequencer.resume();
        }
      }

      this._frozenSequencers = null;
    }

    if (this._thawedSequencers !== null) {
      for (const sequencer of this._thawedSequencers) {
        if (sequencer.state === TweenSequencerState.Active) {
          sequencer.pause();
        }
      }

      this._thawedSequencers = null;
    }
  }

  public destroy(): void {
    for (const tween of this._tweens.keys()) {
      tween.stop();
    }

    for (const sequencer of this._sequencers.keys()) {
      sequencer.stop();
    }

    this._tweens.clear();
    this._sequencers.clear();
    this._cold.clear();
    this._coldPaused.clear();
    this._coldSequencers.clear();
    this._suspendedTweens = null;
    this._suspendedSequencers = null;
    this._frozenTweens = null;
    this._thawedTweens = null;
    this._frozenSequencers = null;
    this._thawedSequencers = null;
  }
}
```

Note: the `import { type TweenSequencer as TweenSequencerType } from '#animation/TweenSequencer'; import { TweenSequencer } from '#animation/TweenSequencer';` pair looks redundant — collapse to a single value import, since a value import already carries the type:

```ts
import { TweenSequencer } from '#animation/TweenSequencer';
```

and use `TweenSequencer` directly as the type everywhere `TweenSequencerType` appears above (`Map<TweenSequencer, ...>`, `Set<TweenSequencer>`, return types). Re-read the class body above with that single substitution before saving the file — this plan wrote it with a placeholder alias only to keep the value/type distinction visible while explaining the diff; the real file must not import the same module twice.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/scene/scene-tweens.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm eslint src/core/scene/SceneTweens.ts test/core/scene/scene-tweens.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/scene/SceneTweens.ts test/core/scene/scene-tweens.test.ts
git commit -m "fix(core): make SceneTweens dormant until Active (create/add/createSequencer)"
```

---

## Task 7: `SceneInteraction.ts` — per-entry `attached` dormancy

**Files:**

- Modify: `src/core/scene/SceneInteraction.ts`
- Test: `test/core/scene/scene-interaction.test.ts`

**Interfaces:**

- Produces: `SceneInteraction` constructor gains a required second parameter `getState: () => SceneState` (internal-only, every call site is `SceneScope`, updated in Task 9). `observe()`/`capture()`/`suspend()`/`resume()`/`destroy()` behavior widens (same public signatures).

Verified (`SceneScope.ts:453-460` today): `_attachAutoRoots()` calls `this._app.interaction.attachRoot(...)` unconditionally from `prepare()` — moved to `activate()` in Task 9. This task fixes the *other* half of spec §4.1's bug: `SceneInteraction.observe()`/`.capture()` themselves also attach eagerly, regardless of the owning scope's state.

**Design:** replace the single `_suspended` boolean with a per-entry `attached: boolean` flag. `observe()`/`capture()` consult `getState() === Active` at call time: if live, attach immediately (as today); if not, track without attaching. `suspend()` detaches every currently-attached entry (setting `attached = false`) without discarding tracking. `resume()` attaches every entry that isn't currently attached, in tracking order — this single operation correctly covers both a fresh activation flushing cold registrations and a retention restore reinstating what `suspend()` detached, since by the time either runs every entry is uniformly in the same attached/unattached state (entries only ever attach while truly `Active`, and `suspend()` uniformly clears them all together — see the inline comment in the implementation for why a mixed state can't arise in practice). Releasing a never-attached entry must not call the app-wide detach/pop functions at all.

- [ ] **Step 1: Update every existing call site, then write the failing tests**

In `test/core/scene/scene-interaction.test.ts`, replace every occurrence of:

```ts
new SceneInteraction(app)
```

with:

```ts
new SceneInteraction(app, () => SceneState.Active)
```

(18 occurrences — use a project-wide find/replace across this one file; every existing test exercises the "live" facade, so passing `Active` preserves current behavior/assertions unchanged.)

Add the import at the top of the file:

```ts
import { SceneState } from '#core/SceneState';
```

Then add a new `describe` block at the end of the file:

```ts
describe('SceneInteraction — dormancy (registration while not Active)', () => {
  test('observe() while Ready tracks the observation but never calls app.interaction.attachRoot', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Ready);
    const root = fakeRoot();

    interaction.observe(root);

    expect(app.interaction.attachRoot).not.toHaveBeenCalled();
  });

  test('releasing an observation created while dormant never calls app.interaction.detachRoot', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Ready);
    const root = fakeRoot();

    const observation = interaction.observe(root);
    observation.release();

    expect(app.interaction.detachRoot).not.toHaveBeenCalled();
  });

  test('resume() attaches every observation registered while dormant, in registration order', () => {
    const app = createAppStub();
    let state: SceneState = SceneState.Ready;
    const interaction = new SceneInteraction(app, () => state);
    const rootA = fakeRoot();
    const rootB = fakeRoot();

    interaction.observe(rootA);
    interaction.observe(rootB);

    expect(app.interaction.attachRoot).not.toHaveBeenCalled();

    state = SceneState.Active;
    interaction.resume();

    expect(app.interaction.attachRoot).toHaveBeenNthCalledWith(1, rootA);
    expect(app.interaction.attachRoot).toHaveBeenNthCalledWith(2, rootB);
  });

  test('resume() is idempotent — calling it twice does not re-attach an already-attached observation', () => {
    const app = createAppStub();
    let state: SceneState = SceneState.Ready;
    const interaction = new SceneInteraction(app, () => state);
    const root = fakeRoot();

    interaction.observe(root);

    state = SceneState.Active;
    interaction.resume();
    interaction.resume();

    expect(app.interaction.attachRoot).toHaveBeenCalledTimes(1);
  });

  test('capture() while Suspended (a new registration while already dormant) buffers instead of pushing', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Suspended);
    const root = fakeRoot();

    interaction.capture(root);

    expect(app.interaction.pushInputCapture).not.toHaveBeenCalled();
  });

  test('suspend() then resume() re-pushes captures in original order', () => {
    const app = createAppStub();
    let state: SceneState = SceneState.Active;
    const interaction = new SceneInteraction(app, () => state);
    const rootA = fakeRoot();
    const rootB = fakeRoot();

    interaction.capture(rootA);
    interaction.capture(rootB);
    (app.interaction.pushInputCapture as MockInstance).mockClear();

    state = SceneState.Suspended;
    interaction.suspend();
    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(2);

    state = SceneState.Active;
    interaction.resume();

    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(1, rootA);
    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(2, rootB);
  });

  test('releasing a still-dormant capture never touches the app-wide capture stack', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Ready);
    const root = fakeRoot();

    const capture = interaction.capture(root);
    capture.release();

    expect(app.interaction.pushInputCapture).not.toHaveBeenCalled();
    expect(app.interaction.popInputCapture).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene/scene-interaction.test.ts`
Expected: FAIL — `SceneInteraction` doesn't accept a second constructor argument, and `observe()`/`capture()` attach unconditionally.

- [ ] **Step 3: Implement**

Replace the full contents of `src/core/scene/SceneInteraction.ts`:

```ts
import type { Application } from '#core/Application';
import { SceneState } from '#core/SceneState';
import type { Destroyable } from '#core/types';
import type { RenderNode } from '#rendering/RenderNode';

/**
 * Handle returned by {@link SceneInteraction.observe}. Detaches the observed
 * root from interaction dispatch — call {@link InteractionObservation.release}
 * (or {@link InteractionObservation.destroy}, an alias) when the root no
 * longer needs pointer/focus routing. Idempotent; also released automatically
 * when the owning scene ends permanently.
 */
export interface InteractionObservation extends Destroyable {
  /** Detach the observed root. Idempotent alias for {@link InteractionObservation.destroy}. */
  release(): void;
}

/**
 * Handle returned by {@link SceneInteraction.capture}. While active, pointer
 * hit-testing is confined to the captured root's subtree. Call
 * {@link InteractionCapture.release} (or {@link InteractionCapture.destroy},
 * an alias) to end the capture — nested captures restore whichever capture
 * was active before this one, regardless of release order. Idempotent; also
 * released automatically when the owning scene ends permanently.
 */
export interface InteractionCapture extends Destroyable {
  /** `true` until this capture is released. */
  readonly active: boolean;
  /** End this capture. Idempotent alias for {@link InteractionCapture.destroy}. */
  release(): void;
}

interface TrackedObservation extends InteractionObservation {
  readonly root: RenderNode;
  /** Whether this observation currently reached `app.interaction` — false while created/left dormant. */
  attached: boolean;
  released: boolean;
}

interface TrackedCapture extends InteractionCapture {
  readonly root: RenderNode;
  /** Whether this capture is currently pushed onto `app.interaction`'s stack — false while created/left dormant. */
  attached: boolean;
  released: boolean;
}

/**
 * Scene-bound interaction facade. `scene.root` and a materialized `scene.ui`
 * are attached automatically at activation and detached at teardown — that
 * automatic wiring lives in the internal `SceneScope`, not here.
 * {@link SceneInteraction.observe} is the *explicit* path for additional
 * roots (e.g. a subtree rendered outside `scene.root`); {@link
 * SceneInteraction.capture} confines hit-testing to one subtree (modal
 * dialogs, pause menus). Access via {@link Scene.interaction}.
 *
 * Delegates entirely to `app.interaction` — no second picking/dispatch
 * engine, just tracking of what this facade attached/pushed so it can
 * detach/release on teardown. Pause-aware dispatch gating (state
 * Active/Paused, transition gate) is enforced once, centrally, in
 * {@link InteractionManager.update} — not duplicated here.
 *
 * While the owning scope is not `Active` (`Preparing`, `Ready`, or
 * `Suspended`), `observe()`/`capture()` track their registration locally but
 * never reach `app.interaction` — including a call made while already
 * `Suspended` (definition §4.2). {@link SceneInteraction.resume} attaches
 * everything not yet attached, in tracking order, on the next transition
 * into `Active` (fresh activation or retention restore alike).
 */
export class SceneInteraction implements Destroyable {
  private readonly _observations = new Set<TrackedObservation>();
  private readonly _captures: TrackedCapture[] = [];

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
  ) {}

  private _isLive(): boolean {
    return this._getState() === SceneState.Active;
  }

  /**
   * Attach `root` to interaction dispatch (pointer/focus routing), so its
   * interactive descendants start receiving events — immediately if the
   * owning scope is currently `Active`, otherwise buffered until it next
   * becomes `Active` (see the class doc). Returns a handle to detach it
   * early; otherwise it is detached automatically when the scene ends
   * permanently.
   */
  public observe(root: RenderNode): InteractionObservation {
    const live = this._isLive();

    if (live) {
      this._app.interaction.attachRoot(root);
    }

    const observation: TrackedObservation = {
      root,
      attached: live,
      released: false,
      release: () => this._release(observation),
      destroy: () => this._release(observation),
    };

    this._observations.add(observation);

    return observation;
  }

  /**
   * Confine pointer hit-testing to `root`'s subtree until the returned
   * handle is released — a modal dialog, pause menu, or full-screen overlay
   * that must swallow clicks outside itself. Nested captures use
   * last-created priority; releasing any capture (not only the most recent)
   * restores the stack to its state as if that capture had never been
   * created, preserving the relative order of the rest. Buffered until the
   * owning scope is `Active`, same as {@link SceneInteraction.observe}.
   */
  public capture(root: RenderNode): InteractionCapture {
    const live = this._isLive();

    if (live) {
      this._app.interaction.pushInputCapture(root);
    }

    const capture: TrackedCapture = {
      root,
      attached: live,
      released: false,
      release: () => this._releaseCapture(capture),
      destroy: () => this._releaseCapture(capture),
      get active(): boolean {
        return !this.released;
      },
    };

    this._captures.push(capture);

    return capture;
  }

  /**
   * Detach every currently-attached observation and pop every
   * currently-attached capture off the manager's stack, without discarding
   * local tracking — so {@link SceneInteraction.resume} can reattach exactly
   * the same set in the same order. A retained scene must not keep
   * receiving pointer dispatch alongside whichever scope is now active
   * (definition §4.2). A no-op for anything created while already dormant
   * (never reached `app.interaction` in the first place). Idempotent.
   * @internal
   */
  public suspend(): void {
    for (const observation of this._observations) {
      if (observation.attached) {
        this._app.interaction.detachRoot(observation.root);
        observation.attached = false;
      }
    }

    for (let i = this._captures.length - 1; i >= 0; i--) {
      const capture = this._captures[i]!;

      if (capture.attached) {
        this._app.interaction.popInputCapture();
        capture.attached = false;
      }
    }
  }

  /**
   * Attach every observation and push every capture not currently attached
   * to `app.interaction`, in tracking order — covers both a fresh
   * activation flushing whatever was registered while dormant, and a
   * retention restore reinstating whatever {@link SceneInteraction.suspend}
   * detached. Idempotent — already-attached entries are left alone.
   * @internal
   */
  public resume(): void {
    for (const observation of this._observations) {
      if (!observation.attached) {
        this._app.interaction.attachRoot(observation.root);
        observation.attached = true;
      }
    }

    for (const capture of this._captures) {
      if (!capture.attached) {
        this._app.interaction.pushInputCapture(capture.root);
        capture.attached = true;
      }
    }
  }

  public destroy(): void {
    for (const observation of [...this._observations]) {
      this._release(observation);
    }

    this._observations.clear();

    for (const capture of [...this._captures].reverse()) {
      this._releaseCapture(capture);
    }
  }

  private _release(observation: TrackedObservation): void {
    if (observation.released) {
      return;
    }

    observation.released = true;
    this._observations.delete(observation);

    if (observation.attached) {
      this._app.interaction.detachRoot(observation.root);
    }
  }

  private _releaseCapture(capture: TrackedCapture): void {
    if (capture.released) {
      return;
    }

    const index = this._captures.indexOf(capture);

    if (!capture.attached) {
      // Never reached app.interaction (created while dormant, or currently
      // detached by suspend()) — local bookkeeping only; the manager's
      // stack was never touched for this capture in the first place.
      capture.released = true;
      this._captures.splice(index, 1);

      return;
    }

    // Every capture from `index` onward is attached together in practice —
    // captures only ever attach while genuinely Active, and suspend()
    // detaches the entire array together, so a mix of attached/unattached
    // entries above an attached one cannot arise. Pop every capture from
    // the top down through (and including) this one, then re-push
    // everything that was above it, in original order — restores the
    // manager's stack as if `capture` had never existed.
    const above = this._captures.slice(index + 1);

    for (let i = this._captures.length - 1; i >= index; i--) {
      this._app.interaction.popInputCapture();
      this._captures[i]!.attached = false;
    }

    capture.released = true;
    this._captures.splice(index, 1);

    for (const entry of above) {
      this._app.interaction.pushInputCapture(entry.root);
      entry.attached = true;
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/scene/scene-interaction.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm eslint src/core/scene/SceneInteraction.ts test/core/scene/scene-interaction.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/scene/SceneInteraction.ts test/core/scene/scene-interaction.test.ts
git commit -m "fix(core): make SceneInteraction dormant until Active (observe/capture)"
```

---

## Task 8: `Scene.ts` — `onActivate`/`onSuspend` replace `onLoad`/`onUnload`

**Files:**

- Modify: `src/core/Scene.ts`
- Modify: `examples/application-scenes/scene-lifecycle.ts`
- Modify: `examples/application-scenes/scene-lifecycle.js`

**Interfaces:**

- Produces: `Scene.onActivate: Signal`, `Scene.onSuspend: Signal` (new public exports). Removes `Scene.onLoad`, `Scene.onUnload`. Consumed by Task 9 (`SceneScope.activate()`/`restore()`/`suspend()` dispatch them via `dispatchIsolated`).

No dedicated new test in this task — `Scene.onActivate`/`onSuspend` have no independent dispatcher yet (that's Task 9); this task only changes the signal declarations and `_teardownInternals()`. Existing tests that reference `onLoad` (in `test/core/scene-scope.test.ts`) are updated in Task 9, alongside the `SceneScope` changes that actually dispatch the new signals. Verified here only by `pnpm typecheck` (the file must still compile) — this task's own commit is intentionally a pure, small, mechanical rename that Task 9 then wires up.

**Note on Slice 1 overlap:** a parallel Slice 1 agent may be adding an `AppLike` second generic to this same file. This task's edits are confined to the signal-declaration region (lines ~62–69 today) and `_teardownInternals()` (lines ~415–424 today) — neither touches the class's generic parameter list (`export class Scene<Data = void> { ... }`) or the `app` getter. If a merge conflict does occur, it will be localized and mechanical (two independent hunks in the same file), not a semantic conflict.

- [ ] **Step 1: Implement — remove `onLoad`/`onUnload`, add `onActivate`/`onSuspend`**

In `src/core/Scene.ts`, change:

```ts
  /** Dispatched after the scene finishes loading (after load() and init() complete). */
  public readonly onLoad = new Signal();
  /** Dispatched when the scene is about to be unloaded. */
  public readonly onUnload = new Signal();
  /** Dispatched after this scene's {@link Scene.paused} flag is set. Same event as {@link SceneDirector.onPause}, exposed directly on the scene for convenience. */
  public readonly onPause = new Signal();
  /** Dispatched after this scene's {@link Scene.paused} flag is cleared. Same event as {@link SceneDirector.onResume}, exposed directly on the scene for convenience. */
  public readonly onResume = new Signal();
```

to:

```ts
  /**
   * Dispatched after this scene becomes `Active` — a fresh activation
   * (`Ready` → `Active`) or a retention restore (`Suspended` → `Active`).
   * Exceptions thrown by a listener are isolated: reported through
   * {@link Application.onError}, never propagated back to whatever
   * triggered the activation, and never able to block the remaining
   * listeners or the activation itself.
   */
  public readonly onActivate = new Signal();
  /**
   * Dispatched after this scene is suspended for retention
   * (`Active` → `Suspended`). Same exception-isolation contract as
   * {@link Scene.onActivate}.
   */
  public readonly onSuspend = new Signal();
  /** Dispatched after this scene's {@link Scene.paused} flag is set. Same event as {@link SceneDirector.onPause}, exposed directly on the scene for convenience. */
  public readonly onPause = new Signal();
  /** Dispatched after this scene's {@link Scene.paused} flag is cleared. Same event as {@link SceneDirector.onResume}, exposed directly on the scene for convenience. */
  public readonly onResume = new Signal();
```

And change `_teardownInternals()`:

```ts
  public _teardownInternals(): void {
    this._disposal.destroy();
    this.onLoad.destroy();
    this.onUnload.destroy();
    this.onPause.destroy();
    this.onResume.destroy();
    this._root.destroy();
    this._app = null;
    this._scope = null;
  }
```

to:

```ts
  public _teardownInternals(): void {
    this._disposal.destroy();
    this.onActivate.destroy();
    this.onSuspend.destroy();
    this.onPause.destroy();
    this.onResume.destroy();
    this._root.destroy();
    this._app = null;
    this._scope = null;
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL — `examples/application-scenes/scene-lifecycle.ts` still references `this.onLoad`/`this.onUnload`.

- [ ] **Step 3: Fix the example**

In `examples/application-scenes/scene-lifecycle.ts`, change the comment block and the two signal registrations. Replace:

```ts
// `update`/`draw` run every frame in between. Two signals bracket the same
// span from the outside: `onLoad` fires right after `init()` resolves (the
// scene is about to become active) and `onUnload` fires right before
// `destroy()` runs (the scene is about to deactivate) — a hook point for
// cross-cutting concerns (audio cues, analytics, HUD toggles) that shouldn't
// live inside `init`/`destroy` themselves.
```

with:

```ts
// `update`/`draw` run every frame in between. Two signals bracket
// activation from the outside: `onActivate` fires once the scene becomes
// visible (fresh activation or a retention restore) and `onSuspend` fires
// if the scene is ever retained instead of destroyed — a hook point for
// cross-cutting concerns (audio cues, analytics, HUD toggles) that shouldn't
// live inside `init`/`destroy` themselves.
```

Replace:

```ts
        this.onLoad.add(() => {
            this.events.push('onLoad');
        });

        this.onUnload.add(() => {
            this.events.push('onUnload');
        });
```

with:

```ts
        this.onActivate.add(() => {
            this.events.push('onActivate');
        });

        this.onSuspend.add(() => {
            this.events.push('onSuspend');
        });
```

Apply the identical change (same comment text, same two `add()` blocks, adjusted for the file's already-compiled JS syntax — no type annotations) to `examples/application-scenes/scene-lifecycle.js`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm typecheck && pnpm typecheck:examples`
Expected: clean.

- [ ] **Step 5: Lint**

Run: `pnpm eslint src/core/Scene.ts examples/application-scenes/scene-lifecycle.js examples/application-scenes/scene-lifecycle.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/Scene.ts examples/application-scenes/scene-lifecycle.ts examples/application-scenes/scene-lifecycle.js
git commit -m "feat(core): replace Scene.onLoad/onUnload with onActivate/onSuspend"
```

---

## Task 9: `SceneScope.ts` — wire the `Ready` checkpoint and dormancy

**Files:**

- Modify: `src/core/SceneScope.ts`
- Test: `test/core/scene-scope.test.ts`

**Interfaces:**

- Consumes: `SceneState.Ready` (Task 1), `Signal.dispatchIsolated` (Task 2), `Scene.onActivate`/`onSuspend` (Task 8), the widened `SceneInteraction`/`SceneTweens` constructors (Tasks 6–7).
- Produces: `SceneScope.prepare()` now ends in `Ready` (was: stayed in `Preparing`, called `_attachAutoRoots()` and dispatched the now-removed `scene.onLoad`). `SceneScope.activate()` now transitions `Ready` → `Active` (was: `Preparing` → `Active`) and performs facility activation (attach roots, flush interaction/tweens, flush pending audio) before dispatching `Scene.onActivate` then the `onStateChange` callback — reordered per spec §2.1. `SceneScope.suspend()` now also dispatches `Scene.onSuspend`. `SceneScope.restore()` now also flushes pending audio and dispatches `Scene.onActivate`. Consumed by Task 10 (`SceneDirector`, unchanged call shape — `scope.activate()`/`scope.prepare()`/`scope.suspend()`/`scope.restore()` keep their existing signatures).

**Ordering per spec §2.1:**

```
Fresh activation (Preparing → Ready → Active):
  Preparing → Ready:  Director.onStateChange only (no Scene signal)
  Ready → Active:
    state = Active
    facilities activate (roots attach, captured interactions push, tweens start)
    pending audio flushes
    Scene.onActivate
    Director.onStateChange
    (Director.onChangeScene / onStartScene: dispatched by SceneDirector, Task 10 — unchanged call site)

Restore (Suspended → Active):
  state = Active
  facilities resume (existing order: inputs, interaction, roots, tweens, audio)
  pending audio flushes
  Scene.onActivate
  (Director.onStateChange / onChangeScene: dispatched by SceneDirector, Task 10)

Suspend (Active → Suspended):
  state = Suspended
  facilities suspend
  Scene.onSuspend
  (Director.onStateChange: dispatched by SceneDirector's _suspendAndRetain, Task 10 — unaffected call site, just converted to isolated dispatch)
```

- [ ] **Step 1: Write the failing tests**

In `test/core/scene-scope.test.ts`, first update the import line to include `Ready`, no change needed (imports `SceneState` as a whole already). Then apply the following rewrites.

Replace the existing test (lines 64–90, "runs load() then init() in order..., attaches roots, and dispatches onLoad only after both complete"):

```ts
    test('runs load() then init() in order (definition §5.1), ends in Ready — no facility attachment or Scene signal yet', async () => {
      const app = createAppStub();
      const events: string[] = [];

      class RecordingScene extends Scene {
        public override async load(): Promise<void> {
          events.push('load:start');
          await Promise.resolve();
          events.push('load:end');
        }

        public override init(): void {
          events.push('init');
        }
      }

      const scene = new RecordingScene();

      scene.onActivate.add(() => events.push('onActivate'));

      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);

      expect(events).toEqual(['load:start', 'load:end', 'init']);
      expect(scope.state).toBe(SceneState.Ready);
      // Roots/onActivate are deferred to activate() — the Ready checkpoint
      // itself produces no application-wide effect (definition §4.1/§4.2).
      expect(app.interaction.attachRoot).not.toHaveBeenCalled();
    });
```

Replace the existing test (lines 117–133, "activate() transitions Preparing to Active; frame methods only dispatch once Active"):

```ts
    test('activate() transitions Ready to Active; frame methods only dispatch once Active', async () => {
      const app = createAppStub();
      const update = vi.fn();
      const scene = Object.assign(new Scene(), { update });
      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);
      expect(scope.state).toBe(SceneState.Ready);

      scope.update(new Time(16));
      expect(update).not.toHaveBeenCalled(); // still Ready

      scope.activate();
      expect(scope.state).toBe(SceneState.Active);

      scope.update(new Time(16));
      expect(update).toHaveBeenCalledTimes(1);
    });

    test('activate() attaches the scene root to interaction dispatch (deferred from prepare(), definition §4.1)', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);
      expect(app.interaction.attachRoot).not.toHaveBeenCalled();

      scope.activate();
      expect(app.interaction.attachRoot).toHaveBeenCalledWith(scene.root);
    });

    test('activate() dispatches Scene.onActivate after facility activation, before reporting the state change', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const events: string[] = [];
      const scope = new SceneScope(app, scene, () => events.push('onStateChange'));

      vi.spyOn(app.interaction, 'attachRoot').mockImplementation(() => events.push('attachRoot'));
      scene.onActivate.add(() => events.push('onActivate'));

      await scope.prepare(undefined);
      scope.activate();

      expect(events).toEqual(['attachRoot', 'onActivate', 'onStateChange']);
    });
```

Replace the existing test (lines 135–146, "activate() reports the Preparing to Active transition via the injected onStateChange callback"):

```ts
    test('prepare() reports Preparing to Ready, activate() reports Ready to Active, via the injected onStateChange callback', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const onStateChange = vi.fn();
      const scope = new SceneScope(app, scene, onStateChange);

      await scope.prepare(undefined);
      expect(onStateChange).toHaveBeenCalledTimes(1);
      expect(onStateChange).toHaveBeenNthCalledWith(1, SceneState.Preparing, SceneState.Ready);

      scope.activate();
      expect(onStateChange).toHaveBeenCalledTimes(2);
      expect(onStateChange).toHaveBeenNthCalledWith(2, SceneState.Ready, SceneState.Active);
    });

    test('a throwing Scene.onActivate listener is reported through the app error pipeline and does not block activation', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const errorSpy = vi.fn();

      app.onError.add(errorSpy);
      scene.onActivate.add(() => {
        throw new Error('onActivate listener failed');
      });

      const scope = new SceneScope(app, scene);

      await scope.prepare(undefined);
      scope.activate();

      expect(scope.state).toBe(SceneState.Active);
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'onActivate listener failed' }));
    });
```

Add a new test to the `describe('retention (definition §14)', ...)` block, after the existing `suspend()` tests:

```ts
    test('suspend() dispatches Scene.onSuspend after facility suspension', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);
      const events: string[] = [];

      vi.spyOn(scope.interaction, 'suspend').mockImplementation(() => events.push('interaction.suspend'));
      scene.onSuspend.add(() => events.push('onSuspend'));

      scope.suspend();

      expect(events).toEqual(['interaction.suspend', 'onSuspend']);
    });

    test('restore() flushes pending audio and dispatches Scene.onActivate', async () => {
      const app = createAppStub();
      const scene = new Scene();
      const scope = await activate(app, scene);
      const events: string[] = [];

      scope.suspend();

      vi.spyOn(scope.audio, '_flushPending').mockImplementation(() => events.push('audio._flushPending'));
      scene.onActivate.add(() => events.push('onActivate'));

      scope.restore();

      expect(events).toEqual(['audio._flushPending', 'onActivate']);
    });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene-scope.test.ts`
Expected: FAIL — `prepare()` still ends in `Preparing`, `activate()` still transitions directly from `Preparing`, `scene.onActivate`/`onSuspend` don't exist yet on the `Scene` instances constructed by these tests (they do — Task 8 already added them — but `SceneScope` doesn't dispatch them yet).

- [ ] **Step 3: Implement**

In `src/core/SceneScope.ts`, replace `prepare()`:

```ts
  public async prepare(data: Data): Promise<void> {
    await this.scene.load(data);

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- init() is declared void; capturing the raw return is exactly how a broken async override is detected below.
    const result = this.scene.init(data) as unknown;

    if (isThenable(result)) {
      // Detach any rejection from the abandoned thenable — an async init()
      // is a dev-mode activation error below, so the original async result
      // is intentionally discarded and must never surface as an unhandled
      // rejection on top of that error.
      (result as Promise<unknown>).catch(() => {
        /* discarded: see the thenable-detection error thrown below */
      });

      if (__DEV__) {
        throw new Error(
          'Scene.init() must be synchronous, but it returned a thenable (e.g. an async function). init() runs only after load() has completed — move asynchronous setup into load() instead.',
        );
      }
    }

    this._attachAutoRoots();

    this._rootsAttached = true;
    this.scene.onLoad.dispatch();
  }
```

with:

```ts
  public async prepare(data: Data): Promise<void> {
    await this.scene.load(data);

    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- init() is declared void; capturing the raw return is exactly how a broken async override is detected below.
    const result = this.scene.init(data) as unknown;

    if (isThenable(result)) {
      // Detach any rejection from the abandoned thenable — an async init()
      // is a dev-mode activation error below, so the original async result
      // is intentionally discarded and must never surface as an unhandled
      // rejection on top of that error.
      (result as Promise<unknown>).catch(() => {
        /* discarded: see the thenable-detection error thrown below */
      });

      if (__DEV__) {
        throw new Error(
          'Scene.init() must be synchronous, but it returned a thenable (e.g. an async function). init() runs only after load() has completed — move asynchronous setup into load() instead.',
        );
      }
    }

    const previous = this._state;

    this._state = SceneState.Ready;
    this._onStateChange(previous, this._state);
  }
```

Replace `activate()`:

```ts
  /** Commit this scope as the active scene: `Preparing` → `Active`. Called by the director once the switch boundary is crossed. */
  public activate(): void {
    const previous = this._state;

    this._state = SceneState.Active;
    this._onStateChange(previous, this._state);
    this.audio._flushPending();
  }
```

with:

```ts
  /**
   * Commit this scope as the active scene: `Ready` → `Active` (definition
   * §2.1's fresh-activation ordering). Called by the director once the
   * switch boundary is crossed. Attaches the scene's automatic root/UI to
   * interaction dispatch and flushes every facility registration buffered
   * while dormant (definition §4.1/§4.2) before dispatching
   * {@link Scene.onActivate}, then reports the state change last.
   */
  public activate(): void {
    const previous = this._state;

    this._state = SceneState.Active;

    const errors: unknown[] = [];

    this._guard(errors, () => this._attachAutoRoots());
    this._rootsAttached = true;
    this._guard(errors, () => this.interaction.resume());
    this._guard(errors, () => this.tweens.activate());
    this._guard(errors, () => this.audio._flushPending());
    this._guard(errors, () => this.scene.onActivate.dispatchIsolated(error => this._reportError(error)));

    this._reportErrors(errors);

    this._onStateChange(previous, this._state);
  }
```

Replace `suspend()`:

```ts
  public suspend(): boolean {
    if (!canSuspend(this._state)) {
      return false;
    }

    this._state = SceneState.Suspended;

    const errors: unknown[] = [];

    this._guard(errors, () => this.inputs.suspend());
    this._guard(errors, () => this.interaction.suspend());
    this._guard(errors, () => {
      if (this._rootsAttached) {
        this._detachAutoRoots();
      }
    });
    this._guard(errors, () => this.tweens.suspend());
    this._guard(errors, () => this.audio.suspend());

    this._reportErrors(errors);

    return true;
  }
```

with:

```ts
  public suspend(): boolean {
    if (!canSuspend(this._state)) {
      return false;
    }

    this._state = SceneState.Suspended;

    const errors: unknown[] = [];

    this._guard(errors, () => this.inputs.suspend());
    this._guard(errors, () => this.interaction.suspend());
    this._guard(errors, () => {
      if (this._rootsAttached) {
        this._detachAutoRoots();
      }
    });
    this._guard(errors, () => this.tweens.suspend());
    this._guard(errors, () => this.audio.suspend());
    this._guard(errors, () => this.scene.onSuspend.dispatchIsolated(error => this._reportError(error)));

    this._reportErrors(errors);

    return true;
  }
```

Replace `restore()`:

```ts
  public restore(): boolean {
    if (!canRestore(this._state)) {
      return false;
    }

    this._state = SceneState.Active;

    const errors: unknown[] = [];

    this._guard(errors, () => this.inputs.resume());
    this._guard(errors, () => this.interaction.resume());
    this._guard(errors, () => {
      if (this._rootsAttached) {
        this._attachAutoRoots();
      }
    });
    this._guard(errors, () => this.tweens.restore());
    this._guard(errors, () => this.audio.restore());

    this._reportErrors(errors);

    return true;
  }
```

with:

```ts
  public restore(): boolean {
    if (!canRestore(this._state)) {
      return false;
    }

    this._state = SceneState.Active;

    const errors: unknown[] = [];

    this._guard(errors, () => this.inputs.resume());
    this._guard(errors, () => this.interaction.resume());
    this._guard(errors, () => {
      if (this._rootsAttached) {
        this._attachAutoRoots();
      }
    });
    this._guard(errors, () => this.tweens.restore());
    this._guard(errors, () => this.audio.restore());
    this._guard(errors, () => this.audio._flushPending());
    this._guard(errors, () => this.scene.onActivate.dispatchIsolated(error => this._reportError(error)));

    this._reportErrors(errors);

    return true;
  }
```

Update the constructor to pass `getState` to `SceneInteraction`/`SceneTweens` (both now require it):

```ts
    this.interaction = new SceneInteraction(app);
    this.tweens = new SceneTweens(app);
```

to:

```ts
    this.interaction = new SceneInteraction(app, () => this._state);
    this.tweens = new SceneTweens(app, () => this._state);
```

Add the singular `_reportError` helper (used above), and have the existing `_reportErrors` delegate to it — change:

```ts
  private _reportErrors(errors: unknown[]): void {
    for (const error of errors) {
      const normalized = error instanceof Error ? error : new Error(String(error));

      logger.error('A SceneScope cleanup stage failed.', { source: 'SceneScope', error: normalized });
      this._app.onError.dispatch(normalized);
    }
  }
```

to:

```ts
  private _reportError(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));

    logger.error('A SceneScope cleanup stage failed.', { source: 'SceneScope', error: normalized });
    this._app.onError.dispatch(normalized);
  }

  private _reportErrors(errors: unknown[]): void {
    for (const error of errors) {
      this._reportError(error);
    }
  }
```

Finally, update the class-level JSDoc to mention the `Ready` checkpoint — change:

```ts
/**
 * Internal owner of one {@link Scene} activation: constructs and attaches the
 * scene's facilities, runs `load()`/`init()`, gates per-frame dispatch by
 * {@link SceneState}, supports retention ({@link SceneScope.suspend} /
 * {@link SceneScope.restore}), and runs permanent teardown in the normative
 * order. Not exported from the package root — `Scene` and `SceneDirector`
 * are the public surface; this class is their shared internal implementation
 * detail.
 * @internal
 */
```

to:

```ts
/**
 * Internal owner of one {@link Scene} activation: constructs and attaches the
 * scene's facilities, runs `load()`/`init()` (ending in {@link
 * SceneState.Ready} — a cold checkpoint before any facility produces an
 * application-wide effect), commits `Ready`/`Suspended` → `Active` via
 * {@link SceneScope.activate}/{@link SceneScope.restore}, gates per-frame
 * dispatch by {@link SceneState}, supports retention ({@link
 * SceneScope.suspend}/{@link SceneScope.restore}), and runs permanent
 * teardown in the normative order. Not exported from the package root —
 * `Scene` and `SceneDirector` are the public surface; this class is their
 * shared internal implementation detail.
 * @internal
 */
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/scene-scope.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm eslint src/core/SceneScope.ts test/core/scene-scope.test.ts`
Expected: clean.

- [ ] **Step 6: Run the full core suite to catch any other test relying on the old Preparing→Active edge**

Run: `pnpm test:core`
Expected: FAIL only in `test/core/scene-director.test.ts` (three tests assert the exact `(Preparing, Active, scene)` `onStateChange` tuple / call count that no longer occurs — fixed in Task 10). No other file should fail; if one does, stop and investigate before continuing (do not proceed to Task 10 with an unexplained failure elsewhere).

- [ ] **Step 7: Commit**

```bash
git add src/core/SceneScope.ts test/core/scene-scope.test.ts
git commit -m "feat(core): wire the Ready checkpoint into SceneScope.prepare()/activate(), dispatch Scene.onActivate/onSuspend"
```

---

## Task 10: `SceneDirector.ts` — isolated lifecycle dispatch

**Files:**

- Modify: `src/core/SceneDirector.ts`
- Test: `test/core/scene-director.test.ts`

**Interfaces:**

- Consumes: `Signal.dispatchIsolated` (Task 2), `SceneScope`'s Task 9 changes (no signature change — `_onStateChange` callback shape, `scope.activate()`/`suspend()`/`restore()` all unchanged).
- Produces: no public signature changes. `onChangeScene`/`onStartScene`/`onStopScene`/`onStateChange` all keep dispatching the exact same payloads, just through `dispatchIsolated` instead of `dispatch`.

Six call sites convert from `.dispatch(...)` to `.dispatchIsolated(error => this._reportLifecycleError(error), ...)`:
1. `_prepareScene()`'s `onStateChange` callback lambda.
2. `setScene()`'s `onChangeScene`/`onStartScene` (two calls).
3. `_clearScene()`'s `onChangeScene`.
4. `restoreScene()`'s `onChangeScene`/`onStateChange` (two calls).
5. `_disposeScene()`'s `onStopScene`.
6. `_suspendAndRetain()`'s `onStateChange`.

This is a **deliberate behavior change**, per spec §2.2.1: today, a throwing `onStopScene`/`onStateChange` listener genuinely propagates and triggers `_rollbackSwitch()` — exercised by the two existing tests in `describe('SceneDirector — switch-phase rollback', ...)`. After this change, those listeners' exceptions are isolated (reported via `Application.onError`, dispatch continues), so they can no longer trigger a rollback. Those two tests are rewritten below, per the spec's own explicit instruction, into tests of the new (correct) behavior.

- [ ] **Step 1: Write the failing tests**

**1a.** Update the two `onStateChange`-count assertions affected by Task 9's `Preparing → Ready → Active` split. Replace (around line 258–270):

```ts
  test('setScene() dispatches onStateChange for the fresh Preparing to Active activation', async () => {
    const TestScene = makeSceneClass();
    const manager = new SceneDirector(createApplicationStub(), { test: TestScene });
    const onStateChange = vi.fn();

    manager.onStateChange.add(onStateChange);

    await manager.setScene(TestScene);
    const scene = manager.currentScene;

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Preparing, SceneState.Active, scene);
  });
```

with:

```ts
  test('setScene() dispatches onStateChange for Preparing to Ready, then Ready to Active', async () => {
    const TestScene = makeSceneClass();
    const manager = new SceneDirector(createApplicationStub(), { test: TestScene });
    const onStateChange = vi.fn();

    manager.onStateChange.add(onStateChange);

    await manager.setScene(TestScene);
    const scene = manager.currentScene;

    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(onStateChange).toHaveBeenNthCalledWith(1, SceneState.Preparing, SceneState.Ready, scene);
    expect(onStateChange).toHaveBeenNthCalledWith(2, SceneState.Ready, SceneState.Active, scene);
  });
```

Replace (around line 272–290):

```ts
  test('switching scenes dispatches onStateChange for the outgoing scope Destroying and Destroyed transitions', async () => {
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(createApplicationStub(), { first: First, second: Second });

    await manager.setScene(First);
    const first = manager.currentScene;
    const onStateChange = vi.fn();

    manager.onStateChange.add(onStateChange);

    await manager.setScene(Second);
    const second = manager.currentScene;

    expect(onStateChange).toHaveBeenCalledTimes(3);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Active, SceneState.Destroying, first);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Destroying, SceneState.Destroyed, first);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Preparing, SceneState.Active, second);
  });
```

with:

```ts
  test('switching scenes dispatches onStateChange for the outgoing scope Destroying and Destroyed transitions, and the incoming Preparing→Ready→Active', async () => {
    const First = makeSceneClass();
    const Second = makeSceneClass();
    const manager = new SceneDirector(createApplicationStub(), { first: First, second: Second });

    await manager.setScene(First);
    const first = manager.currentScene;
    const onStateChange = vi.fn();

    manager.onStateChange.add(onStateChange);

    await manager.setScene(Second);
    const second = manager.currentScene;

    expect(onStateChange).toHaveBeenCalledTimes(4);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Active, SceneState.Destroying, first);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Destroying, SceneState.Destroyed, first);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Preparing, SceneState.Ready, second);
    expect(onStateChange).toHaveBeenCalledWith(SceneState.Ready, SceneState.Active, second);
  });
```

(The third existing test in this group, `'a failed activation dispatches onStateChange for Preparing to Destroying to Destroyed'`, needs no change — a failed `prepare()` never reaches `Ready`.)

**1b.** Replace the two obsolete rollback tests. In `describe('SceneDirector — switch-phase rollback', ...)`, replace both tests:

```ts
  test('a throwing onStopScene listener rolls back to the previous scope and rethrows', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.setScene(FirstScene);
    const firstInstance = director.currentScene;

    const failure = new Error('onStopScene listener failed');

    director.onStopScene.add(() => {
      throw failure;
    });

    await expect(director.setScene(SecondScene)).rejects.toThrow(failure);

    expect(director.currentScene).toBe(firstInstance); // rolled back
    expect(director.state).toBe(SceneState.Active);
  });

  test('a throwing onStopScene listener during a retainCurrent switch un-suspends the previous scope', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.setScene(FirstScene);
    const firstInstance = director.currentScene;

    const failure = new Error('onStateChange listener failed');

    director.onStateChange.add(() => {
      throw failure;
    });

    await expect(director.setScene(SecondScene, { retainCurrent: true })).rejects.toThrow(failure);

    expect(director.currentScene).toBe(firstInstance);
    expect(firstInstance?.state).toBe(SceneState.Active); // un-suspended, not left dangling in _retained
    await expect(director.restoreScene(FirstScene)).rejects.toThrow(RetainedSceneNotFoundError); // proves it's NOT in _retained
  });
```

with:

```ts
  test('a throwing onStopScene listener no longer aborts the switch — isolated, reported via onError, switch completes (definition §2.2.1)', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.setScene(FirstScene);

    const failure = new Error('onStopScene listener failed');
    const errorSpy = vi.fn();

    director.onStopScene.add(() => {
      throw failure;
    });
    app.onError.add(errorSpy);

    await expect(director.setScene(SecondScene)).resolves.toBe(director);

    expect(director.currentScene).toBeInstanceOf(SecondScene);
    expect(director.state).toBe(SceneState.Active);
    expect(errorSpy).toHaveBeenCalledWith(failure);
  });

  test('a throwing onStateChange listener during a retainCurrent switch no longer un-suspends the previous scope — isolated, reported via onError, retention completes', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.setScene(FirstScene);
    const firstInstance = director.currentScene;

    const failure = new Error('onStateChange listener failed');
    const errorSpy = vi.fn();

    director.onStateChange.add(() => {
      throw failure;
    });
    app.onError.add(errorSpy);

    await expect(director.setScene(SecondScene, { retainCurrent: true })).resolves.toBe(director);

    expect(director.currentScene).toBeInstanceOf(SecondScene);
    expect(firstInstance?.state).toBe(SceneState.Suspended); // retained normally, not rolled back
    expect(errorSpy).toHaveBeenCalledWith(failure);

    await expect(director.restoreScene(FirstScene)).resolves.toBe(director); // proves it IS in _retained
  });

  test('a throwing onChangeScene/onStartScene listener does not abort setScene() or block later listeners', async () => {
    const app = createApplicationStub();
    const TestScene = makeSceneClass();
    const director = new SceneDirector(app, { test: TestScene });
    const errorSpy = vi.fn();
    const laterChangeListener = vi.fn();
    const laterStartListener = vi.fn();

    director.onChangeScene.add(() => {
      throw new Error('onChangeScene listener failed');
    });
    director.onChangeScene.add(laterChangeListener);
    director.onStartScene.add(() => {
      throw new Error('onStartScene listener failed');
    });
    director.onStartScene.add(laterStartListener);
    app.onError.add(errorSpy);

    await expect(director.setScene(TestScene)).resolves.toBe(director);

    expect(laterChangeListener).toHaveBeenCalledTimes(1);
    expect(laterStartListener).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: FAIL — the rewritten tests expect isolation/completion; today's unguarded `.dispatch()` calls still propagate and roll back.

- [ ] **Step 3: Implement**

In `src/core/SceneDirector.ts`, add the private helper, placed just above `_prepareScene`:

```ts
  /**
   * Report an exception thrown by a lifecycle Signal listener — used as the
   * `onError` callback for every `dispatchIsolated` call in this class
   * (definition §2.2/§2.2.1): logged, then forwarded to
   * {@link Application.onError}. Never propagates itself; `Signal.dispatchIsolated`
   * additionally guards against a throwing `onError` callback, but this
   * implementation does not throw regardless.
   */
  private _reportLifecycleError(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));

    logger.error('A SceneDirector lifecycle signal listener threw.', { source: 'SceneDirector', error: normalized });
    this._app.onError.dispatch(normalized);
  }
```

Change the `_prepareScene` scope construction:

```ts
    const scope = new SceneScope(this._app, scene, (previous, next) => this.onStateChange.dispatch(previous, next, scene as Scene));
```

to:

```ts
    const scope = new SceneScope(this._app, scene, (previous, next) =>
      this.onStateChange.dispatchIsolated(error => this._reportLifecycleError(error), previous, next, scene as Scene),
    );
```

Change `setScene()`'s dispatch pair:

```ts
      newScope.activate();

      this.onChangeScene.dispatch(scene as Scene);
      this.onStartScene.dispatch(scene as Scene);
```

to:

```ts
      newScope.activate();

      this.onChangeScene.dispatchIsolated(error => this._reportLifecycleError(error), scene as Scene);
      this.onStartScene.dispatchIsolated(error => this._reportLifecycleError(error), scene as Scene);
```

Change `_clearScene()`'s dispatch:

```ts
      this.onChangeScene.dispatch(null);
```

to:

```ts
      this.onChangeScene.dispatchIsolated(error => this._reportLifecycleError(error), null);
```

Change `restoreScene()`'s dispatch pair:

```ts
        this.onChangeScene.dispatch(retainedScope.scene as Scene);
        this.onStateChange.dispatch(previousState, retainedScope.state, retainedScope.scene as Scene);
```

to:

```ts
        this.onChangeScene.dispatchIsolated(error => this._reportLifecycleError(error), retainedScope.scene as Scene);
        this.onStateChange.dispatchIsolated(error => this._reportLifecycleError(error), previousState, retainedScope.state, retainedScope.scene as Scene);
```

Change `_disposeScene()`'s dispatch:

```ts
  private async _disposeScene(scope: SceneScope): Promise<void> {
    this.onStopScene.dispatch(scope.scene as Scene);
    await scope.destroy();
  }
```

to:

```ts
  private async _disposeScene(scope: SceneScope): Promise<void> {
    this.onStopScene.dispatchIsolated(error => this._reportLifecycleError(error), scope.scene as Scene);
    await scope.destroy();
  }
```

Change `_suspendAndRetain()`'s dispatch:

```ts
  private _suspendAndRetain(target: AnySceneConstructor, scope: SceneScope): void {
    const previousState = scope.state;

    scope.suspend();
    this._retained.set(target, scope);

    this.onStateChange.dispatch(previousState, scope.state, scope.scene as Scene);
  }
```

to:

```ts
  private _suspendAndRetain(target: AnySceneConstructor, scope: SceneScope): void {
    const previousState = scope.state;

    scope.suspend();
    this._retained.set(target, scope);

    this.onStateChange.dispatchIsolated(error => this._reportLifecycleError(error), previousState, scope.state, scope.scene as Scene);
  }
```

Finally, widen the `onStateChange` field doc to reflect that a throw no longer aborts anything — change:

```ts
  /**
   * Fires whenever the active scene's {@link SceneState} changes, as
   * `(previous, next, scene)` — every edge in the state graph, including the
   * initial `Preparing` → `Active` activation and the terminal
   * `Destroying` → `Destroyed` teardown, not just pause/resume/retention.
   */
  public readonly onStateChange = new Signal<[SceneState, SceneState, Scene]>();
```

to:

```ts
  /**
   * Fires whenever a scene's {@link SceneState} changes, as
   * `(previous, next, scene)` — every edge in the state graph, including
   * `Preparing` → `Ready`, `Ready` → `Active`, and the terminal
   * `Destroying` → `Destroyed` teardown, not just pause/resume/retention.
   * Pure observation: a throwing listener is reported through
   * {@link Application.onError} and never aborts the transition or blocks
   * the remaining listeners (definition §2.2/§2.2.1).
   */
  public readonly onStateChange = new Signal<[SceneState, SceneState, Scene]>();
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm eslint src/core/SceneDirector.ts test/core/scene-director.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/SceneDirector.ts test/core/scene-director.test.ts
git commit -m "fix(core): isolate lifecycle Signal dispatch in SceneDirector (definition §2.2.1)

A throwing onStopScene/onStateChange/onChangeScene/onStartScene listener
can no longer abort a navigation or roll back a switch — reported through
Application.onError instead, dispatch continues to the remaining
listeners. Rewrites the two 'switch-phase rollback' tests that exercised
the old (now removed) throw-triggers-rollback behavior."
```

---

## Task 11: Full-slice verification

**Files:** none (verification only).

- [ ] **Step 1: Full core test suite**

Run: `pnpm test:core`
Expected: PASS, 0 failures. Compare the file/test counts against the baseline (318 files / 5083 tests before this slice) — expect the counts to have grown by the new tests added across Tasks 1–10, with no file count decrease.

- [ ] **Step 2: Full typecheck (including examples)**

Run: `pnpm typecheck && pnpm typecheck:examples && pnpm typecheck:type-tests`
Expected: clean.

- [ ] **Step 3: Full lint**

Run: `pnpm lint:all`
Expected: clean.

- [ ] **Step 4: Format check**

Run: `pnpm format:check`
Expected: clean. If it fails on files this slice touched, run `pnpm format` and re-stage.

- [ ] **Step 5: Regenerate and check API docs**

`Scene.onActivate`/`Scene.onSuspend` are new public exports; `Scene.onLoad`/`Scene.onUnload` are removed ones. Run:

```bash
pnpm docs:api:generate
```

Expected: the generated API JSON reflects the new/removed signals. Then:

```bash
pnpm docs:api:check
```

Expected: clean (no drift between the generator's output and what's committed).

- [ ] **Step 6: Grep sweep for any remaining `onLoad`/`onUnload` reference**

Run: `grep -rn "\.onLoad\b\|\.onUnload\b" src/ test/ examples/ site/ docs/superpowers 2>/dev/null | grep -v "Loader\|resources/Loader"`
Expected: no output referring to `Scene.onLoad`/`Scene.onUnload` (the `Loader.onLoad`-style hits from `src/resources/Loader.ts`, if any, are a distinct, unrelated signal and must remain — the grep's `-v` filter excludes that file already; double-check nothing else slipped through).

- [ ] **Step 7: Commit any formatting fixups**

```bash
git add -A
git commit -m "chore: format + docs:api:generate for Slice 2 (Ready state & facility dormancy)"
```

(Skip this commit if Steps 4–5 produced no changes.)

- [ ] **Step 8: Update this plan's checkboxes**

Mark every completed task's checkboxes `[x]` in this file and commit:

```bash
git add docs/superpowers/plans/2026-07-23-scene-transition-slice-2-ready-facility-dormancy.md
git commit -m "docs: mark Slice 2 plan complete"
```

---

## Self-Review

**1. Spec coverage.**
- §2 (remove `onLoad`/`onUnload`, add `onActivate`/`onSuspend`) — Task 8.
- §2.1 (exact signal/dispatch ordering for fresh activation, restore, suspend, teardown) — Task 9 (`SceneScope.activate()`/`restore()`/`suspend()` reordered exactly per the table); teardown ordering itself is unchanged (already correct) and untouched.
- §2.2 (lifecycle signal error semantics — never rolls back, never blocks remaining listeners, reported via `onError`) — Task 2 (`dispatchIsolated`) + Tasks 9–10 (every lifecycle dispatch site converted).
- §2.2.1 (`Signal.dispatch()` needs a dedicated path; this is a deliberate behavior change breaking an existing test) — Task 2 + Task 10 (explicitly rewrites the two named-in-spec obsolete tests).
- §4.1 (dormancy problem — verified `_attachAutoRoots()` called unconditionally from `prepare()`, `SceneInteraction.observe()`/`.capture()` eager-attach) — Task 7 (SceneInteraction) + Task 9 (moves auto-root attach to `activate()`).
- §4.2 (genuine `Ready` state with cold facilities; dormancy invariant table; `Suspended` included deliberately; `SceneAudio`/`SceneTweens`/`SceneInteraction` per-facility specifics; `SceneLoader` exception) — Task 1 (`Ready`), Task 3 (`SceneInputs`), Task 4 (`SceneAudio`), Task 6 (`SceneTweens`), Task 7 (`SceneInteraction`). Loader deliberately untouched (Global Constraints note).
- Scope note ("`SceneScope.prepare()` should end in `Ready`... `SceneDirector.ts`'s call flow stays as-is structurally") — Task 9's `prepare()`/`activate()` split; Global Constraints documents the resulting `_rollbackSwitch()`/`destroyFailedActivation()` temporary imprecision explicitly, matching the task instructions' own framing.

**2. Placeholder scan.** Every step above contains complete, real code (full method bodies, full test files/blocks) — no "TODO", no "add appropriate handling," no "similar to Task N" without the actual code shown. Task 6's `TweenSequencerType` alias note is the one place where I called out a construction detail explicitly (to avoid a double-import bug) rather than silently leaving it implicit — reviewed and it resolves to concrete, unambiguous instructions (collapse to a single import, substitute the name), not a placeholder.

**3. Type consistency.**
- `SceneInteraction` constructor: `(app: Application, getState: () => SceneState)` — consistent across Task 7's implementation, Task 9's call site (`new SceneInteraction(app, () => this._state)`), and Task 7's test updates.
- `SceneTweens` constructor: `(app: Application, getState: () => SceneState)` — consistent across Task 6's implementation, Task 9's call site, and Task 6's test updates.
- `Signal.dispatchIsolated(onError: (error: unknown) => void, ...params: Args): this` — consistent across Task 2's implementation and every call site in Tasks 9–10 (`error => this._reportError(error)` / `error => this._reportLifecycleError(error)`).
- `TweenSequencer._attachManager(manager: TweenManager): void` — matches `Tween._attachManager`'s existing shape exactly; Task 6's `SceneTweens.restore()` calls it as `sequencer._attachManager(this._app.tweens)`.
- `SceneScope._reportError(error: unknown): void` (new, singular) vs. the pre-existing `_reportErrors(errors: unknown[]): void` (now delegates to it) — both defined in Task 9, no other task assumes a different shape.
- `SceneState.Ready = 'ready'` used identically (string literal, enum member) everywhere it's referenced across all eleven tasks.

No further gaps found; plan is complete and internally consistent.
