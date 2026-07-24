import { Ease } from '#animation/Easing';
import {
  composePhasedSceneTransition,
  mergeSceneTransitionRequirements,
  PhasedSceneTransition,
  type PhasedSceneTransitionOptions,
  resolvePhasedSelection,
  type SceneTransitionPhaseContext,
  type SceneTransitionPhaseRequirements,
} from '#core/PhasedSceneTransition';
import type { SceneTransitionContext, SceneTransitionEnvironment, SceneTransitionFrame } from '#core/SceneTransition';
import { Time } from '#core/Time';

const fakeContext: SceneTransitionContext = { operation: 'change', hasOutgoingScene: true, hasIncomingScene: true };

// A minimal concrete subclass declaring NO constructor of its own — the
// exact shape a real FlashTransition-style author would write. If
// PhasedSceneTransition's constructor were `protected`, this class would
// inherit that modifier and `new MinimalPhase()` below would fail to
// compile (verified separately in Task 2's typecheck step; the point of
// this test is that it runs and passes at all, proving construction
// succeeded from outside the module).
class MinimalPhase extends PhasedSceneTransition {
  protected getPhaseRequirements(): SceneTransitionPhaseRequirements {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }
}

describe('PhasedSceneTransition', () => {
  test('a concrete subclass with no constructor of its own is directly instantiable (public constructor)', () => {
    const instance = new MinimalPhase();

    expect(instance).toBeInstanceOf(PhasedSceneTransition);
  });

  test('constructor options default duration=220, easing=Ease.linear, placement="screen"', () => {
    const instance = new MinimalPhase();

    expect(instance.duration).toBe(220);
    expect(instance.easing).toBe(Ease.linear);
    expect(instance.placement).toBe('screen');
  });

  test('constructor options override the defaults', () => {
    const options: PhasedSceneTransitionOptions = { duration: 500, easing: Ease.quadIn, placement: 'scene' };
    const instance = new MinimalPhase(options);

    expect(instance.duration).toBe(500);
    expect(instance.easing).toBe(Ease.quadIn);
    expect(instance.placement).toBe('scene');
  });

  test('getRequirementsForPhase() is callable from outside the class hierarchy and forwards to the phase hook', () => {
    const instance = new MinimalPhase();

    // directorLikeCaller does not extend PhasedSceneTransition — this call
    // only compiles/works because getRequirementsForPhase() is public.
    const directorLikeCaller = (phase: PhasedSceneTransition): unknown => phase.getRequirementsForPhase('exit', fakeContext);

    expect(directorLikeCaller(instance)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
  });

  test("getRequirements() merges the instance's own exit/enter requirements (no promotion when they match)", () => {
    const instance = new MinimalPhase();

    expect(instance.getRequirements(fakeContext)).toEqual({ outgoingFrame: 'none', currentFrame: 'direct' });
  });
});

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

  protected getPhaseRequirements(): SceneTransitionPhaseRequirements {
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
    const context: SceneTransitionPhaseContext = {
      phase: 'exit',
      progress: 1,
      easedProgress: 1,
      presence: 0,
      frame: fakeFrame,
      rendering: fakeRenderingContext,
    };

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

  test("session.placement reflects the instance's own placement throughout (single-instance case)", () => {
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

class DirectPhase extends RecordingPhase {
  protected override getPhaseRequirements(): SceneTransitionPhaseRequirements {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }
}

class TexturePhase extends RecordingPhase {
  protected override getPhaseRequirements(): SceneTransitionPhaseRequirements {
    return { outgoingFrame: 'snapshot', currentFrame: 'texture' };
  }
}

describe('composePhasedSceneTransition', () => {
  test("merges the two instances' own requirements via getRequirementsForPhase (§3.9.1)", () => {
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

  test("session.placement switches from the exit instance's to the enter instance's at the commit boundary", () => {
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
