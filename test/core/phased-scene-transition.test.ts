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
