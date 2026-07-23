# v0.17 Scene Transition/Lifecycle Redesign — Slice 3: Atomic Navigation Transaction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `SceneDirector.setScene()`/`restoreScene()` with `change()`/`restore()` — a clean break, not an alias — built on the atomic commit boundary defined in `.workspace/specs/2026-07-23-scene-transition-lifecycle-design.md` §3.5/§3.5.1/§3.5.2: the outgoing scope remains `_activeScope` for the entire pre-commit phase, the swap to the incoming scope happens exactly once at a point guaranteed never to throw, and `_rollbackSwitch()` — needed today only because of an optimistic early `_activeScope` reassignment this slice removes — disappears entirely. `suspendCurrent` replaces `retainCurrent` as the one option name (not aliased alongside it). Both methods gain key-based navigation (a registered string key, alongside a constructor) wired to the bidirectional registry Slice 1 lands. The pre-existing hardcoded fade-transition machinery in `SceneDirector.ts` is left completely alone and is still reachable through a narrow, explicitly-temporary bridge — the one deliberate exception to this redesign's "no shims" rule, justified purely by slice sequencing (Slice 5 replaces that machinery wholesale).

**Architecture:**

This slice does **not** touch `SceneScope.ts` — no changes are needed there. `SceneScope.prepare()`/`.activate()`/`.suspend()`/`.restore()`/`.destroy()` already have exactly the call shape this slice needs (Slice 2, assumed merged, only changed what happens *inside* `prepare()`/`activate()` — ending in `Ready` instead of `Preparing` before `activate()` runs — which is transparent to `SceneDirector`'s calling code).

The atomic commit boundary is extracted into a new, narrowly-scoped collaborator, `SceneNavigationTransaction` (`src/core/scene/SceneNavigationTransaction.ts`), rather than inlined into `SceneDirector.change()`/`restore()` directly. Reasoning, since the task explicitly calls for this File Structure decision to be made and justified here: `SceneDirector.ts` is 740 lines today and both `change()`/`restore()` need the *identical* outgoing-scope disposition logic (suspend+retain vs. begin-permanent-teardown, plus the guarded post-commit signal dispatch) — today that logic is `_handleOutgoingScope()`/`_suspendAndRetain()`/`_rollbackSwitch()`, about 60 lines duplicating concerns across two call sites. Slice 5's own scope note explicitly identifies "the `environment.commit()` hook point is exactly your atomic commit boundary" — i.e., Slice 5's transition-session runner needs to call into precisely this logic too, from a different call site (its session-driving loop) that doesn't naturally live inside `change()`'s/`restore()`'s own method bodies. Giving this logic one small, dedicated, already-unit-tested class with two precisely-specified methods (`beginOutgoingDisposition`/`finishOutgoingDisposition`) gives Slice 5 a stable, narrow seam to call through instead of reaching into `SceneDirector`'s private methods or duplicating the logic a third time. `SceneDirector` remains the sole owner of `_activeScope`/`_activeScopeTarget`/`_retained` — the transaction collaborator is handed `_retained` and the two Director signals it needs to dispatch (`onStopScene`, `onStateChange`) at construction time and holds no other state.

Every lifecycle-signal dispatch this slice's code performs — `onChangeScene`, `onStartScene`, `onStopScene`, `onStateChange` (both the `SceneScope`-internal transitions routed through the callback wired up in `_prepareScene`, and the Director-driven suspend/restore edges) — is wrapped in a small local guard (`_dispatchGuarded`/`_reportNavigationError` on `SceneDirector`, mirrored inside `SceneNavigationTransaction`) that reports a throwing listener through `Application.onError` instead of letting it propagate. This is required by the atomic model itself, independent of whatever Signal-level exception-isolation Slice 2 may or may not already provide generically (§2.2.1 assigns that to Slice 2's "Scene lifecycle signal rework," but this slice cannot depend on its exact shape without knowing it — see the assumption note below): once `change()`/`restore()` cross the commit boundary (§3.5 step 7), nothing may cause the returned promise to reject or leave `_activeScope` pointing at a half-committed scope, and a throwing lifecycle listener is exactly the one realistic way that could otherwise happen. This is also precisely why the current `test/core/scene-director.test.ts` "switch-phase rollback" describe block (two tests, asserting a throwing `onStopScene`/`onStateChange` listener rolls the switch back) is deleted, not renamed: under the atomic model there is nothing to roll back to — the new scene is already live and committed by the time either signal fires — so this slice replaces those two tests with two that assert the opposite (and complementary) property: the switch stays committed, `change()`/`restore()` still resolve, and the error surfaces via `Application.onError`.

**Explicit, load-bearing assumption about Slices 1 and 2 (both merged ahead of this slice, per the dependency order):**
- **Slice 2** (`Ready` state, `Scene.onActivate`/`onSuspend`, cold facilities): `SceneScope.prepare()` ends in `Ready`; a separate `SceneScope.activate()` call moves `Ready → Active`. This slice's code calls `prepare()` then `activate()` in exactly the same two-step shape the current (pre-Slice-2) code already uses — nothing here needs to change for that reason alone.
- **Slice 1** (bidirectional key↔constructor registry, `Application<Registry>`): this slice assumes `SceneDirector` is already declared as `SceneDirector<Registry extends SceneRegistryShape<Registry> = Record<string, never>>` (spec §6.1), and that its internal `_registry` field — today a one-way `ReadonlyMap<AnySceneConstructor, string>` built by `validateSceneRegistry()` — has been extended with **one** new capability this slice actually calls: resolving a registered string key back to its constructor, referenced below as `this._registry.resolve(key: string): AnySceneConstructor | undefined`. Every other existing use of `this._registry` in today's file (`.has(ctor)`, `[...this._registry.values()]` for the registered-name list passed to `UnregisteredSceneError`) is left completely unchanged, on the assumption Slice 1 preserved that shape. **Before starting Task 3, read the actual, by-then-merged `SceneTypes.ts`/`SceneDirector.ts` and confirm this** — if Slice 1's real method/property names differ from `.resolve(key)`, rename only that one call site to match; every other assumption and every other line of this plan is unaffected by Slice 1's exact naming choices.
- This slice does **not** assume Slice 1 added the `{ scene, transition }` registry-descriptor form (spec §6.1's `SceneRegistration` union) — that form's `transition` field only makes sense once `SceneTransitionSelection` exists (Slice 5+), so it is out of scope here regardless of whether Slice 1 already stubbed it in. `SceneRegistryShape<Registry>` is assumed to be the simpler `{ readonly [K in keyof Registry]: AnySceneConstructor }` for this slice's purposes.

**Deliberately out of scope for this slice** (confirmed against the 8-slice breakdown): preload (`_preloaded`, Slice 4), the real `SceneTransition`/`PhasedSceneTransition`/`SceneTransitionSession` runtime and its `environment.commit()` (Slice 5), phase composition/rendering (Slice 6), built-in transitions and the `Application.start()` §3.7 startup-sequencing fix (Slice 7), and migrating examples/docs/guides off `setScene`/`retainCurrent` (Slice 8). The existing hardcoded fade machinery (`_transitionOverlay`, `_advanceTransition`, `_executeTransitionAction`, `_finishTransition`, `_getTransitionAlpha`, `_renderTransitionOverlay`, `_runTransitionedAction`, the `ActiveFadeTransition`/`TransitionOverlayMesh` types, and the old `FadeSceneTransition`/`SceneTransition` union in `SceneTypes.ts`) is untouched line-for-line — only *how it's reached* changes (via the new methods' names, through the bridge type below).

**Tech Stack:** TypeScript (strict), Vitest. Builds on `SceneScope`/`SceneState`/`SceneTypes` as they exist after Slices 1–2 (assumed merged, per above); baseline for everything this plan does *not* assume changed is `pnpm test:core` green at 318 files / 5083 tests / 0 failures on `origin/main @ b5aad1a3`.

## Global Constraints

- Clean breaks only — no deprecated aliases, no shims (pre-1.0 policy). **The one sanctioned, explicitly-temporary exception:** `change()`/`restore()` still accept an old-shaped `transition` option (`{ type: 'fade', duration?, color? }`) and route it through the untouched fade machinery exactly as `setScene()`/`restoreScene()` do today — needed purely because Slice 5, not this slice, replaces that machinery. This bridge's type (`ChangeSceneCallOptions`/`RestoreSceneCallOptions`) is not re-exported from the package root and is not part of `ChangeSceneOptions`/`RestoreSceneOptions`'s documented public shape.
- `suspendCurrent: boolean` fully replaces `retainCurrent: boolean` — one name, not both, everywhere (types, JSDoc, error messages, tests).
- `data`/`options` collapse into one object — no more two-argument `(data?, options?)` variadic pair, no more runtime data-vs-options guessing (`resolveSetSceneArgs`/`looksLikeSetSceneOptions`/`SetSceneArgs` are deleted, not deprecated).
- Every lifecycle signal dispatch this slice's code performs, once past the atomic commit boundary, must not be able to reject `change()`/`restore()`'s returned promise — a throwing listener is reported via `Application.onError` instead.
- `_rollbackSwitch()` is deleted, not renamed or reused — there is nothing left for it to do under the atomic model (§3.5.1).
- JSDoc conventions: see `[[feedback-jsdoc-conventions]]` memory — every public export gets a doc comment; `@internal` for engine-only surface.
- `pnpm docs:api:generate` must be run and committed before the final push (push-gated).
- Every task ends green on its own scoped test command before moving to the next.
- Director-level signal *names* (`onChangeScene`/`onStartScene`/`onStopScene`/`onStateChange`) are unchanged — only navigation *methods* are renamed.

---

## File Structure

```text
src/core/
├── SceneTypes.ts                        (modified) — delete SetSceneOptions/RestoreSceneOptions (old
│                                                        shape)/SetSceneArgs/resolveSetSceneArgs/
│                                                        looksLikeSetSceneOptions/setSceneOptionsKeys/
│                                                        isPlainObject; add ChangeSceneOptions<Data>/
│                                                        ChangeSceneArgs<Data>/RestoreSceneOptions (new
│                                                        shape)/ChangeSceneCallOptions<Data>/
│                                                        RestoreSceneCallOptions (the fade bridge, @internal,
│                                                        not re-exported); update error-message text
│                                                        referencing the old method names
├── SceneDirector.ts                     (modified) — change()/restore() (replace setScene()/restoreScene()),
│                                                        _resolveNavigationTarget(), _dispatchGuarded()/
│                                                        _reportNavigationError(), _navigation field; delete
│                                                        _handleOutgoingScope()/_suspendAndRetain()/
│                                                        _rollbackSwitch(); _prepareScene()'s onStateChange
│                                                        callback now goes through _dispatchGuarded; the fade
│                                                        machinery (bottom half of the file) is untouched
├── Application.ts                       (modified) — start()'s two overloads + its scenes.setScene(...) call
│                                                        site → change()/ChangeSceneArgs (name/type change only
│                                                        — the §3.7 startup-sequencing fix is Slice 7's job)
└── scene/
    └── SceneNavigationTransaction.ts      (new) — beginOutgoingDisposition()/finishOutgoingDisposition(),
                                                     the shared atomic-commit-boundary collaborator

test/core/
├── scene-director.test.ts               (modified) — setScene→change/restoreScene→restore/retainCurrent→
│                                                        suspendCurrent renamed throughout; "switch-phase
│                                                        rollback" describe block deleted and replaced with
│                                                        "post-commit signal isolation"; new "key-based
│                                                        navigation" describe block added
└── scene/
    └── scene-navigation-transaction.test.ts (new) — dedicated unit coverage for the new collaborator
```

---

## Task 1: `SceneTypes.ts` — single options object, `suspendCurrent` rename, the fade bridge

**Files:**

- Modify: `src/core/SceneTypes.ts`

**Interfaces:**

- Consumes (Slice 1, assumed merged, unused by this task directly but not removed): `SceneRegistryShape<Registry>`, `RegistryKeyOf<Registry>` — this task does not touch registry types at all, only the options/args shapes.
- Produces: `ChangeSceneOptions<Data>`, `ChangeSceneArgs<Data>`, `RestoreSceneOptions` (new shape — `suspendCurrent` only, no `data`), `ChangeSceneCallOptions<Data>` (`@internal`, the fade bridge), `RestoreSceneCallOptions` (`@internal`, the fade bridge). Consumed by Task 3 (`SceneDirector`).

No dedicated test file for this task — like the equivalent type-only task in the prior retention slice, these are pure type/shape additions with no independent runtime behavior; they're exercised through Task 3's `SceneDirector` tests. This task ends on a clean `pnpm typecheck` instead.

- [ ] **Step 1: Delete the old variadic-args machinery**

In `src/core/SceneTypes.ts`, delete these four pieces entirely (they exist to resolve the two-argument `(data?, options?)` ambiguity that no longer exists once there is only one `options` object):

```ts
const setSceneOptionsKeys = new Set(['transition', 'retainCurrent']);

export type SetSceneArgs<Data> = [Data] extends [void] ? [options?: SetSceneOptions] : [data: Readonly<Data>, options?: SetSceneOptions];

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const looksLikeSetSceneOptions = (value: unknown): value is SetSceneOptions =>
  isPlainObject(value) && Object.keys(value).every(key => setSceneOptionsKeys.has(key));

export function resolveSetSceneArgs(args: readonly unknown[]): { data: unknown; options: SetSceneOptions } {
  if (args.length >= 2) {
    return { data: args[0], options: (args[1] as SetSceneOptions | undefined) ?? {} };
  }

  if (args.length === 1) {
    return looksLikeSetSceneOptions(args[0]) ? { data: undefined, options: args[0] } : { data: args[0], options: {} };
  }

  return { data: undefined, options: {} };
}
```

Also delete their doc comments (the block starting `/** The reserved key set of {@link SetSceneOptions}...`, the block starting `/** Tuple type for the variadic tail...`, and the block starting `/** Resolve the erased-at-runtime...`).

- [ ] **Step 2: Delete the old `SetSceneOptions`/`RestoreSceneOptions`**

Delete:

```ts
/** Options passed to {@link SceneDirector.setScene} / {@link Application.start}. */
export interface SetSceneOptions {
  transition?: SceneTransition;
  /**
   * Suspend the outgoing scene instead of ending it permanently, retaining
   * it (keyed by its constructor) for a later {@link SceneDirector.restoreScene}
   * call. The same scene instance and its state are preserved; `load()`/
   * `init()` do not re-run on restore.
   */
  retainCurrent?: boolean;
}

/** Options passed to {@link SceneDirector.restoreScene}. */
export interface RestoreSceneOptions {
  transition?: SceneTransition;
  /**
   * Suspend the currently active scene (if any) instead of ending it
   * permanently, retaining it for a later {@link SceneDirector.restoreScene}
   * call — mirrors {@link SetSceneOptions.retainCurrent}.
   */
  retainCurrent?: boolean;
}
```

- [ ] **Step 3: Add the new options/args types in their place**

```ts
/**
 * Options for {@link SceneDirector.change}. This is an intermediate shape —
 * the spec's final shape (definition §6.3) also carries a `transition`
 * field accepting a `SceneTransitionSelection` (a class-based
 * `SceneTransition`/`PhasedSceneTransition`, or an `{ enter, exit }` pair).
 * That lands in Slice 5, once the real transition-runtime types exist. A
 * caller who still needs today's hardcoded fade machinery in the meantime
 * uses the bridge documented on {@link SceneDirector.change} itself, not
 * this type — `transition` is deliberately not part of this shape yet.
 */
export type ChangeSceneOptions<Data> = ([Data] extends [void] ? { data?: never } : { data: Readonly<Data> }) & {
  /**
   * Suspend the outgoing scene instead of ending it permanently, retaining
   * it (keyed by its constructor) for a later {@link SceneDirector.restore}
   * call. The same scene instance and its state are preserved; `load()`/
   * `init()` do not re-run on restore. Replaces the old `retainCurrent`
   * name — same meaning, renamed to match the public state it produces
   * ({@link SceneState.Suspended}).
   */
  suspendCurrent?: boolean;
};

/**
 * Tuple type for `change()`'s single options parameter: present-and-required
 * whenever `ChangeSceneOptions<Data>` has a required `data` field (`Data`
 * is not `void`), optional otherwise. There is no runtime data/options
 * ambiguity to resolve anymore — `data` always lives inside this one
 * object, never as a separate positional argument (spec §6.3; this
 * supersedes the deleted two-argument `SetSceneArgs`).
 */
export type ChangeSceneArgs<Data> = [Data] extends [void] ? [options?: ChangeSceneOptions<Data>] : [options: ChangeSceneOptions<Data>];

/**
 * Options for {@link SceneDirector.restore}. No `data` field — a restored
 * scope reuses whatever activation data it was originally prepared with;
 * `load()`/`init()` never run again for it (definition §14.3).
 */
export interface RestoreSceneOptions {
  /** Suspend the currently active scene (if any) instead of ending it permanently — mirrors {@link ChangeSceneOptions.suspendCurrent}. */
  suspendCurrent?: boolean;
}

/**
 * @internal Temporary bridge, removed by Slice 5 once `SceneTransition`
 * becomes the real class-based union (spec §3.2) and a `transition` field
 * is added to {@link ChangeSceneOptions} directly (spec §6.3). Until then,
 * `SceneDirector.change()` still accepts today's hardcoded-fade-shaped
 * `transition` option and routes it through the existing fade machinery
 * unchanged — this type is that call boundary's actual (wider) parameter
 * type. Deliberately not re-exported from the package root: a new caller
 * should not discover `transition` as supported input via this slice's
 * public types.
 */
export type ChangeSceneCallOptions<Data> = ChangeSceneOptions<Data> & { transition?: SceneTransition };

/** @internal Bridge counterpart of {@link ChangeSceneCallOptions} for {@link SceneDirector.restore}. See its doc comment for the full rationale. */
export type RestoreSceneCallOptions = RestoreSceneOptions & { transition?: SceneTransition };
```

- [ ] **Step 4: Update error-message text referencing the old method names**

In `RetainedSceneConflictError`'s constructor, change:

```ts
super(
  `Scene constructor "${constructorName}" already has a retained (suspended) instance. Call restoreScene(...) or releaseScene(...) for it before starting a fresh activation.`,
);
```

to:

```ts
super(
  `Scene constructor "${constructorName}" already has a retained (suspended) instance. Call restore(...) or releaseScene(...) for it before starting a fresh activation.`,
);
```

Update the JSDoc directly above the class from `@link SceneDirector.restoreScene}` to `{@link SceneDirector.restore}`. Do the same for `ConcurrentSceneNavigationError`'s doc comment (`` `setScene`/`restoreScene` `` → `` `change`/`restore` ``) and `RetainedSceneConflictError`'s doc comment (`` Thrown when `setScene` targets... `` → `` Thrown when `change` targets... ``, `` `restoreScene` `` → `` `restore` ``) and `RetainedSceneNotFoundError`'s doc comment (`` `restoreScene` `` → `` `restore` ``).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: FAILS at this point — `SceneDirector.ts` still imports the now-deleted `SetSceneOptions`/`RestoreSceneOptions`/`SetSceneArgs`/`resolveSetSceneArgs`. That's expected; Task 3 fixes it. Confirm the failure is exactly those missing-export errors in `SceneDirector.ts`/`Application.ts` and nothing else (e.g. no stray typo in the new types themselves) before moving on.

- [ ] **Step 6: Commit**

```bash
git add src/core/SceneTypes.ts docs/superpowers/plans/2026-07-23-scene-transition-slice-3-atomic-navigation-transaction.md
git commit -m "feat(core)!: single-options ChangeSceneOptions/RestoreSceneOptions, suspendCurrent rename

Deletes the erased-at-runtime (data?, options?) variadic heuristic
(SetSceneArgs/resolveSetSceneArgs/looksLikeSetSceneOptions) entirely — data
now always lives inside the one options object change()/restore() take, so
there is nothing left to disambiguate at runtime. retainCurrent is renamed
to suspendCurrent throughout. Adds a deliberately-narrow, @internal,
non-re-exported bridge type (ChangeSceneCallOptions/RestoreSceneCallOptions)
so change()/restore() can still accept today's hardcoded-fade-shaped
transition option until Slice 5 replaces that machinery.

Breaking: SetSceneOptions/RestoreSceneOptions (old shape)/SetSceneArgs/
resolveSetSceneArgs are removed, not aliased (pre-1.0 clean-break policy).
SceneDirector.ts/Application.ts do not yet compile against this — fixed in
the next commit."
```

---

## Task 2: `SceneNavigationTransaction` — the shared atomic-commit-boundary collaborator

**Files:**

- Create: `src/core/scene/SceneNavigationTransaction.ts`
- Create: `test/core/scene/scene-navigation-transaction.test.ts`

**Interfaces:**

- Consumes: `SceneScope` (existing — only its `.state`/`.suspend()`/`.destroy()`/`.scene` members are used), `SceneState` (existing), `Signal` (existing), `AnySceneConstructor` (existing), `Scene` (existing — only for the `.scene as Scene` casts already used elsewhere in `SceneDirector.ts`).
- Produces: `SceneNavigationTransaction`, constructed with `(retained: Map<AnySceneConstructor, SceneScope>, onStopScene: Signal<[Scene]>, onStateChange: Signal<[SceneState, SceneState, Scene]>, reportError: (error: unknown) => void)`. Exposes `beginOutgoingDisposition(outgoing, suspendCurrent): { teardown: Promise<void>; pendingStopScene: SceneScope | null }` and `finishOutgoingDisposition(pendingStopScene: SceneScope | null): void`. Consumed by Task 3 (`SceneDirector.change()`/`restore()`), and — per this plan's Architecture section — intended as the exact seam Slice 5's transition-session runner calls through at its `environment.commit()` point.

- [ ] **Step 1: Write the failing tests**

```ts
// test/core/scene/scene-navigation-transaction.test.ts (new file)
import type { Scene } from '#core/Scene';
import { SceneNavigationTransaction } from '#core/scene/SceneNavigationTransaction';
import type { SceneScope } from '#core/SceneScope';
import { SceneState } from '#core/SceneState';
import type { AnySceneConstructor } from '#core/SceneTypes';
import { Signal } from '#core/Signal';

class FakeTarget {}

const makeFakeScope = (state: SceneState = SceneState.Active): SceneScope & { state: SceneState } => {
  const scope = {
    state,
    scene: { name: 'fake-scene' } as unknown as Scene,
    suspend: vi.fn(() => {
      if (scope.state !== SceneState.Active) {
        return false;
      }

      scope.state = SceneState.Suspended;

      return true;
    }),
    destroy: vi.fn(async () => {
      scope.state = SceneState.Destroyed;
    }),
  } as unknown as SceneScope & { state: SceneState };

  return scope;
};

describe('SceneNavigationTransaction', () => {
  describe('beginOutgoingDisposition()', () => {
    test('with no outgoing scope, resolves immediately with a null pendingStopScene', () => {
      const retained = new Map<AnySceneConstructor, SceneScope>();
      const onStopScene = new Signal<[Scene]>();
      const onStateChange = new Signal<[SceneState, SceneState, Scene]>();
      const reportError = vi.fn();
      const transaction = new SceneNavigationTransaction(retained, onStopScene, onStateChange, reportError);

      const result = transaction.beginOutgoingDisposition(null, false);

      expect(result.pendingStopScene).toBeNull();
      return expect(result.teardown).resolves.toBeUndefined();
    });

    test('suspendCurrent: true suspends the outgoing scope, retains it, and dispatches onStateChange — no pending onStopScene', async () => {
      const retained = new Map<AnySceneConstructor, SceneScope>();
      const onStopScene = new Signal<[Scene]>();
      const onStateChange = new Signal<[SceneState, SceneState, Scene]>();
      const reportError = vi.fn();
      const transaction = new SceneNavigationTransaction(retained, onStopScene, onStateChange, reportError);
      const scope = makeFakeScope(SceneState.Active);
      const onStateChangeSpy = vi.fn();

      onStateChange.add(onStateChangeSpy);

      const result = transaction.beginOutgoingDisposition({ scope, target: FakeTarget }, true);

      expect(scope.suspend).toHaveBeenCalledTimes(1);
      expect(retained.get(FakeTarget)).toBe(scope);
      expect(onStateChangeSpy).toHaveBeenCalledWith(SceneState.Active, SceneState.Suspended, scope.scene);
      expect(result.pendingStopScene).toBeNull();
      await expect(result.teardown).resolves.toBeUndefined();
    });

    test('suspendCurrent: false begins permanent teardown and returns the scope as pendingStopScene', () => {
      const retained = new Map<AnySceneConstructor, SceneScope>();
      const onStopScene = new Signal<[Scene]>();
      const onStateChange = new Signal<[SceneState, SceneState, Scene]>();
      const reportError = vi.fn();
      const transaction = new SceneNavigationTransaction(retained, onStopScene, onStateChange, reportError);
      const scope = makeFakeScope(SceneState.Active);

      const result = transaction.beginOutgoingDisposition({ scope, target: FakeTarget }, false);

      expect(scope.destroy).toHaveBeenCalledTimes(1);
      expect(result.pendingStopScene).toBe(scope);
      expect(retained.has(FakeTarget)).toBe(false);
    });

    test('a throwing onStateChange listener during a suspendCurrent commit is reported, not thrown, and the scope is still retained', () => {
      const retained = new Map<AnySceneConstructor, SceneScope>();
      const onStopScene = new Signal<[Scene]>();
      const onStateChange = new Signal<[SceneState, SceneState, Scene]>();
      const reportError = vi.fn();
      const transaction = new SceneNavigationTransaction(retained, onStopScene, onStateChange, reportError);
      const scope = makeFakeScope(SceneState.Active);
      const failure = new Error('onStateChange listener failed');

      onStateChange.add(() => {
        throw failure;
      });

      expect(() => transaction.beginOutgoingDisposition({ scope, target: FakeTarget }, true)).not.toThrow();
      expect(retained.get(FakeTarget)).toBe(scope);
      expect(reportError).toHaveBeenCalledWith(failure);
    });
  });

  describe('finishOutgoingDisposition()', () => {
    test('with null, is a no-op', () => {
      const onStopScene = new Signal<[Scene]>();
      const dispatchSpy = vi.spyOn(onStopScene, 'dispatch');
      const transaction = new SceneNavigationTransaction(new Map(), onStopScene, new Signal<[SceneState, SceneState, Scene]>(), vi.fn());

      expect(() => transaction.finishOutgoingDisposition(null)).not.toThrow();
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    test('with a scope, dispatches onStopScene with its scene', () => {
      const onStopScene = new Signal<[Scene]>();
      const onStopSceneSpy = vi.fn();
      const transaction = new SceneNavigationTransaction(new Map(), onStopScene, new Signal<[SceneState, SceneState, Scene]>(), vi.fn());
      const scope = makeFakeScope(SceneState.Destroying);

      onStopScene.add(onStopSceneSpy);
      transaction.finishOutgoingDisposition(scope);

      expect(onStopSceneSpy).toHaveBeenCalledWith(scope.scene);
    });

    test('a throwing onStopScene listener is reported, not thrown', () => {
      const onStopScene = new Signal<[Scene]>();
      const reportError = vi.fn();
      const transaction = new SceneNavigationTransaction(new Map(), onStopScene, new Signal(), reportError);
      const scope = makeFakeScope(SceneState.Destroying);
      const failure = new Error('onStopScene listener failed');

      onStopScene.add(() => {
        throw failure;
      });

      expect(() => transaction.finishOutgoingDisposition(scope)).not.toThrow();
      expect(reportError).toHaveBeenCalledWith(failure);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene/scene-navigation-transaction.test.ts`
Expected: FAIL — the module `#core/scene/SceneNavigationTransaction` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/core/scene/SceneNavigationTransaction.ts (new file, full contents)
import type { Scene } from '../Scene';
import type { SceneScope } from '../SceneScope';
import type { SceneState } from '../SceneState';
import type { AnySceneConstructor } from '../SceneTypes';
import type { Signal } from '../Signal';

/** An outgoing scope at a switch boundary, paired with the constructor it was activated from (needed to key it in `_retained` when suspended). */
export interface OutgoingScope {
  readonly scope: SceneScope;
  readonly target: AnySceneConstructor;
}

/** Result of {@link SceneNavigationTransaction.beginOutgoingDisposition}. */
export interface OutgoingDisposition {
  /** Resolves once the outgoing scope's permanent teardown has fully settled. Already resolved when there was no outgoing scope, or it was suspended instead of torn down. */
  readonly teardown: Promise<void>;
  /** The scope `finishOutgoingDisposition` must still dispatch `onStopScene` for, or `null` when there is nothing to dispatch (no outgoing scope, or it was suspended instead). */
  readonly pendingStopScene: SceneScope | null;
}

/**
 * @internal Collaborator owned by `SceneDirector`, holding the atomic
 * commit-boundary logic (definition §3.5, steps 5 and 8) shared by
 * `change()` and `restore()` — and the exact seam a later slice's
 * transition-session runner calls through at its own commit point, so this
 * logic exists in exactly one place rather than duplicated per call site.
 * Holds no state of its own beyond the `_retained` map and the two Director
 * signals it dispatches through, both handed in at construction —
 * `SceneDirector` remains the sole owner of `_activeScope`/
 * `_activeScopeTarget`/`_retained` itself.
 */
export class SceneNavigationTransaction {
  public constructor(
    private readonly _retained: Map<AnySceneConstructor, SceneScope>,
    private readonly _onStopScene: Signal<[Scene]>,
    private readonly _onStateChange: Signal<[SceneState, SceneState, Scene]>,
    private readonly _reportError: (error: unknown) => void,
  ) {}

  /**
   * Commit the outgoing scope's fate as part of an atomic switch (§3.5 step
   * 5): suspend and retain it under `outgoing.target` when `suspendCurrent`
   * is set (dispatching `onStateChange` for the edge, guarded — a throwing
   * listener is reported, never thrown back), otherwise begin its permanent
   * teardown (`scope.destroy()`, which synchronously flips it to
   * `Destroying` before this method returns) and hand back the still-settling
   * teardown promise plus the scope `finishOutgoingDisposition` must still
   * dispatch `onStopScene` for. No-op (an already-resolved teardown, `null`
   * pending-stop-scene) when `outgoing` is `null`. Never throws.
   */
  public beginOutgoingDisposition(outgoing: OutgoingScope | null, suspendCurrent: boolean): OutgoingDisposition {
    if (outgoing === null) {
      return { teardown: Promise.resolve(), pendingStopScene: null };
    }

    if (suspendCurrent) {
      const previousState = outgoing.scope.state;

      outgoing.scope.suspend();
      this._retained.set(outgoing.target, outgoing.scope);
      this._dispatchGuarded(() => this._onStateChange.dispatch(previousState, outgoing.scope.state, outgoing.scope.scene as Scene));

      return { teardown: Promise.resolve(), pendingStopScene: null };
    }

    return { teardown: outgoing.scope.destroy(), pendingStopScene: outgoing.scope };
  }

  /**
   * Not-rollback-able step 8: dispatch `onStopScene` for a just-committed
   * permanent switch's outgoing scope — guarded, never throws back to the
   * caller (the switch already committed; a throwing listener here cannot
   * un-commit it). No-op when `pendingStopScene` is `null`.
   */
  public finishOutgoingDisposition(pendingStopScene: SceneScope | null): void {
    if (pendingStopScene === null) {
      return;
    }

    this._dispatchGuarded(() => this._onStopScene.dispatch(pendingStopScene.scene as Scene));
  }

  private _dispatchGuarded(dispatch: () => void): void {
    try {
      dispatch();
    } catch (error) {
      this._reportError(error);
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/scene/scene-navigation-transaction.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: the pre-existing `SceneDirector.ts`/`Application.ts` failures from Task 1 Step 5 are still present (untouched until Task 3) — confirm no *new* errors come from this task's own two files.

- [ ] **Step 6: Commit**

```bash
git add src/core/scene/SceneNavigationTransaction.ts test/core/scene/scene-navigation-transaction.test.ts
git commit -m "feat(core): SceneNavigationTransaction — shared atomic commit-boundary collaborator

Extracts the outgoing-scope disposition logic (suspend+retain vs. begin
permanent teardown) and its guarded post-commit signal dispatch into one
small, already-unit-tested collaborator, shared by change()/restore()
(next commit) and intended as the seam a later slice's transition-session
runner calls through at its own commit point, instead of duplicating this
logic a third time or reaching into SceneDirector's private methods."
```

---

## Task 3: `SceneDirector.ts` — `change()`/`restore()`, key-based navigation, delete `_rollbackSwitch()`

**Files:**

- Modify: `src/core/SceneDirector.ts`
- Modify: `test/core/scene-director.test.ts`

**Interfaces:**

- Consumes: `SceneNavigationTransaction` (Task 2), `ChangeSceneOptions`/`ChangeSceneArgs`/`ChangeSceneCallOptions`/`RestoreSceneOptions`/`RestoreSceneCallOptions` (Task 1), `RegistryKeyOf<Registry>`/`SceneRegistryShape<Registry>` (Slice 1, assumed — see the Architecture section's assumption note), `this._registry.resolve(key: string): AnySceneConstructor | undefined` (Slice 1, assumed — the **one** new registry capability this task calls).
- Produces: `SceneDirector.change<C>(target, ...args): Promise<this>` and `SceneDirector.change<K>(target: K, ...args): Promise<this>` (two overloads — constructor and registry key), `SceneDirector.restore(target, options?): Promise<this>` (same target shape). `setScene()`/`restoreScene()` no longer exist. `releaseScene()`'s name and behavior are unchanged this slice (Slice 4 replaces it with `unload()`).

This is the large task — it rewrites most of `SceneDirector.ts`'s navigation surface and every test that calls it. Read the file in full before starting (`src/core/SceneDirector.ts`) so the diffs below apply against the actual current text — **and, per the Architecture section's assumption note, confirm at this point exactly how Slice 1 exposes key resolution on `this._registry` before writing code**, adjusting only that one call site's method name if it differs from `.resolve(key)`.

### 3.1 — Import updates

Change:

```ts
import {
  type AnySceneConstructor,
  ConcurrentSceneNavigationError,
  type InferSceneData,
  resolveSetSceneArgs,
  type RestoreSceneOptions,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  type SceneTransition,
  type SetSceneArgs,
  UnregisteredSceneError,
  validateSceneRegistry,
} from './SceneTypes';
```

to:

```ts
import {
  type AnySceneConstructor,
  type ChangeSceneArgs,
  type ChangeSceneCallOptions,
  ConcurrentSceneNavigationError,
  type InferSceneData,
  type RegistryKeyOf,
  type RestoreSceneCallOptions,
  type RestoreSceneOptions,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  type SceneTransition,
  UnregisteredSceneError,
  validateSceneRegistry,
} from './SceneTypes';
```

(`RegistryKeyOf<Registry>` is Slice 1's — imported here only, not redefined by this task.)

Add, right after the `./SceneScope` import:

```ts
import { SceneNavigationTransaction } from './scene/SceneNavigationTransaction';
```

Update the re-export line:

```ts
export type { FadeSceneTransition, RestoreSceneOptions, SceneTransition, SetSceneOptions } from './SceneTypes';
export { ConcurrentSceneNavigationError, RetainedSceneConflictError, RetainedSceneNotFoundError } from './SceneTypes';
```

to:

```ts
export type { ChangeSceneOptions, FadeSceneTransition, RestoreSceneOptions, SceneTransition } from './SceneTypes';
export { ConcurrentSceneNavigationError, RetainedSceneConflictError, RetainedSceneNotFoundError } from './SceneTypes';
```

(`SetSceneOptions` is gone — not aliased.)

### 3.2 — New field: `_navigation`

Add next to the existing fields (after `_retained`):

```ts
  private readonly _retained = new Map<AnySceneConstructor, SceneScope>();
  private readonly _navigation = new SceneNavigationTransaction(this._retained, this.onStopScene, this.onStateChange, error => this._reportNavigationError(error));
```

This relies on class field initializers running top-to-bottom in declaration order (so `_retained`/`onStopScene`/`onStateChange` are already assigned by the time `_navigation`'s initializer runs) — place `_navigation`'s declaration after all four of those fields, not before.

### 3.3 — Replace `setScene()` with `change()`

Delete the entire current `setScene()` method and replace it with:

```ts
  /**
   * Switch to a fresh instance of `target` (a registered key or a
   * constructor), ending the previously active scene permanently — unless
   * `options.suspendCurrent` is set, in which case the outgoing scene is
   * suspended and retained (keyed by its constructor) for a later
   * {@link SceneDirector.restore} call instead. Ordinary switching always
   * creates a fresh instance (definition §11.4). The new scene completes
   * `load()`+`init()` while the outgoing scene is still fully live and
   * driving frames; the switch itself is then atomic (definition §3.5):
   * once the incoming scope has been prepared, nothing past that point can
   * fail or roll back — the outgoing scope is suspended or torn down and
   * the incoming scope activated as one uninterruptible step, and the
   * returned promise additionally waits for the outgoing scope's permanent
   * teardown to fully settle (skipped when `suspendCurrent` is set, since
   * there is nothing to tear down).
   *
   * A `transition` option shaped like today's hardcoded fade transition
   * (`{ type: 'fade', duration?, color? }`) is still accepted and runs
   * exactly as it does today — a temporary bridge to the pre-existing fade
   * machinery, removed once a later slice lands the real transition
   * runtime and adds a `transition` field to {@link ChangeSceneOptions}
   * itself. It is intentionally not part of {@link ChangeSceneOptions}'s
   * documented public shape.
   *
   * Rejects with {@link ConcurrentSceneNavigationError} when another
   * navigation is already in flight (dev and production builds — no
   * queueing, definition §11.5); with {@link UnregisteredSceneError} (dev
   * builds for a constructor target, every build for an unresolvable
   * registry key) when `target` is not present in
   * `ApplicationOptions.scenes`; with {@link RetainedSceneConflictError}
   * when `target` already has a retained instance (restore or release it
   * first).
   */
  public async change<K extends RegistryKeyOf<Registry>>(
    target: K,
    ...args: ChangeSceneArgs<InferSceneData<Registry[K]>>
  ): Promise<this>;
  public async change<C extends AnySceneConstructor>(target: C, ...args: ChangeSceneArgs<InferSceneData<C>>): Promise<this>;
  public async change(target: AnySceneConstructor | string, ...args: readonly unknown[]): Promise<this> {
    const options = (args[0] as ChangeSceneCallOptions<unknown> | undefined) ?? {};

    await this._runWithNavigation(async () => {
      // Resolved inside the navigation lock, deliberately — this preserves
      // the existing check order (concurrent-navigation guard first, then
      // target validation) for both a bad key and an unregistered
      // constructor alike, rather than only for the latter.
      const resolvedTarget = this._resolveNavigationTarget(target);

      if (__DEV__ && !this._registry.has(resolvedTarget)) {
        throw new UnregisteredSceneError(resolvedTarget.name, [...this._registry.values()]);
      }

      if (this._retained.has(resolvedTarget)) {
        throw new RetainedSceneConflictError(resolvedTarget.name);
      }

      const scene = new resolvedTarget();
      const newScope = await this._prepareScene(scene, (options as { data?: unknown }).data);

      // Atomic commit boundary (definition §3.5, steps 5-7) — nothing past
      // this point can fail or roll back.
      const previousScope = this._activeScope;
      const previousTarget = this._activeScopeTarget;
      const outgoing = previousScope === null ? null : { scope: previousScope, target: previousTarget as AnySceneConstructor };
      const { teardown, pendingStopScene } = this._navigation.beginOutgoingDisposition(outgoing, options.suspendCurrent ?? false);

      this._activeScope = newScope;
      this._activeScopeTarget = resolvedTarget;
      newScope.activate();

      this._dispatchGuarded(() => this.onChangeScene.dispatch(scene as Scene));
      this._dispatchGuarded(() => this.onStartScene.dispatch(scene as Scene));

      // Not rollback-able (definition §3.5, steps 8-9).
      this._navigation.finishOutgoingDisposition(pendingStopScene);
      await teardown;
    }, options.transition);

    return this;
  }
```

(`previousScope !== null` and `previousTarget !== null` are always set together — see the class fields' invariant, unchanged from today — hence the cast rather than a second null check.)

### 3.4 — Add `restore()`, replacing `restoreScene()`

Delete the entire current `restoreScene()` method and replace it with:

```ts
  /**
   * Reactivate a scene previously retained via
   * `change(..., { suspendCurrent: true })` or
   * `restore(..., { suspendCurrent: true })` — the same instance, returned
   * to whichever of `Active`/`Paused` it had before suspension. `load()`/
   * `init()` do not run again (definition §14.3). Shares the same atomic
   * commit boundary as {@link SceneDirector.change} — see its doc comment
   * for the exact guarantee and the temporary fade-transition bridge.
   *
   * Rejects with {@link ConcurrentSceneNavigationError} when another
   * navigation is already in flight; with {@link RetainedSceneNotFoundError}
   * when `target` has no retained instance.
   */
  public async restore<K extends RegistryKeyOf<Registry>>(target: K, options?: RestoreSceneCallOptions): Promise<this>;
  public async restore<C extends AnySceneConstructor>(target: C, options?: RestoreSceneCallOptions): Promise<this>;
  public async restore(target: AnySceneConstructor | string, options: RestoreSceneCallOptions = {}): Promise<this> {
    const resolvedTarget = this._resolveNavigationTarget(target);
    const retainedScope = this._retained.get(resolvedTarget);

    if (retainedScope === undefined) {
      throw new RetainedSceneNotFoundError(resolvedTarget.name);
    }

    // Eager, synchronous claim: removed from `_retained` before any `await`
    // so a concurrent restore(target)/releaseScene(target) call targeting
    // the same constructor can never also see it.
    this._retained.delete(resolvedTarget);

    try {
      await this._runWithNavigation(async () => {
        const previousScope = this._activeScope;
        const previousTarget = this._activeScopeTarget;
        const outgoing = previousScope === null ? null : { scope: previousScope, target: previousTarget as AnySceneConstructor };
        const { teardown, pendingStopScene } = this._navigation.beginOutgoingDisposition(outgoing, options.suspendCurrent ?? false);

        // Atomic commit boundary — restore() has no async prepare step, so
        // this reaches the commit point immediately.
        const previousState = retainedScope.state;

        this._activeScope = retainedScope;
        this._activeScopeTarget = resolvedTarget;
        retainedScope.restore();

        this._dispatchGuarded(() => this.onChangeScene.dispatch(retainedScope.scene as Scene));
        this._dispatchGuarded(() => this.onStateChange.dispatch(previousState, retainedScope.state, retainedScope.scene as Scene));

        this._navigation.finishOutgoingDisposition(pendingStopScene);
        await teardown;
      }, options.transition);
    } catch (error) {
      // Only reachable here via a rejected concurrent-navigation guard —
      // retainedScope.restore() itself never throws (SceneScope guards
      // every facility call). Put the eager claim back so the scope
      // remains available for a future restore()/releaseScene() call.
      this._retained.set(resolvedTarget, retainedScope);

      throw error;
    }

    return this;
  }
```

### 3.5 — `_resolveNavigationTarget()` and the guarded-dispatch helpers

Add these three private methods (placed near `_prepareScene`):

```ts
  /**
   * Resolve a `change()`/`restore()` navigation target: a constructor
   * passes through unchanged; a registered key resolves to its constructor
   * via the bidirectional registry. An unresolvable key is always an
   * error, in every build — unlike an unregistered *constructor* (checked
   * separately, dev-only), there is no constructor to fall back to for an
   * unresolvable key.
   */
  private _resolveNavigationTarget(target: AnySceneConstructor | string): AnySceneConstructor {
    if (typeof target !== 'string') {
      return target;
    }

    const resolved = this._registry.resolve(target);

    if (resolved === undefined) {
      throw new UnregisteredSceneError(target, [...this._registry.values()]);
    }

    return resolved;
  }

  /**
   * Dispatch a Director-owned lifecycle signal, guarded: a throwing
   * listener is reported through {@link Application.onError} instead of
   * propagating — required once past the atomic commit boundary (§3.5),
   * where nothing may cause `change()`/`restore()` to reject.
   */
  private _dispatchGuarded(dispatch: () => void): void {
    try {
      dispatch();
    } catch (error) {
      this._reportNavigationError(error);
    }
  }

  private _reportNavigationError(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));

    logger.error('A SceneDirector lifecycle signal listener failed after a navigation had already committed.', { source: 'SceneDirector', error: normalized });
    this._app.onError.dispatch(normalized);
  }
```

### 3.6 — Guard `_prepareScene()`'s `onStateChange` callback

This one change protects *every* `onStateChange` dispatch for *every* scope's entire lifecycle (fresh activation, failed activation, and — since the outgoing scope in `change()`/`restore()` was itself originally created through this same method — its own eventual `Destroying`/`Destroyed` edges too), because every `SceneScope` is always constructed here.

Change:

```ts
  private async _prepareScene<Data>(scene: Scene<Data>, data: Data): Promise<SceneScope<Data>> {
    const scope = new SceneScope(this._app, scene, (previous, next) => this.onStateChange.dispatch(previous, next, scene as Scene));
```

to:

```ts
  private async _prepareScene<Data>(scene: Scene<Data>, data: Data): Promise<SceneScope<Data>> {
    const scope = new SceneScope(this._app, scene, (previous, next) => this._dispatchGuarded(() => this.onStateChange.dispatch(previous, next, scene as Scene)));
```

### 3.7 — Delete the now-superseded private methods

Delete `_handleOutgoingScope()`, `_suspendAndRetain()`, and `_rollbackSwitch()` in their entirety — every use they had is now covered by `SceneNavigationTransaction` (Task 2) called directly from `change()`/`restore()`.

### 3.8 — `releaseScene()` doc-only update

`releaseScene()`'s behavior and signature are unchanged this slice. Only update its doc comment's cross-reference:

```ts
  /**
   * Permanently end a retained (suspended) scene without reactivating it.
   * Returns `true` if a retained instance existed for `target`, `false`
   * otherwise (no-op, not an error).
   */
```

stays word-for-word (it already doesn't mention `restoreScene`/`setScene` by name) — no edit needed here beyond confirming this during review.

### 3.9 — Confirm the rest of the file is untouched

Grep after applying 3.1–3.7 to confirm no stray references remain:

```bash
grep -n "setScene\|restoreScene\|retainCurrent\|resolveSetSceneArgs\|SetSceneArgs\|_rollbackSwitch\|_handleOutgoingScope\|_suspendAndRetain" src/core/SceneDirector.ts
```

Expected: no output. Everything from `_disposeScene()` downward (including the entire fade-transition machinery — `_runWithNavigation`, `_runTransitionedAction`, `_advanceTransition`, `_executeTransitionAction`, `_finishTransition`, `_getTransitionAlpha`, `_renderTransitionOverlay`, `_dispose()`/`destroy()`) is untouched by this task.

- [ ] **Step 1: Apply 3.1–3.8 above**

- [ ] **Step 2: Rename existing tests mechanically**

Run:

```bash
sed -i \
  -e 's/\.setScene(/.change(/g' \
  -e 's/\.restoreScene(/.restore(/g' \
  -e 's/retainCurrent/suspendCurrent/g' \
  test/core/scene-director.test.ts
```

This covers every existing call site (both the `manager.`-prefixed tests in the top `describe('SceneDirector', ...)` block and the `director.`-prefixed tests in the retention/concurrent-navigation/rollback/destroy blocks) and every `retainCurrent` occurrence, in options objects and in test titles/comments alike.

- [ ] **Step 3: Delete the "switch-phase rollback" describe block and replace it**

Delete this entire block (now testing behavior the atomic model no longer has):

```ts
describe('SceneDirector — switch-phase rollback', () => {
  test('a throwing onStopScene listener rolls back to the previous scope and rethrows', async () => {
    /* ... (full body, already renamed by Step 2's sed to director.change) ... */
  });

  test('a throwing onStopScene listener during a suspendCurrent switch un-suspends the previous scope', async () => {
    /* ... (full body) ... */
  });
});
```

Replace it with:

```ts
describe('SceneDirector — post-commit signal isolation', () => {
  test('a throwing onStopScene listener does not roll back — the switch stays committed and change() still resolves', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });
    const errorSpy = vi.fn();
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    app.onError.add(errorSpy);
    await director.change(FirstScene);

    const failure = new Error('onStopScene listener failed');

    director.onStopScene.add(() => {
      throw failure;
    });

    await expect(director.change(SecondScene)).resolves.toBe(director);

    expect(director.currentScene).toBeInstanceOf(SecondScene); // committed regardless of the throw
    expect(errorSpy).toHaveBeenCalledWith(failure);

    loggerErrorSpy.mockRestore();
  });

  test('a throwing onStateChange listener during a suspendCurrent switch does not un-suspend the outgoing scope', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });
    const errorSpy = vi.fn();
    const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    app.onError.add(errorSpy);
    await director.change(FirstScene);
    const firstInstance = director.currentScene;

    const failure = new Error('onStateChange listener failed');

    director.onStateChange.add(() => {
      throw failure;
    });

    await expect(director.change(SecondScene, { suspendCurrent: true })).resolves.toBe(director);

    expect(director.currentScene).toBeInstanceOf(SecondScene);
    expect(firstInstance?.state).toBe(SceneState.Suspended); // still suspended+retained despite the throw
    await expect(director.restore(FirstScene)).resolves.toBe(director); // proves it IS in _retained

    loggerErrorSpy.mockRestore();
  });
});
```

- [ ] **Step 4: Add a "key-based navigation" describe block**

Add, after the "destroy() / _dispose()" describe block:

```ts
describe('SceneDirector — key-based navigation', () => {
  test('change() accepts a registered string key and resolves to that key\'s constructor', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene });

    await expect(director.change('first')).resolves.toBe(director);
    expect(director.currentScene).toBeInstanceOf(FirstScene);
  });

  test('restore() accepts a registered string key for a retained scope', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });

    await director.change('first');
    await director.change('second', { suspendCurrent: true });

    await expect(director.restore('first')).resolves.toBe(director);
    expect(director.currentScene).toBeInstanceOf(FirstScene);
  });

  test('change() still accepts a raw constructor directly, unchanged', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene });

    await expect(director.change(FirstScene)).resolves.toBe(director);
  });

  test('change() rejects for an unregistered string key, in every build', async () => {
    const app = createApplicationStub();
    const RegisteredScene = makeSceneClass();
    // Widened to the untyped registry shape for this one call — a string
    // key not present in the registry is a compile-time error against the
    // precisely-typed overload, which is exactly the point; this test
    // exercises the runtime rejection path a production build still needs.
    const director = new SceneDirector(app, { first: RegisteredScene }) as SceneDirector<Record<string, SceneConstructor<void>>>;

    await expect(director.change('missing')).rejects.toThrow(UnregisteredSceneError);
  });
});
```

- [ ] **Step 5: Run to verify everything fails first, then passes**

Run: `pnpm vitest run test/core/scene-director.test.ts -t "post-commit signal isolation"`
Expected (before Step 1's implementation, or if run out of order): FAIL — `change`/`restore` don't exist. After 3.1–3.8 are applied: PASS.

Run: `pnpm vitest run test/core/scene-director.test.ts -t "key-based navigation"`
Expected: PASS once 3.1–3.8 are applied and Slice 1's actual `.resolve(key)` shape is wired correctly (Step 0 verification above).

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: PASS — every pre-existing renamed test plus the two new describe blocks.

- [ ] **Step 6: Confirm the grep from 3.9 returns nothing, then typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean (this also clears the deliberate Task 1/Task 2 typecheck failures, since `SceneDirector.ts` now compiles against the new types).

- [ ] **Step 7: Run the full core suite**

Run: `pnpm test:core`
Expected: all green — confirms nothing else in the codebase called `SceneDirector`'s old private method names directly (they were already private) or referenced `setScene`/`restoreScene`/`retainCurrent` outside `Application.ts` (fixed next in Task 4).

- [ ] **Step 8: Commit**

```bash
git add src/core/SceneDirector.ts test/core/scene-director.test.ts
git commit -m "$(cat <<'EOF'
feat(core)!: change()/restore() replace setScene()/restoreScene() — atomic commit boundary

change()/restore() fully replace setScene()/restoreScene() (removed, not
aliased). Both now build on the atomic commit boundary (spec §3.5): the
outgoing scope stays _activeScope for the entire pre-commit phase, the
swap to the incoming scope happens exactly once at a point guaranteed
never to throw, and _rollbackSwitch()/_handleOutgoingScope()/
_suspendAndRetain() are deleted — there is nothing left to roll back for
the active-scope assignment under this model (§3.5.1).

suspendCurrent replaces retainCurrent everywhere. Both methods accept a
registered string key alongside a constructor, resolved through the
bidirectional registry (Slice 1). Every lifecycle-signal dispatch this
navigation performs (onChangeScene/onStartScene/onStopScene/onStateChange)
is now guarded — a throwing listener is reported through
Application.onError instead of rejecting change()/restore() or rolling
back an already-committed switch, which is why the old "switch-phase
rollback" tests are replaced with "post-commit signal isolation" tests
asserting the opposite (and now-correct) property.

The pre-existing hardcoded fade-transition machinery is untouched and
still reachable via a narrow, @internal, non-re-exported bridge type
(ChangeSceneCallOptions/RestoreSceneCallOptions) — the one deliberate
exception to this redesign's "no shims" rule, removed once a later slice
replaces that machinery wholesale.

releaseScene() is unchanged this slice (a later slice folds it into a
unified unload()).
EOF
)"
```

---

## Task 4: `Application.ts` — update the `start()` call site

**Files:**

- Modify: `src/core/Application.ts`

**Interfaces:**

- Consumes: `SceneDirector.change()`/`ChangeSceneArgs` (Task 3/Task 1). Does **not** implement the spec's §3.7 startup-sequencing fix (`_frameLoopActive` decoupled from `_status`) — that is Slice 7's job; this task only renames the call site.

- [ ] **Step 1: Update the import**

Change:

```ts
import type { AnySceneConstructor, InferSceneData, SetSceneArgs } from './SceneTypes';
```

to:

```ts
import type { AnySceneConstructor, ChangeSceneArgs, InferSceneData } from './SceneTypes';
```

- [ ] **Step 2: Update `start()`'s overload and call site**

Change:

```ts
  public async start<C extends AnySceneConstructor>(target: C, ...args: SetSceneArgs<InferSceneData<C>>): Promise<this>;
  public async start(target?: AnySceneConstructor, ...args: readonly unknown[]): Promise<this> {
```

to:

```ts
  public async start<C extends AnySceneConstructor>(target: C, ...args: ChangeSceneArgs<InferSceneData<C>>): Promise<this>;
  public async start(target?: AnySceneConstructor, ...args: readonly unknown[]): Promise<this> {
```

Change:

```ts
        if (target !== undefined) {
          await this.scenes.setScene(target, ...(args as SetSceneArgs<InferSceneData<typeof target>>));
        }
```

to:

```ts
        if (target !== undefined) {
          await this.scenes.change(target, ...(args as ChangeSceneArgs<InferSceneData<typeof target>>));
        }
```

(This task deliberately does not accept a registry key in `start()`'s own overload — `start()`'s first parameter today is typed `AnySceneConstructor`, matching `SceneDirector.change()`'s constructor overload exactly; extending `start()` itself to also take a key is a reasonable follow-up but isn't required by this slice's scope and isn't exercised by any existing test, so it's left alone here to keep this task's diff minimal and mechanical.)

- [ ] **Step 3: Grep for any other stray reference**

```bash
grep -n "setScene\|SetSceneArgs\|retainCurrent" src/core/Application.ts
```

Expected: no output.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 5: Run the Application test suite**

Run: `pnpm vitest run test/core/application.test.ts`
Expected: PASS, unchanged — this task is a pure rename with no behavior change, so no test edits are expected here. If any existing `Application` test calls `app.start(SomeScene, { retainCurrent: true })`-shaped options directly (unlikely — `retainCurrent`/`suspendCurrent` is scene-*switch* semantics, not meaningful for the very first `start()` activation), grep for `retainCurrent` in that test file too and rename to `suspendCurrent` if found.

```bash
grep -rn "retainCurrent" test/core/application.test.ts
```

Expected: no output (if this returns matches, rename them to `suspendCurrent` before proceeding).

- [ ] **Step 6: Run the full core suite**

Run: `pnpm test:core`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/core/Application.ts
git commit -m "feat(core): Application.start() calls scenes.change() instead of the removed scenes.setScene()

Pure rename at the one in-repo core call site — no behavior change. The
§3.7 startup-sequencing fix (decoupling the frame loop from ApplicationStatus)
is a later slice's job, not this one."
```

---

## Task 5: JSDoc pass, full verification, API docs, PR

**Files:** none new — verification + docs regen only.

- [ ] **Step 1: JSDoc conventions check**

Re-read `[[feedback-jsdoc-conventions]]` memory's style rules and diff every new/changed doc comment from Tasks 1–4 against it (tag order, `@internal` usage, `{@link}` cross-references, imperative-verb method openers, no noise `@param`/`@returns`). Fix inline.

- [ ] **Step 2: Confirm the package-root export surface**

Check `src/core/index.ts` for any re-export of `setScene`/`restoreScene`/`retainCurrent`-named symbols (there shouldn't be any — those were never separately exported, only `SceneDirector`/the error classes/the options types are). Confirm `SceneNavigationTransaction` is **not** exported from `src/core/index.ts` — it's an internal collaborator, not public API.

```bash
grep -n "SetSceneOptions\|SetSceneArgs\|resolveSetSceneArgs\|SceneNavigationTransaction" src/core/index.ts
```

Expected: no output. If `src/core/index.ts` exports `SetSceneOptions`/`RestoreSceneOptions`/`SceneTransition`-adjacent type names by hand (rather than a blanket re-export from `SceneDirector.ts`), update that list to `ChangeSceneOptions`/`RestoreSceneOptions` there too.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: all pass, count ≥ baseline (5083 in `test:core` alone before this slice) + new tests from Tasks 2/3.

- [ ] **Step 4: Full typecheck (all projects)**

Run: `pnpm typecheck && pnpm typecheck:examples && pnpm typecheck:type-tests && pnpm typecheck:guides && pnpm typecheck:packages`
Expected: `typecheck`/`typecheck:type-tests`/`typecheck:packages` clean. `typecheck:examples`/`typecheck:guides` may fail here if any in-repo example or guide snippet already calls `setScene`/`restoreScene`/`retainCurrent` directly — **migrating those is explicitly Slice 8's job, not this slice's**. If a failure appears in an example/guide, confirm it is exactly a `setScene`/`restoreScene`/`retainCurrent` reference (nothing else) and record it in this task's final PR description as a known, deliberately-deferred gap for Slice 8, rather than fixing it here — fixing it here would silently expand this slice's scope into Slice 8's.

- [ ] **Step 5: Full lint + format**

Run: `pnpm lint:all && pnpm format:check`
Expected: clean (0 errors from this slice's own files; pre-existing unrelated warnings elsewhere are fine, matching prior slices' baselines).

- [ ] **Step 6: package policy + exports**

Run: `pnpm verify:package-policy && pnpm verify:exports`
Expected: clean. `verify:exports` needs a fresh `pnpm build` first if `dist/` is stale — run `pnpm build` before it if the check reports missing `dist/` entry targets.

- [ ] **Step 7: Regenerate API docs**

Run: `pnpm docs:api:generate && pnpm docs:api:check`
Expected: generate exits 0; check reports in sync. This should pick up `SceneDirector.change`/`.restore` (new), the removal of `.setScene`/`.restoreScene`, and `ChangeSceneOptions`/`RestoreSceneOptions` (new/renamed types) automatically from JSDoc.

- [ ] **Step 8: Commit the docs regen (if not already clean from Task 3's own commit)**

```bash
git add site/src/content/api/
git commit -m "docs: regenerate scene-director.json for change()/restore() (Slice 3)"
```

- [ ] **Step 9: Push + PR + auto-merge**

```bash
git push -u origin feat/v0.17-scene-transition-slice-3-atomic-navigation-transaction
gh pr create --title "feat(core)!: atomic navigation transaction — change()/restore() (Slice 3)" --body "$(cat <<'EOF'
## Summary
- `SceneDirector.change()`/`.restore()` fully replace `.setScene()`/`.restoreScene()` (removed, not aliased) — built on the atomic commit boundary (spec §3.5): the outgoing scope stays `_activeScope` for the entire pre-commit phase, the swap to the incoming scope happens exactly once at a point guaranteed never to throw, and `_rollbackSwitch()` is deleted — there is nothing left to roll back for the active-scope assignment under this model (§3.5.1).
- `suspendCurrent` replaces `retainCurrent` everywhere (one name, not aliased).
- The `(data?, options?)` variadic pair collapses into a single options object — the erased-at-runtime data/options disambiguation heuristic (`SetSceneArgs`/`resolveSetSceneArgs`/`looksLikeSetSceneOptions`) is deleted entirely, not worked around.
- `change()`/`restore()` accept a registered string key alongside a constructor, resolved through the bidirectional registry (Slice 1).
- New `SceneNavigationTransaction` collaborator (`src/core/scene/`) holds the shared atomic commit-boundary logic — the seam a later slice's transition-session runner calls through at its own commit point.
- Every lifecycle-signal dispatch this navigation performs is now guarded (a throwing listener is reported via `Application.onError`, never rejects `change()`/`restore()` or rolls back an already-committed switch) — replacing the old "switch-phase rollback" tests with "post-commit signal isolation" tests asserting the opposite, now-correct property.
- The pre-existing hardcoded fade-transition machinery is untouched and still reachable via a narrow, `@internal`, non-re-exported bridge type — the one deliberate, temporary exception to this redesign's "no shims" rule, removed once Slice 5 replaces that machinery wholesale.
- `Application.start()`'s call site updated to `scenes.change()` (rename only — the §3.7 startup-sequencing fix is Slice 7's job).
- `releaseScene()` is unchanged this slice (Slice 4 folds it into a unified `unload()`).

Implements Slice 3 of `.workspace/specs/2026-07-23-scene-transition-lifecycle-design.md` §3.5/§3.5.1/§3.5.2/§6.3 (the atomic navigation transaction). Depends on Slice 1 (registry foundation) and Slice 2 (`Ready` state) already being merged.

## Test plan
- [x] `pnpm test` — full suite green
- [x] `pnpm typecheck` / `typecheck:type-tests` / `typecheck:packages` — clean
- [x] `pnpm lint:all` / `pnpm format:check` — clean
- [x] New tests: `SceneNavigationTransaction` unit coverage (suspend+retain vs. begin-teardown, guarded dispatch on both paths), key-based navigation (`change('key')`/`restore('key')`, unregistered-key rejection, raw-constructor path unchanged), post-commit signal isolation (throwing `onStopScene`/`onStateChange` listeners no longer roll back)
- [ ] Known, deliberately-deferred gap: any example/guide still calling `setScene`/`restoreScene`/`retainCurrent` directly is Slice 8's migration, not fixed here (see Task 5 Step 4)
EOF
)"
gh pr merge --auto --squash
```

---

## Self-Review Notes (from the plan-writing pass)

**Spec coverage check:** §3.5 (commit/rollback boundary, steps 1-9 as they apply to the no-transition fast path — steps 1-3 and the transition-session-specific parts of 4/9 are explicitly Slice 5's, not reproduced here) — Task 3's `change()`/`restore()` bodies plus `SceneNavigationTransaction` (Task 2). §3.5.1 ("four distinct pre-commit-failure concepts, not one" — active-scope rollback eliminated; failed-preparation cleanup unchanged via `_prepareScene`'s existing `destroyFailedActivation()` call; `Ready`-scope cleanup and preload claim-restoration are explicitly Slice 4/5 concerns per the abort contract in §3.7, out of scope here; retained-claim restoration is `restore()`'s existing catch-block, carried forward) — covered, with the two slice-5/4-only sub-cases explicitly called out as out of scope in the Architecture section. §3.5.2 (`commit()` non-reentrancy) — not applicable to this slice; there is no `environment.commit()` yet, only the direct fast path, which per §3.3 "is not an instance of this hazard." §6.3 (navigation renames, single options object, `suspendCurrent` rename) — Task 1 + Task 3. §11.4/§11.5 (fresh-instance-always, concurrent-navigation rejection) — unchanged, already correct from the prior (Slice E) implementation, preserved verbatim in `_runWithNavigation` (untouched by this slice). §6.1 (key-based navigation) — Task 3's two-overload `change()`/`restore()` plus `_resolveNavigationTarget()`, consuming Slice 1's assumed registry extension. §14.3 (restore preserves instance identity, no `load()`/`init()` re-run, returns to pre-suspend `Active`/`Paused`) — unaffected by this slice, since `SceneScope.restore()` itself is untouched (Slice 2's territory) and this slice only changes *how* `SceneDirector.restore()` reaches the commit point, not what `SceneScope.restore()` does once called.

**Explicitly out of scope for this plan** (confirmed against the 8-slice breakdown in the dispatch prompt): preload (`_preloaded`, Slice 4), the real transition runtime and `environment.commit()`/`SceneTransitionSession` (Slice 5), phase composition/rendering (Slice 6), built-in transitions and the `Application.start()` §3.7 fix (Slice 7), migrating examples/docs/guides (Slice 8). `releaseScene()` is intentionally left as-is (Task 3.8) — Slice 4 replaces it with `unload()`.

**Placeholder scan:** every task step above contains complete, runnable code (or an exact shell command with expected output) — no "TBD"/"add appropriate handling"/"similar to Task N" phrasing anywhere in Tasks 1-5.

**Type consistency check:** `ChangeSceneOptions<Data>`/`ChangeSceneArgs<Data>` (Task 1) are the exact names Task 3's `change()` overloads reference; `RestoreSceneOptions`/`RestoreSceneCallOptions` (Task 1) match Task 3's `restore()` overloads; `ChangeSceneCallOptions<Data>` (Task 1, `@internal`, not re-exported) is the exact parameter type Task 3's `change()` implementation signature and its `options.transition`/`(options as { data?: unknown }).data` accesses assume. `SceneNavigationTransaction`'s constructor parameter order (`retained, onStopScene, onStateChange, reportError`) and its two method names/signatures (`beginOutgoingDisposition(outgoing, suspendCurrent): { teardown, pendingStopScene }`, `finishOutgoingDisposition(pendingStopScene)`) are used identically in Task 2's own tests, Task 3's `change()`/`restore()` call sites (3.3/3.4), and the Architecture section's prose — no drift between them. `_resolveNavigationTarget`/`_dispatchGuarded`/`_reportNavigationError` (Task 3.5) are each referenced by exactly the name they're declared with in 3.3/3.4/3.6. The one cross-slice assumption (`this._registry.resolve(key)`) is flagged in exactly one place (the Architecture section) and referenced, not re-litigated, everywhere else it's used (3.3, 3.4, 3.5, and Task 3's own "Read the file in full... and confirm" instruction).
