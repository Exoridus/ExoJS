# Scene Transition Slice 4 — Preload & Explicit `unload()` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transparent scene `preload()` (a `_preloaded` map, backed by the `Ready` state, with in-flight sharing and `Object.is()`-matched consumption by `change()`) and replace `releaseScene()` with a unified `unload(Target, options?)` that discards whatever is parked/active for a constructor, throwing `AmbiguousSceneInstanceError` instead of applying a silent priority order when more than one candidate (active/retained/preloaded) exists.

**Architecture:** `SceneDirector` gains a `_preloaded: Map<AnySceneConstructor, PreloadEntry>` field (same storage shape as the already-shipped `_retained` map) plus a `preload()` method that inserts an entry synchronously — before its first `await` — so a racing second `preload()`/`change()` call can see and share it. `change()`'s existing claim/prepare step (built by Slice 3) is taught to check `_preloaded` first: a synchronous, pre-`await` claim on an `Object.is()`-matched entry, mirroring the eager-claim-before-first-`await` pattern `restore()` already uses for `_retained`. `unload()` computes which of `{active, retained, preloaded}` match a target *synchronously* (no state mutation, no `await`) and either resolves the single candidate, throws `AmbiguousSceneInstanceError` when more than one exists and `options.instance` wasn't given, or targets exactly the requested one. The active-scope case reuses `_clearScene()` (extended with an optional `transition` parameter) rather than building new transition-dispatch logic — Slice 5 will replace that bridge wholesale once the real transition runtime exists. `preload()`/`unload()`'s retained/preloaded branches never take the `_navigationInFlight` lock (they don't touch `_activeScope`); only `unload()`'s active-scope branch does, via `_clearScene()`.

**Tech Stack:** TypeScript (strict), Vitest. Builds on Slices 1–3 (Public Types & Registry Foundation; `Ready` State & Facility Dormancy; Atomic Navigation Transaction) — assumed merged ahead of this plan's execution. See "Assumptions about Slices 1–3's output" below; Task 1 re-verifies every one of them against the real merged code before any other task starts.

## Global Constraints

- Clean breaks only — no deprecated aliases, no shims (pre-1.0 policy). `releaseScene()` is **removed**, not kept as an alias for `unload()`.
- `AmbiguousSceneInstanceError` (and `SceneInstanceNotFoundError`, introduced in this slice — see Task 2's note) must be thrown **synchronously**, before any teardown begins and before any `await` — computing `unload()`'s candidate set is a pure, synchronous read of `_activeScopeTarget`/`_retained`/`_preloaded`.
- `preload(Target, data)` inserts its `_preloaded` entry **synchronously**, before awaiting anything — this is what makes in-flight sharing possible (spec §4.3).
- Preload/retained coexistence is unrestricted: `preload(Target)` while `Target` is already retained, or while a different `Target` instance is active, is always allowed — the two maps (`_retained`, `_preloaded`) and the active scope are read independently and never cross-check each other except where explicitly noted (§4.3).
- `change()`'s preload match uses `Object.is()` on the activation data — reference/primitive identity, never a deep-equality check. Two separate `{ level: 2 }` object literals never match.
- `unload()` racing an in-flight `preload()` must never call `scope.destroy()` (or any teardown) concurrently with an in-progress `prepare()` — mark the entry `cancelling` synchronously, then await the same `ready` promise `preload()`'s caller is awaiting, before tearing anything down (spec §4.3's last bullet).
- A preloaded scope that is discarded (via `unload()`, or superseded by a mismatched-data `preload()`/`change()` call) while it never reached `Active` must run `Scene.unload()` (it *did* finish preparing) but must **not** dispatch `SceneDirector.onStopScene` (spec §2.1: "`onStopScene` fires only for a scope activated at least once").
- `options.transition` on `unload()` only materializes for an active-scope match — a retained or preloaded match always runs the direct, non-transitioned teardown path regardless of what `options.transition` was given (spec §5).
- `unload()`'s registry-level default transition (spec §3.10) never applies, regardless of match kind — out of scope for this slice anyway, since the registry-level-default-transition resolution machinery doesn't exist until Slice 5/6.
- `preload()`/`unload()`'s retained/preloaded code paths do **not** take the `_navigationInFlight` lock — only `unload()`'s active-scope branch does (via `_clearScene()`), so a `preload()` call can freely run concurrently with an in-flight `change()`/`restore()` navigation.
- Every task ends green on its own scoped test command before moving to the next.
- JSDoc conventions: every public export gets a doc comment; `@internal` for engine-only surface (see `[[feedback-jsdoc-conventions]]` memory).
- `pnpm docs:api:generate` must be run and committed before the final push (push-gated).
- `pnpm test:core` (`vitest run --project=exojs`) must stay green throughout — 318 files / 5083 tests passing at the start of this slice (pre-Slices-1-3 baseline measured directly in this worktree; the count will have grown once Slices 1–3 land, and will grow further as this slice's own tests are added).

---

## Assumptions about Slices 1–3's output (Task 1 verifies these first)

This plan was written by reading the actual, current `src/core/SceneDirector.ts` (740 lines), `src/core/SceneTypes.ts` (243 lines), `src/core/SceneScope.ts`, and `src/core/SceneState.ts` in this exact worktree — which, at plan-writing time, is still the **pre-Slice-1/2/3 baseline** (`origin/main @ b5aad1a3`): `SceneState` has no `Ready` value yet, `SceneDirector` still exposes `setScene()`/`restoreScene()`/`releaseScene()`, and `_rollbackSwitch()` still exists. Slices 1–3 are being planned by parallel agents into the same `docs/superpowers/plans/` directory and had not landed as of this writing.

This plan is therefore written **against that real, current code**, transformed by the specific, spec-mandated renames/removals Slices 1–3 are expected to apply. Every task below states its diffs as edits to the code exactly as read (renamed per the table below). **Before starting Task 2, re-read the actual merged `SceneDirector.ts`/`SceneTypes.ts`/`SceneState.ts` in this worktree and reconcile:**

| Assumed (this plan) | Pre-Slice-1-3 baseline (confirmed, read directly) | Expected post-Slice-1-3 (per spec — verify!) |
|---|---|---|
| `SceneState.Ready` exists | Not present (`Preparing\|Active\|Suspended\|Destroying\|Destroyed`) | Added by Slice 2 (§4.2) |
| `SceneDirector.change()` | `SceneDirector.setScene()` | Renamed by Slice 3 (§6.3) |
| `SceneDirector.restore()` | `SceneDirector.restoreScene()` | Renamed by Slice 3 (§6.3) |
| `ChangeSceneOptions<Data>` / `ChangeSceneArgs<Data>` (single options object, `{ data, transition, suspendCurrent }`) | `SetSceneOptions` / `SetSceneArgs<Data>` (separate `data`/`options` tail, `retainCurrent`) | Collapsed by Slice 3 (§6.3) — exact type names are a guess; find the real ones |
| No `_rollbackSwitch()` — atomic commit boundary, nothing to roll back for `_activeScope` itself | `_rollbackSwitch()` exists, called from both `setScene()`/`restoreScene()`'s catch blocks | Removed by Slice 3 (§3.5.1) |
| `_activeScope`, `_activeScopeTarget`, `_retained`, `_prepareScene()`, `_disposeScene()`, `_handleOutgoingScope()`, `_suspendAndRetain()`, `_runWithNavigation()`, `_clearScene()` | All present, same names, same shapes | Spec does not call for renaming any of these — assume unchanged unless Task 1 finds otherwise |
| `RetainedSceneConflictError`, `RetainedSceneNotFoundError`, `UnregisteredSceneError`, `ConcurrentSceneNavigationError` | All present, same names | Unchanged |

**If any assumed name/shape differs from the real merged code, apply the *behavior* described in this plan's tasks against the *real* names/shapes — the exact identifiers below are illustrative, not authoritative. The spec section numbers cited in each task are authoritative.**

---

## File Structure

```text
src/core/
├── SceneState.ts       (not modified by this slice — Slice 2's Ready state is a dependency, not something this slice touches)
├── SceneTypes.ts        (modified) — SceneInstanceKind, UnloadOptions, PreloadOptions<Data>/PreloadArgs<Data>,
│                                       resolvePreloadArgs(), AmbiguousSceneInstanceError, SceneInstanceNotFoundError
└── SceneDirector.ts     (modified) — PreloadEntry (internal, colocated like the existing ActiveFadeTransition),
                                        _preloaded field, preload(), unload() (replaces releaseScene()),
                                        _unloadInstance()/_unloadPreloaded() helpers, _prepareScene() gains an
                                        optional pre-built-scope parameter, _disposeScene() gains an optional
                                        dispatchStopScene flag, _clearScene() gains an optional transition
                                        parameter, change()'s claim step consumes _preloaded (editing Slice 3's
                                        already-merged method, not a parallel path)

test/core/
└── scene-director.test.ts (modified) — preload(), unload()/disambiguation, the unload-vs-preload race test;
                                          releaseScene()'s two existing tests are rewritten as unload() tests
```

**No new test file.** `_retained` — the structurally identical existing precedent — has never had its own test file; its tests live directly in `scene-director.test.ts` because retention/preload/unload all reason about the *same* `SceneDirector` instance's combined state (`_activeScope`/`_retained`/`_preloaded` together, which is exactly what `unload()`'s disambiguation needs to exercise). Splitting preload into its own file would need its own `createApplicationStub()` copy and the disambiguation tests would need to import from both files anyway — no isolation benefit, only duplication.

---

## Task 1: Orientation — verify Slices 1–3's actual merged shape

**Files:** none modified — read-only reconnaissance.

**Interfaces:** none produced — this task's output is a short written confirmation (or list of deltas) that the next task's diffs apply to, either verbatim or after renaming.

- [ ] **Step 1: Confirm `Ready` exists**

Run:
```bash
grep -n "Ready" src/core/SceneState.ts
```
Expected: a `Ready = 'ready'` enum member exists in `SceneState`, between `Preparing` and `Active` conceptually (per spec §4.2's `Preparing → Ready → Active` chain). If it is missing, Slice 2 has not landed — stop and flag this to the user before proceeding; this slice cannot be implemented without it (`preload()`'s entries must live in `Ready`, not a stretched `_retained`-shaped state).

- [ ] **Step 2: Confirm the navigation method names**

Run:
```bash
grep -n "public async change\|public async restore\|public async setScene\|public async restoreScene\|releaseScene" src/core/SceneDirector.ts
```
Expected: `change()` and `restore()` exist; `setScene()`/`restoreScene()` do not (fully renamed, not aliased — clean-break policy); `releaseScene()` still exists (Slice 3 does not touch it — confirmed by this plan's own brief).

- [ ] **Step 3: Confirm `_rollbackSwitch()` is gone**

Run:
```bash
grep -n "_rollbackSwitch" src/core/SceneDirector.ts
```
Expected: no output (removed per spec §3.5.1 — the atomic commit boundary leaves nothing to roll back for `_activeScope` itself).

- [ ] **Step 4: Confirm the options-object shape `change()` takes**

Run:
```bash
grep -n "interface.*Options\|type.*Args" src/core/SceneTypes.ts
```
Read whichever type(s) actually replaced `SetSceneOptions`/`SetSceneArgs`. Note the exact name(s) — Task 2 below calls the assumed name `ChangeSceneOptions<Data>`/`ChangeSceneArgs<Data>`; substitute the real name everywhere in Tasks 2–7 if it differs. The three fields it carries (`data`, `transition`, `suspendCurrent` — spec §6.3) matter more than the type's name.

- [ ] **Step 5: Confirm the remaining fields/methods this plan builds on are unchanged**

Run:
```bash
grep -n "_activeScope\b\|_activeScopeTarget\|_retained\b\|_prepareScene\|_disposeScene\|_handleOutgoingScope\|_suspendAndRetain\|_runWithNavigation\|_clearScene" src/core/SceneDirector.ts
```
Confirm all of these still exist with recognizably the same responsibilities described in this plan's Architecture section (exact line numbers will have shifted — that's expected and fine).

- [ ] **Step 6: Record deltas**

If every check above matches this plan's assumptions, proceed directly to Task 2. If any differ, write down the actual name/shape for each (a short note at the top of your working notes, not committed anywhere) and substitute it consistently through every remaining task — the code shown in Tasks 2–8 is the intended *behavior*; adapt identifiers to match reality.

No commit for this task (nothing changed).

---

## Task 2: `SceneTypes.ts` — new types and error classes

**Files:**

- Modify: `src/core/SceneTypes.ts`

**Interfaces:**

- Produces: `SceneInstanceKind = 'active' | 'retained' | 'preloaded'`; `UnloadOptions { transition?: SceneTransition; instance?: SceneInstanceKind | 'all' }`; `PreloadOptions<Data>` / `PreloadArgs<Data>` (mirrors whatever Slice 3 named its single-options-object erasure-safe tuple type — see Task 1 Step 4); `resolvePreloadArgs(args): { data: unknown }`; `AmbiguousSceneInstanceError`; `SceneInstanceNotFoundError`. Consumed by Task 4 (`preload()`), Task 5 (`change()`'s claim step), Task 6 (`unload()`).

No test file for this task alone — pure type/class additions, exercised through Tasks 4–6's `SceneDirector` tests, same convention the existing `RetainedSceneConflictError`/`RetainedSceneNotFoundError` classes used (see `docs/superpowers/plans/2026-07-20-v0.17-slice-e-retention.md`, Task 4).

**Design note on `SceneInstanceNotFoundError`:** spec §5 says "`instance` specified: `'active' | 'retained' | 'preloaded'` targets exactly that candidate (an error if it doesn't exist)" but does not name a class for that error — only `AmbiguousSceneInstanceError` is spec-named. Reusing `AmbiguousSceneInstanceError` for "the one instance you asked for isn't there" would be semantically wrong (that error means "more than one candidate, pick one" — the opposite situation). This plan adds `SceneInstanceNotFoundError` as a small, natural complement, following the exact same precedent `RetainedSceneNotFoundError` already set for the analogous `restoreScene()`/now-`restore()` case.

- [ ] **Step 1: Add `SceneInstanceKind` and `UnloadOptions`**

Add after the existing `RestoreSceneOptions` interface (or its Slice-3 equivalent — see Task 1 Step 4):

```ts
/** Which kind of scene activation a disambiguating {@link SceneDirector.unload} call targets. */
export type SceneInstanceKind = 'active' | 'retained' | 'preloaded';

/** Options passed to {@link SceneDirector.unload}. */
export interface UnloadOptions {
  /**
   * Only materializes for an active-scope match — a retained or preloaded
   * match has nothing visible on screen to transition, and always runs the
   * direct (non-transitioned) teardown path regardless of this option.
   */
  transition?: SceneTransition;
  /**
   * Disambiguates which candidate to discard when more than one exists for
   * the same constructor (active, retained, and/or preloaded can all
   * coexist). Omit only when exactly one candidate exists — `'all'` discards
   * every one that does.
   */
  instance?: SceneInstanceKind | 'all';
}
```

- [ ] **Step 2: Add `PreloadOptions`/`PreloadArgs`/`resolvePreloadArgs`**

Add after `UnloadOptions`. This mirrors whatever conditional-tuple erasure trick Slice 3 used for `change()`'s single-options-object (Task 1 Step 4) — shown here using the assumed `ChangeSceneOptions`-style shape, minus the `transition`/`suspendCurrent` fields that don't apply to preloading:

```ts
/**
 * Options passed to {@link SceneDirector.preload}. Unlike
 * {@link ChangeSceneOptions}, there is no `transition`/`suspendCurrent` —
 * preloading never touches the active scope or visibly transitions anything.
 */
export type PreloadOptions<Data> = [Data] extends [void] ? { data?: never } : { data: Readonly<Data> };

/**
 * Tuple type for the variadic tail of `preload()` calls, after the target
 * constructor — mirrors {@link ChangeSceneArgs}'s conditional-arity trick:
 * when `Data` is `void` the options argument itself is optional (nothing to
 * supply), otherwise it's required so a data-carrying scene can't be
 * preloaded without its data.
 */
export type PreloadArgs<Data> = [Data] extends [void] ? [options?: PreloadOptions<Data>] : [options: PreloadOptions<Data>];

/**
 * Resolve the erased-at-runtime options tail of a `preload()` call. Simpler
 * than {@link resolveSetSceneArgs}'s old data-vs-options disambiguation
 * (removed by Slice 3) — `preload()` only ever takes zero or one argument,
 * always an options object, never a bare data value.
 * @internal
 */
export function resolvePreloadArgs(args: readonly unknown[]): { data: unknown } {
  const options = args[0] as { data?: unknown } | undefined;

  return { data: options?.data };
}
```

**If Task 1 found a different name for the single-options-object type** (not `ChangeSceneOptions`/`ChangeSceneArgs`), rename every reference above to match, and adjust the JSDoc `{@link ...}` tags accordingly.

- [ ] **Step 3: Add `AmbiguousSceneInstanceError` and `SceneInstanceNotFoundError`**

Add after the existing `RetainedSceneNotFoundError` class:

```ts
/**
 * Thrown when `unload(Target)` is called with `options.instance` omitted
 * while more than one activation (active, retained, and/or preloaded)
 * exists for `Target` — there is no priority order; the caller must specify
 * which one via `{ instance: 'active' | 'retained' | 'preloaded' }`, or
 * `{ instance: 'all' }` to discard every one.
 */
export class AmbiguousSceneInstanceError extends Error {
  public readonly constructorName: string;
  public readonly candidates: readonly SceneInstanceKind[];

  public constructor(constructorName: string, candidates: readonly SceneInstanceKind[]) {
    super(
      `Scene constructor "${constructorName}" has more than one matching instance (${candidates.join(', ')}). Call unload(${constructorName}, { instance: '...' }) to specify which one, or { instance: 'all' } to discard every one.`,
    );
    this.name = 'AmbiguousSceneInstanceError';
    this.constructorName = constructorName;
    this.candidates = candidates;
  }
}

/**
 * Thrown when `unload(Target, { instance: kind })` targets a specific kind
 * of activation that does not exist for `Target`.
 */
export class SceneInstanceNotFoundError extends Error {
  public readonly constructorName: string;
  public readonly instance: SceneInstanceKind;

  public constructor(constructorName: string, instance: SceneInstanceKind) {
    super(`Scene constructor "${constructorName}" has no ${instance} instance to unload.`);
    this.name = 'SceneInstanceNotFoundError';
    this.constructorName = constructorName;
    this.instance = instance;
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean (new types/classes compile; nothing yet consumes them, so no new errors — same pattern Slice E's Task 4 used).

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/SceneTypes.ts
git commit -m "feat(core): preload/unload types and error classes (SceneTypes)

SceneInstanceKind, UnloadOptions, PreloadOptions/PreloadArgs/resolvePreloadArgs,
AmbiguousSceneInstanceError, and SceneInstanceNotFoundError. Not yet consumed —
SceneDirector wiring is the next tasks."
```

---

## Task 3: `SceneDirector.ts` — small refactors `preload()`/`unload()` need

**Files:**

- Modify: `src/core/SceneDirector.ts`
- Test: `test/core/scene-director.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `_prepareScene<Data>(scene, data, scope?)` gains an optional third parameter (a pre-built `SceneScope` to prepare, instead of always constructing a fresh one) — consumed by Task 4. `_disposeScene(scope, options?)` gains an optional `{ dispatchStopScene?: boolean }` second parameter (default `true`, unchanged behavior for every existing call site) — consumed by Task 4/6.

This task changes two private helpers' signatures without changing any existing caller's observable behavior — it's covered entirely by the *existing* test suite (no new assertions needed yet), so this task's "test" step is running the existing suite to confirm nothing broke, not adding new tests.

- [ ] **Step 1: Widen `_prepareScene`'s signature**

Find (adapt to the real, current signature per Task 1's reconciliation):

```ts
  private async _prepareScene<Data>(scene: Scene<Data>, data: Data): Promise<SceneScope<Data>> {
    const scope = new SceneScope(this._app, scene, (previous, next) => this.onStateChange.dispatch(previous, next, scene as Scene));

    try {
      await scope.prepare(data);
```

Replace with:

```ts
  /**
   * Construct (unless `scope` is already supplied — used by
   * {@link SceneDirector.preload}, which needs the `SceneScope` reference to
   * exist before `prepare()` resolves) and run its activation sequence
   * (attach → `Preparing` → `load()` → `init()`). On failure, runs the
   * failed-activation cleanup — engine-managed registrations destroyed,
   * loader claims released, `scene.destroy()` invoked, but `unload()` is
   * never called — and rethrows the original error unchanged.
   */
  private async _prepareScene<Data>(
    scene: Scene<Data>,
    data: Data,
    scope: SceneScope<Data> = new SceneScope(this._app, scene, (previous, next) => this.onStateChange.dispatch(previous, next, scene as Scene)),
  ): Promise<SceneScope<Data>> {
    try {
      await scope.prepare(data);
```

(Leave the rest of the method body — the root/draw warning check, the `catch` block calling `destroyFailedActivation()` — unchanged.)

- [ ] **Step 2: Widen `_disposeScene`'s signature**

Find:

```ts
  private async _disposeScene(scope: SceneScope): Promise<void> {
    this.onStopScene.dispatch(scope.scene as Scene);
    await scope.destroy();
  }
```

Replace with:

```ts
  /**
   * Permanently end `scope`'s scene: dispatch {@link SceneDirector.onStopScene}
   * (unless `dispatchStopScene: false` — used by {@link SceneDirector.unload}
   * for a preloaded scope that never reached `Active`; spec §2.1:
   * "`onStopScene` fires only for a scope activated at least once"), then run
   * the scope's teardown sequence.
   */
  private async _disposeScene(scope: SceneScope, options: { dispatchStopScene?: boolean } = {}): Promise<void> {
    if (options.dispatchStopScene ?? true) {
      this.onStopScene.dispatch(scope.scene as Scene);
    }

    await scope.destroy();
  }
```

- [ ] **Step 3: Widen `_clearScene`'s signature**

Find (adapt to whatever Slice 3 left this method as — it is not expected to have changed, per Task 1):

```ts
  public async _clearScene(): Promise<this> {
    await this._runWithNavigation(async () => {
      const previousScope = this._activeScope;

      this._activeScope = null;
      this._activeScopeTarget = null;

      if (previousScope !== null) {
        await this._disposeScene(previousScope);
      }

      this.onChangeScene.dispatch(null);
    });

    return this;
  }
```

Replace with:

```ts
  /**
   * @internal Clear the active scene (if any) without activating a new one.
   * Used by {@link Application.stop}/{@link Application.destroy} (no
   * transition, the default), and by {@link SceneDirector.unload}'s
   * active-scope match (an explicit `transition` may apply there — spec §5).
   * Never part of the public navigation surface itself (navigation always
   * targets a registered constructor).
   */
  public async _clearScene(transition?: SceneTransition): Promise<this> {
    await this._runWithNavigation(async () => {
      const previousScope = this._activeScope;

      this._activeScope = null;
      this._activeScopeTarget = null;

      if (previousScope !== null) {
        await this._disposeScene(previousScope);
      }

      this.onChangeScene.dispatch(null);
    }, transition);

    return this;
  }
```

(`Application.ts:915` calls `this.scenes._clearScene()` with zero arguments today — confirmed by reading the file directly; the new parameter is optional, so this call site needs no change.)

- [ ] **Step 4: Run the full existing scene-director suite to confirm nothing broke**

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: PASS — every existing test, unchanged, since all three signature widenings are purely additive (new optional parameters, unchanged default behavior).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/SceneDirector.ts
git commit -m "refactor(core): widen _prepareScene/_disposeScene/_clearScene for preload+unload

Purely additive optional parameters (a pre-built scope to prepare, an
opt-out of the onStopScene dispatch, an optional transition) — no behavior
change for any existing call site. Prepares the ground for preload()/unload()
in the following commits."
```

---

## Task 4: `SceneDirector.ts` — `_preloaded` map and `preload()`

**Files:**

- Modify: `src/core/SceneDirector.ts`
- Test: `test/core/scene-director.test.ts`

**Interfaces:**

- Consumes: `PreloadOptions<Data>`/`PreloadArgs<Data>`/`resolvePreloadArgs` (Task 2), the widened `_prepareScene`/`_disposeScene` (Task 3).
- Produces: `SceneDirector.preload<C>(target: C, ...args: PreloadArgs<InferSceneData<C>>): Promise<void>`. Consumed by Task 5 (`change()`'s claim step) and Task 6/7 (`unload()`/the race test).

- [ ] **Step 1: Write the failing tests**

Add to `test/core/scene-director.test.ts`, as a new top-level `describe`:

```ts
describe('SceneDirector — preload', () => {
  test('preload() prepares a scene into Ready without activating it', async () => {
    const app = createApplicationStub();
    const init = vi.fn();
    const PreloadedScene = makeSceneClass({ init });
    const director = new SceneDirector(app, { preloaded: PreloadedScene });

    await director.preload(PreloadedScene);

    expect(init).toHaveBeenCalledTimes(1);
    expect(director.currentScene).toBeNull(); // never activated
    expect(director.state).toBeNull(); // no active scope at all
  });

  test('a racing second preload() call for the same target and data shares the same in-flight preparation', async () => {
    const app = createApplicationStub();
    const load = vi.fn(async () => undefined);
    const PreloadedScene = makeSceneClass({ load });
    const director = new SceneDirector(app, { preloaded: PreloadedScene });

    const first = director.preload(PreloadedScene);
    const second = director.preload(PreloadedScene);

    await Promise.all([first, second]);

    expect(load).toHaveBeenCalledTimes(1); // one shared preparation, not two
  });

  test('preload() with mismatched data discards the stale entry and starts a fresh preparation with the new data', async () => {
    const app = createApplicationStub();
    const seenData: unknown[] = [];
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');
    class DataScene extends Scene<{ level: number }> {
      public override init(data: Readonly<{ level: number }>): void {
        seenData.push(data);
      }
    }
    const director = new SceneDirector(app, { preloaded: DataScene as unknown as SceneConstructor<void> });

    await director.preload(DataScene, { data: { level: 1 } });
    await director.preload(DataScene, { data: { level: 2 } }); // different object literal — Object.is() mismatch

    expect(seenData).toEqual([{ level: 1 }, { level: 2 }]);
    expect(destroySpy).toHaveBeenCalledTimes(1); // the stale level-1 preload was torn down

    destroySpy.mockRestore();
  });

  test('preload() rejects (dev builds) when the target is not registered', async () => {
    const app = createApplicationStub();
    const UnregisteredScene = makeSceneClass();
    const director = new SceneDirector(app, {});

    await expect(director.preload(UnregisteredScene)).rejects.toThrow(UnregisteredSceneError);
  });

  test('preload() coexists with a different active instance of the same constructor', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });

    await director.change(GameScene); // one live instance active
    await expect(director.preload(GameScene)).resolves.toBeUndefined(); // a second, preloaded instance — allowed

    expect(director.currentScene).toBeInstanceOf(GameScene);
  });
});
```

(This test file uses `change()` — per Task 1's renaming confirmation. If Task 1 found the method still named `setScene()`, use that instead, here and in every later task.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene-director.test.ts -t "SceneDirector — preload"`
Expected: FAIL — `director.preload` is not a function.

- [ ] **Step 3: Implement `PreloadEntry` and the `_preloaded` field**

Add near the top of `src/core/SceneDirector.ts`, alongside the existing `ActiveFadeTransition` interface (same "small internal-only interface colocated with the class that uses it" convention):

```ts
type PreloadStatus = 'loading' | 'ready' | 'claimed' | 'cancelling' | 'failed';

interface PreloadEntry {
  readonly scope: SceneScope;
  readonly data: unknown;
  readonly ready: Promise<void>;
  status: PreloadStatus;
}
```

Add the field next to `_retained`:

```ts
  private readonly _retained = new Map<AnySceneConstructor, SceneScope>();
  private readonly _preloaded = new Map<AnySceneConstructor, PreloadEntry>();
```

Update the import line to add the new consumed types:

```ts
import {
  type AnySceneConstructor,
  ConcurrentSceneNavigationError,
  type InferSceneData,
  type PreloadArgs,
  resolvePreloadArgs,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  type SceneTransition,
  UnregisteredSceneError,
  validateSceneRegistry,
} from './SceneTypes';
```

(Merge this with whatever the real import list looks like post-Slice-1-3 — keep every existing import, just add `PreloadArgs`/`resolvePreloadArgs`.)

- [ ] **Step 4: Implement `preload()`**

Add as a new public method, near `change()`/`restore()`:

```ts
  /**
   * Transparently pre-warm a fresh instance of `target` into {@link SceneState.Ready}
   * — fully prepared (`load()` + `init()` complete), but never activated. A
   * later {@link SceneDirector.change} call for the same constructor with
   * `Object.is()`-matching data consumes it automatically, skipping `load()`/
   * `init()` entirely. Not exclusive of an active or retained instance of the
   * same constructor — preloading "the next `GameScene`" while a different
   * `GameScene` instance is currently playing, or already retained, is fully
   * supported.
   *
   * A racing second `preload()` call for the same constructor shares this
   * same in-flight preparation when its data matches (`Object.is()`); a call
   * with different data discards the stale entry (once its own preparation
   * settles) and starts a fresh one with the new data — the newest call's
   * data always wins, never silently ignored.
   *
   * Rejects with {@link UnregisteredSceneError} (dev builds) when `target` is
   * not present in `ApplicationOptions.scenes`.
   */
  public preload<C extends AnySceneConstructor>(target: C, ...args: PreloadArgs<InferSceneData<C>>): Promise<void> {
    const { data } = resolvePreloadArgs(args);
    const existing = this._preloaded.get(target);

    if (existing !== undefined && existing.status !== 'cancelling') {
      if (Object.is(existing.data, data)) {
        return existing.ready;
      }

      this._preloaded.delete(target);
      this._discardStalePreload(existing);
    }

    if (__DEV__ && !this._registry.has(target)) {
      throw new UnregisteredSceneError(target.name, [...this._registry.values()]);
    }

    const scene = new target();
    const scope = new SceneScope(this._app, scene, (previous, next) => this.onStateChange.dispatch(previous, next, scene as Scene));
    const entry = {
      scope,
      data,
      status: 'loading',
      ready: undefined,
    } as { scope: SceneScope; data: unknown; ready: Promise<void>; status: PreloadStatus };

    entry.ready = this._runPreloadPrepare(target, entry, scene, data);

    this._preloaded.set(target, entry);

    return entry.ready;
  }
```

Add the two private helpers it depends on, near `_prepareScene`:

```ts
  /**
   * Runs the actual `prepare()` for a `preload()` entry. Marks the entry
   * `ready` on success (unless a racing `unload()` already marked it
   * `cancelling` — in that case `unload()` itself owns the final teardown;
   * this method leaves it alone), or removes it from `_preloaded` and
   * rethrows on failure (ordinary failed-preparation cleanup — no `unload()`,
   * spec §3.5.1).
   */
  private async _runPreloadPrepare(target: AnySceneConstructor, entry: PreloadEntry, scene: Scene, data: unknown): Promise<void> {
    try {
      await this._prepareScene(scene, data, entry.scope);
    } catch (error) {
      if (this._preloaded.get(target) === entry) {
        this._preloaded.delete(target);
      }

      throw error;
    }

    if (entry.status === 'cancelling') {
      return;
    }

    entry.status = 'ready';
  }

  /**
   * Discard a `_preloaded` entry that a newer `preload()`/`change()` call
   * superseded (mismatched data). Never destroys the scope while its own
   * `prepare()` is still in flight — waits for `ready` to settle first, then
   * tears it down through the normal "Ready-scope cleanup" path (`unload()`
   * runs, `onStopScene` does not — spec §2.1/§3.5.1). A failed `prepare()`
   * already cleaned itself up via `_runPreloadPrepare`'s own catch above —
   * nothing further to do in that case.
   */
  private _discardStalePreload(entry: PreloadEntry): void {
    entry.status = 'cancelling';

    void entry.ready
      .then(() => this._disposeScene(entry.scope, { dispatchStopScene: false }))
      .catch(() => {
        /* prepare() itself failed — already cleaned up */
      });
  }
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run test/core/scene-director.test.ts -t "SceneDirector — preload"`
Expected: PASS.

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/core/SceneDirector.ts test/core/scene-director.test.ts
git commit -m "feat(core): SceneDirector.preload() — transparent pre-warming into Ready

_preloaded map with synchronous, before-first-await insertion (in-flight
sharing); Object.is()-mismatched preloads discard the stale entry once its
own prepare() settles and start fresh. Not yet consumed by change() — next
commit."
```

---

## Task 5: `change()` consumes `_preloaded`

**Files:**

- Modify: `src/core/SceneDirector.ts`
- Test: `test/core/scene-director.test.ts`

**Interfaces:**

- Consumes: `_preloaded`/`PreloadEntry` (Task 4), Slice 3's already-merged `change()` implementation.
- Produces: `change()`'s behavior extends — no signature change.

**This task edits Slice 3's already-merged `change()` method — it does not add a parallel path.** Re-read the actual current body of `change()` before applying this diff (Task 1 already asked you to locate it; do so again now if time has passed and more code has landed in the meantime). The edit below is expressed against the *pre-Slice-3* `setScene()` body (the only concrete text available while this plan was written), restructured per spec §3.5.1's atomic-commit shape (no `_rollbackSwitch()`, no early `_activeScope` reassignment) — apply the equivalent edit to whatever the real, already-atomic `change()` body looks like: the new logic is "claim from `_preloaded` synchronously, before the first `await`, in place of always constructing+preparing a fresh scope."

- [ ] **Step 1: Write the failing tests**

Add to `test/core/scene-director.test.ts`, inside (or right after) the new preload `describe` block from Task 4:

```ts
  test('change() consumes a matching preload without re-running load()/init()', async () => {
    const app = createApplicationStub();
    const load = vi.fn(async () => undefined);
    const init = vi.fn();
    const GameScene = makeSceneClass({ load, init });
    const director = new SceneDirector(app, { game: GameScene });

    await director.preload(GameScene);
    expect(load).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);

    await director.change(GameScene);

    expect(load).toHaveBeenCalledTimes(1); // not re-run
    expect(init).toHaveBeenCalledTimes(1); // not re-run
    expect(director.state).toBe(SceneState.Active);
  });

  test('change() with data matching (Object.is) a preload consumes it; mismatched data ignores it and prepares fresh', async () => {
    const app = createApplicationStub();
    const seenData: unknown[] = [];
    class DataScene extends Scene<{ level: number }> {
      public override init(data: Readonly<{ level: number }>): void {
        seenData.push(data);
      }
    }
    const director = new SceneDirector(app, { game: DataScene as unknown as SceneConstructor<void> });
    const sharedData = { level: 3 };

    await director.preload(DataScene, { data: sharedData });
    await director.change(DataScene, { data: sharedData }); // same reference — Object.is() match

    expect(seenData).toEqual([{ level: 3 }]); // init() ran exactly once — from the preload, not re-run by change()
    expect(director.currentScene).toBeInstanceOf(DataScene);
  });

  test('change() ignores a preload with different (non-Object.is-matching) data and prepares fresh instead', async () => {
    const app = createApplicationStub();
    const seenData: unknown[] = [];
    class DataScene extends Scene<{ level: number }> {
      public override init(data: Readonly<{ level: number }>): void {
        seenData.push(data);
      }
    }
    const director = new SceneDirector(app, { game: DataScene as unknown as SceneConstructor<void> });

    await director.preload(DataScene, { data: { level: 1 } });
    await director.change(DataScene, { data: { level: 2 } }); // different object literal

    expect(seenData).toEqual([{ level: 1 }, { level: 2 }]); // preload's init() AND change()'s own fresh init() both ran
    expect(director.currentScene).toBeInstanceOf(DataScene);
  });

  test('change() with no matching preload behaves exactly as before (fresh prepare)', async () => {
    const app = createApplicationStub();
    const init = vi.fn();
    const GameScene = makeSceneClass({ init });
    const director = new SceneDirector(app, { game: GameScene });

    await director.change(GameScene);

    expect(init).toHaveBeenCalledTimes(1);
    expect(director.state).toBe(SceneState.Active);
  });
```

- [ ] **Step 2: Run to verify the new assertions fail**

Run: `pnpm vitest run test/core/scene-director.test.ts -t "consumes a matching preload"`
Expected: FAIL — `load`/`init` are each called twice today (`change()` doesn't yet know about `_preloaded`).

- [ ] **Step 3: Implement — teach `change()`'s claim step about `_preloaded`**

Locate the point in `change()`'s body where the incoming scope is currently always constructed fresh — in the pre-Slice-3 baseline this was:

```ts
      const scene = new target();
      const newScope = await this._prepareScene(scene, data);
```

Replace with a synchronous claim check performed *before* this point (still before the method's own first `await` — the registry/retained-conflict checks above it are already synchronous, so this slots in directly after them):

```ts
      const preloadEntry = this._preloaded.get(target);
      const claimedEntry = preloadEntry !== undefined && preloadEntry.status !== 'cancelling' && Object.is(preloadEntry.data, data) ? preloadEntry : null;

      if (claimedEntry !== null) {
        this._preloaded.delete(target);
        claimedEntry.status = 'claimed';
      }

      const scene = claimedEntry !== null ? (claimedEntry.scope.scene as Scene) : new target();
      const newScope = claimedEntry !== null ? await this._awaitClaimedPreload(claimedEntry) : await this._prepareScene(scene, data);
```

Add the small helper this calls:

```ts
  /**
   * Await a claimed `_preloaded` entry's own `ready` — already resolved if
   * the preload had reached `Ready`, still pending if it was mid-`load()`/
   * `init()` when claimed (spec §3.5 step 4: "an already-preloaded target
   * reaches the commit boundary almost immediately since there's nothing
   * left to await"). If `ready` rejects, the preload's own preparation
   * failure already ran the ordinary failed-preparation cleanup
   * (`_runPreloadPrepare`'s catch, Task 4) — nothing further to restore here,
   * this call simply propagates the same rejection `change()` would have
   * produced for a fresh `prepare()` failure.
   */
  private async _awaitClaimedPreload(entry: PreloadEntry): Promise<SceneScope> {
    await entry.ready;

    return entry.scope;
  }
```

**Claim restoration (spec §3.5.1) — deliberately not exercised by a test in this slice.** If the navigation aborts *after* a successful claim but *before* the atomic commit boundary, the claimed entry should go back into `_preloaded` as `ready` rather than being destroyed. Wherever `change()`'s existing pre-commit failure handling lives (whatever replaced the removed `_rollbackSwitch()` — Task 1 Step 3), add this alongside it:

```ts
      // Inside change()'s existing pre-commit catch block, alongside whatever
      // Slice 3 already does for a failed-preparation/aborted-navigation case:
      if (claimedEntry !== null && claimedEntry.status === 'claimed' && !this._preloaded.has(target)) {
        claimedEntry.status = 'ready';
        this._preloaded.set(target, claimedEntry);
      }
```

This branch is real, correct code — but per spec §3.5.1, "the only way to reach [a pre-commit failure after a successful claim] is §3.7's abort scenario," and §3.7 (the frame-loop-abort mechanism) is Slice 7's job, built on Slice 5's transition sessions. With Slice 2's exception-isolating lifecycle-signal dispatch already in place (guarding `onStopScene`/`onStateChange` against a throwing listener) and no real transition session existing yet, there is no way to *force* this branch to run from a test written at this point in the slice sequence — it is forward-compatible dead code until Slice 7 lands. Do not spend time contriving a fake failure injection point to exercise it; a comment citing §3.5.1 (above) is sufficient documentation of intent.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/scene-director.test.ts -t "preload"`
Expected: PASS — every preload test from Task 4 and this task's four new tests.

- [ ] **Step 5: Run the full scene-director suite**

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: PASS — confirms this edit didn't regress `change()`'s ordinary (no-preload) behavior, retention, rollback, or concurrent-navigation tests.

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/core/SceneDirector.ts test/core/scene-director.test.ts
git commit -m "feat(core): change() consumes a matching _preloaded entry

Object.is()-matched claim, synchronous and before the first await (mirrors
restore()'s existing eager claim-before-await pattern for _retained).
Mismatched data discards the stale preload and prepares fresh with the
call's own (always-authoritative) data."
```

---

## Task 6: `unload()` — replaces `releaseScene()`

**Files:**

- Modify: `src/core/SceneDirector.ts`
- Test: `test/core/scene-director.test.ts`

**Interfaces:**

- Consumes: `UnloadOptions`/`SceneInstanceKind`/`AmbiguousSceneInstanceError`/`SceneInstanceNotFoundError` (Task 2), `_preloaded` (Task 4), the widened `_clearScene()` (Task 3).
- Produces: `SceneDirector.unload<C>(target: C, options?: UnloadOptions): Promise<boolean>`. `releaseScene()` is **removed** (no alias).

- [ ] **Step 1: Remove `releaseScene()` and its two existing tests**

Delete the method:

```ts
  public async releaseScene<C extends AnySceneConstructor>(target: C): Promise<boolean> {
    const scope = this._retained.get(target);

    if (scope === undefined) {
      return false;
    }

    this._retained.delete(target);
    await this._disposeScene(scope);

    return true;
  }
```

In `test/core/scene-director.test.ts`, delete these two existing tests (they will be replaced by `unload()`-targeting equivalents in Step 2 below):

```ts
  test('releaseScene() permanently destroys the retained scene and returns true', async () => { /* ... */ });

  test('releaseScene() returns false for a constructor with nothing retained', async () => { /* ... */ });
```

Also update the test at line ~813 (`'a suspended scene keeps its loader claims — releasing it releases them'`) to call `director.unload(FirstScene)` instead of `director.releaseScene(FirstScene)` — this call has exactly one candidate (retained only), so no `instance` option is needed.

- [ ] **Step 2: Write the failing tests**

Add a new `describe` block. Note on the ambiguity tests: a single constructor can simultaneously be **retained** and **preloaded** (spec §4.3: "Coexistence with a retained scope: `preload(Target)` while `Target` is already retained is allowed"), and separately can be **active** and **preloaded** (§4.3: "Coexistence with an active scope") — two candidates is enough to exercise `AmbiguousSceneInstanceError`. All three at once for one constructor is deliberately not exercised: it isn't buildable through the public API (an active+retained combination for the *same* constructor would require `change()` to retain and immediately reuse it, which `RetainedSceneConflictError` specifically forbids), and isn't needed to prove the disambiguation logic — the two-candidate cases already exercise both branches of it.

```ts
describe('SceneDirector — unload', () => {
  test('unload() with exactly one candidate (retained) resolves it directly, no instance needed', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');

    await director.change(FirstScene);
    await director.change(SecondScene, { suspendCurrent: true }); // retains First

    await expect(director.unload(FirstScene)).resolves.toBe(true);
    expect(destroySpy).toHaveBeenCalledTimes(1);

    destroySpy.mockRestore();
  });

  test('unload() with exactly one candidate (preloaded) resolves it directly', async () => {
    const app = createApplicationStub();
    const PreloadedScene = makeSceneClass();
    const director = new SceneDirector(app, { preloaded: PreloadedScene });
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');

    await director.preload(PreloadedScene);

    await expect(director.unload(PreloadedScene)).resolves.toBe(true);
    expect(destroySpy).toHaveBeenCalledTimes(1);

    destroySpy.mockRestore();
  });

  test('unload() with exactly one candidate (active) resolves it directly and clears the active scope', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });

    await director.change(GameScene);

    await expect(director.unload(GameScene)).resolves.toBe(true);
    expect(director.currentScene).toBeNull();
  });

  test('unload() returns false when nothing matches at all', async () => {
    const app = createApplicationStub();
    const UnusedScene = makeSceneClass();
    const director = new SceneDirector(app, { unused: UnusedScene });

    await expect(director.unload(UnusedScene)).resolves.toBe(false);
  });
describe('SceneDirector — unload', () => {
  test('unload() with exactly one candidate (retained) resolves it directly, no instance needed', async () => {
    const app = createApplicationStub();
    const FirstScene = makeSceneClass();
    const SecondScene = makeSceneClass();
    const director = new SceneDirector(app, { first: FirstScene, second: SecondScene });
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');

    await director.change(FirstScene);
    await director.change(SecondScene, { suspendCurrent: true }); // retains First

    await expect(director.unload(FirstScene)).resolves.toBe(true);
    expect(destroySpy).toHaveBeenCalledTimes(1);

    destroySpy.mockRestore();
  });

  test('unload() with exactly one candidate (preloaded) resolves it directly', async () => {
    const app = createApplicationStub();
    const PreloadedScene = makeSceneClass();
    const director = new SceneDirector(app, { preloaded: PreloadedScene });
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');

    await director.preload(PreloadedScene);

    await expect(director.unload(PreloadedScene)).resolves.toBe(true);
    expect(destroySpy).toHaveBeenCalledTimes(1);

    destroySpy.mockRestore();
  });

  test('unload() with exactly one candidate (active) resolves it directly and clears the active scope', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });

    await director.change(GameScene);

    await expect(director.unload(GameScene)).resolves.toBe(true);
    expect(director.currentScene).toBeNull();
  });

  test('unload() returns false when nothing matches at all', async () => {
    const app = createApplicationStub();
    const UnusedScene = makeSceneClass();
    const director = new SceneDirector(app, { unused: UnusedScene });

    await expect(director.unload(UnusedScene)).resolves.toBe(false);
  });

  test('unload() with omitted instance rejects with AmbiguousSceneInstanceError when retained+preloaded both exist', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const OtherScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene, other: OtherScene });

    await director.change(GameScene);
    await director.change(OtherScene, { suspendCurrent: true }); // retains GameScene
    await director.preload(GameScene); // also preload a fresh GameScene — allowed alongside the retained one

    await expect(director.unload(GameScene)).rejects.toThrow(AmbiguousSceneInstanceError);
  });

  test('unload() with omitted instance rejects with AmbiguousSceneInstanceError when active+preloaded both exist', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });

    await director.change(GameScene);
    await director.preload(GameScene);

    await expect(director.unload(GameScene)).rejects.toThrow(AmbiguousSceneInstanceError);
  });

  test('unload(..., { instance }) targets exactly the requested candidate', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const OtherScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene, other: OtherScene });

    await director.change(GameScene);
    await director.change(OtherScene, { suspendCurrent: true }); // retains GameScene
    await director.preload(GameScene); // + a fresh preloaded GameScene

    await expect(director.unload(GameScene, { instance: 'preloaded' })).resolves.toBe(true);
    // The retained GameScene is untouched — still resolvable and unambiguous now:
    await expect(director.unload(GameScene, { instance: 'retained' })).resolves.toBe(true);
  });

  test('unload(..., { instance }) rejects with SceneInstanceNotFoundError when that specific kind does not exist', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });

    await director.preload(GameScene);

    await expect(director.unload(GameScene, { instance: 'retained' })).rejects.toThrow(SceneInstanceNotFoundError);
  });

  test('unload(..., { instance: "all" }) discards every existing candidate', async () => {
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: GameScene });
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');

    await director.change(GameScene);
    await director.preload(GameScene);

    await expect(director.unload(GameScene, { instance: 'all' })).resolves.toBe(true);

    expect(director.currentScene).toBeNull();
    expect(destroySpy).toHaveBeenCalledTimes(2); // the active instance and the preloaded one

    destroySpy.mockRestore();
  });

  test('a retained or preloaded match ignores options.transition — only an active match can visibly transition', async () => {
    const app = createApplicationStub();
    const PreloadedScene = makeSceneClass();
    const director = new SceneDirector(app, { preloaded: PreloadedScene });

    // No fade machinery is exercised for a retained/preloaded discard — this
    // resolves immediately regardless of the (deliberately long) duration,
    // proving the direct fast path ran instead of the transition bridge.
    await director.preload(PreloadedScene);

    await expect(director.unload(PreloadedScene, { transition: { type: 'fade', duration: 5000 } })).resolves.toBe(true);
  });

  test('unload() never dispatches onStopScene for a preloaded scene that was never activated', async () => {
    const app = createApplicationStub();
    const PreloadedScene = makeSceneClass();
    const director = new SceneDirector(app, { preloaded: PreloadedScene });
    const stopSceneSpy = vi.fn();

    director.onStopScene.add(stopSceneSpy);

    await director.preload(PreloadedScene);
    await director.unload(PreloadedScene);

    expect(stopSceneSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run test/core/scene-director.test.ts -t "SceneDirector — unload"`
Expected: FAIL — `director.unload` is not a function.

- [ ] **Step 4: Implement `unload()`**

Add the public method (placed where `releaseScene()` used to be), plus its two private helpers:

```ts
  /**
   * Discard whatever is parked or active for `target`'s constructor — the
   * single, unified replacement for the removed `releaseScene()`. Checks
   * every candidate (active, retained, preloaded); when more than one
   * exists, `options.instance` must disambiguate which one — there is no
   * priority order. `options.transition` only materializes for an
   * active-scope match (a retained or preloaded match has nothing visible on
   * screen to transition, and always runs the direct, non-transitioned
   * teardown path).
   *
   * Returns `false` if nothing matched `target` at all. Rejects with
   * {@link AmbiguousSceneInstanceError} when `options.instance` is omitted
   * and more than one candidate exists; with {@link SceneInstanceNotFoundError}
   * when `options.instance` names a specific kind that doesn't exist for
   * `target`.
   */
  public async unload<C extends AnySceneConstructor>(target: C, options: UnloadOptions = {}): Promise<boolean> {
    const preloadEntry = this._preloaded.get(target);
    const candidates: SceneInstanceKind[] = [
      ...(this._activeScopeTarget === target ? (['active'] as const) : []),
      ...(this._retained.has(target) ? (['retained'] as const) : []),
      ...(preloadEntry !== undefined && preloadEntry.status !== 'cancelling' ? (['preloaded'] as const) : []),
    ];

    if (candidates.length === 0) {
      return false;
    }

    if (options.instance === undefined) {
      if (candidates.length > 1) {
        throw new AmbiguousSceneInstanceError(target.name, candidates);
      }

      return this._unloadInstance(target, candidates[0] as SceneInstanceKind, options);
    }

    if (options.instance === 'all') {
      let unloadedAny = false;

      for (const kind of ['retained', 'preloaded', 'active'] as const) {
        if (!candidates.includes(kind)) {
          continue;
        }

        const unloaded = await this._unloadInstance(target, kind, options);

        unloadedAny = unloaded || unloadedAny;
      }

      return unloadedAny;
    }

    if (!candidates.includes(options.instance)) {
      throw new SceneInstanceNotFoundError(target.name, options.instance);
    }

    return this._unloadInstance(target, options.instance, options);
  }

  private async _unloadInstance(target: AnySceneConstructor, kind: SceneInstanceKind, options: UnloadOptions): Promise<boolean> {
    if (kind === 'retained') {
      const scope = this._retained.get(target);

      if (scope === undefined) {
        return false;
      }

      this._retained.delete(target);
      await this._disposeScene(scope);

      return true;
    }

    if (kind === 'preloaded') {
      return this._unloadPreloaded(target);
    }

    if (this._activeScopeTarget !== target) {
      return false;
    }

    await this._clearScene(options.transition);

    return true;
  }

  /**
   * Discard a `_preloaded` entry, racing an in-flight `preload()` safely:
   * marks the entry `cancelling` synchronously (so `preload()`'s own claim
   * check and `change()`'s claim check both skip it — Tasks 4/5), then waits
   * for its `ready` to settle before tearing anything down — `scope.destroy()`
   * never runs concurrently with an in-progress `prepare()`.
   */
  private async _unloadPreloaded(target: AnySceneConstructor): Promise<boolean> {
    const entry = this._preloaded.get(target);

    if (entry === undefined || entry.status === 'cancelling') {
      return false;
    }

    entry.status = 'cancelling';

    try {
      await entry.ready;
    } catch {
      // prepare() failed — _runPreloadPrepare() already ran the
      // failed-preparation cleanup and removed the entry. Nothing further to do.
      return true;
    }

    // prepare() succeeded — the scope genuinely reached Ready. Normal
    // permanent teardown, WITH unload() (spec §2.1/§3.5.1's "Ready-scope
    // cleanup"), but WITHOUT dispatching onStopScene (§2.1: never activated).
    if (this._preloaded.get(target) === entry) {
      this._preloaded.delete(target);
    }

    await this._disposeScene(entry.scope, { dispatchStopScene: false });

    return true;
  }
```

Update the import block to add the four new consumed identifiers:

```ts
import {
  AmbiguousSceneInstanceError,
  type AnySceneConstructor,
  ConcurrentSceneNavigationError,
  type InferSceneData,
  type PreloadArgs,
  resolvePreloadArgs,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  type SceneInstanceKind,
  SceneInstanceNotFoundError,
  type SceneTransition,
  type UnloadOptions,
  UnregisteredSceneError,
  validateSceneRegistry,
} from './SceneTypes';
```

And update the re-export lines:

```ts
export type { FadeSceneTransition, /* ...existing Slice-3 type exports..., */ SceneInstanceKind, UnloadOptions } from './SceneTypes';
export {
  AmbiguousSceneInstanceError,
  ConcurrentSceneNavigationError,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  SceneInstanceNotFoundError,
} from './SceneTypes';
```

Finally, update `SceneDirector`'s class-level JSDoc (currently references `setScene`) to mention `unload()` and drop any remaining reference to `releaseScene()`.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run test/core/scene-director.test.ts -t "SceneDirector — unload"`
Expected: PASS.

- [ ] **Step 6: Run the full scene-director suite**

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: PASS — including the rewritten "suspended scene keeps its loader claims" test from Step 1.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 8: Grep-confirm `releaseScene` is fully gone**

Run:
```bash
grep -rn "releaseScene" src test
```
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add src/core/SceneDirector.ts test/core/scene-director.test.ts
git commit -m "feat(core): SceneDirector.unload() replaces releaseScene()

Unified discard entry point across active/retained/preloaded scopes, with
explicit AmbiguousSceneInstanceError disambiguation instead of a silent
priority order. releaseScene() is removed, not aliased (clean-break policy)."
```

---

## Task 7: Race safety — `unload()` vs. an in-flight `preload()`

**Files:**

- Modify: `test/core/scene-director.test.ts` only (the production code this exercises was already written in Task 6's `_unloadPreloaded`; this task adds the dedicated test the spec explicitly calls for).

**Interfaces:** none new — this task is pure test coverage for an already-implemented code path.

- [ ] **Step 1: Write the failing (well — should-already-pass, confirming) test**

Add to the `'SceneDirector — unload'` describe block from Task 6, using the repo's established pattern for manually-controlling an in-flight async hook (see e.g. `SlowScene`/`load: () => new Promise<void>(() => {})` elsewhere in this file — here the promise needs to be externally resolvable, not permanently pending):

```ts
  test('unload() racing an in-flight preload() cancels it: waits for prepare() to settle, never destroys concurrently with prepare(), then still runs unload() (Ready-scope cleanup)', async () => {
    const app = createApplicationStub();
    let resolveLoad!: () => void;
    const initSpy = vi.fn();
    const unloadHook = vi.fn(async () => undefined);
    const destroySpy = vi.spyOn(Scene.prototype, 'destroy');
    const SlowScene = makeSceneClass({
      load: () =>
        new Promise<void>(resolve => {
          resolveLoad = resolve;
        }),
      init: initSpy,
      unload: unloadHook,
    });
    const director = new SceneDirector(app, { slow: SlowScene });

    const preloadPromise = director.preload(SlowScene);
    const unloadPromise = director.unload(SlowScene);

    // Still mid-load() — unload() must be waiting on prepare() to settle,
    // not tearing anything down yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(destroySpy).not.toHaveBeenCalled();
    expect(unloadHook).not.toHaveBeenCalled();
    expect(initSpy).not.toHaveBeenCalled(); // load() hasn't even resolved yet

    resolveLoad();

    await expect(preloadPromise).resolves.toBeUndefined(); // prepare() itself still succeeds
    await expect(unloadPromise).resolves.toBe(true);

    expect(initSpy).toHaveBeenCalledTimes(1); // prepare() ran to completion (reached Ready), not aborted mid-way
    expect(unloadHook).toHaveBeenCalledTimes(1); // Ready-scope cleanup: unload() DOES run (spec §2.1/§3.5.1)
    expect(destroySpy).toHaveBeenCalledTimes(1);

    destroySpy.mockRestore();
  });

  test('a fresh preload() call racing an in-flight unload()-cancellation of the same target does not interfere with it', async () => {
    const app = createApplicationStub();
    let resolveFirstLoad!: () => void;
    const firstUnloadHook = vi.fn(async () => undefined);
    const secondInit = vi.fn();
    let loadCallCount = 0;
    const RacyScene = makeSceneClass({
      load: () => {
        loadCallCount += 1;

        if (loadCallCount === 1) {
          return new Promise<void>(resolve => {
            resolveFirstLoad = resolve;
          });
        }

        return undefined;
      },
      init: secondInit,
      unload: firstUnloadHook,
    });
    const director = new SceneDirector(app, { racy: RacyScene });

    const firstPreload = director.preload(RacyScene);
    const cancellingUnload = director.unload(RacyScene); // marks the first entry 'cancelling'

    const secondPreload = director.preload(RacyScene); // starts an independent, fresh preload for the same constructor

    resolveFirstLoad();

    await Promise.all([firstPreload, cancellingUnload, secondPreload]);

    expect(firstUnloadHook).toHaveBeenCalledTimes(1); // the cancelled entry's own scene was torn down
    expect(secondInit).toHaveBeenCalledTimes(1); // the second preload's scene reached Ready independently

    // The second preload is still available for a later change() to consume —
    // confirmed by its state, not yet activated:
    expect(director.currentScene).toBeNull();
  });
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run test/core/scene-director.test.ts -t "racing"`
Expected: PASS immediately (Task 6 already implemented `_unloadPreloaded`'s cancelling behavior; this task only adds the dedicated coverage the spec calls for). If either test fails, the bug is in Task 6's `_unloadPreloaded`/`preload()` interaction — fix it there before proceeding (do not special-case the test).

- [ ] **Step 3: Run the full scene-director suite once more**

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: PASS, full file.

- [ ] **Step 4: Commit**

```bash
git add test/core/scene-director.test.ts
git commit -m "test(core): unload() vs in-flight preload() race coverage

Confirms the cancelling status transition never destroys a scope
concurrently with an in-progress prepare(), and that a fresh preload() for
the same constructor started while an older one is being cancelled runs
independently without interference."
```

---

## Task 8: API docs regeneration and full targeted verification

**Files:**

- Regenerated: `site/src/content/api/scene-director.json`, `site/src/content/api/scene-types.json` (or equivalent — whatever `docs:api:generate` produces for the touched exports), plus any new per-symbol JSON files for `AmbiguousSceneInstanceError`/`SceneInstanceNotFoundError`/`UnloadOptions`/`SceneInstanceKind` (mirrors the existing `site/src/content/api/retained-scene-conflict-error.json` pattern).
- Also grep-check: `CHANGELOG.md` mentions `releaseScene` (from its original addition) — leave historical changelog entries alone (they document what shipped in the past); this slice's own changelog entry is Slice 8's job (documentation slice), not this one's.

- [ ] **Step 1: Regenerate API docs**

Run: `pnpm docs:api:generate`
Expected: succeeds; `git status` shows new/modified files under `site/src/content/api/`.

- [ ] **Step 2: Review the generated diff briefly**

Run: `git diff --stat site/src/content/api/`
Expected: modified entries for `scene-director` and the `SceneTypes`-sourced symbols touched this slice; new entries for `AmbiguousSceneInstanceError`, `SceneInstanceNotFoundError`. No unrelated symbols should appear in the diff — if any do, something outside this slice's scope got picked up (investigate before committing).

- [ ] **Step 3: Full targeted verification**

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: PASS, full file (final confirmation before the broader gate).

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

Run: `pnpm test:core`
Expected: PASS — every file in the `exojs` Vitest project, not just `scene-director.test.ts` (confirms no cross-file regression, e.g. in any test that imports `SceneTypes`' now-changed export list).

- [ ] **Step 4: Commit**

```bash
git add site/src/content/api/
git commit -m "docs(api): regenerate API docs for preload()/unload()

New AmbiguousSceneInstanceError/SceneInstanceNotFoundError entries; updated
SceneDirector entry (preload/unload replace releaseScene)."
```

---

## Self-Review

**1. Spec coverage** — walked every subsection this slice owns:
- §4.1 (dormancy problem) — not this slice's concern; assumed fixed by Slice 2, only consumed here (facilities stay cold through `Ready`).
- §4.2 (`Ready` state, facility-dormancy table) — assumed shipped by Slice 2; Task 1 verifies it exists before anything else proceeds.
- §4.3 (preload design) — `_preloaded` map (Task 4), synchronous pre-`await` insertion (Task 4 Step 4), in-flight sharing (Task 4 Step 1 test 2), `Object.is()`-mismatch discard (Task 4 Step 1 test 3, Task 4 Step 4 `_discardStalePreload`), consumption by `change()` (Task 5), coexistence with active/retained (Task 4 Step 1 test 5, Task 6 ambiguity tests), `unload()`-vs-in-flight-`preload()` cancelling (Task 6 `_unloadPreloaded`, Task 7's dedicated race tests).
- §5 (`unload()`) — single unified entry point (Task 6), exactly-one-candidate resolves directly (Task 6 tests 1–3), `AmbiguousSceneInstanceError` with no priority order (Task 6 tests 5–6), `instance` targeting + `'all'` (Task 6 tests 7–9), `options.transition` only for active match (Task 6 test 10), `releaseScene()` removed not aliased (Task 6 Step 1/9).
- §2.1's `onStopScene`-never-for-never-activated rule, as it specifically applies to a discarded preload — Task 3 Step 2 (`_disposeScene`'s new flag), Task 6 test 11.
- §3.5.1's claim-restoration for preload — implemented in Task 5 (code shown, wired to whatever pre-commit-failure path Slice 3 already has), explicitly *not* forced into a test, with the reasoning stated inline (unreachable before Slice 7's abort path exists).
- Scope note "unload()'s active-scope-match case should just delegate to whatever change() in Slice 3 already does with a transition option" — satisfied by reusing `_clearScene()` (Task 3 Step 3, Task 6's `_unloadInstance`'s `'active'` branch) rather than building new transition-dispatch logic.
- §6.3-adjacent naming (`change()`/`restore()`) — not built by this slice, only consumed; Task 1 verifies the assumption before any code is written against it.

**2. Placeholder scan** — no "TBD"/"handle appropriately"/bare prose-only steps; every code step shows complete, real TypeScript. The one place this plan deliberately does *not* force a test (§3.5.1's claim-restoration branch, Task 5) states the concrete reason (unreachable until Slice 7) rather than hand-waving it away, and still shows the real implementation code — it is not an unimplemented placeholder, only an untested-for-now branch with a stated reason.

**3. Type consistency** — checked every later reference against its introducing task:
- `PreloadEntry`/`PreloadStatus` (Task 4) used identically in Task 5 (`_awaitClaimedPreload`) and Task 6 (`_unloadPreloaded`).
- `_preloaded: Map<AnySceneConstructor, PreloadEntry>` (Task 4) — same field name/type used in Task 5's claim check and Task 6's candidate computation.
- `SceneInstanceKind`/`UnloadOptions`/`AmbiguousSceneInstanceError`/`SceneInstanceNotFoundError` (Task 2) — names match their Task 6 usage exactly (constructor argument order: `(constructorName, candidates)` / `(constructorName, instance)`, matching the classes' actual constructors).
- `_prepareScene<Data>(scene, data, scope?)` (Task 3) — Task 4's `_runPreloadPrepare` calls it with all three arguments (`this._prepareScene(scene, data, entry.scope)`), matching the widened signature exactly.
- `_disposeScene(scope, options?)` (Task 3) — Task 4's `_discardStalePreload` and Task 6's `_unloadPreloaded` both call it with `{ dispatchStopScene: false }`, matching the widened signature.
- `_clearScene(transition?)` (Task 3) — Task 6's `_unloadInstance`'s `'active'` branch calls `this._clearScene(options.transition)`, matching.
- Test helper names (`makeSceneClass`, `createApplicationStub`, `tick`) reused as-is from the existing file — no renaming introduced.

Fixed inline during this pass: an early draft of Task 6's ambiguity test tried to build all three candidates (active+retained+preloaded) for one constructor, which doesn't compile against `RetainedSceneConflictError`'s existing constraint — Task 6 Step 2 now uses the two-candidate versions instead (retained+preloaded, active+preloaded), with the reasoning stated directly in the step rather than silently swapped in.
