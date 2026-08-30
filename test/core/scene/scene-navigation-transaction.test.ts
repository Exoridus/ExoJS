import { Scene } from '#core/Scene';
import { SceneNavigationTransaction } from '#core/scene/SceneNavigationTransaction';
import type { SceneScope } from '#core/SceneScope';
import { SceneState } from '#core/SceneState';
import type { AnySceneConstructor } from '#core/sceneTypes';
import { Signal } from '#core/Signal';

class FakeTarget extends Scene {}

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
  describe('prepareOutgoingDisposition()', () => {
    test('with no outgoing scope, returns a null pendingStopScene', () => {
      const retained = new Map<AnySceneConstructor, SceneScope>();
      const onStopScene = new Signal<[Scene]>();
      const onStateChange = new Signal<[SceneState, SceneState, Scene]>();
      const reportError = vi.fn();
      const transaction = new SceneNavigationTransaction(retained, onStopScene, onStateChange, reportError);

      const result = transaction.prepareOutgoingDisposition(null, false);

      expect(result.pendingStopScene).toBeNull();
    });

    test('suspendCurrent: true suspends the outgoing scope, retains it, and dispatches onStateChange — no pending onStopScene', () => {
      const retained = new Map<AnySceneConstructor, SceneScope>();
      const onStopScene = new Signal<[Scene]>();
      const onStateChange = new Signal<[SceneState, SceneState, Scene]>();
      const reportError = vi.fn();
      const transaction = new SceneNavigationTransaction(retained, onStopScene, onStateChange, reportError);
      const scope = makeFakeScope(SceneState.Active);
      const onStateChangeSpy = vi.fn();

      onStateChange.add(onStateChangeSpy);

      const result = transaction.prepareOutgoingDisposition({ scope, target: FakeTarget }, true);

      expect(scope.suspend).toHaveBeenCalledTimes(1);
      expect(retained.get(FakeTarget)).toBe(scope);
      expect(onStateChangeSpy).toHaveBeenCalledWith(SceneState.Active, SceneState.Suspended, scope.scene);
      expect(result.pendingStopScene).toBeNull();
    });

    test('suspendCurrent: false returns the scope as pendingStopScene WITHOUT starting its teardown', () => {
      const retained = new Map<AnySceneConstructor, SceneScope>();
      const onStopScene = new Signal<[Scene]>();
      const onStateChange = new Signal<[SceneState, SceneState, Scene]>();
      const reportError = vi.fn();
      const transaction = new SceneNavigationTransaction(retained, onStopScene, onStateChange, reportError);
      const scope = makeFakeScope(SceneState.Active);

      const result = transaction.prepareOutgoingDisposition({ scope, target: FakeTarget }, false);

      expect(scope.destroy).not.toHaveBeenCalled();
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

      expect(() => transaction.prepareOutgoingDisposition({ scope, target: FakeTarget }, true)).not.toThrow();
      expect(retained.get(FakeTarget)).toBe(scope);
      expect(reportError).toHaveBeenCalledWith(failure);
    });

    test('does not start teardown until beginOutgoingTeardown is called', async () => {
      const onStopScene = new Signal<[Scene]>();
      const onStateChange = new Signal<[SceneState, SceneState, Scene]>();
      const reportError = vi.fn();
      const transaction = new SceneNavigationTransaction(new Map(), onStopScene, onStateChange, reportError);
      const scope = makeFakeScope(SceneState.Active);

      const { pendingStopScene } = transaction.prepareOutgoingDisposition({ scope, target: FakeTarget }, false);

      expect(scope.destroy).not.toHaveBeenCalled();

      transaction.dispatchStopScene(pendingStopScene);
      await transaction.beginOutgoingTeardown(pendingStopScene);

      expect(scope.destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispatchStopScene()', () => {
    test('with null, is a no-op', () => {
      const onStopScene = new Signal<[Scene]>();
      const dispatchSpy = vi.spyOn(onStopScene, 'dispatch');
      const transaction = new SceneNavigationTransaction(new Map(), onStopScene, new Signal<[SceneState, SceneState, Scene]>(), vi.fn());

      expect(() => transaction.dispatchStopScene(null)).not.toThrow();
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    test('with a scope, dispatches onStopScene with its scene', () => {
      const onStopScene = new Signal<[Scene]>();
      const onStopSceneSpy = vi.fn();
      const transaction = new SceneNavigationTransaction(new Map(), onStopScene, new Signal<[SceneState, SceneState, Scene]>(), vi.fn());
      const scope = makeFakeScope(SceneState.Destroying);

      onStopScene.add(onStopSceneSpy);
      transaction.dispatchStopScene(scope);

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

      expect(() => transaction.dispatchStopScene(scope)).not.toThrow();
      expect(reportError).toHaveBeenCalledWith(failure);
    });
  });

  describe('beginOutgoingTeardown()', () => {
    test('with null, resolves immediately without tearing anything down', () => {
      const transaction = new SceneNavigationTransaction(new Map(), new Signal<[Scene]>(), new Signal<[SceneState, SceneState, Scene]>(), vi.fn());

      return expect(transaction.beginOutgoingTeardown(null)).resolves.toBeUndefined();
    });

    test('with a scope, starts its permanent teardown and returns the settling promise', async () => {
      const transaction = new SceneNavigationTransaction(new Map(), new Signal<[Scene]>(), new Signal<[SceneState, SceneState, Scene]>(), vi.fn());
      const scope = makeFakeScope(SceneState.Destroying);

      const teardown = transaction.beginOutgoingTeardown(scope);

      expect(scope.destroy).toHaveBeenCalledTimes(1);
      await expect(teardown).resolves.toBeUndefined();
    });
  });
});
