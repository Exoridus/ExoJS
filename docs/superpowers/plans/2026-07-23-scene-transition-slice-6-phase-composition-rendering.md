# Scene Transition Slice 6 — Phase Composition & Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `PhasedSceneTransition` — the single-class `enter()`/`exit()` authoring layer over `SceneTransition` (spec §3.9) — plus the requirements-lattice merge/promotion rule (§3.9.1), the `SceneTransitionPhases`/`SceneTransitionSelection` types (§3.10), and registry-level default-transition resolution wired into scene navigation, per the exact per-operation resolution order in §3.10.

**Architecture:** `PhasedSceneTransition` (new file, `src/core/PhasedSceneTransition.ts`) is a concrete-enough abstract base class over Slice 5's `SceneTransition`: authors override `getPhaseRequirements()`/`enter()`/`exit()` (both `protected`) and the base class does the rest — driving one continuous session (exit 0→1 → `commit()` → hold at the exit end-state → enter 0→1 → done) via an internal `PhasedSceneTransitionSession`. Because the Director (and, for `{ enter, exit }` composition, a *different* `PhasedSceneTransition` instance's own session driver) needs to call into an arbitrary instance it does not share a class hierarchy with, every one of `getPhaseRequirements()`/`enter()`/`exit()` gets a `public` wrapper (`getRequirementsForPhase()`, `runPhase()`) that does nothing but forward to the `protected` hook — the exact same shape as `beginSession()`/`createSession()` in Slice 5 (§3.1a). `SceneTransitionPhases`/`SceneTransitionSelection` (new types, added to `SceneTypes.ts`) model a registry-level or call-site transition choice; `resolveSceneTransitionSelection()` (new file, `src/core/SceneTransitionResolution.ts`) is a small pure function implementing §3.10's four-rule resolution order plus the "unload never consults the registry default" carve-out, and is wired into `SceneDirector`'s navigation methods.

**Tech Stack:** TypeScript (strict), Vitest, `#core`/`#animation`/`#rendering` subpath imports. Builds on Slices 1–5 of `.workspace/specs/2026-07-23-scene-transition-lifecycle-design.md` (assumed merged — see "Dependency note" below).

## Dependency note — this plan targets code that does not exist in this worktree yet

This worktree is branched directly off `origin/main @ b5aad1a3`, which predates Slices 1–5 of this redesign entirely (no `PhasedSceneTransition`, no `SceneTransition` base class, no `change()`/`restore()`/`preload()`/`unload()`, no scene registry descriptor with a `transition` field — `SceneDirector` still has the pre-redesign `setScene()`/`restoreScene()`/fade-only `SceneTransition` union). Every type this plan imports from Slice 5 (`SceneTransition`, `SceneTransitionSession`, `SceneTransitionEnvironment`, `SceneTransitionFrame`, `SceneTransitionContext`, `SceneTransitionRequirements`, `SceneTransitionOperation`) is quoted **verbatim from the spec's own §3 code block**, which is Slice 5's exact deliverable — there is no ambiguity to resolve there. Task 8 (wiring into `SceneDirector`) is the one task whose *exact* surrounding code this plan cannot pin down (Slices 1–4 haven't landed either) — that task gives the precise invariant to satisfy and a grep-first step to locate the real insertion point; do not skip the grep step even if the file looks like it matches.

Assumed filenames for prior-slice deliverables (confirm with a quick `ls`/grep before Task 8; adjust import paths in earlier tasks too if wrong — they're independent of Task 8's uncertainty):
- `src/core/SceneTransition.ts` — Slice 5's `SceneTransition` abstract class + session/environment/frame/context/requirements types.
- `src/core/SceneTypes.ts` — already exists (pre-redesign); Slice 1 adds `SceneRegistration<C>`/`SceneRegistryShape<Registry>` here (registry descriptor types, §6.1) and leaves `transition?: unknown` as a placeholder per this plan's brief.
- `src/core/SceneDirector.ts` — already exists; Slices 3/4 rename `setScene`/`restoreScene` to `change`/`restore`, add `preload`/`unload`.

## Global Constraints

- Clean breaks only — no deprecated aliases, no shims (pre-1.0 policy).
- Every new public export gets a JSDoc comment; `@internal` for engine-only surface (see `[[feedback-jsdoc-conventions]]` memory for the house style — mirror the `{@link}`-heavy, example-bearing style already in `Scene.ts`/`SceneTypes.ts`).
- `pnpm docs:api:generate` must be run and committed before the final push (push-gated).
- Every task ends green on its own scoped test command before moving to the next.
- **`getPhaseRequirements()`, `enter()`, `exit()` are `protected` on `PhasedSceneTransition`; every one of them gets a `public` wrapper method with an identical parameter list, forwarding as its entire body.** This is not optional polish — a `protected` method on a class the caller doesn't share a hierarchy with is simply uncallable from that caller, confirmed by an empirical `tsc --strict` check in Task 2 and Task 3 below (see each task's compiler-verification step). Do not call `getPhaseRequirements()`/`enter()`/`exit()` from `SceneDirector`, `SceneTransitionResolution.ts`, or any composed-session driver — always go through the public wrapper.
- **`PhasedSceneTransition`'s own constructor must be `public`, never `protected`.** An abstract class with a `protected` constructor is still non-instantiable on its own (that's what `abstract` already does) — but the modifier is *inherited*: a concrete subclass that declares no constructor of its own (the common case for a minimal `enter()`/`exit()`-only transition) inherits the `protected` constructor and becomes uninstantiable from outside the module too. Verified empirically in Task 2.
- **Compile-time verification, not runtime-only:** this repo's Vitest transform (esbuild-based) strips TypeScript access modifiers without re-verifying them — a `protected` constructor or method would still let a plain `.test.ts` file call it at runtime with zero test failures, even though the code is invalid TypeScript. Every task touching visibility modifiers must include a `pnpm typecheck` step and treat it (not the Vitest run) as the actual gate for that requirement.
- `SceneTransitionPhases` is a **union of two variants** (`{ enter: X; exit?: Y }` or `{ enter?: X; exit: Y }`), never an interface with both fields optional — confirmed in Task 5 that the interface form type-checks `{}` as valid (a real, verified TypeScript `--strict` bug: a call-site `transition: {}` would silently suppress a scene's registry default while looking like a no-op), while the union form correctly rejects it.

---

## File Structure

```text
src/core/
├── PhasedSceneTransition.ts        (new) — PhasedSceneTransitionOptions, SceneTransitionPhaseRequirements,
│                                             SceneTransitionPhaseContext, PhasedSceneTransition (public ctor,
│                                             getRequirementsForPhase()/runPhase() public wrappers, getRequirements()
│                                             override via merge, createSession() via PhasedSceneTransitionSession),
│                                             mergeSceneTransitionRequirements(), PhasedSceneTransitionSession
│                                             (internal session driver, exported for testing), composePhasedSceneTransition(),
│                                             NoOpPhasedSceneTransition + resolvePhasedSelection()
├── SceneTransitionResolution.ts    (new) — resolveSceneTransitionSelection() (§3.10 resolution order + operation table)
├── SceneTypes.ts                   (modified) — SceneTransitionPhases (union), SceneTransitionSelection,
│                                                  SceneRegistration.transition: unknown → SceneTransitionSelection
├── SceneDirector.ts                (modified) — change()/restore() (and start() by extension, since start()
│                                                  delegates to change() per §3.7) consult the target's registry
│                                                  default via resolveSceneTransitionSelection(); unload() never does
└── index.ts                        (modified) — export the new public surface

test/core/
├── phased-scene-transition.test.ts        (new) — PhasedSceneTransition, the merge function, the single-instance
│                                                    session driver, composePhasedSceneTransition, NoOpPhasedSceneTransition
├── scene-transition-resolution.test.ts    (new) — resolveSceneTransitionSelection(), all 4 rules + the unload carve-out
└── scene-director.test.ts                 (modified) — registry-default consultation at the SceneDirector level

test/type-tests/
└── scene-transition-phases.type-test.ts   (new) — SceneTransitionPhases rejects {}, SceneTransitionSelection accepts
                                                     SceneTransition | SceneTransitionPhases | false, public-constructor
                                                     + public-wrapper compile-time checks
```

One test file per new source file (`phased-scene-transition.test.ts` ↔ `PhasedSceneTransition.ts`, mirroring the existing `scene-scope.test.ts` ↔ `SceneScope.ts` convention), rather than splitting the merge function or the composition helper into their own files — they're small, cohesive, and always change together with the class they support.

---

## Task 1: `mergeSceneTransitionRequirements()` — the requirements lattice

**Files:**
- Create: `src/core/PhasedSceneTransition.ts` (this task only adds the merge function and its supporting types; the class comes in Task 2)
- Test: `test/core/phased-scene-transition.test.ts` (new)

**Interfaces:**
- Consumes: nothing from prior tasks (first task in this slice).
- Produces: `SceneTransitionPhaseRequirements` interface, `mergeSceneTransitionRequirements(a, b): SceneTransitionRequirements` (pure function). Consumed by Task 2 (`PhasedSceneTransition.getRequirements()`) and Task 4 (`composePhasedSceneTransition`).

This is spec §3.9.1's merge function, taken verbatim — the stronger requirement wins on each axis independently (`direct` exit + `texture` enter → session-wide `texture`). This single function *is* the entire "direct → texture identity-composite promotion" rule: once the merged value is `'texture'`, Slice 5's existing per-frame "live surface → pooled texture" render (§3.4, already built, unconditional whenever a session declares `currentFrame: 'texture'`) automatically populates `frame.current` for a promoted phase with no phase-level code change required — there is no separate pixel-compositing mechanism for this plan to add.

- [ ] **Step 1: Write the failing tests**

```ts
// test/core/phased-scene-transition.test.ts (new file)
import { mergeSceneTransitionRequirements, type SceneTransitionPhaseRequirements } from '#core/PhasedSceneTransition';

describe('mergeSceneTransitionRequirements', () => {
  test('identical requirements pass through unchanged', () => {
    const a: SceneTransitionPhaseRequirements = { outgoingFrame: 'none', currentFrame: 'direct' };
    const b: SceneTransitionPhaseRequirements = { outgoingFrame: 'none', currentFrame: 'direct' };

    expect(mergeSceneTransitionRequirements(a, b)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
  });

  test('direct exit + texture enter promotes to texture (identity-composite promotion, §3.9.1)', () => {
    const exit: SceneTransitionPhaseRequirements = { outgoingFrame: 'none', currentFrame: 'direct' };
    const enter: SceneTransitionPhaseRequirements = { outgoingFrame: 'none', currentFrame: 'texture' };

    expect(mergeSceneTransitionRequirements(exit, enter)).toEqual({ outgoingFrame: 'none', currentFrame: 'texture' });
  });

  test('merge is order-independent (the stronger side always wins regardless of argument order)', () => {
    const weak: SceneTransitionPhaseRequirements = { outgoingFrame: 'none', currentFrame: 'none' };
    const strong: SceneTransitionPhaseRequirements = { outgoingFrame: 'snapshot', currentFrame: 'texture' };

    expect(mergeSceneTransitionRequirements(weak, strong)).toEqual({ outgoingFrame: 'snapshot', currentFrame: 'texture' });
    expect(mergeSceneTransitionRequirements(strong, weak)).toEqual({ outgoingFrame: 'snapshot', currentFrame: 'texture' });
  });

  test('each axis is resolved independently (mixed strength on each axis)', () => {
    const a: SceneTransitionPhaseRequirements = { outgoingFrame: 'snapshot', currentFrame: 'none' };
    const b: SceneTransitionPhaseRequirements = { outgoingFrame: 'none', currentFrame: 'texture' };

    expect(mergeSceneTransitionRequirements(a, b)).toEqual({ outgoingFrame: 'snapshot', currentFrame: 'texture' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/phased-scene-transition.test.ts`
Expected: FAIL — `#core/PhasedSceneTransition` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/core/PhasedSceneTransition.ts (new file — full contents so far; more is added in later tasks)
import type { SceneTransitionRequirements } from './SceneTransition';

/**
 * Per-phase render-resource requirements for one phase (`enter` or `exit`)
 * of a {@link PhasedSceneTransition}. Same shape as {@link SceneTransitionRequirements}
 * — kept as a distinct type because a phase declares its *own* requirements,
 * which the Director then merges with the other phase's via
 * {@link mergeSceneTransitionRequirements} to produce the session-wide
 * {@link SceneTransitionRequirements} (spec §3.9.1).
 */
export interface SceneTransitionPhaseRequirements {
  readonly outgoingFrame: 'none' | 'snapshot';
  readonly currentFrame: 'none' | 'direct' | 'texture';
}

const outgoingFrameRank = { none: 0, snapshot: 1 } as const;
const currentFrameRank = { none: 0, direct: 1, texture: 2 } as const;

/**
 * Join two phases' {@link SceneTransitionPhaseRequirements} into one
 * session-wide {@link SceneTransitionRequirements} — the stronger
 * requirement wins on each axis independently (spec §3.9.1). This is the
 * entire "direct → texture identity-composite promotion" rule: once this
 * merge picks `texture`, the existing per-frame live-surface-to-texture
 * render (spec §3.4) already populates `frame.current` for *any*
 * `texture`-requesting session — a promoted phase that itself only
 * declared `direct` never needs to know it was promoted.
 */
export function mergeSceneTransitionRequirements(
  a: SceneTransitionPhaseRequirements,
  b: SceneTransitionPhaseRequirements,
): SceneTransitionRequirements {
  return {
    outgoingFrame: outgoingFrameRank[a.outgoingFrame] >= outgoingFrameRank[b.outgoingFrame] ? a.outgoingFrame : b.outgoingFrame,
    currentFrame: currentFrameRank[a.currentFrame] >= currentFrameRank[b.currentFrame] ? a.currentFrame : b.currentFrame,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/phased-scene-transition.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean (verify the assumed `./SceneTransition` import path resolves — see the "Dependency note" above; if Slice 5 named the file differently, fix the import here and note the correction in the commit message).

- [ ] **Step 6: Commit**

```bash
git add src/core/PhasedSceneTransition.ts test/core/phased-scene-transition.test.ts
git commit -m "feat(core): requirements-lattice merge for PhasedSceneTransition (spec §3.9.1)"
```

---

## Task 2: `PhasedSceneTransition` base class shell — public constructor, public `getRequirementsForPhase()`

**Files:**
- Modify: `src/core/PhasedSceneTransition.ts`
- Test: `test/core/phased-scene-transition.test.ts`

**Interfaces:**
- Consumes: `mergeSceneTransitionRequirements()`/`SceneTransitionPhaseRequirements` (Task 1); `SceneTransition`, `SceneTransitionContext`, `SceneTransitionRequirements` (Slice 5, `./SceneTransition`); `EasingFunction`, `Easing` (`#animation/types`, `#animation/Easing`).
- Produces: `PhasedSceneTransitionOptions` interface, `PhasedSceneTransition` abstract class with `duration`/`easing`/`placement` public readonly fields, a **public** constructor, `getRequirementsForPhase(phase, context): SceneTransitionPhaseRequirements` (public wrapper), `protected abstract getPhaseRequirements(...)`, `public override getRequirements(context): SceneTransitionRequirements`. Consumed by Task 3 (session driving), Task 4 (composition), and Slice 7 (built-in transitions).

This task deliberately does **not** yet implement `createSession()` (Task 3) — `PhasedSceneTransition` stays abstract with no concrete `createSession()` override for now, so the tests here only exercise the constructor and `getRequirementsForPhase()`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/core/phased-scene-transition.test.ts — add below the existing describe block
import { PhasedSceneTransition, type PhasedSceneTransitionOptions } from '#core/PhasedSceneTransition';
import { Easing } from '#animation/Easing';
import type { SceneTransitionContext } from '#core/SceneTransition';

const fakeContext: SceneTransitionContext = { operation: 'change', hasOutgoingScene: true, hasIncomingScene: true };

// A minimal concrete subclass declaring NO constructor of its own — the
// exact shape a real FlashTransition-style author would write. If
// PhasedSceneTransition's constructor were `protected`, this class would
// inherit that modifier and `new MinimalPhase()` below would fail to
// compile (verified separately in Task 2's typecheck step; the point of
// this test is that it runs and passes at all, proving construction
// succeeded from outside the module).
class MinimalPhase extends PhasedSceneTransition {
  protected getPhaseRequirements(): { outgoingFrame: 'none' | 'snapshot'; currentFrame: 'none' | 'direct' | 'texture' } {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }
}

describe('PhasedSceneTransition', () => {
  test('a concrete subclass with no constructor of its own is directly instantiable (public constructor)', () => {
    const instance = new MinimalPhase();

    expect(instance).toBeInstanceOf(PhasedSceneTransition);
  });

  test('constructor options default duration=220, easing=Easing.linear, placement="screen"', () => {
    const instance = new MinimalPhase();

    expect(instance.duration).toBe(220);
    expect(instance.easing).toBe(Easing.linear);
    expect(instance.placement).toBe('screen');
  });

  test('constructor options override the defaults', () => {
    const options: PhasedSceneTransitionOptions = { duration: 500, easing: Easing.quadIn, placement: 'scene' };
    const instance = new MinimalPhase(options);

    expect(instance.duration).toBe(500);
    expect(instance.easing).toBe(Easing.quadIn);
    expect(instance.placement).toBe('scene');
  });

  test('getRequirementsForPhase() is callable from outside the class hierarchy and forwards to the phase hook', () => {
    const instance = new MinimalPhase();

    // directorLikeCaller does not extend PhasedSceneTransition — this call
    // only compiles/works because getRequirementsForPhase() is public.
    const directorLikeCaller = (phase: PhasedSceneTransition): unknown => phase.getRequirementsForPhase('exit', fakeContext);

    expect(directorLikeCaller(instance)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
  });

  test('getRequirements() merges the instance\'s own exit/enter requirements (no promotion when they match)', () => {
    const instance = new MinimalPhase();

    expect(instance.getRequirements(fakeContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/phased-scene-transition.test.ts`
Expected: FAIL — `PhasedSceneTransition` is not exported.

- [ ] **Step 3: Implement**

```ts
// src/core/PhasedSceneTransition.ts — add above mergeSceneTransitionRequirements (imports) and below it (the class)
import { Easing } from '#animation/Easing';
import type { EasingFunction } from '#animation/types';

import { SceneTransition, type SceneTransitionContext, type SceneTransitionRequirements } from './SceneTransition';

/** Construction options for {@link PhasedSceneTransition} and its subclasses. */
export interface PhasedSceneTransitionOptions {
  /** Duration of *each* phase (enter and exit run this long independently), in milliseconds. Default `220`. */
  readonly duration?: number;
  /** Applied to both phases' `progress` to produce `easedProgress`. Default {@link Easing.linear}. */
  readonly easing?: EasingFunction;
  /** Which render layer this transition's output composites against (spec §3.6). Default `'screen'`. */
  readonly placement?: 'scene' | 'screen';
}

/**
 * Single-class `enter()`/`exit()` authoring layer over the full
 * {@link SceneTransition} contract (spec §3.9) — covers the common case
 * (fade, slide, wipe, a custom flash) with no need to hand-manage timing,
 * easing, or session lifecycle. Subclasses implement
 * {@link PhasedSceneTransition.getPhaseRequirements} and override
 * {@link PhasedSceneTransition.enter}/{@link PhasedSceneTransition.exit} —
 * `createSession()` is implemented once, here, and never needs overriding
 * for this common case.
 * @stable
 */
export abstract class PhasedSceneTransition extends SceneTransition {
  public readonly duration: number;
  public readonly easing: EasingFunction;
  public readonly placement: 'scene' | 'screen';

  /**
   * Public — an abstract class with a `protected` constructor is still not
   * directly instantiable (that's what `abstract` already does), but a
   * *protected* constructor is inherited: a concrete subclass that declares
   * no constructor of its own (the common case — e.g. a `FlashTransition`
   * with only `enter()`/`exit()`) would inherit it and become
   * uninstantiable from outside the module. Public keeps every minimal
   * subclass usable with zero boilerplate.
   */
  public constructor(options: PhasedSceneTransitionOptions = {}) {
    super();
    this.duration = options.duration ?? 220;
    this.easing = options.easing ?? Easing.linear;
    this.placement = options.placement ?? 'screen';
  }

  /**
   * Director entry point — mirrors {@link SceneTransition.beginSession}/
   * `createSession()` (spec §3.1a): the Director (and, for `{ enter, exit }`
   * composition, a sibling `PhasedSceneTransition` instance's own session
   * driver) calls this directly on a phase instance it doesn't own the
   * hierarchy of, which the `protected` {@link PhasedSceneTransition.getPhaseRequirements}
   * authoring hook cannot support on its own. Authors implement
   * `getPhaseRequirements()`; nothing else calls it directly.
   */
  public getRequirementsForPhase(phase: 'enter' | 'exit', context: SceneTransitionContext): SceneTransitionPhaseRequirements {
    return this.getPhaseRequirements(phase, context);
  }

  /** Declare this phase's render-resource requirements. See {@link SceneTransitionPhaseRequirements}. */
  protected abstract getPhaseRequirements(phase: 'enter' | 'exit', context: SceneTransitionContext): SceneTransitionPhaseRequirements;

  /** Draw one frame of the `enter` phase. No-op by default — override for a visible enter effect. */
  protected enter(_context: SceneTransitionPhaseContext): void {}

  /** Draw one frame of the `exit` phase. No-op by default — override for a visible exit effect. */
  protected exit(_context: SceneTransitionPhaseContext): void {}

  public override getRequirements(context: SceneTransitionContext): SceneTransitionRequirements {
    return mergeSceneTransitionRequirements(this.getRequirementsForPhase('exit', context), this.getRequirementsForPhase('enter', context));
  }
}
```

Note: this step references `SceneTransitionPhaseContext` in `enter()`/`exit()`'s signature, which is defined in Task 3 — add a forward-declared placeholder import/type stub for this step only if `pnpm typecheck` complains before Task 3 lands; in practice, write Task 2 and Task 3's code together in the same file edit (both tasks touch the same file, this is expected) and run `pnpm typecheck` only after both are in place. If executing tasks strictly one at a time, temporarily type `enter`/`exit`'s parameter as `never` in this step and correct it in Task 3 — call this out explicitly if you take that route.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/phased-scene-transition.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck — the load-bearing check for the public-constructor and public-wrapper requirements**

Run: `pnpm typecheck`
Expected: clean. This is the check that actually enforces "public constructor" and "public `getRequirementsForPhase()`" — Vitest's esbuild transform does not verify TypeScript access modifiers, so Step 4 passing is not proof either requirement holds; only this step is.

**Empirically confirm the counter-case would fail**, so there's no doubt what this check is protecting against — temporarily change the constructor to `protected constructor(...)`, run `pnpm typecheck` again, and confirm it now reports `TS2674` (or equivalent) on `new MinimalPhase()` inside the test file. Then revert the constructor back to `public` and re-run `pnpm typecheck` to confirm it's clean again before moving on.

- [ ] **Step 6: Commit**

```bash
git add src/core/PhasedSceneTransition.ts test/core/phased-scene-transition.test.ts
git commit -m "feat(core): PhasedSceneTransition base class — public constructor, getRequirementsForPhase() wrapper"
```

---

## Task 3: `SceneTransitionPhaseContext` (`progress`/`easedProgress`/`presence`) + `runPhase()` + single-instance session driving

**Files:**
- Modify: `src/core/PhasedSceneTransition.ts`
- Test: `test/core/phased-scene-transition.test.ts`

**Interfaces:**
- Consumes: `PhasedSceneTransition` (Task 2); `SceneTransitionSession`, `SceneTransitionEnvironment`, `SceneTransitionFrame` (Slice 5, `./SceneTransition`); `RenderingContext` (`#rendering/RenderingContext`); `Time` (`./Time`).
- Produces: `SceneTransitionPhaseContext` interface, `PhasedSceneTransition.runPhase(phase, context): void` (public wrapper around `enter()`/`exit()`), `PhasedSceneTransitionSession` class (implements `SceneTransitionSession`), `PhasedSceneTransition`'s concrete `protected createSession()` override. Consumed by Task 4 (`composePhasedSceneTransition` reuses `PhasedSceneTransitionSession` directly for the two-different-instance case).

**Why `runPhase()` is needed (a second instance of the same access-modifier bug class the spec calls out for `getRequirementsForPhase()`):** `enter()`/`exit()` are `protected`. `PhasedSceneTransitionSession` — the class that actually drives a session frame-by-frame — is *not* a subclass of `PhasedSceneTransition` (it's a session, not a transition), so it cannot call `somePhaseInstance.exit(context)` directly, for exactly the same reason `SceneDirector` cannot call `getPhaseRequirements()` directly. This was verified empirically before writing this plan:

```ts
// scratch check — a class outside the PhasedSceneTransition hierarchy
class SessionDriver {
  driveExit(phase: PhasedSceneTransitionLike) {
    phase.exit();               // TS2445: Property 'exit' is protected and only
                                 // accessible within class '...' and its subclasses.
    phase.getRequirementsForPhase('exit', ctx); // OK — public wrapper.
  }
}
```
`tsc --noEmit --strict` on this exact shape reproduced `TS2445` on the direct `.exit()` call and reported no error on the wrapper call — confirming the fix is the same wrapper pattern, applied to `enter`/`exit` too.

- [ ] **Step 1: Write the failing tests**

```ts
// test/core/phased-scene-transition.test.ts — add imports and a new describe block
import type { SceneTransitionEnvironment, SceneTransitionFrame } from '#core/SceneTransition';
import { Time } from '#core/Time';

class TestEnvironment implements SceneTransitionEnvironment {
  public readonly context = fakeContext;
  public commitCalls = 0;
  private _committed = false;
  private _commitRequested = false;

  public get commitRequested(): boolean {
    return this._commitRequested;
  }

  public get committed(): boolean {
    return this._committed;
  }

  public commit(): void {
    this._commitRequested = true;
    this.commitCalls++;
    this._committed = true; // this fake settles synchronously; the session must still wait one extra update() tick — see below
  }
}

const fakeFrame: SceneTransitionFrame = { outgoing: null, current: null, committed: false };
const fakeRenderingContext = {} as never; // opaque to PhasedSceneTransitionSession/RecordingPhase — never dereferenced in these tests

interface RecordedCall {
  readonly phase: 'enter' | 'exit';
  readonly progress: number;
  readonly easedProgress: number;
  readonly presence: number;
}

class RecordingPhase extends PhasedSceneTransition {
  public readonly calls: RecordedCall[] = [];

  protected getPhaseRequirements(): { outgoingFrame: 'none' | 'snapshot'; currentFrame: 'none' | 'direct' | 'texture' } {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }

  protected override enter(context: SceneTransitionPhaseContext): void {
    this.calls.push({ phase: 'enter', progress: context.progress, easedProgress: context.easedProgress, presence: context.presence });
  }

  protected override exit(context: SceneTransitionPhaseContext): void {
    this.calls.push({ phase: 'exit', progress: context.progress, easedProgress: context.easedProgress, presence: context.presence });
  }
}

describe('PhasedSceneTransition — single-instance session driving', () => {
  test('runPhase() is callable from outside the class hierarchy and forwards to enter()/exit()', () => {
    const instance = new RecordingPhase({ duration: 10 });
    const context: SceneTransitionPhaseContext = { phase: 'exit', progress: 1, easedProgress: 1, presence: 0, frame: fakeFrame, rendering: fakeRenderingContext };

    // sessionLikeCaller does not extend PhasedSceneTransition.
    const sessionLikeCaller = (phase: PhasedSceneTransition): void => phase.runPhase('exit', context);
    sessionLikeCaller(instance);

    expect(instance.calls).toEqual([{ phase: 'exit', progress: 1, easedProgress: 1, presence: 0 }]);
  });

  test('drives exit (0→1) → requests commit() exactly once → holds → drives enter (0→1) → done, with correct presence', () => {
    const phase = new RecordingPhase({ duration: 100 });
    const environment = new TestEnvironment();
    const session = phase.beginSession(environment);

    expect(session.done).toBe(false);

    session.update(new Time(50));
    session.render(fakeRenderingContext, fakeFrame);
    expect(environment.commitCalls).toBe(0);
    expect(phase.calls.at(-1)).toMatchObject({ phase: 'exit', progress: 0.5, presence: 0.5 });

    session.update(new Time(60)); // elapsed clamps to 100 — exit phase finishes, commit() requested
    expect(environment.commitCalls).toBe(1);
    session.render(fakeRenderingContext, fakeFrame); // still holding at the exit end-state
    expect(phase.calls.at(-1)).toMatchObject({ phase: 'exit', progress: 1, presence: 0 });
    expect(session.done).toBe(false);

    // environment.committed flipped true synchronously inside this fake's commit() call, but the
    // session only observes it on the *next* update() — matching spec §3.5.2 (the switch is never
    // processed reentrantly from inside the callback that requested it).
    session.update(new Time(0));
    session.render(fakeRenderingContext, fakeFrame);
    expect(phase.calls.at(-1)).toMatchObject({ phase: 'enter', progress: 0, presence: 0 });

    session.update(new Time(100));
    expect(session.done).toBe(true);
    session.render(fakeRenderingContext, fakeFrame);
    expect(phase.calls.at(-1)).toMatchObject({ phase: 'enter', progress: 1, presence: 1 });

    expect(environment.commitCalls).toBe(1); // never called a second time
  });

  test('session.placement reflects the instance\'s own placement throughout (single-instance case)', () => {
    const phase = new RecordingPhase({ duration: 10, placement: 'scene' });
    const session = phase.beginSession(new TestEnvironment());

    expect(session.placement).toBe('scene');
    session.update(new Time(10));
    expect(session.placement).toBe('scene');
  });

  test('a zero-duration phase completes its half immediately on the first update() past commit', () => {
    const phase = new RecordingPhase({ duration: 0 });
    const environment = new TestEnvironment();
    const session = phase.beginSession(environment);

    session.update(new Time(0)); // exit duration 0 — finishes immediately, requests commit
    expect(environment.commitCalls).toBe(1);

    session.update(new Time(0)); // observes committed, switches to enter, which also finishes immediately
    expect(session.done).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/phased-scene-transition.test.ts`
Expected: FAIL — `runPhase` is not a method, `beginSession()` throws (no concrete `createSession()` yet).

- [ ] **Step 3: Implement**

```ts
// src/core/PhasedSceneTransition.ts — add these imports
import type { RenderingContext } from '#rendering/RenderingContext';

import type { SceneTransitionEnvironment, SceneTransitionFrame, SceneTransitionSession } from './SceneTransition';
import type { Time } from './Time';
```

Add `SceneTransitionPhaseContext` (near `SceneTransitionPhaseRequirements`):

```ts
/**
 * Per-frame context handed to {@link PhasedSceneTransition.enter}/
 * {@link PhasedSceneTransition.exit}. Spec §3.9.
 */
export interface SceneTransitionPhaseContext {
  readonly phase: 'enter' | 'exit';
  /** Chronological progress of this phase. Always 0 → 1, regardless of phase. */
  readonly progress: number;
  /** `progress` after this transition's `easing` function. Always 0 → 1. */
  readonly easedProgress: number;
  /**
   * Visual presence of the affected scene — `enter`: 0 → 1 (offscreen →
   * onscreen); `exit`: 1 → 0 (onscreen → offscreen). Lets both phases share
   * one formula (e.g. `lerp(offscreenX, 0, presence)`) without either
   * inverting anything itself.
   */
  readonly presence: number;
  readonly frame: SceneTransitionFrame;
  readonly rendering: RenderingContext;
}
```

Add `runPhase()` to `PhasedSceneTransition`, directly below `getRequirementsForPhase()`:

```ts
  /**
   * Session-driver entry point for rendering one frame of `phase` —
   * mirrors {@link PhasedSceneTransition.getRequirementsForPhase} exactly:
   * {@link PhasedSceneTransitionSession} (and, for `{ enter, exit }`
   * composition, a *different* `PhasedSceneTransition` instance's session)
   * is not a subclass of this class and cannot call the `protected`
   * {@link PhasedSceneTransition.enter}/{@link PhasedSceneTransition.exit}
   * hooks directly. Authors override `enter()`/`exit()`; nothing else calls
   * them directly.
   */
  public runPhase(phase: 'enter' | 'exit', context: SceneTransitionPhaseContext): void {
    if (phase === 'enter') {
      this.enter(context);
    } else {
      this.exit(context);
    }
  }
```

Add the concrete `createSession()` override, directly below `getRequirements()`:

```ts
  protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    return new PhasedSceneTransitionSession(this, this, environment);
  }
```

Add `PhasedSceneTransitionSession` at the bottom of the file (after the class):

```ts
type PhasedTransitionPhaseState = 'exit' | 'holding' | 'enter' | 'done';

/**
 * Drives one {@link SceneTransitionSession} for a `{ enter, exit }` pair —
 * `exitPhase` and `enterPhase` may be the *same* instance (the common,
 * single-`PhasedSceneTransition` case — spec §3.9) or two independently
 * authored instances (composition — spec §3.9.1, {@link composePhasedSceneTransition}).
 * Exit runs 0→1, then `environment.commit()` is requested exactly once and
 * the session holds at the exit end-state until `environment.committed`
 * is observed true on a later `update()` call (never reentrantly within
 * the same call that requested it — spec §3.5.2), then enter runs 0→1 to
 * `done`.
 * @internal
 */
export class PhasedSceneTransitionSession implements SceneTransitionSession {
  private _phaseState: PhasedTransitionPhaseState = 'exit';
  private _elapsedMs = 0;

  public constructor(
    private readonly _exitPhase: PhasedSceneTransition,
    private readonly _enterPhase: PhasedSceneTransition,
    private readonly _environment: SceneTransitionEnvironment,
  ) {}

  public get done(): boolean {
    return this._phaseState === 'done';
  }

  public get placement(): 'scene' | 'screen' {
    return this._phaseState === 'enter' ? this._enterPhase.placement : this._exitPhase.placement;
  }

  public update(delta: Time): void {
    if (this._phaseState === 'done') {
      return;
    }

    if (this._phaseState === 'holding') {
      if (this._environment.committed) {
        this._phaseState = 'enter';
        this._elapsedMs = 0;
      }

      return;
    }

    const activePhase = this._phaseState === 'exit' ? this._exitPhase : this._enterPhase;

    this._elapsedMs = Math.min(activePhase.duration, this._elapsedMs + Math.max(0, delta.milliseconds));

    if (this._elapsedMs >= activePhase.duration) {
      if (this._phaseState === 'exit') {
        if (!this._environment.commitRequested) {
          this._environment.commit();
        }

        this._phaseState = 'holding';
      } else {
        this._phaseState = 'done';
      }
    }
  }

  public render(context: RenderingContext, frame: SceneTransitionFrame): void {
    if (this._phaseState === 'done') {
      return;
    }

    const phase: 'enter' | 'exit' = this._phaseState === 'enter' ? 'enter' : 'exit';
    const activePhase = phase === 'enter' ? this._enterPhase : this._exitPhase;
    const progress = activePhase.duration === 0 ? 1 : Math.min(1, this._elapsedMs / activePhase.duration);
    const easedProgress = activePhase.easing(progress);
    const presence = phase === 'enter' ? easedProgress : 1 - easedProgress;

    activePhase.runPhase(phase, { phase, progress, easedProgress, presence, frame, rendering: context });
  }

  public destroy(): void {
    // No resources of its own — pooled textures/input gate are Director-owned (spec §3.4/§3.7b).
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/phased-scene-transition.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean. As in Task 2, temporarily mark `enter`/`exit` `public` instead of `protected`, confirm `pnpm typecheck` still passes (it will — this doesn't catch an *overly* permissive modifier, only an overly restrictive one), then temporarily change `runPhase()` to call a *non-existent* wrapper (delete `runPhase()` entirely and have the test's `sessionLikeCaller` call `phase.exit(context)` directly) and confirm `pnpm typecheck` now fails with the protected-access error — then restore the real implementation and confirm clean again.

- [ ] **Step 6: Commit**

```bash
git add src/core/PhasedSceneTransition.ts test/core/phased-scene-transition.test.ts
git commit -m "feat(core): PhasedSceneTransition session driving — runPhase() wrapper, progress/easedProgress/presence"
```

---

## Task 4: `composePhasedSceneTransition()` — two-different-instance composition + `NoOpPhasedSceneTransition`

**Files:**
- Modify: `src/core/PhasedSceneTransition.ts`
- Test: `test/core/phased-scene-transition.test.ts`

**Interfaces:**
- Consumes: `PhasedSceneTransition`, `PhasedSceneTransitionSession`, `mergeSceneTransitionRequirements` (Tasks 1–3); `SceneTransition`, `SceneTransitionContext`, `SceneTransitionEnvironment`, `SceneTransitionRequirements`, `SceneTransitionSession` (Slice 5).
- Produces: `composePhasedSceneTransition(exit, enter): SceneTransition`, `resolvePhasedSelection(exit, enter): SceneTransition` (takes `PhasedSceneTransition | undefined` for either side — deliberately decoupled from `SceneTransitionPhases`, defined in Task 5, so this task has no forward dependency on it). Consumed by Task 7 (`resolveSceneTransitionSelection`).

Per spec §3.9.1: "the Director — not either instance — resolves the session's actual `SceneTransitionRequirements`" by calling the public `getRequirementsForPhase()` on each instance and merging. `composePhasedSceneTransition` packages that (plus the session-driving reuse of `PhasedSceneTransitionSession` from Task 3) into one `SceneTransition` instance so the Director's call site stays a single `beginSession()` call regardless of whether it's driving a single `PhasedSceneTransition` or a composed pair — matching §3.3's "no special-casing at the call site" shape.

`NoOpPhasedSceneTransition` fills the missing side when `SceneTransitionPhases` supplies only one of `{ enter, exit }` (the union in Task 5 requires at least one, not both) — there is no pre-existing "do nothing" `PhasedSceneTransition` instance to fall back to (the class is abstract), so this task adds a minimal concrete one: requirements `{ outgoingFrame: 'none', currentFrame: 'none' }` (the weakest possible on both axes, so it never forces promotion), `enter()`/`exit()` left as the inherited no-ops.

- [ ] **Step 1: Write the failing tests**

```ts
// test/core/phased-scene-transition.test.ts — add imports and a new describe block
import { composePhasedSceneTransition, resolvePhasedSelection } from '#core/PhasedSceneTransition';

class DirectPhase extends RecordingPhase {
  protected override getPhaseRequirements(): { outgoingFrame: 'none' | 'snapshot'; currentFrame: 'none' | 'direct' | 'texture' } {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }
}

class TexturePhase extends RecordingPhase {
  protected override getPhaseRequirements(): { outgoingFrame: 'none' | 'snapshot'; currentFrame: 'none' | 'direct' | 'texture' } {
    return { outgoingFrame: 'snapshot', currentFrame: 'texture' };
  }
}

describe('composePhasedSceneTransition', () => {
  test('merges the two instances\' own requirements via getRequirementsForPhase (§3.9.1)', () => {
    const exitPhase = new DirectPhase({ duration: 10 });
    const enterPhase = new TexturePhase({ duration: 10 });
    const composed = composePhasedSceneTransition(exitPhase, enterPhase);

    expect(composed.getRequirements(fakeContext)).toEqual({ outgoingFrame: 'snapshot', currentFrame: 'texture' });
  });

  test('drives exit from the exit instance and enter from the enter instance — never crossed', () => {
    const exitPhase = new RecordingPhase({ duration: 10 });
    const enterPhase = new RecordingPhase({ duration: 10 });
    const environment = new TestEnvironment();
    const composed = composePhasedSceneTransition(exitPhase, enterPhase);
    const session = composed.beginSession(environment);

    session.update(new Time(10));
    session.render(fakeRenderingContext, fakeFrame);
    session.update(new Time(0)); // observes committed
    session.render(fakeRenderingContext, fakeFrame);
    session.update(new Time(10));
    session.render(fakeRenderingContext, fakeFrame);

    expect(session.done).toBe(true);
    expect(exitPhase.calls.every(call => call.phase === 'exit')).toBe(true);
    expect(exitPhase.calls.length).toBeGreaterThan(0);
    expect(enterPhase.calls.every(call => call.phase === 'enter')).toBe(true);
    expect(enterPhase.calls.length).toBeGreaterThan(0);
  });

  test('session.placement switches from the exit instance\'s to the enter instance\'s at the commit boundary', () => {
    const exitPhase = new RecordingPhase({ duration: 10, placement: 'screen' });
    const enterPhase = new RecordingPhase({ duration: 10, placement: 'scene' });
    const composed = composePhasedSceneTransition(exitPhase, enterPhase);
    const session = composed.beginSession(new TestEnvironment());

    expect(session.placement).toBe('screen');
    session.update(new Time(10)); // exit finishes, commit requested — still holding, still exit's placement
    expect(session.placement).toBe('screen');
    session.update(new Time(0)); // switches to enter
    expect(session.placement).toBe('scene');
  });
});

describe('resolvePhasedSelection', () => {
  test('falls back to a no-op phase for whichever side is omitted, without forcing texture/snapshot', () => {
    const exitPhase = new TexturePhase({ duration: 10 });
    const resolved = resolvePhasedSelection(exitPhase, undefined);

    // TexturePhase alone requests snapshot/texture; the no-op fallback requests
    // none/none on both axes, so it never wins the merge — the composed result
    // is exactly TexturePhase's own requirements.
    expect(resolved.getRequirements(fakeContext)).toEqual({ outgoingFrame: 'snapshot', currentFrame: 'texture' });
  });

  test('a fully-omitted pair resolves to a fully no-op transition', () => {
    const resolved = resolvePhasedSelection(undefined, undefined);

    expect(resolved.getRequirements(fakeContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'none' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/phased-scene-transition.test.ts`
Expected: FAIL — `composePhasedSceneTransition`/`resolvePhasedSelection` are not exported.

- [ ] **Step 3: Implement**

```ts
// src/core/PhasedSceneTransition.ts — add at the bottom of the file, after PhasedSceneTransitionSession

/**
 * Compose two independently-authored {@link PhasedSceneTransition}
 * instances into one {@link SceneTransition}: `exit`'s `exit()` phase runs
 * first, then `enter`'s `enter()` phase, sharing one session and one
 * atomic commit (spec §3.9.2 contrasts this with Excalibur's independently-
 * animated `in`/`out` entities — this is *not* that). Session-wide
 * requirements are resolved by the Director-facing `getRequirementsForPhase()`
 * wrapper on each instance, then merged (spec §3.9.1) — never via the
 * `protected` `getPhaseRequirements()` hook directly.
 */
export function composePhasedSceneTransition(exit: PhasedSceneTransition, enter: PhasedSceneTransition): SceneTransition {
  return new ComposedPhasedSceneTransition(exit, enter);
}

class ComposedPhasedSceneTransition extends SceneTransition {
  public constructor(
    private readonly _exitPhase: PhasedSceneTransition,
    private readonly _enterPhase: PhasedSceneTransition,
  ) {
    super();
  }

  public getRequirements(context: SceneTransitionContext): SceneTransitionRequirements {
    return mergeSceneTransitionRequirements(
      this._exitPhase.getRequirementsForPhase('exit', context),
      this._enterPhase.getRequirementsForPhase('enter', context),
    );
  }

  protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    return new PhasedSceneTransitionSession(this._exitPhase, this._enterPhase, environment);
  }
}

/**
 * Concrete, fully-inert {@link PhasedSceneTransition} — requirements
 * `{ outgoingFrame: 'none', currentFrame: 'none' }` (the weakest possible
 * on both axes, so it never wins {@link mergeSceneTransitionRequirements}),
 * `enter()`/`exit()` left as the inherited no-ops. Fills whichever side of
 * a `{ enter, exit }` selection (spec §3.10) is omitted — the union type
 * requires at least one of `{ enter, exit }`, never both, so the other
 * side needs a real (if inert) instance to compose against.
 */
class NoOpPhasedSceneTransition extends PhasedSceneTransition {
  protected getPhaseRequirements(): SceneTransitionPhaseRequirements {
    return { outgoingFrame: 'none', currentFrame: 'none' };
  }
}

const noOpPhasedSceneTransition = new NoOpPhasedSceneTransition({ duration: 0 });

/**
 * Resolve an optional `{ enter, exit }` pair (either side may be omitted —
 * see {@link NoOpPhasedSceneTransition}) into one composed
 * {@link SceneTransition}, ready to hand to {@link SceneTransition.beginSession}.
 */
export function resolvePhasedSelection(exit: PhasedSceneTransition | undefined, enter: PhasedSceneTransition | undefined): SceneTransition {
  return composePhasedSceneTransition(exit ?? noOpPhasedSceneTransition, enter ?? noOpPhasedSceneTransition);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/phased-scene-transition.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/PhasedSceneTransition.ts test/core/phased-scene-transition.test.ts
git commit -m "feat(core): composePhasedSceneTransition() + NoOpPhasedSceneTransition (spec §3.9.1)"
```

---

## Task 5: `SceneTransitionPhases` (union) + `SceneTransitionSelection`

**Files:**
- Modify: `src/core/SceneTypes.ts`
- Test: `test/type-tests/scene-transition-phases.type-test.ts` (new)

**Interfaces:**
- Consumes: `PhasedSceneTransition` (Task 2, `./PhasedSceneTransition`); `SceneTransition` (Slice 5, `./SceneTransition`).
- Produces: `SceneTransitionPhases`, `SceneTransitionSelection`. Consumed by Task 6 (registry descriptor), Task 7 (`resolveSceneTransitionSelection`), and Slice 3/4's navigation option types (already-shipped by the time this task runs, per this plan's dependency assumption — this task only adds the types, Task 8 wires them into `SceneDirector`).

- [ ] **Step 1: Write the failing type-test**

```ts
// test/type-tests/scene-transition-phases.type-test.ts (new file)
import type { PhasedSceneTransition } from '#core/PhasedSceneTransition';
import type { SceneTransition } from '#core/SceneTransition';
import type { SceneTransitionPhases, SceneTransitionSelection } from '#core/SceneTypes';

declare const enterPhase: PhasedSceneTransition;
declare const exitPhase: PhasedSceneTransition;
declare const transitionInstance: SceneTransition;

// SceneTransitionPhases requires at least one of { enter, exit } — a union
// of two variants, not an interface with both fields optional (confirmed,
// TypeScript --strict: the interface form types `{}` as valid, which would
// silently suppress a scene's registry default while looking like a no-op).
const _enterOnly: SceneTransitionPhases = { enter: enterPhase };
const _exitOnly: SceneTransitionPhases = { exit: exitPhase };
const _both: SceneTransitionPhases = { enter: enterPhase, exit: exitPhase };
// @ts-expect-error — neither field present must be rejected
const _neither: SceneTransitionPhases = {};

// SceneTransitionSelection: SceneTransition | SceneTransitionPhases | false
const _selectionTransition: SceneTransitionSelection = transitionInstance;
const _selectionPhasedInstance: SceneTransitionSelection = enterPhase; // a PhasedSceneTransition IS a SceneTransition
const _selectionPhases: SceneTransitionSelection = { enter: enterPhase };
const _selectionFalse: SceneTransitionSelection = false;
// @ts-expect-error — {} is not a valid SceneTransitionSelection either (same empty-phases rejection)
const _selectionEmpty: SceneTransitionSelection = {};

export {};
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm typecheck:type-tests`
Expected: FAIL — `SceneTransitionPhases`/`SceneTransitionSelection` are not exported from `#core/SceneTypes`.

- [ ] **Step 3: Implement**

```ts
// src/core/SceneTypes.ts — add near the top, after the existing SceneTransition-related types
import type { PhasedSceneTransition } from './PhasedSceneTransition';
import type { SceneTransition } from './SceneTransition';

/**
 * A `{ enter, exit }` pair of independently-authored {@link PhasedSceneTransition}
 * instances (spec §3.9.1/§3.10) — a union of two variants requiring at
 * least one of `{ enter, exit }`, never an interface with both fields
 * optional. An interface form would type-check `transition: {}` as valid,
 * which — since a call-site value fully replaces the registry default
 * (§3.10 rule 1) — would silently suppress a scene's configured default
 * while looking like a no-op. Confirmed, TypeScript `--strict`: the union
 * form correctly rejects `{}` (see `test/type-tests/scene-transition-phases.type-test.ts`).
 */
export type SceneTransitionPhases =
  | { readonly enter: PhasedSceneTransition; readonly exit?: PhasedSceneTransition }
  | { readonly enter?: PhasedSceneTransition; readonly exit: PhasedSceneTransition };

/**
 * The full set of values accepted for a `transition` option — call-site
 * (`change()`/`restore()`/`unload()`) or registry-level default (§3.10):
 * a single {@link SceneTransition} (or {@link PhasedSceneTransition}, which
 * is one), a `{ enter, exit }` pair to compose, or `false` (the explicit
 * "no transition, even if a registry default exists" escape hatch).
 */
export type SceneTransitionSelection = SceneTransition | SceneTransitionPhases | false;
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm typecheck:type-tests`
Expected: PASS.

- [ ] **Step 5: Full typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/SceneTypes.ts test/type-tests/scene-transition-phases.type-test.ts
git commit -m "feat(core): SceneTransitionPhases union + SceneTransitionSelection (spec §3.10)"
```

---

## Task 6: Registry descriptor `transition` field — `unknown` placeholder → `SceneTransitionSelection`

**Files:**
- Modify: `src/core/SceneTypes.ts` (the `SceneRegistration<C>` type Slice 1 introduced)
- Modify: `src/core/Application.ts` (only if it references the placeholder type directly — verify via grep)

**Interfaces:**
- Consumes: `SceneTransitionSelection` (Task 5).
- Produces: `SceneRegistration<C>.transition: SceneTransitionSelection | undefined` (was `unknown`). Consumed by Task 8 (`SceneDirector` reads a target's registered default through this field).

This is the one place in this task list touching code produced by an *earlier* slice (Slice 1) rather than new code — locate it first.

- [ ] **Step 1: Locate the placeholder**

Run:
```bash
grep -n "transition" src/core/SceneTypes.ts
grep -rn "SceneRegistration\b" src/core --include="*.ts"
```
Expected: a type (named `SceneRegistration` per spec §6.1, though Slice 1 may have named it differently — check the grep output) with a field shaped like `transition?: unknown` and an inline comment noting it's a placeholder pending this slice.

- [ ] **Step 2: Replace the placeholder type**

Change (exact surrounding lines depend on Slice 1's actual output — this is the shape the spec's §6.1 code block gives, which Slice 1 is expected to have followed):

```ts
export type SceneRegistration<C extends AnySceneConstructor> =
  | C
  | { readonly scene: C; readonly transition?: unknown }; // TODO(slice 6): SceneTransitionSelection
```

to:

```ts
export type SceneRegistration<C extends AnySceneConstructor> =
  | C
  | { readonly scene: C; readonly transition?: SceneTransitionSelection };
```

Remove any `TODO`/placeholder comment left by Slice 1 alongside this field.

- [ ] **Step 3: Fix any resulting `Application.ts` references**

Run: `grep -n "SceneRegistration\|\.transition" src/core/Application.ts`

If `Application.ts` narrows or re-types the placeholder `unknown` anywhere (e.g. an `as unknown as SceneTransitionSelection` cast bridging the placeholder), remove the cast now that the real type flows through directly.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean. If a scene descriptor consumer elsewhere in the codebase was relying on `transition` being `unknown` (e.g. an `if (typeof x.transition === 'unknown')`-style guard, which wouldn't type-check anyway), fix it here.

- [ ] **Step 5: Commit**

```bash
git add src/core/SceneTypes.ts src/core/Application.ts
git commit -m "feat(core): scene registry descriptor's transition field is SceneTransitionSelection

Replaces Slice 1's unknown-typed placeholder now that SceneTransitionSelection exists."
```

---

## Task 7: `resolveSceneTransitionSelection()` — §3.10 resolution order

**Files:**
- Create: `src/core/SceneTransitionResolution.ts`
- Test: `test/core/scene-transition-resolution.test.ts` (new)

**Interfaces:**
- Consumes: `SceneTransition` (Slice 5, `./SceneTransition`); `SceneTransitionOperation` (Slice 5); `SceneTransitionSelection`, `SceneTransitionPhases` (Task 5, `./SceneTypes`); `resolvePhasedSelection` (Task 4, `./PhasedSceneTransition`).
- Produces: `resolveSceneTransitionSelection(operation, callSiteTransition, registryDefault): SceneTransition | null`. Consumed by Task 8 (`SceneDirector`).

**Resolution order, from spec §3.10** (this function implements exactly this table):
```
1. Call-site transition: SceneTransition or SceneTransitionPhases → used as-is, no merging with the registry default
2. Call-site transition: false                                    → no transition, full stop
3. Call-site transition not specified                              → the target's registry-level default (if any)
4. No call-site value and no registry default                      → no transition (§3.3 fast path)
```
**Which operations consult the registry default:** `start`/`change`/`restore` do; `unload` never does, regardless of match kind (spec §3.10). Note: `start()` delegates to `change()` internally (spec §3.7 step 5), so `SceneTransitionOperation` itself only ever needs `'change' | 'restore' | 'unload'` — there is no separate `'start'` operation value to handle here; `start()`'s registry-default consultation happens for free by virtue of calling `change()`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/core/scene-transition-resolution.test.ts (new file)
import { PhasedSceneTransition } from '#core/PhasedSceneTransition';
import { SceneTransition, type SceneTransitionEnvironment, type SceneTransitionSession } from '#core/SceneTransition';
import { resolveSceneTransitionSelection } from '#core/SceneTransitionResolution';

class FakeTransition extends SceneTransition {
  public getRequirements() {
    return { outgoingFrame: 'none' as const, currentFrame: 'direct' as const };
  }

  protected createSession(): SceneTransitionSession {
    throw new Error('not exercised in these tests');
  }
}

class FakePhase extends PhasedSceneTransition {
  protected getPhaseRequirements() {
    return { outgoingFrame: 'none' as const, currentFrame: 'direct' as const };
  }
}

describe('resolveSceneTransitionSelection', () => {
  const callSiteTransition = new FakeTransition();
  const registryDefault = new FakeTransition();

  test('rule 1: a call-site SceneTransition is used as-is, ignoring any registry default', () => {
    const resolved = resolveSceneTransitionSelection('change', callSiteTransition, registryDefault);

    expect(resolved).toBe(callSiteTransition);
  });

  test('rule 1: a call-site SceneTransitionPhases is composed, ignoring any registry default', () => {
    const enterPhase = new FakePhase();
    const resolved = resolveSceneTransitionSelection('change', { enter: enterPhase }, registryDefault);

    expect(resolved).not.toBe(registryDefault);
    expect(resolved).not.toBeNull();
  });

  test('rule 2: a call-site false means no transition, regardless of a registry default', () => {
    const resolved = resolveSceneTransitionSelection('change', false, registryDefault);

    expect(resolved).toBeNull();
  });

  test('rule 3: call-site not specified (undefined) falls back to the registry default', () => {
    const resolved = resolveSceneTransitionSelection('change', undefined, registryDefault);

    expect(resolved).toBe(registryDefault);
  });

  test('rule 3: a registry default of false means no transition', () => {
    const resolved = resolveSceneTransitionSelection('change', undefined, false);

    expect(resolved).toBeNull();
  });

  test('rule 3: a registry-level SceneTransitionPhases default is composed', () => {
    const exitPhase = new FakePhase();
    const resolved = resolveSceneTransitionSelection('change', undefined, { exit: exitPhase });

    expect(resolved).not.toBeNull();
  });

  test('rule 4: no call-site value and no registry default is the direct fast path (null)', () => {
    const resolved = resolveSceneTransitionSelection('change', undefined, undefined);

    expect(resolved).toBeNull();
  });

  test("unload never consults the registry default, even though it would otherwise apply", () => {
    const resolved = resolveSceneTransitionSelection('unload', undefined, registryDefault);

    expect(resolved).toBeNull();
  });

  test('unload still honors an explicit call-site transition', () => {
    const resolved = resolveSceneTransitionSelection('unload', callSiteTransition, registryDefault);

    expect(resolved).toBe(callSiteTransition);
  });

  test("restore consults the registry default exactly like change", () => {
    const resolved = resolveSceneTransitionSelection('restore', undefined, registryDefault);

    expect(resolved).toBe(registryDefault);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/scene-transition-resolution.test.ts`
Expected: FAIL — `#core/SceneTransitionResolution` does not exist.

- [ ] **Step 3: Implement**

```ts
// src/core/SceneTransitionResolution.ts (new file)
import { resolvePhasedSelection } from './PhasedSceneTransition';
import { SceneTransition, type SceneTransitionOperation } from './SceneTransition';
import type { SceneTransitionPhases, SceneTransitionSelection } from './SceneTypes';

function isPhasesSelection(selection: SceneTransition | SceneTransitionPhases): selection is SceneTransitionPhases {
  return !(selection instanceof SceneTransition);
}

function resolveSelectionValue(selection: SceneTransitionSelection): SceneTransition | null {
  if (selection === false) {
    return null;
  }

  if (isPhasesSelection(selection)) {
    return resolvePhasedSelection(selection.exit, selection.enter);
  }

  return selection;
}

/**
 * Resolve a navigation call's `transition` option against a target scene's
 * registry-level default, per the exact per-operation order in spec §3.10:
 *
 * 1. An explicit call-site `transition` (a {@link SceneTransition},
 *    {@link SceneTransitionPhases}, or `false`) is used as-is — never
 *    merged with the registry default on either side.
 * 2. No call-site value: `change`/`restore` (and `start`, which delegates
 *    to `change()` — spec §3.7) fall back to the target's registry
 *    default, if any. `unload` never does, regardless of match kind — an
 *    unload is a discard, not an "entering" of the target.
 * 4. No call-site value and no applicable registry default: `null` — the
 *    direct, transition-free fast path (spec §3.3).
 *
 * Returns a ready-to-use {@link SceneTransition} (composing a
 * `{ enter, exit }` selection via {@link resolvePhasedSelection} if
 * needed) or `null` for "no transition."
 */
export function resolveSceneTransitionSelection(
  operation: SceneTransitionOperation,
  callSiteTransition: SceneTransitionSelection | undefined,
  registryDefault: SceneTransitionSelection | undefined,
): SceneTransition | null {
  if (callSiteTransition !== undefined) {
    return resolveSelectionValue(callSiteTransition);
  }

  if (operation === 'unload' || registryDefault === undefined) {
    return null;
  }

  return resolveSelectionValue(registryDefault);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/scene-transition-resolution.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/SceneTransitionResolution.ts test/core/scene-transition-resolution.test.ts
git commit -m "feat(core): resolveSceneTransitionSelection() — per-operation registry-default resolution (spec §3.10)"
```

---

## Task 8: Wire registry-default resolution into `SceneDirector`

**Files:**
- Modify: `src/core/SceneDirector.ts`
- Test: `test/core/scene-director.test.ts`

**Interfaces:**
- Consumes: `resolveSceneTransitionSelection` (Task 7); the target's registered `SceneRegistration.transition` (Task 6); whatever navigation methods Slices 3/4 produced (assumed `change()`/`restore()`/`preload()`/`unload()`, `SceneTransitionOperation`-typed internally).

**This is the one task in this plan whose exact insertion point cannot be pinned down from this worktree** (Slices 1–4 haven't landed here — see the "Dependency note" at the top of this plan). The invariant to satisfy, regardless of exact surrounding code:

> Every `change()`/`restore()` call (and `start()`, by extension, since it delegates to `change()`) resolves its actual transition via `resolveSceneTransitionSelection(operation, options.transition, registeredDefaultForTarget)` — not by using `options.transition` directly — before deciding between the no-transition fast path (§3.3) and `beginSession()`. `unload()` calls `resolveSceneTransitionSelection('unload', options.transition, registeredDefaultForTarget)` too (the function itself enforces the "never consults default" rule internally — Task 7 already covers this — so `unload()`'s call site doesn't need its own special case beyond passing `'unload'` as the operation).

- [ ] **Step 1: Locate the current wiring**

Run:
```bash
grep -n "async change\|async restore\|async unload\|async preload\|options.transition\|SceneTransitionOperation" src/core/SceneDirector.ts
```
Read the full body of each matched method before editing — the exact variable names holding the resolved target constructor, the registry map, and `options.transition` will differ from any snippet this plan could give.

- [ ] **Step 2: Write the failing tests**

```ts
// test/core/scene-director.test.ts — add a new describe block
import { PhasedSceneTransition } from '#core/PhasedSceneTransition';

class RecordingPhaseForDirectorTest extends PhasedSceneTransition {
  public static beginSessionCalls = 0;

  protected getPhaseRequirements() {
    return { outgoingFrame: 'none' as const, currentFrame: 'direct' as const };
  }

  public override beginSession(...args: Parameters<PhasedSceneTransition['beginSession']>) {
    RecordingPhaseForDirectorTest.beginSessionCalls++;
    return super.beginSession(...args);
  }
}

describe('SceneDirector — registry-default transition resolution (spec §3.10)', () => {
  test('change() uses the target\'s registered default transition when no call-site transition is given', async () => {
    const registeredDefault = new RecordingPhaseForDirectorTest({ duration: 0 });
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: { scene: GameScene, transition: registeredDefault } });

    await director.change(GameScene);

    expect(RecordingPhaseForDirectorTest.beginSessionCalls).toBeGreaterThan(0);
  });

  test('an explicit call-site transition: false suppresses the registered default entirely', async () => {
    const registeredDefault = new RecordingPhaseForDirectorTest({ duration: 0 });
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: { scene: GameScene, transition: registeredDefault } });

    RecordingPhaseForDirectorTest.beginSessionCalls = 0;
    await director.change(GameScene, { transition: false });

    expect(RecordingPhaseForDirectorTest.beginSessionCalls).toBe(0);
  });

  test('unload() never consults the registered default transition', async () => {
    const registeredDefault = new RecordingPhaseForDirectorTest({ duration: 0 });
    const app = createApplicationStub();
    const GameScene = makeSceneClass();
    const director = new SceneDirector(app, { game: { scene: GameScene, transition: registeredDefault } });

    await director.change(GameScene);
    RecordingPhaseForDirectorTest.beginSessionCalls = 0;

    await director.unload(GameScene);

    expect(RecordingPhaseForDirectorTest.beginSessionCalls).toBe(0);
  });
});
```

Adapt `createApplicationStub`/`makeSceneClass`/the `SceneDirector` constructor call/`director.change`/`director.unload` signatures to whatever Slices 1–4 actually produced — these names are the plan's best expectation per the spec (§6.1, §6.3), not a guarantee; if a name differs, use the real one and note the correction in the commit message.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: FAIL — `change()`/`unload()` don't yet consult the registered default.

- [ ] **Step 4: Implement**

At each of `change()`'s, `restore()`'s, and `unload()`'s call sites where the resolved `SceneTransition | undefined` is currently taken straight from `options.transition`, insert a call to `resolveSceneTransitionSelection`:

```ts
import { resolveSceneTransitionSelection } from './SceneTransitionResolution';
```

```ts
// Wherever the method currently does something equivalent to:
//   const transition = options.transition;
// change it to:
const registeredDefault = this._registry.get(target)?.transition; // adapt to the real registry accessor
const transition = resolveSceneTransitionSelection('change', options.transition, registeredDefault); // 'restore'/'unload' in their own methods
```

The rest of each method (the no-transition-fast-path vs. `beginSession()` branch from spec §3.3) is unchanged — it already needs to handle `transition` being possibly absent; this task only changes *how* that value is computed.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/core/SceneDirector.ts test/core/scene-director.test.ts
git commit -m "feat(core): SceneDirector consults the registry-level default transition (spec §3.10)

change()/restore()/start() resolve options.transition against the target's
registered default via resolveSceneTransitionSelection(); unload() never
consults it."
```

---

## Task 9: Public exports + full-slice verification

**Files:**
- Modify: `src/core/index.ts`

**Interfaces:** none new — this task only wires the public export surface and runs the full verification gate for the slice.

- [ ] **Step 1: Add the new public exports**

```ts
// src/core/index.ts — add alongside the existing Scene*/SceneTypes exports
export { PhasedSceneTransition } from './PhasedSceneTransition';
export type { PhasedSceneTransitionOptions, SceneTransitionPhaseContext, SceneTransitionPhaseRequirements } from './PhasedSceneTransition';
```

```ts
// src/core/index.ts — extend the existing SceneTypes type-export line
export type {
  AnySceneConstructor,
  InferSceneData,
  RestoreSceneOptions,
  SceneConstructor,
  SceneTransitionPhases,
  SceneTransitionSelection,
  SetSceneArgs,
  SetSceneOptions,
} from './SceneTypes';
```

Do **not** export `PhasedSceneTransitionSession`, `composePhasedSceneTransition`, `resolvePhasedSelection`, or `resolveSceneTransitionSelection` from the package root — they're Director/internal-composition machinery, not part of the transition-authoring public surface (an author writes a `PhasedSceneTransition` subclass; they never construct a session or call the resolver directly). Mark each with `@internal` in its own JSDoc if not already done in earlier tasks.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Full slice test run**

Run: `pnpm vitest run test/core/phased-scene-transition.test.ts test/core/scene-transition-resolution.test.ts test/core/scene-director.test.ts test/core/scene-types.test.ts`
Expected: PASS.

- [ ] **Step 4: Type-tests**

Run: `pnpm typecheck:type-tests`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 6: Full core test suite (baseline regression check)**

Run: `pnpm test:core`
Expected: PASS, no new failures relative to the 318-file/5083-test/0-failure baseline recorded at the start of this slice (some file/test counts will legitimately grow from this slice's new test files).

- [ ] **Step 7: Docs**

Run: `pnpm docs:api:generate`
Expected: regenerates the API docs JSON to include the new public exports (`PhasedSceneTransition`, `PhasedSceneTransitionOptions`, `SceneTransitionPhaseContext`, `SceneTransitionPhaseRequirements`, `SceneTransitionPhases`, `SceneTransitionSelection`). Stage whatever files it touches.

- [ ] **Step 8: Commit**

```bash
git add src/core/index.ts docs/
git commit -m "feat(core): export PhasedSceneTransition + phase-composition types from #core

Completes Slice 6 (Phase Composition & Rendering) of the scene-transition
redesign."
```

---

## Self-Review

**1. Spec coverage.**
- §3.9 `PhasedSceneTransition` (options, public constructor, `enter`/`exit`, `getRequirements()` override) — Tasks 2–3.
- §3.9's `progress`/`easedProgress`/`presence` semantics — Task 3, with an explicit test asserting the exact `presence` values at 0%/50%/100% for both phases.
- §3.9.1 requirements lattice + `direct → texture` promotion — Task 1 (merge function) and Task 4 (composition uses it); the plan explicitly documents why no separate pixel-compositing code is needed (Slice 5's existing `frame.current` population already covers it).
- §3.9.2 (why full `SceneTransition` remains for Crossfade) — no task needed; this is a design-rationale section about a *different* slice's (7) built-in, not something Slice 6 implements. Confirmed no gap: `PhasedSceneTransition` doesn't attempt to model Crossfade.
- §3.10 `SceneTransitionPhases`/`SceneTransitionSelection` — Task 5; registry-level default + resolution order + the `unload` carve-out — Tasks 6–8.
- The two compiler-verified bugs named in the brief (protected-constructor inheritance; `getRequirementsForPhase` needing to be public) — Task 2, with an empirical before/after `pnpm typecheck` check for each, plus the additionally-discovered third instance of the same bug class (`enter`/`exit` needing `runPhase()`) — Task 3, verified the same way.
- §6.1's registry descriptor `transition` field — Task 6.

**2. Placeholder scan.** No "TBD"/"add appropriate handling"/"similar to Task N"-without-code patterns found. Task 8 is the one task that cannot give exact pre-existing line numbers (the code it modifies doesn't exist in this worktree yet, per the dependency note) — but every step in it still gives complete, concrete code to write and a precise invariant to verify against, with an explicit grep-first step rather than a vague "figure it out."

**3. Type consistency.** Traced through all 9 tasks:
- `SceneTransitionPhaseRequirements` (Task 1) is the type every `getPhaseRequirements()`/`getRequirementsForPhase()` override and call in Tasks 2–4 uses consistently.
- `PhasedSceneTransition.getRequirementsForPhase(phase, context)` (Task 2) — same name/signature used in Task 3 (`runPhase` mirrors it), Task 4 (`composePhasedSceneTransition`'s merge call), and the type-tests (Task 5's compile check references it implicitly via `PhasedSceneTransition`'s public surface).
- `PhasedSceneTransitionSession` (Task 3) is reused as-is (not re-implemented) by `ComposedPhasedSceneTransition` in Task 4 — confirmed both construct it with `(exitPhase, enterPhase, environment)` in the same argument order.
- `resolvePhasedSelection(exit, enter)` (Task 4) takes two independent optional `PhasedSceneTransition` arguments, not a `SceneTransitionPhases` object — confirmed Task 7's `resolveSceneTransitionSelection` calls it as `resolvePhasedSelection(selection.exit, selection.enter)`, matching that signature exactly.
- `SceneTransitionSelection`/`SceneTransitionPhases` (Task 5) are the exact types `SceneRegistration.transition` (Task 6) and `resolveSceneTransitionSelection`'s parameters (Task 7) use — no renaming across tasks.
- `resolveSceneTransitionSelection(operation, callSiteTransition, registryDefault): SceneTransition | null` (Task 7) is called with this exact parameter order and name in Task 8's `SceneDirector` wiring.
