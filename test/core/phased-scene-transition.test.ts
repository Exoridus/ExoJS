import { Ease } from '#animation/Easing';
import { mergeSceneTransitionRequirements, PhasedSceneTransition, type PhasedSceneTransitionOptions, type SceneTransitionPhaseRequirements } from '#core/PhasedSceneTransition';
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
