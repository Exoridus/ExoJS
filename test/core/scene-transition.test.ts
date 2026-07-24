import {
  SceneTransition,
  type SceneTransitionContext,
  type SceneTransitionEnvironment,
  type SceneTransitionFrame,
  SceneTransitionLifecycleError,
  type SceneTransitionRequirements,
  type SceneTransitionSession,
} from '#core/SceneTransition';
import type { Time } from '#core/Time';
import type { RenderingContext } from '#rendering/RenderingContext';

class NoopSession implements SceneTransitionSession {
  public done = false;
  public placement: 'scene' | 'screen' = 'screen';
  public destroyCallCount = 0;

  public update(_delta: Time): void {}
  public render(_context: RenderingContext, _frame: SceneTransitionFrame): void {}
  public destroy(): void {
    this.destroyCallCount++;
  }
}

class FakeTransition extends SceneTransition {
  public lastEnvironment: SceneTransitionEnvironment | null = null;
  public readonly session = new NoopSession();

  public getRequirements(_context: SceneTransitionContext): SceneTransitionRequirements {
    return { outgoingFrame: 'none', currentFrame: 'direct' };
  }

  protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    this.lastEnvironment = environment;

    return this.session;
  }
}

const context: SceneTransitionContext = { operation: 'change', hasOutgoingScene: false, hasIncomingScene: true };

describe('SceneTransition', () => {
  test('beginSession() dispatches to createSession() and returns its session', () => {
    const transition = new FakeTransition();
    const environment: SceneTransitionEnvironment = {
      context,
      commitRequested: false,
      committed: false,
      commit() {},
    };

    const session = transition.beginSession(environment);

    expect(session).toBe(transition.session);
    expect(transition.lastEnvironment).toBe(environment);
  });

  test('is not directly instantiable (abstract)', () => {
    // Compile-time guarantee — `new SceneTransition()` is a type error. This
    // test documents the contract at the value level: only a subclass can be
    // constructed.
    expect(() => new FakeTransition()).not.toThrow();
  });
});

describe('SceneTransitionLifecycleError', () => {
  test.each([
    ['commit-reentrant', /commit\(\) was called a second time/],
    ['done-before-commit', /done became true while.*committed was still false/],
    ['aborted', /destroyed while a SceneTransitionSession was still active/],
  ] as const)('constructs with the %s reason and a matching message', (reason, messagePattern) => {
    const error = new SceneTransitionLifecycleError(reason);

    expect(error.reason).toBe(reason);
    expect(error.name).toBe('SceneTransitionLifecycleError');
    expect(error.message).toMatch(messagePattern);
    expect(error).toBeInstanceOf(Error);
  });
});
