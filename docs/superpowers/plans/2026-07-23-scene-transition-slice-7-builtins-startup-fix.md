# Scene Transition Slice 7 — Built-in Transitions & `Application.start()` Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two remaining, mutually-independent pieces of the scene-transition/lifecycle redesign before Slice 8's migration+docs pass: (Group A) the three core built-in transitions — `FadeSceneTransition`, `SlideSceneTransition`, `CrossFadeSceneTransition` — built on Slices 5/6's `SceneTransition`/`PhasedSceneTransition` runtime; and (Group B) `Application.start()`'s startup-sequencing fix — a `_frameLoopActive` flag that decouples the per-frame loop's gate from `_status`, consistent `_startFrameLoop()`/`_stopFrameLoop()` helpers used at every call site that can stop the loop, and an in-flight-navigation-abort mechanism so a frame-driven transition session in progress at shutdown time is destroyed and its promise rejected rather than left to hang forever.

**Architecture:**
Group A adds three new files under `src/core/transitions/`, each a thin, focused subclass: `FadeSceneTransition`/`SlideSceneTransition` extend Slice 6's `PhasedSceneTransition` (declare `getPhaseRequirements()`, override `enter()`/`exit()`); `CrossFadeSceneTransition` extends Slice 5's full `SceneTransition` directly with its own private `SceneTransitionSession` implementation, per spec §3.9.2 (a true crossfade needs simultaneous snapshot+live blending, which the phase-split model cannot express). All three are pure rendering/timing logic with no navigation-lifecycle concerns of their own — the commit/rollback/claim machinery they ride on top of is entirely Slice 5/6's responsibility, already merged.

Group B rewrites `Application.ts`'s startup/shutdown sequencing: a new private `_frameLoopActive` boolean becomes the _only_ thing the per-frame `update()` method's top-level gate checks (replacing `this._status === ApplicationStatus.Running`), so the loop can run — and reschedule itself — while `_status` is still `Loading`, letting a frame-driven transition session progress during the very first `start()` call. Two new private helpers, `_startFrameLoop()`/`_stopFrameLoop()`, centralize every place the flag flips; `_stopFrameLoop()` additionally asks `SceneDirector` to abort whatever navigation is currently in flight (a new `SceneDirector._abortInFlightNavigation()` method, generalizing the existing "reject an in-flight fade's promise on destroy" pattern already shipped in `SceneDirector._dispose()`) before the loop's own bookkeeping is torn down, so a transition-driven `change()`/`restore()`/`start()` call in progress at shutdown time rejects cleanly instead of hanging.

**Tech Stack:** TypeScript (strict), Vitest. Builds on the `SceneTransition`/`PhasedSceneTransition`/`SceneTransitionSession` runtime and the `change()`/`restore()`/`_navigationInFlight` navigation machinery from Slices 1–6 (merged, per this project's dependency ordering) and on `Easing`/`Ease` (`src/animation/Easing.ts`, already shipped, unrelated to this redesign).

## ⚠️ Baseline drift notice — read this before starting any task

This plan was written in a worktree branched directly off `origin/main @ b5aad1a3` — **before** Slices 1–6 of this same redesign exist in the codebase. Everything this plan cites as "the current `SceneDirector`/`Scene`/`SceneTypes`" (retention, `_navigationInFlight`, `_retained`, the old `{ type: 'fade' }` config-object `SceneTransition`, `Scene.onLoad`/`onUnload`, the `_transition`/`TransitionOverlayMesh` hardcoded-fade machinery in `SceneDirector.ts`) is the **pre-Slice-1 baseline**, not the code this slice actually executes against. By the time this plan is executed, Slices 1–6 will have replaced large parts of `SceneDirector.ts`/`SceneTypes.ts`/`Scene.ts` with the class-based `SceneTransition`/`PhasedSceneTransition` runtime, a `Ready` state, `change()`/`restore()` (renamed from `setScene()`/`restoreScene()`), preload, and `unload()`.

Concretely, before starting **any** task below:

1. Re-read `src/core/SceneDirector.ts`, `src/core/SceneTransition.ts` (or wherever Slice 5 placed it — grep for `class SceneTransition`), `src/core/PhasedSceneTransition.ts` (or wherever Slice 6 placed it — grep for `class PhasedSceneTransition`), and `src/core/SceneTypes.ts` **as they actually exist** at execution time.
2. Confirm the exact navigation method names (`change`/`restore` vs. this plan's occasional `setScene`/`restoreScene` references — use whatever the merged code actually calls them), the exact `SceneTransition`/`PhasedSceneTransition` public/protected member names, and the exact internal fields `SceneDirector` uses to track an in-flight navigation, a claimed preload entry, a retained entry, and the active `SceneTransitionSession`.
3. Where this plan's code differs from what you find, **the behavioral contract described in prose (and cited spec section) is authoritative — adapt names/call sites to match the real merged code**, not the other way around.

The "Assumed cross-slice API surface" section immediately below lists every place this plan had to guess at a Slice 1–6 name or invent a new rendering primitive, so you can jump straight to re-verifying exactly those points instead of re-reading everything from scratch.

### Assumed cross-slice API surface (re-verify before implementing)

**High confidence — spec gives literal code, Slices 5/6 produce this verbatim (spec §3, §3.9):**

- `SceneTransitionOperation`, `SceneTransitionContext`, `SceneTransitionRequirements`, `SceneTransitionEnvironment`, `SceneTransitionFrame`, `SceneTransitionSession` — types.
- `abstract class SceneTransition { getRequirements(context): SceneTransitionRequirements; beginSession(environment): SceneTransitionSession; protected abstract createSession(environment): SceneTransitionSession; }`.
- `PhasedSceneTransitionOptions { duration?, easing?, placement? }`, `SceneTransitionPhaseRequirements { outgoingFrame, currentFrame }`, `SceneTransitionPhaseContext { phase, progress, easedProgress, presence, frame, rendering }`.
- `abstract class PhasedSceneTransition extends SceneTransition` — public `duration`/`easing`/`placement` fields, public constructor with defaults `duration ?? 220`, `easing ?? Easing.linear` (this plan uses the actual exported easing-functions class name it finds — the pre-Slice-1 baseline calls it `Ease`, e.g. `Ease.linear`; the spec prose says `Easing.linear` — **use whichever name `src/animation/Easing.ts` actually exports at execution time**, this plan writes `Ease.linear` matching today's file), `placement ?? 'screen'`; `getRequirementsForPhase(phase, context)` (public wrapper) delegating to `protected abstract getPhaseRequirements(phase, context)`; `protected enter(context)`/`exit(context)` (default no-op); `getRequirements(context)` merges both phases via a `mergeSceneTransitionRequirements()` helper.
- Assumed file locations: `src/core/SceneTransition.ts` (barrel-exported as `#core/SceneTransition`), `src/core/PhasedSceneTransition.ts` (`#core/PhasedSceneTransition`). **Grep for `class SceneTransition` / `class PhasedSceneTransition` first — adjust every import path in Group A below if Slice 5/6 chose different files.**

**Medium confidence — reasonable rendering primitives Slice 5/6 must have added for phase-authored transitions to draw anything, exact names invented by this plan:**

- `RenderingContext.drawOverlay(options: { color: Color; alpha: number }): void` — draws a fullscreen, screen-space solid-color quad. This is the natural replacement for the hardcoded `TransitionOverlayMesh`/`_renderTransitionOverlay()` machinery that lives in the **pre-Slice-1** `SceneDirector.ts` (read in full during this repo's verification pass — `Color.black` default, `220`ms default duration, linear progress, no easing curve applied) — used directly in the spec's own `FadeSceneTransition` code example (§3.9). **Grep `RenderingContext.ts` for `drawOverlay` — if Slice 5 named it differently (e.g. `drawFullscreenOverlay`, or exposed it only via `drawGeometry` + a full-screen quad), adapt Task 1/2's `enter()`/`exit()` bodies to call the real method with equivalent semantics (a screen-space quad tinted `color` at `alpha`).**
- `RenderingContext.drawTexture(texture: RenderTexture, options?: { x?: number; y?: number; alpha?: number }): void` — draws a previously-captured/pooled `SceneTransitionFrame.outgoing`/`.current` texture at a pixel offset with optional alpha, used by `SlideSceneTransition` (texture translation) and `CrossFadeSceneTransition` (blend). **Grep for `drawTexture` / any texture-compositing helper on `RenderingContext` — Slice 5 needed _some_ such primitive to implement `currentFrame: 'texture'` promotion (spec §3.9.1) at all, so one exists; adapt the call sites in Tasks 2/3 to its real signature.**
- `RenderingContext.screenView.getBounds(): Rectangle` (`{ left, top, right, bottom }`) — already shipped today (used by the pre-Slice-1 `SceneDirector._renderTransitionOverlay()` via `backend.view.getBounds()`); this plan uses the public `context.rendering.screenView.getBounds()` accessor (confirmed present on `RenderingContext` today: `public get screenView(): View`, `View.getBounds(): Rectangle`) to compute screen width/height for `SlideSceneTransition`'s off-screen offsets.

**Low confidence — SceneDirector's internal in-flight-navigation state, invented by this plan for Task 9's `_abortInFlightNavigation()`, since Slice 5's exact field names for "the active session" / "a claimed preload entry" / "a claimed retained entry" don't exist anywhere yet to read:**

- This plan assumes `SceneDirector` (post-Slice-5) holds _some_ field referencing the currently-in-flight `SceneTransitionSession` (this plan calls it `_activeSession`), _some_ per-navigation "was this specific claim (preload entry / retained entry) taken by the in-flight navigation" bookkeeping, and _some_ way to reject the pending `change()`/`restore()`/`unload()` promise and flip a per-navigation `aborted` flag. Task 9 below spells out the exact shape it needs and is written so its own tests fail loudly (not silently pass) if the assumed shape doesn't match — **read this task's preamble carefully and adjust the private field names before writing any code.**

---

## Global Constraints

- Clean breaks only — no deprecated aliases, no shims (pre-1.0 policy).
- Every task ends green on its own scoped test command before moving to the next.
- JSDoc conventions: see `[[feedback-jsdoc-conventions]]` memory — every public export gets a doc comment; `@internal` for engine-only surface.
- `pnpm docs:api:generate` must be run and committed before the final push (push-gated).
- No new public `InstantSceneTransition`-style "config object" transition type — `SceneTransition`/`PhasedSceneTransition` subclasses only (spec §3.2).
- The Director owns all pooled transition textures (spec §3.4) — none of the three built-ins in this slice allocates, resizes, destroys, or retains a texture reference past its own session; they only read `SceneTransitionFrame.outgoing`/`.current`, which are borrowed.
- `_frameLoopActive` is `true` for the entire span from just before the first `requestAnimationFrame` call through app shutdown — a strict superset of `_status === Running` (spec §3.7). Nothing in this slice may reintroduce a second, independent "is the loop alive" boolean.
- The frame guard's existing, deliberate "does NOT call `Application.stop()`/unload the scene on a fatal halt" behavior (existing doc comment on `_handleFrameError`, pre-Slice-1 `Application.ts:840-845`) must be preserved — `_stopFrameLoop()` itself must never call `scenes._clearScene()`/`change()`/`restore()` teardown paths; only the explicit `stop()` method does that.
- `SceneTransitionSession.destroy()` is called exactly once per session, regardless of exit path (spec §3.7b) — the abort mechanism in Task 9 must not call it twice if the session was already independently settled (e.g. `done` reached) in the same tick.

---

## File Structure

```text
src/core/
├── Application.ts              (modified) — _frameLoopActive, _startFrameLoop()/_stopFrameLoop(),
│                                              update() gate, start() sequencing, stop()/destroy()/
│                                              fatal-frame-error call sites
├── SceneDirector.ts             (modified) — _abortInFlightNavigation()
├── SceneTypes.ts                (modified) — SceneNavigationAbortedError
└── transitions/
    ├── FadeSceneTransition.ts        (new) — PhasedSceneTransition, direct/none, placement 'screen'
    ├── SlideSceneTransition.ts       (new) — PhasedSceneTransition, texture(+snapshot for cover/reveal)
    ├── CrossFadeSceneTransition.ts   (new) — full SceneTransition, snapshot+texture, placement 'scene'
    └── index.ts                      (new) — barrel: re-exports the three classes + their Options types

src/core/index.ts               (modified) — export the three new classes + Options types

test/core/
├── application-frame-loop.test.ts       (new) — _frameLoopActive mechanics, start() sequencing,
│                                                  stop()/destroy() during Loading, abort integration
├── application-frame-guard.test.ts      (modified) — fatal-halt now routes through _stopFrameLoop()
├── application-lifecycle.test.ts        (modified) — mocked-SceneDirector harness: _abortInFlightNavigation
│                                                       wiring from stop()/destroy()
├── scene-director.test.ts               (modified) — _abortInFlightNavigation() unit tests
├── application-transition-startup.test.ts (new) — capstone: real FadeSceneTransition drives the very
│                                                    first start() call end-to-end
└── transitions/
    ├── fade-scene-transition.test.ts       (new)
    ├── slide-scene-transition.test.ts      (new)
    └── cross-fade-scene-transition.test.ts (new)
```

---

# Group A — Core built-in transitions (spec §8)

## Task 1: `FadeSceneTransition`

**Files:**

- Create: `src/core/transitions/FadeSceneTransition.ts`
- Test: `test/core/transitions/fade-scene-transition.test.ts`

**Interfaces:**

- Consumes: `PhasedSceneTransition`, `PhasedSceneTransitionOptions`, `SceneTransitionPhaseContext`, `SceneTransitionPhaseRequirements` (`#core/PhasedSceneTransition` — verify exact path first, see the "Assumed cross-slice API surface" section), `Color` (`#core/Color`), `RenderingContext.drawOverlay` (verify exact name first).
- Produces: `class FadeSceneTransition extends PhasedSceneTransition` — `public constructor(color?: Color, options?: PhasedSceneTransitionOptions)`, `public readonly color: Color`. Consumed by Task 4 (barrel export) and Task 10 (capstone integration test).

Preserves the pre-Slice-1 hardcoded fade's exact visual defaults, verified directly against `src/core/SceneDirector.ts` in this worktree before this task was written: `defaultFadeTransitionDuration = 220` (ms), default color `Color.black` (`transition.color ?? Color.black`), and a linear (un-eased) progress-to-alpha ramp (`_getTransitionAlpha()` computes raw `elapsedMs / durationMs` with no easing function applied). `PhasedSceneTransitionOptions`'s own defaults (`duration ?? 220`, `easing ?? Ease.linear`, `placement ?? 'screen'`) already match this exactly, so `FadeSceneTransition` needs no default overrides of its own beyond `color`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/core/transitions/fade-scene-transition.test.ts (new file)
import { Color } from '#core/Color';
import { Ease } from '#animation/Easing';
import type { SceneTransitionContext, SceneTransitionPhaseContext, SceneTransitionPhaseRequirements } from '#core/SceneTransition';
import { FadeSceneTransition } from '#core/transitions/FadeSceneTransition';

// Exposes the protected authoring hooks through public wrappers — the
// idiomatic way to unit-test a PhasedSceneTransition subclass's own
// enter()/exit()/getPhaseRequirements() in isolation, without re-driving
// PhasedSceneTransition's own session machinery (already covered by Slice 6's
// test suite).
class TestableFadeSceneTransition extends FadeSceneTransition {
  public callEnter(context: SceneTransitionPhaseContext): void {
    this.enter(context);
  }
  public callExit(context: SceneTransitionPhaseContext): void {
    this.exit(context);
  }
  public callGetPhaseRequirements(phase: 'enter' | 'exit', context: SceneTransitionContext): SceneTransitionPhaseRequirements {
    return this.getPhaseRequirements(phase, context);
  }
}

const stubContext = (overrides: Partial<SceneTransitionPhaseContext> = {}): SceneTransitionPhaseContext => ({
  phase: 'enter',
  progress: 0,
  easedProgress: 0,
  presence: 0,
  frame: { outgoing: null, current: null, committed: false },
  rendering: { drawOverlay: vi.fn() } as unknown as SceneTransitionPhaseContext['rendering'],
  ...overrides,
});

const navContext: SceneTransitionContext = { operation: 'change', hasOutgoingScene: true, hasIncomingScene: true };

describe('FadeSceneTransition', () => {
  test('defaults: color black, duration 220, linear easing, placement screen', () => {
    const fade = new FadeSceneTransition();

    expect(fade.color.equals(Color.black)).toBe(true);
    expect(fade.duration).toBe(220);
    expect(fade.easing).toBe(Ease.linear);
    expect(fade.placement).toBe('screen');
  });

  test('accepts a custom color and options', () => {
    const customColor = new Color(255, 0, 0, 1);
    const fade = new FadeSceneTransition(customColor, { duration: 500, easing: Ease.cubicOut });

    expect(fade.color).toBe(customColor);
    expect(fade.duration).toBe(500);
    expect(fade.easing).toBe(Ease.cubicOut);
  });

  test('getPhaseRequirements: none/direct for both phases (no texture, no snapshot)', () => {
    const fade = new TestableFadeSceneTransition();

    expect(fade.callGetPhaseRequirements('exit', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
    expect(fade.callGetPhaseRequirements('enter', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
  });

  test('getRequirements() merges identical exit/enter requirements unchanged', () => {
    const fade = new FadeSceneTransition();

    expect(fade.getRequirements(navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
  });

  test("exit(): draws the overlay at alpha = 1 - presence, in this transition's color", () => {
    const fade = new TestableFadeSceneTransition();
    const drawOverlay = vi.fn();
    const context = stubContext({ phase: 'exit', presence: 0.25, rendering: { drawOverlay } as never });

    fade.callExit(context);

    expect(drawOverlay).toHaveBeenCalledWith({ color: fade.color, alpha: 0.75 });
  });

  test('enter(): draws the overlay at alpha = 1 - presence, symmetric with exit()', () => {
    const fade = new TestableFadeSceneTransition();
    const drawOverlay = vi.fn();
    const context = stubContext({ phase: 'enter', presence: 0.6, rendering: { drawOverlay } as never });

    fade.callEnter(context);

    expect(drawOverlay).toHaveBeenCalledWith({ color: fade.color, alpha: 0.4 });
  });

  test('exit() at presence 1 (start of exit) draws a fully transparent overlay', () => {
    const fade = new TestableFadeSceneTransition();
    const drawOverlay = vi.fn();

    fade.callExit(stubContext({ phase: 'exit', presence: 1, rendering: { drawOverlay } as never }));

    expect(drawOverlay).toHaveBeenCalledWith({ color: fade.color, alpha: 0 });
  });

  test('exit() at presence 0 (end of exit, about to commit) draws a fully opaque overlay', () => {
    const fade = new TestableFadeSceneTransition();
    const drawOverlay = vi.fn();

    fade.callExit(stubContext({ phase: 'exit', presence: 0, rendering: { drawOverlay } as never }));

    expect(drawOverlay).toHaveBeenCalledWith({ color: fade.color, alpha: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/transitions/fade-scene-transition.test.ts`
Expected: FAIL — `#core/transitions/FadeSceneTransition` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/core/transitions/FadeSceneTransition.ts — full file
import { Color } from '#core/Color';
import {
  PhasedSceneTransition,
  type PhasedSceneTransitionOptions,
  type SceneTransitionPhaseContext,
  type SceneTransitionPhaseRequirements,
} from '#core/PhasedSceneTransition';

/**
 * Fade to a color, switch scenes, fade back in. `placement: 'screen'`,
 * `currentFrame: 'direct'`, `outgoingFrame: 'none'` — the live surface
 * renders straight to the screen with no extra texture pass; `render()`
 * only draws the overlay on top. The universal default transition
 * (definition spec §8).
 * @stable
 */
export class FadeSceneTransition extends PhasedSceneTransition {
  /** The color faded to. Default {@link Color.black}. */
  public readonly color: Color;

  public constructor(color: Color = Color.black, options: PhasedSceneTransitionOptions = {}) {
    super(options);
    this.color = color;
  }

  protected override getPhaseRequirements(): SceneTransitionPhaseRequirements {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }

  protected override enter(context: SceneTransitionPhaseContext): void {
    context.rendering.drawOverlay({ color: this.color, alpha: 1 - context.presence });
  }

  protected override exit(context: SceneTransitionPhaseContext): void {
    context.rendering.drawOverlay({ color: this.color, alpha: 1 - context.presence });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/transitions/fade-scene-transition.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/transitions/FadeSceneTransition.ts test/core/transitions/fade-scene-transition.test.ts
git commit -m "feat(core): FadeSceneTransition built-in (Slice 7 Group A)"
```

---

## Task 2: `SlideSceneTransition`

**Files:**

- Create: `src/core/transitions/SlideSceneTransition.ts`
- Test: `test/core/transitions/slide-scene-transition.test.ts`

**Interfaces:**

- Consumes: same `PhasedSceneTransition` surface as Task 1, plus `RenderingContext.drawTexture` (verify exact name), `View.getBounds()` (`#rendering/View`, already shipped) via `context.rendering.screenView.getBounds()`.
- Produces: `SlideDirection = 'left' | 'right' | 'up' | 'down'`, `SlideMode = 'push' | 'cover' | 'reveal'`, `SlideSceneTransitionOptions extends PhasedSceneTransitionOptions { direction?: SlideDirection; mode?: SlideMode }`, `class SlideSceneTransition extends PhasedSceneTransition`.

**Design decision (this task's own — the spec fixes only the constructor shape and mode/direction vocabulary in §8, not per-mode visual algorithms):** all three modes need `currentFrame: 'texture'` for at least one phase, because a `PhasedSceneTransition` can only _composite on top of_ the live surface in `render()` — it cannot retroactively move already-drawn scene content, so any translation of the live scene requires the "current" surface to be a texture the transition can draw at an offset, never `'direct'`.

- **`push`** (both phases animated, simplification documented below): exit slides the outgoing scene fully off-screen toward `direction`; enter slides the incoming scene in from the _opposite_ edge to (0,0). Both phases: `{ outgoingFrame: 'none', currentFrame: 'texture' }`. Because `PhasedSceneTransition` phase-splits at the commit boundary (spec §3.9.2 — no simultaneous two-scene compositing outside a full `SceneTransition`), there is a one-frame gap at the exact commit instant where neither scene is on-screen (both fully off, briefly showing the clear color) — an accepted, documented simplification, the same category of known limitation the spec itself calls out for phase composition (§3.9's `placement` "pop" corollary).
- **`reveal`** (only exit animated): the outgoing scene slides away toward `direction` to reveal the incoming scene once committed; enter is a no-op cut (the incoming scene is simply already there once the exit finishes and commit happens). Exit: `{ outgoingFrame: 'none', currentFrame: 'texture' }`; enter: `{ outgoingFrame: 'none', currentFrame: 'direct' }` (nothing to animate).
- **`cover`** (only enter animated, mirror of reveal): the outgoing scene stays static and untouched during exit (a plain cut, `currentFrame: 'direct'`, empty `exit()` body); once committed, a frozen snapshot of the outgoing scene is drawn as a static background and the incoming scene's live texture slides in from `direction`'s opposite edge on top of it. Exit: `{ outgoingFrame: 'none', currentFrame: 'direct' }`; enter: `{ outgoingFrame: 'snapshot', currentFrame: 'texture' }`.

`direction` names the edge the _outgoing_ content exits toward (`'left'` ⇒ outgoing exits left, incoming — for `push` — enters from the right).

- [ ] **Step 1: Write the failing tests**

```ts
// test/core/transitions/slide-scene-transition.test.ts (new file)
import type { SceneTransitionContext, SceneTransitionPhaseContext, SceneTransitionPhaseRequirements } from '#core/SceneTransition';
import { SlideSceneTransition } from '#core/transitions/SlideSceneTransition';

class TestableSlideSceneTransition extends SlideSceneTransition {
  public callEnter(context: SceneTransitionPhaseContext): void {
    this.enter(context);
  }
  public callExit(context: SceneTransitionPhaseContext): void {
    this.exit(context);
  }
  public callGetPhaseRequirements(phase: 'enter' | 'exit', context: SceneTransitionContext): SceneTransitionPhaseRequirements {
    return this.getPhaseRequirements(phase, context);
  }
}

const navContext: SceneTransitionContext = { operation: 'change', hasOutgoingScene: true, hasIncomingScene: true };

const stubRendering = (): {
  drawTexture: ReturnType<typeof vi.fn>;
  screenView: { getBounds: () => { left: number; top: number; right: number; bottom: number } };
} => ({
  drawTexture: vi.fn(),
  screenView: { getBounds: () => ({ left: 0, top: 0, right: 800, bottom: 600 }) },
});

const stubContext = (
  overrides: Partial<SceneTransitionPhaseContext> & { rendering: SceneTransitionPhaseContext['rendering'] },
): SceneTransitionPhaseContext => ({
  phase: 'exit',
  progress: 0,
  easedProgress: 0,
  presence: 0,
  frame: { outgoing: null, current: {} as never, committed: false },
  ...overrides,
});

describe('SlideSceneTransition', () => {
  test('defaults: direction right, mode push', () => {
    const slide = new SlideSceneTransition();

    // Defaults are asserted indirectly through getPhaseRequirements()/behavior below —
    // direction/mode are not part of the public requirements shape, so this test only
    // pins the constructor not throwing and requirements matching the "push" table.
    expect(slide.callGetPhaseRequirements?.bind(slide)).toBeUndefined(); // no protected leak on the public instance
    expect(slide.getRequirements(navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'texture' });
  });

  describe('mode: push', () => {
    test('both phases require currentFrame texture, no snapshot', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'push' });

      expect(slide.callGetPhaseRequirements('exit', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'texture' });
      expect(slide.callGetPhaseRequirements('enter', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'texture' });
    });

    test('exit slides the outgoing texture toward `direction` (left): offset goes from 0 to -width as presence goes 1 to 0', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'push', direction: 'left' });
      const rendering = stubRendering();

      slide.callExit(stubContext({ phase: 'exit', presence: 1, rendering: rendering as never }));
      expect(rendering.drawTexture).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ x: 0 }));

      slide.callExit(stubContext({ phase: 'exit', presence: 0, rendering: rendering as never }));
      expect(rendering.drawTexture).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ x: -800 }));
    });

    test('enter slides the incoming texture in from the opposite edge (right, for direction left) to 0', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'push', direction: 'left' });
      const rendering = stubRendering();

      slide.callEnter(stubContext({ phase: 'enter', presence: 0, rendering: rendering as never }));
      expect(rendering.drawTexture).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ x: 800 }));

      slide.callEnter(stubContext({ phase: 'enter', presence: 1, rendering: rendering as never }));
      expect(rendering.drawTexture).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ x: 0 }));
    });

    test('direction right exits toward positive offset', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'push', direction: 'right' });
      const rendering = stubRendering();

      slide.callExit(stubContext({ phase: 'exit', presence: 0, rendering: rendering as never }));
      expect(rendering.drawTexture).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ x: 800 }));
    });

    test('direction up/down offsets the y axis instead of x', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'push', direction: 'up' });
      const rendering = stubRendering();

      slide.callExit(stubContext({ phase: 'exit', presence: 0, rendering: rendering as never }));
      expect(rendering.drawTexture).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ x: 0, y: -600 }));
    });
  });

  describe('mode: reveal', () => {
    test('exit requires texture, enter requires only direct (no animation)', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'reveal' });

      expect(slide.callGetPhaseRequirements('exit', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'texture' });
      expect(slide.callGetPhaseRequirements('enter', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
    });

    test('enter() is a no-op (nothing left to animate — the reveal already happened during exit)', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'reveal' });
      const rendering = stubRendering();

      slide.callEnter(stubContext({ phase: 'enter', presence: 1, rendering: rendering as never }));

      expect(rendering.drawTexture).not.toHaveBeenCalled();
    });
  });

  describe('mode: cover', () => {
    test('exit requires only direct (static, no animation), enter requires snapshot + texture', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'cover' });

      expect(slide.callGetPhaseRequirements('exit', navContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
      expect(slide.callGetPhaseRequirements('enter', navContext)).toEqual({ outgoingFrame: 'snapshot', currentFrame: 'texture' });
    });

    test('exit() is a no-op (outgoing scene stays static and untouched)', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'cover' });
      const rendering = stubRendering();

      slide.callExit(stubContext({ phase: 'exit', presence: 1, rendering: rendering as never }));

      expect(rendering.drawTexture).not.toHaveBeenCalled();
    });

    test('enter() draws the frozen outgoing snapshot at full opacity behind the sliding incoming texture', () => {
      const slide = new TestableSlideSceneTransition({ mode: 'cover', direction: 'left' });
      const rendering = stubRendering();
      const outgoingSnapshot = { snapshot: true } as never;
      const currentTexture = { current: true } as never;

      slide.callEnter(
        stubContext({
          phase: 'enter',
          presence: 0.5,
          frame: { outgoing: outgoingSnapshot, current: currentTexture, committed: true },
          rendering: rendering as never,
        }),
      );

      expect(rendering.drawTexture).toHaveBeenCalledWith(outgoingSnapshot, { x: 0, y: 0, alpha: 1 });
      expect(rendering.drawTexture).toHaveBeenLastCalledWith(currentTexture, { x: 400, y: 0, alpha: 1 });
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/transitions/slide-scene-transition.test.ts`
Expected: FAIL — `#core/transitions/SlideSceneTransition` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/core/transitions/SlideSceneTransition.ts — full file
import {
  PhasedSceneTransition,
  type PhasedSceneTransitionOptions,
  type SceneTransitionPhaseContext,
  type SceneTransitionPhaseRequirements,
} from '#core/PhasedSceneTransition';
import type { SceneTransitionContext } from '#core/SceneTransition';

export type SlideDirection = 'left' | 'right' | 'up' | 'down';
export type SlideMode = 'push' | 'cover' | 'reveal';

export interface SlideSceneTransitionOptions extends PhasedSceneTransitionOptions {
  /** The edge the outgoing content exits toward. Default `'right'`. */
  readonly direction?: SlideDirection;
  /** Default `'push'`. See {@link SlideSceneTransition} for the three modes' visual shape. */
  readonly mode?: SlideMode;
}

const directionAxis: Record<SlideDirection, 'x' | 'y'> = {
  left: 'x',
  right: 'x',
  up: 'y',
  down: 'y',
};

const directionSign: Record<SlideDirection, 1 | -1> = {
  left: -1,
  right: 1,
  up: -1,
  down: 1,
};

const oppositeDirection: Record<SlideDirection, SlideDirection> = {
  left: 'right',
  right: 'left',
  up: 'down',
  down: 'up',
};

/**
 * Directional slide transition — covers menu/inventory/page-style navigation
 * (definition spec §8). Three modes:
 * - `'push'` (default): the outgoing scene exits toward `direction` while the
 *   incoming scene enters from the opposite edge. Phase-split at the commit
 *   boundary (not a full `SceneTransition`), so there is a brief single-frame
 *   gap at the exact commit instant where neither scene is on-screen.
 * - `'reveal'`: only the outgoing scene animates, sliding away toward
 *   `direction` to reveal the (already-committed) incoming scene underneath.
 * - `'cover'`: only the incoming scene animates, sliding in from the opposite
 *   edge over a frozen snapshot of the (already-gone) outgoing scene.
 * @stable
 */
export class SlideSceneTransition extends PhasedSceneTransition {
  public readonly direction: SlideDirection;
  public readonly mode: SlideMode;

  public constructor(options: SlideSceneTransitionOptions = {}) {
    super(options);
    this.direction = options.direction ?? 'right';
    this.mode = options.mode ?? 'push';
  }

  protected override getPhaseRequirements(phase: 'enter' | 'exit', _context: SceneTransitionContext): SceneTransitionPhaseRequirements {
    if (this.mode === 'push') {
      return { outgoingFrame: 'none', currentFrame: 'texture' };
    }

    if (this.mode === 'reveal') {
      return phase === 'exit' ? { outgoingFrame: 'none', currentFrame: 'texture' } : { outgoingFrame: 'none', currentFrame: 'direct' };
    }

    // mode === 'cover'
    return phase === 'exit' ? { outgoingFrame: 'none', currentFrame: 'direct' } : { outgoingFrame: 'snapshot', currentFrame: 'texture' };
  }

  protected override exit(context: SceneTransitionPhaseContext): void {
    if (this.mode === 'cover') {
      return; // static — the outgoing scene stays put, untouched, until commit
    }

    // 'push' and 'reveal': the outgoing texture slides toward `direction`,
    // fully off-screen once presence reaches 0.
    if (context.frame.current === null) {
      return;
    }

    const { width, height } = this._screenSize(context);
    const distance = directionAxis[this.direction] === 'x' ? width : height;
    const offset = distance * (1 - context.presence) * directionSign[this.direction];
    const point = directionAxis[this.direction] === 'x' ? { x: offset, y: 0 } : { x: 0, y: offset };

    context.rendering.drawTexture(context.frame.current, { ...point, alpha: 1 });
  }

  protected override enter(context: SceneTransitionPhaseContext): void {
    if (this.mode === 'reveal') {
      return; // nothing left to animate — the reveal already happened during exit
    }

    if (this.mode === 'cover' && context.frame.outgoing !== null) {
      context.rendering.drawTexture(context.frame.outgoing, { x: 0, y: 0, alpha: 1 });
    }

    if (context.frame.current === null) {
      return;
    }

    // 'push' enters from the OPPOSITE edge of `direction`; 'cover' always
    // enters from `direction`'s own edge (there's no outgoing motion to mirror).
    const entryDirection = this.mode === 'push' ? oppositeDirection[this.direction] : this.direction;
    const { width, height } = this._screenSize(context);
    const distance = directionAxis[entryDirection] === 'x' ? width : height;
    const offset = distance * (1 - context.presence) * directionSign[entryDirection];
    const point = directionAxis[entryDirection] === 'x' ? { x: offset, y: 0 } : { x: 0, y: offset };

    context.rendering.drawTexture(context.frame.current, { ...point, alpha: 1 });
  }

  private _screenSize(context: SceneTransitionPhaseContext): { width: number; height: number } {
    const bounds = context.rendering.screenView.getBounds();

    return { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/transitions/slide-scene-transition.test.ts`
Expected: PASS. If `RenderingContext.drawTexture`/`screenView.getBounds()` differ from the assumed signatures, adjust `_screenSize()`/the two call sites (and the corresponding test stubs) to match the real API — the offset math and phase-requirements table above are the part of this task that must not change.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/transitions/SlideSceneTransition.ts test/core/transitions/slide-scene-transition.test.ts
git commit -m "feat(core): SlideSceneTransition built-in (Slice 7 Group A)"
```

---

## Task 3: `CrossFadeSceneTransition`

**Files:**

- Create: `src/core/transitions/CrossFadeSceneTransition.ts`
- Test: `test/core/transitions/cross-fade-scene-transition.test.ts`

**Interfaces:**

- Consumes: `SceneTransition`, `SceneTransitionContext`, `SceneTransitionEnvironment`, `SceneTransitionFrame`, `SceneTransitionRequirements`, `SceneTransitionSession` (`#core/SceneTransition`), `RenderingContext`/`RenderingContext.drawTexture`, `Time` (`#core/Time`), `EasingFunction`/`Ease` (`#animation/Easing`).
- Produces: `CrossFadeSceneTransitionOptions { duration?, easing? }`, `class CrossFadeSceneTransition extends SceneTransition`.

Per spec §3.9.2, a true crossfade is **not** phase-split — it needs one continuous blend between a snapshot of the outgoing scene and the live incoming scene, with no "exit half"/"enter half" seam. It's a full `SceneTransition` subclass with its own hand-written `createSession()`.

**Design decision (this task's own — spec fixes only `getRequirements()`'s values and `placement: 'scene'` in §8/§3.6, not the exact blend timing):** `environment.commit()` is called synchronously from inside `createSession()` (legal per spec §3.5.2 — `commit()` may be called synchronously from `createSession()`/`update()`/`render()`) so the incoming scene starts preparing immediately, with no "hold" phase the way `FadeSceneTransition` holds at its midpoint. The visible blend's `duration` timer starts counting only once `environment.committed` becomes `true`, not from session creation — otherwise an unpredictable fraction of the configured duration could elapse invisibly while `prepare()` is still in flight, making the actually-visible crossfade shorter than configured for slow-loading targets. Before commit, `frame.current` is still the _outgoing_ scene (§3.7a: "before commit: the outgoing scene"), so `render()` simply draws it at full opacity and does not start blending yet. This also means `done` can only become `true` once `committed` is already `true` (never before), satisfying the spec's "`done` must never be true before `committed`" invariant (§3.5) by construction, not by an extra guard.

- [ ] **Step 1: Write the failing tests**

```ts
// test/core/transitions/cross-fade-scene-transition.test.ts (new file)
import { Ease } from '#animation/Easing';
import type { SceneTransitionContext, SceneTransitionEnvironment, SceneTransitionFrame } from '#core/SceneTransition';
import { Time } from '#core/Time';
import { CrossFadeSceneTransition } from '#core/transitions/CrossFadeSceneTransition';

// beginSession() is public (wraps the protected createSession()) — the real
// entry point any consumer (the Director) uses; no protected-access shim needed here.
const navContext: SceneTransitionContext = { operation: 'change', hasOutgoingScene: true, hasIncomingScene: true };

const makeEnvironment = (): SceneTransitionEnvironment & { _committed: boolean } => {
  const env = {
    context: navContext,
    commitRequested: false,
    committed: false,
    _committed: false,
    commit(): void {
      env.commitRequested = true;
      env.committed = true; // this test double treats "requested" and "committed" as the same tick
      env._committed = true;
    },
  };

  return env;
};

describe('CrossFadeSceneTransition', () => {
  test('getRequirements(): snapshot + texture, regardless of context', () => {
    const crossFade = new CrossFadeSceneTransition();

    expect(crossFade.getRequirements(navContext)).toEqual({ outgoingFrame: 'snapshot', currentFrame: 'texture' });
  });

  test('beginSession() requests commit synchronously (no separate exit hold, unlike FadeSceneTransition)', () => {
    const crossFade = new CrossFadeSceneTransition();
    const environment = makeEnvironment();

    crossFade.beginSession(environment);

    expect(environment.commitRequested).toBe(true);
  });

  test('session.placement is "scene"', () => {
    const crossFade = new CrossFadeSceneTransition();
    const session = crossFade.beginSession(makeEnvironment());

    expect(session.placement).toBe('scene');
  });

  test('done stays false while not yet committed, even after ticks past the configured duration', () => {
    const crossFade = new CrossFadeSceneTransition({ duration: 100 });
    const environment: SceneTransitionEnvironment = {
      context: navContext,
      commitRequested: false,
      committed: false, // never flips true in this test — simulates a still-in-flight prepare()
      commit(): void {
        environment.commitRequested = true;
      },
    };
    const session = crossFade.beginSession(environment);

    session.update(new Time(1000));

    expect(session.done).toBe(false);
  });

  test('render() before commit draws only frame.current at full opacity (still the outgoing scene)', () => {
    const crossFade = new CrossFadeSceneTransition();
    const environment: SceneTransitionEnvironment = {
      context: navContext,
      commitRequested: false,
      committed: false,
      commit(): void {
        environment.commitRequested = true;
      },
    };
    const session = crossFade.beginSession(environment);
    const drawTexture = vi.fn();
    const outgoingLive = {} as never;
    const frame: SceneTransitionFrame = { outgoing: {} as never, current: outgoingLive, committed: false };

    session.render({ drawTexture } as never, frame);

    expect(drawTexture).toHaveBeenCalledTimes(1);
    expect(drawTexture).toHaveBeenCalledWith(outgoingLive, { alpha: 1 });
  });

  test('once committed, blends outgoing snapshot (alpha 1) under current texture (alpha ramping via easing)', () => {
    const crossFade = new CrossFadeSceneTransition({ duration: 100, easing: Ease.linear });
    const environment = makeEnvironment();
    const session = crossFade.beginSession(environment); // commit() already ran synchronously

    session.update(new Time(40));

    const drawTexture = vi.fn();
    const outgoingSnapshot = { snapshot: true } as never;
    const currentTexture = { current: true } as never;

    session.render({ drawTexture } as never, { outgoing: outgoingSnapshot, current: currentTexture, committed: true });

    expect(drawTexture).toHaveBeenNthCalledWith(1, outgoingSnapshot, { alpha: 1 });
    expect(drawTexture).toHaveBeenNthCalledWith(2, currentTexture, { alpha: 0.4 });
  });

  test('done becomes true once elapsed (post-commit) reaches duration, never before', () => {
    const crossFade = new CrossFadeSceneTransition({ duration: 100 });
    const environment = makeEnvironment();
    const session = crossFade.beginSession(environment);

    session.update(new Time(60));
    expect(session.done).toBe(false);

    session.update(new Time(60));
    expect(session.done).toBe(true);
  });

  test('duration 0 completes on the first post-commit update() tick', () => {
    const crossFade = new CrossFadeSceneTransition({ duration: 0 });
    const environment = makeEnvironment();
    const session = crossFade.beginSession(environment);

    session.update(new Time(0));

    expect(session.done).toBe(true);
  });

  test('destroy() does not throw (no owned resources — pooled textures are Director-owned)', () => {
    const crossFade = new CrossFadeSceneTransition();
    const session = crossFade.beginSession(makeEnvironment());

    expect(() => session.destroy()).not.toThrow();
  });

  test('defaults: duration 220, linear easing', () => {
    const crossFade = new CrossFadeSceneTransition();

    expect(crossFade.duration).toBe(220);
    expect(crossFade.easing).toBe(Ease.linear);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/transitions/cross-fade-scene-transition.test.ts`
Expected: FAIL — `#core/transitions/CrossFadeSceneTransition` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/core/transitions/CrossFadeSceneTransition.ts — full file
import type { EasingFunction } from '#animation/Easing';
import { Ease } from '#animation/Easing';
import type { SceneTransitionEnvironment, SceneTransitionFrame, SceneTransitionRequirements, SceneTransitionSession } from '#core/SceneTransition';
import { SceneTransition } from '#core/SceneTransition';
import type { Time } from '#core/Time';
import type { RenderingContext } from '#rendering/RenderingContext';

export interface CrossFadeSceneTransitionOptions {
  /** Blend duration in ms, counted from the moment the switch commits (not from session start). Default `220`. */
  readonly duration?: number;
  /** Default {@link Ease.linear}. */
  readonly easing?: EasingFunction;
}

class CrossFadeSession implements SceneTransitionSession {
  public readonly placement = 'scene';
  private _elapsedMs = 0;
  private _done = false;

  public constructor(
    private readonly _durationMs: number,
    private readonly _easing: EasingFunction,
    private readonly _environment: SceneTransitionEnvironment,
  ) {}

  public get done(): boolean {
    return this._done;
  }

  public update(delta: Time): void {
    if (this._done || !this._environment.committed) {
      return;
    }

    this._elapsedMs += delta.milliseconds;

    if (this._elapsedMs >= this._durationMs) {
      this._done = true;
    }
  }

  public render(context: RenderingContext, frame: SceneTransitionFrame): void {
    if (!this._environment.committed) {
      // Still the outgoing scene either way (§3.7a) — draw it once, plainly.
      if (frame.current !== null) {
        context.drawTexture(frame.current, { alpha: 1 });
      }

      return;
    }

    const progress = this._durationMs > 0 ? Math.min(1, this._elapsedMs / this._durationMs) : 1;
    const alpha = this._easing(progress);

    if (frame.outgoing !== null) {
      context.drawTexture(frame.outgoing, { alpha: 1 });
    }

    if (frame.current !== null) {
      context.drawTexture(frame.current, { alpha });
    }
  }

  public destroy(): void {
    // No owned resources — pooled textures are Director-owned (spec §3.4).
  }
}

/**
 * Continuous blend between the outgoing scene (frozen as a snapshot at
 * session start) and the incoming scene (rendered live to a pooled texture),
 * with no "exit half"/"enter half" seam — `placement: 'scene'`,
 * `outgoingFrame: 'snapshot'`, `currentFrame: 'texture'`. A full
 * `SceneTransition`, not phase-split (definition spec §3.9.2, §8).
 * @stable
 */
export class CrossFadeSceneTransition extends SceneTransition {
  public readonly duration: number;
  public readonly easing: EasingFunction;

  public constructor(options: CrossFadeSceneTransitionOptions = {}) {
    super();
    this.duration = Math.max(0, options.duration ?? 220);
    this.easing = options.easing ?? Ease.linear;
  }

  public override getRequirements(): SceneTransitionRequirements {
    return { outgoingFrame: 'snapshot', currentFrame: 'texture' };
  }

  protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    // No separate "exit hold" — a crossfade has nothing to wait on visually
    // before starting to prepare the incoming scene.
    environment.commit();

    return new CrossFadeSession(this.duration, this.easing, environment);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/transitions/cross-fade-scene-transition.test.ts`
Expected: PASS. If `RenderingContext.drawTexture` differs from the assumed signature, adjust the two call sites in `CrossFadeSession.render()` (and this task's test stubs) to match the real API — the blend/timing logic above is the part of this task that must not change.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/transitions/CrossFadeSceneTransition.ts test/core/transitions/cross-fade-scene-transition.test.ts
git commit -m "feat(core): CrossFadeSceneTransition built-in (Slice 7 Group A)"
```

---

## Task 4: Barrel exports

**Files:**

- Create: `src/core/transitions/index.ts`
- Modify: `src/core/index.ts`

**Interfaces:**

- Consumes: Tasks 1–3's three classes and their `*Options` types.
- Produces: `FadeSceneTransition`, `SlideSceneTransition`, `SlideDirection`, `SlideMode`, `SlideSceneTransitionOptions`, `CrossFadeSceneTransition`, `CrossFadeSceneTransitionOptions` importable from the package root, and from `#core/transitions`.

No dedicated test — exercised by Task 10's capstone test importing `FadeSceneTransition` from the package root, and by `pnpm typecheck`.

- [ ] **Step 1: Create the `transitions/` barrel**

```ts
// src/core/transitions/index.ts — full file
export { CrossFadeSceneTransition, type CrossFadeSceneTransitionOptions } from './CrossFadeSceneTransition';
export { FadeSceneTransition } from './FadeSceneTransition';
export { SlideSceneTransition, type SlideDirection, type SlideMode, type SlideSceneTransitionOptions } from './SlideSceneTransition';
```

- [ ] **Step 2: Re-export from the package-root `src/core/index.ts`**

Find the existing `export { Scene } from './Scene';`-style block (verify the exact current surrounding lines first — Slices 1–6 will have added their own new exports here, e.g. `PhasedSceneTransition`/`SceneTransition`) and add, alphabetically alongside the existing scene-related exports:

```ts
export { CrossFadeSceneTransition, type CrossFadeSceneTransitionOptions } from './transitions/CrossFadeSceneTransition';
export { FadeSceneTransition } from './transitions/FadeSceneTransition';
export { SlideSceneTransition, type SlideDirection, type SlideMode, type SlideSceneTransitionOptions } from './transitions/SlideSceneTransition';
```

**Note:** the pre-Slice-1 baseline already has a _type-only_ `FadeSceneTransition` exported from `./SceneTypes` (the old `{ type: 'fade' }` config-object interface) at this same barrel file — Slice 5/6 will already have removed that export as part of replacing the config-object transition model with the class-based one (spec §3.2/§3.3), so no name collision is expected by the time this task runs; if one is still present, that's a sign Slice 5/6 didn't fully land yet — stop and re-verify before proceeding, don't paper over it with a rename.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean, no duplicate-export errors.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/transitions/index.ts src/core/index.ts
git commit -m "feat(core): export built-in scene transitions from the package root"
```

---

# Group B — `Application.start()` fix (spec §3.7)

## Task 5: `_frameLoopActive` flag, `_startFrameLoop()`, decouple `update()`'s gate, rewire `start()`

**Files:**

- Modify: `src/core/Application.ts`
- Test: `test/core/application-frame-loop.test.ts` (new)

**Interfaces:**

- Produces: `private _frameLoopActive: boolean`, `private _startFrameLoop(): void`. Consumed by Task 6 (`_stopFrameLoop()`), Task 7, Task 8, Task 9.

Re-verify against the actual merged `Application.ts` before starting: this task's line-number references below are from this worktree's pre-Slice-1 baseline (`Application.ts`, 1260 lines) — Slice 5/6 may have touched `start()`'s body already (e.g. renaming `this.scenes.setScene(...)` to `this.scenes.change(...)`, per the drift note at the top of this plan). Apply this task's diff against whatever `start()`/`update()` actually look like, preserving their surrounding logic untouched.

- [ ] **Step 1: Write the failing tests**

```ts
// test/core/application-frame-loop.test.ts (new file)
/**
 * Slice 7 Group B — Application.start() startup-sequencing fix (spec §3.7):
 * _frameLoopActive decouples the per-frame loop's gate from `_status`, so a
 * frame-driven transition session can progress during the very first
 * `start()` call (before `_status` flips to Running).
 */
import { Application, ApplicationStatus } from '#core/Application';

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return {
      onContextLost: { add: vi.fn() },
      onContextRestored: { add: vi.fn() },
      onRenderError: { add: vi.fn(), destroy: vi.fn() },
      stats: {
        frameTimeMs: 0,
        drawCalls: 0,
        culledNodes: 0,
        submittedNodes: 0,
        batches: 0,
        renderPasses: 0,
        renderTargetChanges: 0,
        frame: 0,
        rawFrameDeltaMs: 0,
      },
      resetStats: vi.fn().mockReturnThis(),
      flush: vi.fn().mockReturnThis(),
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      resize: vi.fn().mockReturnThis(),
      view: { getBounds: vi.fn().mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600 }) },
      renderTarget: {},
      backendType: 'webgl2',
      setView: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      execute: vi.fn().mockReturnThis(),
      clear: vi.fn().mockReturnThis(),
      pushScissorRect: vi.fn().mockReturnThis(),
      popScissorRect: vi.fn().mockReturnThis(),
      acquireRenderTexture: vi.fn(),
      releaseRenderTexture: vi.fn().mockReturnThis(),
      composeWithAlphaMask: vi.fn().mockReturnThis(),
    };
  }),
}));

function frameLoopActive(app: Application): boolean {
  return (app as unknown as Record<string, unknown>)['_frameLoopActive'] as boolean;
}

describe('Application — _frameLoopActive (Slice 7 Group B)', () => {
  let rafSpy: MockInstance;
  let cafSpy: MockInstance;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  test('_frameLoopActive becomes true before start() resolves and status flips to Running', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });

    const startPromise = app.start();

    // Flush the microtask queue enough for the pre-RAF awaits (backend init,
    // capabilities) to settle without needing the whole start() to resolve.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(frameLoopActive(app)).toBe(true);

    await startPromise;
    expect(app.status).toBe(ApplicationStatus.Running);
    app.destroy();
  });

  test('a scheduled RAF callback runs its body (and reschedules) even while _status is still Loading', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });
    const startPromise = app.start();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // start() hasn't resolved yet (status is still Loading), but the loop
    // must already be live and self-rescheduling — this is the bug being fixed.
    expect(app.status).toBe(ApplicationStatus.Loading);
    const callsBeforeManualTick = rafSpy.mock.calls.length;

    expect(rafCallbacks.length).toBeGreaterThan(0);
    rafCallbacks[0]!(0);

    expect(rafSpy.mock.calls.length).toBeGreaterThan(callsBeforeManualTick);

    await startPromise;
    app.destroy();
  });

  test('_activeClock starts ticking as soon as _frameLoopActive flips true, not after start() resolves', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });
    const startPromise = app.start();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(frameLoopActive(app)).toBe(true);
    // activeTime is a live Clock read — a non-zero value here (rather than
    // waiting for start() to resolve) proves the clock started at
    // _startFrameLoop() time, per spec §3.7's fourth "must clear/start
    // everywhere" bullet (the _activeClock one).
    const activeTimeDuringLoading = app.activeTime.milliseconds;

    expect(activeTimeDuringLoading).toBeGreaterThanOrEqual(0);

    await startPromise;
    app.destroy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/application-frame-loop.test.ts`
Expected: FAIL — `_frameLoopActive` does not exist; `start()` still awaits the initial navigation before scheduling any RAF, so `rafCallbacks` is empty at the point the second test inspects it.

- [ ] **Step 3: Implement**

In `src/core/Application.ts`, add the field next to `_status`:

```ts
  private _status: ApplicationStatus = ApplicationStatus.Stopped;
  private _frameLoopActive = false;
```

Add the private helper (placed near `initializeBackend`/`resolveInitialBackendType`, or directly above `start()`):

```ts
  /**
   * Flip the internal "loop is live" flag, schedule the first frame, and
   * reset every clock the frame body depends on — all in one place so every
   * call site that can start the loop does so identically. `_status` is left
   * untouched (still `Loading` at the point {@link Application.start} calls
   * this) — {@link Application.update}'s gate reads `_frameLoopActive`, a
   * strict superset of `_status === Running` (definition spec §3.7).
   */
  private _startFrameLoop(): void {
    this._frameLoopActive = true;
    this._frameRequest = requestAnimationFrame(this._updateHandler);
    this._frameClock.restart();
    this._fixed.reset();
    this._activeClock.start();
  }
```

Change `update()`'s top-level gate:

```ts
  public update(): this {
    if (this._status === ApplicationStatus.Running) {
```

to:

```ts
  public update(): this {
    if (this._frameLoopActive) {
```

Change the two `if (this._status === ApplicationStatus.Running)` checks that guard rescheduling _inside_ `update()` (the `pauseOnHidden` early-return branch, and the `finally` block's reschedule) to `if (this._frameLoopActive)` as well — both currently duplicate the outer gate's condition and must stay in lockstep with it:

```ts
if (this.pauseOnHidden && !this._documentVisible) {
  this._frameClock.restart();
  this._fixed.reset();
  this._frameRequest = requestAnimationFrame(this._updateHandler);

  return this;
}
```

(this inner branch has no status/flag check of its own today — leave it as-is, it already only runs inside the now-`_frameLoopActive`-gated outer `if`)

```ts
// RAF rescheduling always happens unless the guard halted the loop —
// this is what keeps the canvas alive through a throwing frame.
if (this._frameLoopActive) {
  this._frameRequest = requestAnimationFrame(this._updateHandler);
  this._frameClock.restart();
  this._frameCount++;
}
```

Rewire `start()`:

```ts
  public async start(target?: AnySceneConstructor, ...args: readonly unknown[]): Promise<this> {
    invariant(!this._destroyed, 'Application.start() was called after destroy(). Construct a new Application instead of reusing a destroyed one.');

    if (this._status === ApplicationStatus.Stopped) {
      this._status = ApplicationStatus.Loading;

      // Kick off capability detection in parallel with renderer init —
      // both are mostly-async startup work, no point serializing them.
      const capabilitiesPromise = Capabilities.ready;

      try {
        await this.initializeBackend();

        if (this.options.hello) {
          hello({ backend: this._backendType });
        }

        this._capabilities = await capabilitiesPromise;

        // The frame loop must be live BEFORE the initial navigation runs —
        // a frame-driven SceneTransitionSession needs update()/render()
        // calls to progress, and update()'s gate no longer waits for
        // `_status === Running` (definition spec §3.7).
        this._startFrameLoop();

        if (target !== undefined) {
          await this.scenes.setScene(target, ...(args as SetSceneArgs<InferSceneData<typeof target>>));
        }

        this._status = ApplicationStatus.Running;
      } catch (error) {
        this._status = ApplicationStatus.Stopped;
        throw error;
      }
    }

    return this;
  }
```

(`this.scenes.setScene(...)` is written here matching this worktree's pre-Slice-1 baseline method name — replace with `this.scenes.change(...)` if Slice 1–6 already renamed it by execution time, per this plan's drift notice.) Note the `catch` block does **not** call `_stopFrameLoop()` here — Task 6 wires that in, since the same cleanup must also run for a fatal frame error and for `stop()`/`destroy()` during the `Loading` window, and centralizing it avoids triplicating the cleanup steps.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run test/core/application-frame-loop.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full existing Application suite to confirm no regression**

Run: `pnpm vitest run test/core/application-start.test.ts test/core/application-frame-guard.test.ts test/core/application-loop.test.ts test/core/application-lifecycle.test.ts test/core/application-on-frame.test.ts`
Expected: PASS. `application-frame-guard.test.ts`'s `forceRunning()` helper sets `_status` directly without setting `_frameLoopActive` — confirm those tests still pass; if any fail because they now also need `_frameLoopActive = true`, that's expected and gets fixed in Task 7 (which touches that file directly) — note any such failures here but do not fix them in this task; move on only if they're the specific, expected `_frameLoopActive`-related ones you can name.

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/core/Application.ts test/core/application-frame-loop.test.ts
git commit -m "fix(core): decouple the frame loop's gate from _status via _frameLoopActive

Application.start() now starts the RAF loop before awaiting the initial
scene navigation, so a frame-driven SceneTransitionSession can progress on
the very first activation instead of deadlocking (definition spec §3.7)."
```

---

## Task 6: `_stopFrameLoop()` — fatal frame error, `stop()`, `destroy()` during `Loading`

**Files:**

- Modify: `src/core/Application.ts`
- Modify: `test/core/application-frame-guard.test.ts` (fix the now-expected `_frameLoopActive` gap from Task 5, Step 5)
- Test: `test/core/application-frame-loop.test.ts` (extend)

**Interfaces:**

- Consumes: `_frameLoopActive` (Task 5).
- Produces: `private _stopFrameLoop(): void`. Consumed by Task 7 (fatal error path), Task 8/9 (navigation abort).

**Verified directly against this worktree's pre-Slice-1 `Application.ts`:** `stop()` (lines 911–925) guards its entire body on `if (this._status === ApplicationStatus.Running)` — confirming the spec's claim (§3.7: "today's `stop()` only acts when `_status === Running`") is accurate, not just spec prose to take on faith. `destroy()` (1103–1138) calls `this.stop()` unconditionally as its first real step, so it inherits whatever `stop()`'s guard does — fixing `stop()` fixes both, no separate `destroy()`-specific change needed beyond re-verifying that call chain still holds after Slice 1–6.

- [ ] **Step 1: Update `application-frame-guard.test.ts`'s `forceRunning()` helper**

The existing helper only sets `_status`:

```ts
function forceRunning(app: Application): void {
  (app as unknown as Record<string, unknown>)['_status'] = ApplicationStatus.Running;
}
```

Change it to also set the new flag, since `update()`'s gate now reads `_frameLoopActive`:

```ts
function forceRunning(app: Application): void {
  const record = app as unknown as Record<string, unknown>;

  record['_status'] = ApplicationStatus.Running;
  record['_frameLoopActive'] = true;
}
```

- [ ] **Step 2: Run the frame-guard suite to confirm this alone restores the pre-Task-5 green baseline**

Run: `pnpm vitest run test/core/application-frame-guard.test.ts`
Expected: PASS — every test in this file drives frames via `app.update()` directly after calling `forceRunning(app)`, so once that helper sets both flags every existing assertion holds unchanged.

- [ ] **Step 3: Write the new failing tests for `_stopFrameLoop()`'s call sites**

```ts
// test/core/application-frame-loop.test.ts — append to the existing describe block
describe('_stopFrameLoop() — fatal frame error, stop(), destroy() during Loading', () => {
  test('a fatal frame error clears _frameLoopActive and cancels the pending RAF request before setting status Stopped', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });

    await app.start();
    (app.backend.flush as unknown as MockInstance).mockImplementation(() => {
      throw new Error('persistent failure');
    });

    app.update();
    app.update();
    app.update();

    expect(frameLoopActive(app)).toBe(false);
    expect(app.status).toBe(ApplicationStatus.Stopped);
    expect(cafSpy).toHaveBeenCalled();

    app.destroy();
  });

  test('stop() halts the loop even while _status is still Loading (mid-startup)', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });
    const startPromise = app.start().catch(() => undefined); // will reject — see next test

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(app.status).toBe(ApplicationStatus.Loading);
    expect(frameLoopActive(app)).toBe(true);

    app.stop();

    expect(frameLoopActive(app)).toBe(false);
    expect(app.status).toBe(ApplicationStatus.Stopped);

    await startPromise;
    app.destroy();
  });

  test('stop() is a no-op when the loop was never started (still Stopped)', () => {
    const app = new Application({ backend: { type: 'webgl2' } });

    expect(() => app.stop()).not.toThrow();
    expect(app.status).toBe(ApplicationStatus.Stopped);

    app.destroy();
  });

  test('destroy() during Loading also halts the loop (delegates to stop())', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });
    const startPromise = app.start().catch(() => undefined);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(frameLoopActive(app)).toBe(true);

    app.destroy();

    expect(frameLoopActive(app)).toBe(false);

    await startPromise;
  });
});
```

- [ ] **Step 4: Run to verify these fail**

Run: `pnpm vitest run test/core/application-frame-loop.test.ts`
Expected: FAIL — `_stopFrameLoop()` does not exist yet; `stop()` still gates on `_status === Running`, so calling it while `Loading` is a no-op today (the loop keeps running, `_frameLoopActive` stays `true`).

- [ ] **Step 5: Implement**

Add the private helper next to `_startFrameLoop()`:

```ts
  /**
   * Halt the per-frame loop: clear {@link Application._frameLoopActive},
   * cancel the pending RAF request, and stop the active/frame clocks. Called
   * from every place the loop can stop (fatal frame error, {@link
   * Application.stop}, {@link Application.destroy} during the `Loading`
   * window) so `_frameLoopActive` is the single source of truth everywhere,
   * not only where the loop starts (definition spec §3.7). Idempotent — a
   * second call while the loop is already stopped is a no-op. Deliberately
   * does NOT touch scene teardown (`scenes._clearScene()`/navigation abort)
   * — those are the caller's responsibility, since a fatal frame error must
   * NOT unload the active scene (see {@link Application._handleFrameError}'s
   * doc comment), while {@link Application.stop} explicitly does.
   */
  private _stopFrameLoop(): void {
    if (!this._frameLoopActive) {
      return;
    }

    this._frameLoopActive = false;
    cancelAnimationFrame(this._frameRequest);
    this._activeClock.stop();
    this._frameClock.stop();
  }
```

Update `_handleFrameError`'s fatal branch:

```ts
if (fatal) {
  cancelAnimationFrame(this._frameRequest);
  this._status = ApplicationStatus.Stopped;
  logger.error(`Frame loop halted after ${maxConsecutiveFrameErrors} consecutive frame errors.`, { source: 'core', error: normalized });
}
```

to:

```ts
if (fatal) {
  this._stopFrameLoop();
  this._status = ApplicationStatus.Stopped;
  logger.error(`Frame loop halted after ${maxConsecutiveFrameErrors} consecutive frame errors.`, { source: 'core', error: normalized });
}
```

Update `stop()`:

```ts
  public stop(): this {
    if (this._status === ApplicationStatus.Running) {
      this._status = ApplicationStatus.Halting;
      cancelAnimationFrame(this._frameRequest);
      void this.scenes._clearScene().catch((error: unknown) => {
        logger.error('Application.stop() failed to unload the active scene.', { source: 'Application', ...(error instanceof Error && { error }) });
        this.onError?.dispatch(error instanceof Error ? error : new Error(String(error)));
      });
      this._activeClock.stop();
      this._frameClock.stop();
      this._status = ApplicationStatus.Stopped;
    }

    return this;
  }
```

to:

```ts
  /**
   * Halt the per-frame loop, unload the active scene, and stop the active
   * + frame clocks. Leaves backend, input, audio, etc. intact — call
   * {@link Application.destroy} to release everything. Acts whenever the
   * frame loop is actually live (`_frameLoopActive`), including mid-`start()`
   * — not only while `_status` is `Running` (definition spec §3.7): a
   * transition-driven initial navigation may still be in flight, in which
   * case {@link SceneDirector._abortInFlightNavigation} (invoked internally
   * by scene teardown below) rejects it with a dedicated error rather than
   * leaving it to hang.
   */
  public stop(): this {
    if (!this._frameLoopActive) {
      return this;
    }

    if (this._status === ApplicationStatus.Running) {
      this._status = ApplicationStatus.Halting;
    }

    this._stopFrameLoop();

    void this.scenes._clearScene().catch((error: unknown) => {
      logger.error('Application.stop() failed to unload the active scene.', { source: 'Application', ...(error instanceof Error && { error }) });
      this.onError?.dispatch(error instanceof Error ? error : new Error(String(error)));
    });

    this._status = ApplicationStatus.Stopped;

    return this;
  }
```

(`destroy()` needs no change in this task — it already calls `this.stop()` unconditionally, which now itself acts whenever `_frameLoopActive` is `true`, regardless of `_status`.)

- [ ] **Step 6: Run to verify the new tests pass**

Run: `pnpm vitest run test/core/application-frame-loop.test.ts test/core/application-frame-guard.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full existing Application suite**

Run: `pnpm vitest run test/core/application-start.test.ts test/core/application-frame-guard.test.ts test/core/application-loop.test.ts test/core/application-lifecycle.test.ts test/core/application-on-frame.test.ts`
Expected: PASS. `application-lifecycle.test.ts`'s "stop(): onError dispatch on scene-teardown failure" tests force `_status = ApplicationStatus.Running` directly without setting `_frameLoopActive` (same gap `forceRunning()` had) — if those two tests now fail because `stop()` no-ops on `!_frameLoopActive`, update them the same way as Step 1 (set `_frameLoopActive = true` alongside `_status`) as part of this step, not as a separate task.

- [ ] **Step 8: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/core/Application.ts test/core/application-frame-loop.test.ts test/core/application-frame-guard.test.ts test/core/application-lifecycle.test.ts
git commit -m "fix(core): _stopFrameLoop() covers fatal errors, stop(), and destroy() during Loading

_frameLoopActive is now cleared consistently everywhere the loop can stop,
not only where it starts — stop()/destroy() now act during the Loading
startup window instead of silently no-op'ing (definition spec §3.7)."
```

---

## Task 7: `SceneDirector._abortInFlightNavigation()`

**Files:**

- Modify: `src/core/SceneDirector.ts`
- Modify: `src/core/SceneTypes.ts`
- Test: `test/core/scene-director.test.ts` (extend)

**Interfaces:**

- Consumes: whatever Slice 5 actually named its in-flight-navigation/session/claim-tracking internals — **read the "Assumed cross-slice API surface" section's "Low confidence" bullet before starting this task and adjust every private-field reference below to match the real code.**
- Produces: `SceneNavigationAbortedError` (new, `SceneTypes.ts`), `SceneDirector._abortInFlightNavigation(reason: Error): boolean` (`@internal`) — returns `true` if a navigation was actually in flight and got aborted, `false` if there was nothing to abort (the ordinary case — no navigation in flight at all, or a navigation already past its atomic commit boundary with no session left to interrupt). Consumed by Task 8 (`Application._stopFrameLoop()` wiring).

This generalizes the existing pattern already shipped in `SceneDirector._dispose()` (pre-Slice-1 baseline, lines 452–460): rejecting `this._transition`'s pending promise when the Director is destroyed mid-transition. Read that method **in its post-Slice-5 form** first — Slice 5 will have replaced the old `{ type: 'fade' }`-only `_transition: ActiveFadeTransition | null` field with something session-based; this task's `_abortInFlightNavigation()` should read naturally as "the same idea `_dispose()` already does for its one hardcoded case, generalized to any `SceneTransitionSession` and reachable outside of full teardown."

- [ ] **Step 1: Add `SceneNavigationAbortedError`**

In `src/core/SceneTypes.ts`, add after the existing `ConcurrentSceneNavigationError`:

```ts
/**
 * Thrown to reject a `change()`/`restore()`/`unload()` call whose transition
 * session was still in flight when the {@link Application} frame loop
 * stopped (a fatal frame error, or `stop()`/`destroy()` called mid-transition)
 * — the session cannot progress without frame callbacks, so the navigation
 * is aborted rather than left to hang forever (definition spec §3.7). Any
 * claimed preload/retained entry is restored, not discarded — see spec
 * §3.5.1's claim-restoration rules.
 */
export class SceneNavigationAbortedError extends Error {
  public constructor() {
    super('Navigation aborted: the application stopped, or was destroyed, while a transition was in flight.');
    this.name = 'SceneNavigationAbortedError';
  }
}
```

- [ ] **Step 2: Write the failing tests**

Re-verify the exact shape of `SceneDirector`'s post-Slice-5 in-flight-navigation state before writing these — the stub setup below assumes a `_activeSession: SceneTransitionSession | null` field and a way to observe the pending navigation promise's rejection; adjust to match. The test harness below uses whatever helper this file's existing tests already use to construct a real `SceneDirector` + a controllable `SceneTransition` — reuse it rather than reinventing scaffolding.

```ts
// test/core/scene-director.test.ts — new describe block appended before the final closing brace
describe('SceneDirector._abortInFlightNavigation() (Slice 7 Group B)', () => {
  // A controllable SceneTransition whose session never reaches `done` on its
  // own — the test drives (or withholds) commit()/destroy() explicitly.
  class ControllableSceneTransition extends SceneTransition {
    public lastEnvironment: SceneTransitionEnvironment | null = null;
    public sessionDestroyed = false;

    public override getRequirements(): SceneTransitionRequirements {
      return { outgoingFrame: 'none', currentFrame: 'direct' };
    }

    protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
      this.lastEnvironment = environment;

      const self = this;
      return {
        placement: 'screen',
        done: false,
        update(): void {},
        render(): void {},
        destroy(): void {
          self.sessionDestroyed = true;
        },
      };
    }
  }

  test('returns false when no navigation is in flight (nothing to abort)', async () => {
    const app = createApplicationStub();
    const director = new SceneDirector(app);

    expect(director._abortInFlightNavigation(new SceneNavigationAbortedError())).toBe(false);
  });

  test('rejects the pending change() promise with the given reason when a transition session is mid-flight, pre-commit', async () => {
    const app = createApplicationStub();
    const director = new SceneDirector(app, { test: TestScene });
    const transition = new ControllableSceneTransition();

    const navigationPromise = director.change(TestScene, { transition });
    // Let the transition's session actually begin (createSession() called synchronously
    // by beginSession(), so `transition.lastEnvironment` is already set at this point).
    await Promise.resolve();

    const reason = new SceneNavigationAbortedError();
    const aborted = director._abortInFlightNavigation(reason);

    expect(aborted).toBe(true);
    expect(transition.sessionDestroyed).toBe(true);
    await expect(navigationPromise).rejects.toBe(reason);
  });

  test('a second _abortInFlightNavigation() call after one already ran is a no-op (returns false, does not double-destroy the session)', async () => {
    const app = createApplicationStub();
    const director = new SceneDirector(app, { test: TestScene });
    const transition = new ControllableSceneTransition();

    const navigationPromise = director.change(TestScene, { transition }).catch(() => undefined);
    await Promise.resolve();

    director._abortInFlightNavigation(new SceneNavigationAbortedError());
    const destroyCallsAfterFirstAbort = transition.sessionDestroyed;

    expect(director._abortInFlightNavigation(new SceneNavigationAbortedError())).toBe(false);
    expect(transition.sessionDestroyed).toBe(destroyCallsAfterFirstAbort);

    await navigationPromise;
  });

  test('does nothing to a navigation that already committed (no session left to interrupt)', async () => {
    const app = createApplicationStub();
    const director = new SceneDirector(app, { test: TestScene });

    await director.change(TestScene); // no transition — commits synchronously via the direct fast path

    expect(director._abortInFlightNavigation(new SceneNavigationAbortedError())).toBe(false);
  });
});
```

**Note on the test scaffolding above:** `createApplicationStub`, `TestScene`, and the exact `director.change(...)` navigation method name are placeholders for whatever this file's existing tests already establish (grep `test/core/scene-director.test.ts` for its own helper names before writing this step for real — do not invent parallel ones). `SceneTransition`, `SceneTransitionEnvironment`, `SceneTransitionRequirements`, `SceneTransitionSession`, `SceneNavigationAbortedError` need real imports at the top of the file matching Slice 5's actual export locations.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run test/core/scene-director.test.ts -t "_abortInFlightNavigation"`
Expected: FAIL — `_abortInFlightNavigation` is not a method on `SceneDirector`.

- [ ] **Step 4: Implement**

Re-verify the exact field names before writing this for real. The shape below assumes: a private field tracking the currently in-flight `SceneTransitionSession` (called `_activeSession` here), a private field or closure holding the pending navigation's `reject` function and an `aborted` boolean (this plan assumes these live alongside whatever Slice 5 already tracks for the in-flight navigation — e.g. the same object `_runWithNavigation`'s promise executor closes over), and the existing `_retained`/`_preloaded`-claim-restoration helpers Slice 2/4 already built for the ordinary pre-commit-failure path (§3.5.1) — reuse those, do not reimplement claim restoration from scratch here.

```ts
  /**
   * @internal Abort whatever navigation is currently in flight, if any:
   * destroy its `SceneTransitionSession` (idempotent — a no-op if the
   * session already settled), release any pooled textures / close the input
   * gate, restore a claimed preload or retained entry exactly as an ordinary
   * pre-commit failure would (spec §3.5.1), mark the navigation `aborted`,
   * and reject its pending promise with `reason`. Returns `true` if there
   * was actually something to abort, `false` if no navigation was in flight
   * or it had already progressed past the atomic commit boundary (nothing
   * left to interrupt — spec §3.5's commit boundary "never throws" applies
   * here too: an already-committed navigation is not undone). Called by
   * {@link Application._stopFrameLoop} whenever the frame loop stops, since
   * a frame-driven session cannot otherwise progress without `update()`
   * calls (spec §3.7).
   */
  public _abortInFlightNavigation(reason: Error): boolean {
    const session = this._activeSession;
    const pendingNavigation = this._pendingNavigation;

    if (session === null || pendingNavigation === null || pendingNavigation.aborted || pendingNavigation.committed) {
      return false;
    }

    pendingNavigation.aborted = true;
    this._activeSession = null;

    try {
      session.destroy();
    } catch (error) {
      logger.error('SceneDirector: transition session threw during abort-triggered destroy().', {
        source: 'SceneDirector',
        ...(error instanceof Error && { error }),
      });
    }

    this._releaseTransitionResources();
    this._restoreClaimForAbortedNavigation(pendingNavigation);
    pendingNavigation.reject(reason);

    return true;
  }
```

Wire `pendingNavigation.aborted` into the same `await`-then-check-before-crossing-the-commit-boundary point `_runWithNavigation`'s `prepare()` continuation already has (spec §3.7's "What if `commit()` was already requested and `prepare()` is still asynchronously in flight" paragraph) — locate that continuation in the real, merged code and add an `if (pendingNavigation.aborted) { ...destroyFailedActivation() or normal destroy()+unload() per §3.5.1... ; return; }` guard immediately after the `await prepare()`/`await scope.prepare(...)` line, before any commit-boundary work runs. The exact insertion point depends on Slice 2/5's real control flow — this plan cannot show it verbatim without guessing at code that doesn't exist yet; find the single `await` that currently leads straight into the atomic-commit steps and insert the guard immediately after it returns.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run test/core/scene-director.test.ts -t "_abortInFlightNavigation"`
Expected: PASS.

- [ ] **Step 6: Run the full SceneDirector suite**

Run: `pnpm vitest run test/core/scene-director.test.ts`
Expected: PASS — no regression in the existing retention/navigation/dispose tests.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/core/SceneDirector.ts src/core/SceneTypes.ts test/core/scene-director.test.ts
git commit -m "feat(core): SceneDirector._abortInFlightNavigation() — generalizes the
existing in-flight-transition-rejection pattern from _dispose() to any point
the frame loop can stop, restoring claimed preload/retained entries per
spec §3.5.1 rather than discarding them (definition spec §3.7)."
```

---

## Task 8: Wire `Application._stopFrameLoop()` to the abort mechanism

**Files:**

- Modify: `src/core/Application.ts`
- Modify: `test/core/application-lifecycle.test.ts` (mocked-`SceneDirector` harness)

**Interfaces:**

- Consumes: `SceneDirector._abortInFlightNavigation(reason)` (Task 7), `SceneNavigationAbortedError` (Task 7).
- Produces: `_stopFrameLoop()` now calls `this.scenes._abortInFlightNavigation(...)`; `stop()` skips its own `_clearScene()` call when the abort already handled everything (nothing committed to unload).

This task is the Application-side half of Task 7's contract, tested with `application-lifecycle.test.ts`'s existing fully-mocked-`SceneDirector` harness (`loadHarness()`) — it proves `Application` calls the hook correctly and respects its return value, without needing the real `SceneDirector`/session machinery to exist yet. Task 9 is the real, integration-level version of the same behavior.

- [ ] **Step 1: Extend the mocked `sceneDirector` object in the harness**

In `test/core/application-lifecycle.test.ts`, find `const sceneDirector = { update: vi.fn(), setScene: vi.fn()..., _clearScene: vi.fn()..., destroy: vi.fn() };` (rename `setScene` to whatever Slice 1–6 actually calls it by execution time) and add:

```ts
const sceneDirector = {
  update: vi.fn(),
  setScene: vi.fn().mockResolvedValue(undefined),
  _clearScene: vi.fn().mockResolvedValue(undefined),
  _abortInFlightNavigation: vi.fn().mockReturnValue(false),
  destroy: vi.fn(),
};
```

- [ ] **Step 2: Write the failing tests**

```ts
// test/core/application-lifecycle.test.ts — new describe block
describe('_stopFrameLoop() -> scenes._abortInFlightNavigation() wiring (Slice 7 Group B)', () => {
  test('stop() calls scenes._abortInFlightNavigation() before its own _clearScene() call', async () => {
    const { Application, ApplicationStatus, sceneDirector } = await loadHarness();
    const app = new Application({ backend: { type: 'webgl2' } });
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    try {
      await app.start();
      (app as unknown as Record<string, unknown>)['_status'] = ApplicationStatus.Running;

      app.stop();

      expect(sceneDirector._abortInFlightNavigation).toHaveBeenCalledTimes(1);
      expect(sceneDirector._clearScene).toHaveBeenCalledTimes(1);
    } finally {
      rafSpy.mockRestore();
    }
  });

  test('stop() skips its own _clearScene() call when abort already handled an in-flight navigation', async () => {
    const { Application, ApplicationStatus, sceneDirector } = await loadHarness();
    sceneDirector._abortInFlightNavigation.mockReturnValue(true);

    const app = new Application({ backend: { type: 'webgl2' } });
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    try {
      await app.start();
      (app as unknown as Record<string, unknown>)['_status'] = ApplicationStatus.Running;

      app.stop();

      expect(sceneDirector._abortInFlightNavigation).toHaveBeenCalledTimes(1);
      expect(sceneDirector._clearScene).not.toHaveBeenCalled();
    } finally {
      rafSpy.mockRestore();
    }
  });

  test('_abortInFlightNavigation() is called with a SceneNavigationAbortedError', async () => {
    const { Application, ApplicationStatus, sceneDirector } = await loadHarness();
    const app = new Application({ backend: { type: 'webgl2' } });
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    try {
      await app.start();
      (app as unknown as Record<string, unknown>)['_status'] = ApplicationStatus.Running;

      app.stop();

      const [reason] = sceneDirector._abortInFlightNavigation.mock.calls[0] as [Error];
      expect(reason.name).toBe('SceneNavigationAbortedError');
    } finally {
      rafSpy.mockRestore();
    }
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run test/core/application-lifecycle.test.ts -t "_stopFrameLoop"`
Expected: FAIL — `scenes._abortInFlightNavigation` is never called; `_clearScene()` always runs unconditionally.

- [ ] **Step 4: Implement**

Import `SceneNavigationAbortedError` in `Application.ts`'s existing `./SceneTypes`-style import block (adjust to wherever it actually re-exports from, per Task 7):

```ts
import { type AnySceneConstructor, type InferSceneData, SceneNavigationAbortedError, type SetSceneArgs } from './SceneTypes';
```

Update `_stopFrameLoop()` to return whether an in-flight navigation was aborted, and update `stop()` to use that:

```ts
  private _stopFrameLoop(): boolean {
    if (!this._frameLoopActive) {
      return false;
    }

    this._frameLoopActive = false;
    cancelAnimationFrame(this._frameRequest);
    this._activeClock.stop();
    this._frameClock.stop();

    return this.scenes._abortInFlightNavigation(new SceneNavigationAbortedError());
  }
```

Update `stop()`:

```ts
  public stop(): this {
    if (!this._frameLoopActive) {
      return this;
    }

    if (this._status === ApplicationStatus.Running) {
      this._status = ApplicationStatus.Halting;
    }

    const navigationAborted = this._stopFrameLoop();

    if (!navigationAborted) {
      void this.scenes._clearScene().catch((error: unknown) => {
        logger.error('Application.stop() failed to unload the active scene.', { source: 'Application', ...(error instanceof Error && { error }) });
        this.onError?.dispatch(error instanceof Error ? error : new Error(String(error)));
      });
    }

    this._status = ApplicationStatus.Stopped;

    return this;
  }
```

Update `_handleFrameError`'s fatal branch, which currently ignores `_stopFrameLoop()`'s return value (correct — a fatal frame error must never call `_clearScene()`/unload the scene per the existing, deliberate design; it only needs the loop halted and the abort mechanism run for whatever the return value's side effect already did):

```ts
if (fatal) {
  this._stopFrameLoop();
  this._status = ApplicationStatus.Stopped;
  logger.error(`Frame loop halted after ${maxConsecutiveFrameErrors} consecutive frame errors.`, { source: 'core', error: normalized });
}
```

(unchanged from Task 6 — `_stopFrameLoop()`'s new `boolean` return is simply unused here, which is fine; TypeScript does not require consuming a non-`void` return value.)

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run test/core/application-lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full existing Application suite**

Run: `pnpm vitest run test/core/application-start.test.ts test/core/application-frame-guard.test.ts test/core/application-loop.test.ts test/core/application-lifecycle.test.ts test/core/application-on-frame.test.ts test/core/application-frame-loop.test.ts`
Expected: PASS. `application-start.test.ts` and `application-frame-loop.test.ts` use a **real** `SceneDirector` (only the backend is mocked) — `scenes._abortInFlightNavigation` there is the real Task 7 implementation, which returns `false` whenever nothing is in flight (the common case in those files' tests), so `_clearScene()` still runs exactly as before for them.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/core/Application.ts test/core/application-lifecycle.test.ts
git commit -m "fix(core): Application.stop() routes through SceneDirector._abortInFlightNavigation()

stop()/destroy() (and a fatal frame error, via the shared _stopFrameLoop())
now abort whatever scene navigation is in flight instead of only handling
the fully-committed case, closing the gap where stopping mid-transition
left the pending change()/restore() promise hanging forever."
```

---

## Task 9: Integration test — abort mechanism with a real `SceneDirector` and a custom test `SceneTransition`

**Files:**

- Test: `test/core/application-frame-loop.test.ts` (extend)

**Interfaces:**

- Consumes: real `Application`, real `SceneDirector` (only WebGL2/WebGPU backends mocked, matching `application-start.test.ts`'s pattern), a custom `SceneTransition` subclass with a controllable `update()` (per this slice's brief — this test needs no built-in transition to exist, proving Group B stands on its own).

This is the test the prompt calls out explicitly: prove the full contract end-to-end using nothing but the base `SceneTransition` class (already shipped by Slice 5), without depending on Group A's `FadeSceneTransition`/`SlideSceneTransition`/`CrossFadeSceneTransition` at all.

- [ ] **Step 1: Write the failing test**

```ts
// test/core/application-frame-loop.test.ts — append to the file
describe('End-to-end: stopping the app mid-transition aborts the in-flight navigation (real SceneDirector)', () => {
  test('app.stop() called while the initial start() navigation is mid-transition rejects start() with SceneNavigationAbortedError', async () => {
    class HangingSceneTransition extends SceneTransition {
      public sessionDestroyed = false;

      public override getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'direct' };
      }

      protected override createSession(_environment: SceneTransitionEnvironment): SceneTransitionSession {
        // Never calls environment.commit() and never reaches `done` on its
        // own — a stand-in for "a transition whose session is still
        // mid-flight when something stops the app," driven only by the test.
        const self = this;
        return {
          placement: 'screen',
          done: false,
          update(): void {},
          render(): void {},
          destroy(): void {
            self.sessionDestroyed = true;
          },
        };
      }
    }

    class TargetScene extends Scene {}

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { target: TargetScene } });
    const transition = new HangingSceneTransition();

    const startPromise = app.start(TargetScene, { transition });

    // Let the loop start and the transition's session begin — but never
    // drive it to commit/done (that's the whole point of this test).
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(app.status).toBe(ApplicationStatus.Loading);

    app.stop();

    await expect(startPromise).rejects.toThrow(/navigation aborted/i);
    expect(transition.sessionDestroyed).toBe(true);
    expect(app.status).toBe(ApplicationStatus.Stopped);
    expect(app.scenes.currentScene).toBeNull();

    app.destroy();
  });
});
```

Import `SceneTransition`, `SceneTransitionEnvironment`, `SceneTransitionRequirements`, `SceneTransitionSession`, `Scene` at the top of the file, matching their real, merged export locations.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/application-frame-loop.test.ts -t "mid-transition"`
Expected: FAIL until Tasks 5–8 are all in place — if this is being run as a standalone task after those already landed, it should already pass; if it fails, that's a real integration gap between Tasks 5–8's unit-level tests and the real Slice-5 session machinery, and must be root-caused before moving on (do not adjust the test's assertions to match broken behavior — the contract described in Task 7/8 is authoritative).

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm vitest run test/core/application-frame-loop.test.ts`
Expected: PASS, all tests in the file (Tasks 5, 6, and this one).

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add test/core/application-frame-loop.test.ts
git commit -m "test(core): end-to-end coverage for aborting a mid-transition app.start()"
```

---

## Task 10: Capstone — a real `FadeSceneTransition` drives the very first `start()` call end-to-end

**Files:**

- Test: `test/core/application-transition-startup.test.ts` (new)

**Interfaces:**

- Consumes: `Application` (Group B), `FadeSceneTransition` (Group A Task 1), `Scene`.

This is the integration test that ties Group A and Group B together — the scenario the prompt calls out as "what makes 'use a real Fade on the very first `start()` call' actually work end-to-end." Nothing in Tasks 1–9 individually proves this; each proves its own half of the contract in isolation.

- [ ] **Step 1: Write the failing test**

```ts
// test/core/application-transition-startup.test.ts (new file)
import { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import { FadeSceneTransition } from '#core/transitions/FadeSceneTransition';

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return {
      onContextLost: { add: vi.fn() },
      onContextRestored: { add: vi.fn() },
      onRenderError: { add: vi.fn(), destroy: vi.fn() },
      stats: {
        frameTimeMs: 0,
        drawCalls: 0,
        culledNodes: 0,
        submittedNodes: 0,
        batches: 0,
        renderPasses: 0,
        renderTargetChanges: 0,
        frame: 0,
        rawFrameDeltaMs: 0,
      },
      resetStats: vi.fn().mockReturnThis(),
      flush: vi.fn().mockReturnThis(),
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      resize: vi.fn().mockReturnThis(),
      view: { getBounds: vi.fn().mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600 }) },
      renderTarget: {},
      backendType: 'webgl2',
      setView: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      execute: vi.fn().mockReturnThis(),
      clear: vi.fn().mockReturnThis(),
      pushScissorRect: vi.fn().mockReturnThis(),
      popScissorRect: vi.fn().mockReturnThis(),
      acquireRenderTexture: vi.fn(),
      releaseRenderTexture: vi.fn().mockReturnThis(),
      composeWithAlphaMask: vi.fn().mockReturnThis(),
    };
  }),
}));

describe('Application.start() with a real FadeSceneTransition (Slice 7 capstone)', () => {
  test('the very first start() call, transitioned, resolves once the fade completes and the scene is active', async () => {
    class TitleScene extends Scene {}

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { title: TitleScene } });
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    try {
      const startPromise = app.start(TitleScene, { transition: new FadeSceneTransition(undefined, { duration: 40 }) });

      let settled = false;
      void startPromise.then(() => {
        settled = true;
      });

      // Drive frames until the transition's session reaches `done` and
      // start() resolves — bounded so a real deadlock (the bug this slice
      // fixes) fails the test instead of hanging it.
      for (let tick = 0; tick < 200 && !settled; tick++) {
        const callback = rafCallbacks[rafCallbacks.length - 1];

        if (callback === undefined) {
          break;
        }

        callback(tick * 16);
        await Promise.resolve();
      }

      await startPromise;

      expect(app.scenes.currentScene).toBeInstanceOf(TitleScene);
      expect(app.status).toBe(2); // ApplicationStatus.Running — avoid importing the enum just for one literal check
    } finally {
      rafSpy.mockRestore();
      app.destroy();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run test/core/application-transition-startup.test.ts`
Expected: FAIL before Tasks 1 and 5–8 land (either `FadeSceneTransition` doesn't exist, or the fixed 200-tick loop times out waiting for `settled` because the pre-Slice-7-Group-B `start()` deadlocks on the very first frame-driven transition — this is the exact bug the spec's §3.7 describes).

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm vitest run test/core/application-transition-startup.test.ts`
Expected: PASS, once all of Tasks 1–8 are complete.

- [ ] **Step 4: Run the entire `test/core` suite**

Run: `pnpm vitest run test/core`
Expected: PASS, 0 failures — no regression anywhere in `src/core`.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: `pnpm docs:api:generate`**

Run: `pnpm docs:api:generate`
Expected: regenerates the API doc JSON for the three new public classes (`FadeSceneTransition`, `SlideSceneTransition`, `CrossFadeSceneTransition`) and their `*Options` types. Review the diff — it should be additive only (new symbols), no unrelated churn.

- [ ] **Step 7: Commit**

```bash
git add test/core/application-transition-startup.test.ts docs/api
git commit -m "test(core): capstone — a real FadeSceneTransition drives the very first start() call end-to-end

Proves Group A (FadeSceneTransition) and Group B (the _frameLoopActive
startup fix) together: the very first Application.start() call, transitioned,
no longer deadlocks on the first frame-driven session (definition spec §3.7)."
```

---

## Self-Review

**1. Spec coverage.**

- §8 (`FadeSceneTransition`, `CrossFadeSceneTransition`, `SlideSceneTransition`) → Tasks 1, 3, 2 respectively. ✓
- §3.9/§3.9.1 (`PhasedSceneTransition` authoring surface, requirements lattice, `direct → texture` promotion) → consumed (not re-implemented) by Tasks 1/2; Task 2's `push` mode documents the one-frame commit-boundary gap the phase-split model implies, matching §3.9's own "placement pop" precedent for known, documented phase-composition limitations. ✓
- §3.9.2 (why CrossFade is a full `SceneTransition`, not phase-split) → Task 3's design-decision note cites this directly and implements accordingly. ✓
- §3.6 (`placement`) → `FadeSceneTransition`/`PhasedSceneTransition` defaults to `'screen'` (Task 1, inherited); `CrossFadeSceneTransition` hardcodes `'scene'` (Task 3). ✓
- §3.7 (all four "must clear `_frameLoopActive` everywhere the loop can stop" call sites: fatal frame error, `stop()` during `Loading`, `destroy()` during `Loading`, `_activeClock` timing) → Task 5 (`_activeClock` timing, `start()` sequencing), Task 6 (fatal frame error, `stop()`, `destroy()` via `stop()`'s delegation). ✓
- §3.7's in-flight-navigation-abort mechanism (session destroy, claim restoration per §3.5.1, dedicated rejection error) → Tasks 7 (SceneDirector-side), 8 (Application-side wiring), 9 (end-to-end proof with a custom transition, independent of Group A). ✓
- §3.5.1 claim restoration (preload/retained entries restored, not discarded) → Task 7 explicitly delegates to "the existing `_retained`/`_preloaded`-claim-restoration helpers Slice 2/4 already built for the ordinary pre-commit-failure path," reusing rather than reimplementing, per the Global Constraint against speculative complexity. ✓
- The prompt's explicit integration capstone ("use a real Fade on the very first `start()` call") → Task 10. ✓
- Preserving the current hardcoded fade's exact visual defaults (duration/color/easing) → Task 1's design-decision note cites the verified pre-Slice-1 constants (`defaultFadeTransitionDuration = 220`, `Color.black`, linear/un-eased) directly from `SceneDirector.ts`. ✓

**2. Placeholder scan.** No "TBD"/"implement later"/"add appropriate error handling" phrases. Every code step has complete, concrete code — including the three places genuine cross-slice uncertainty exists (`RenderingContext.drawOverlay`/`drawTexture`'s exact name, `SceneDirector`'s internal navigation-abort field names), which are handled by writing complete code against a named, explicit assumption and instructing the implementer where and how to adjust it — not by leaving a blank. Task 7's Step 4 is the one step in this plan that cannot show a fully verbatim diff (the exact insertion point for the `aborted` check inside Slice 5's `prepare()` continuation), because that code does not exist yet anywhere to quote; it names exactly what to find and what to insert, which is the most concrete this plan can honestly be about code from a future, not-yet-written slice.

**3. Type consistency.** `FadeSceneTransition`/`SlideSceneTransition`/`CrossFadeSceneTransition` constructor signatures in Tasks 1–3 match their usage in Task 10 (`new FadeSceneTransition(undefined, { duration: 40 })`) and their barrel exports in Task 4. `SceneDirector._abortInFlightNavigation(reason: Error): boolean` is defined once in Task 7 and consumed with the identical signature in Tasks 8 and 9. `_startFrameLoop()`/`_stopFrameLoop()` are introduced in Tasks 5/6 with consistent `void`/`boolean` return types across their one signature change (Task 8 changes `_stopFrameLoop()`'s return type from `void` to `boolean` — Task 6 introduces it as `void`; Task 8's diff explicitly shows the full updated signature, not just a delta, so there is no lingering `void` reference after Task 8 lands). `SceneNavigationAbortedError` is defined once in Task 7 and imported/thrown with the same name/message pattern in Task 8; Task 9's assertion (`rejects.toThrow(/navigation aborted/i)`) matches the message text defined in Task 7's Step 1 case-insensitively.
