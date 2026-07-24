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
