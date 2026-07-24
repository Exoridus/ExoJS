import { PhasedSceneTransition } from '#core/PhasedSceneTransition';
import { SceneTransition, type SceneTransitionSession } from '#core/SceneTransition';
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

  test('unload never consults the registry default, even though it would otherwise apply', () => {
    const resolved = resolveSceneTransitionSelection('unload', undefined, registryDefault);

    expect(resolved).toBeNull();
  });

  test('unload still honors an explicit call-site transition', () => {
    const resolved = resolveSceneTransitionSelection('unload', callSiteTransition, registryDefault);

    expect(resolved).toBe(callSiteTransition);
  });

  test('restore consults the registry default exactly like change', () => {
    const resolved = resolveSceneTransitionSelection('restore', undefined, registryDefault);

    expect(resolved).toBe(registryDefault);
  });
});
