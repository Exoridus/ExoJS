import type { Application } from '#core/Application';
import { SceneInteraction } from '#core/scene/SceneInteraction';
import { SceneState } from '#core/SceneState';
import type { RenderNode } from '#rendering/RenderNode';

const createAppStub = (): Application =>
  ({
    interaction: {
      attachRoot: vi.fn(),
      detachRoot: vi.fn(),
      pushScope: vi.fn(),
      popScope: vi.fn(),
    },
  }) as unknown as Application;

const fakeRoot = (): RenderNode => ({ id: Symbol('root') }) as unknown as RenderNode;

describe('SceneInteraction', () => {
  test('observe() delegates to app.interaction.attachRoot', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const root = fakeRoot();

    interaction.observe(root);

    expect(app.interaction.attachRoot).toHaveBeenCalledWith(root);
  });

  test('release() detaches the observed root and is idempotent', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const root = fakeRoot();

    const observation = interaction.observe(root);

    observation.release();
    expect(app.interaction.detachRoot).toHaveBeenCalledWith(root);
    expect(app.interaction.detachRoot).toHaveBeenCalledTimes(1);

    observation.release();
    expect(app.interaction.detachRoot).toHaveBeenCalledTimes(1); // idempotent — no second detach
  });

  test('destroy() on the observation is an alias for release()', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const root = fakeRoot();

    const observation = interaction.observe(root);

    observation.destroy();
    expect(app.interaction.detachRoot).toHaveBeenCalledWith(root);
  });

  test('destroy() on the facade releases every remaining observation', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const rootA = fakeRoot();
    const rootB = fakeRoot();

    interaction.observe(rootA);
    interaction.observe(rootB);

    interaction.destroy();

    expect(app.interaction.detachRoot).toHaveBeenCalledWith(rootA);
    expect(app.interaction.detachRoot).toHaveBeenCalledWith(rootB);
    expect(app.interaction.detachRoot).toHaveBeenCalledTimes(2);
  });

  test('destroy() does not re-release an already-released observation', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const root = fakeRoot();

    const observation = interaction.observe(root);

    observation.release();
    interaction.destroy();

    expect(app.interaction.detachRoot).toHaveBeenCalledTimes(1);
  });

  test('suspend() detaches every tracked observation without removing its tracking', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const root = fakeRoot();

    interaction.observe(root);
    interaction.suspend();

    expect(app.interaction.detachRoot).toHaveBeenCalledWith(root);
  });

  test('resume() reattaches every observation suspend() detached', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const root = fakeRoot();

    interaction.observe(root);
    interaction.suspend();
    interaction.resume();

    expect(app.interaction.attachRoot).toHaveBeenCalledTimes(2); // once for observe(), once for resume()
    expect(app.interaction.attachRoot).toHaveBeenLastCalledWith(root);
  });

  test('suspend() is idempotent — a second call does not detach again', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);

    interaction.observe(fakeRoot());
    interaction.suspend();
    (app.interaction.detachRoot as MockInstance).mockClear();

    interaction.suspend();

    expect(app.interaction.detachRoot).not.toHaveBeenCalled();
  });

  test('resume() before any suspend() is a no-op', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);

    interaction.observe(fakeRoot());
    (app.interaction.attachRoot as MockInstance).mockClear();

    interaction.resume();

    expect(app.interaction.attachRoot).not.toHaveBeenCalled();
  });

  test('an observation released while suspended is not reattached by resume()', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const root = fakeRoot();

    const observation = interaction.observe(root);
    interaction.suspend();
    observation.release();
    (app.interaction.attachRoot as MockInstance).mockClear();

    interaction.resume();

    expect(app.interaction.attachRoot).not.toHaveBeenCalled();
  });
});

describe('SceneInteraction.scope()', () => {
  test('capture() pushes the root onto the manager capture stack', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const root = fakeRoot();

    interaction.scope(root);

    expect(app.interaction.pushScope).toHaveBeenCalledWith(root);
  });

  test('release() pops the top capture and is idempotent', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const scope = interaction.scope(fakeRoot());

    scope.release();
    expect(app.interaction.popScope).toHaveBeenCalledTimes(1);
    expect(scope.active).toBe(false);

    scope.release();
    expect(app.interaction.popScope).toHaveBeenCalledTimes(1); // idempotent
  });

  test('destroy() on the capture is an alias for release()', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const scope = interaction.scope(fakeRoot());

    scope.destroy();
    expect(app.interaction.popScope).toHaveBeenCalledTimes(1);
  });

  test('nested captures: releasing the top restores the previous one (net stack effect)', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const rootA = fakeRoot();
    const rootB = fakeRoot();

    const scopeA = interaction.scope(rootA);
    const scopeB = interaction.scope(rootB);

    expect(app.interaction.pushScope).toHaveBeenNthCalledWith(1, rootA);
    expect(app.interaction.pushScope).toHaveBeenNthCalledWith(2, rootB);

    scopeB.release();

    // Popped B, nothing needed re-pushing below it (A was never popped).
    expect(app.interaction.popScope).toHaveBeenCalledTimes(1);
    expect(scopeA.active).toBe(true);
  });

  test('releasing a non-top capture is one targeted pop — no rebuild of the ones above it', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const rootA = fakeRoot();
    const rootB = fakeRoot();
    const rootC = fakeRoot();

    const scopeA = interaction.scope(rootA);
    const scopeB = interaction.scope(rootB);
    const scopeC = interaction.scope(rootC);

    (app.interaction.pushScope as MockInstance).mockClear();

    scopeA.release(); // out-of-order: A is at the bottom, B and C are above it

    // Exactly one targeted popScope call for A's own token — InteractionManager
    // finds and splices that entry itself, wherever it sits; B and C, still
    // active, are never popped or re-pushed to make room for it.
    expect(app.interaction.popScope).toHaveBeenCalledTimes(1);
    expect(app.interaction.pushScope).not.toHaveBeenCalled();
    expect(scopeA.active).toBe(false);
    expect(scopeB.active).toBe(true);
    expect(scopeC.active).toBe(true);
  });

  test('destroy() on the facade releases every remaining capture', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);

    interaction.scope(fakeRoot());
    interaction.scope(fakeRoot());

    interaction.destroy();

    expect(app.interaction.popScope).toHaveBeenCalledTimes(2);
  });

  test('suspend() pops every active capture; resume() re-pushes them in original order', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const rootA = fakeRoot();
    const rootB = fakeRoot();

    interaction.scope(rootA);
    interaction.scope(rootB);
    (app.interaction.pushScope as MockInstance).mockClear();

    interaction.suspend();
    expect(app.interaction.popScope).toHaveBeenCalledTimes(2);

    interaction.resume();
    expect(app.interaction.pushScope).toHaveBeenNthCalledWith(1, rootA);
    expect(app.interaction.pushScope).toHaveBeenNthCalledWith(2, rootB);
  });

  test('releasing a non-top capture while suspended only updates local bookkeeping; resume() re-pushes the corrected stack', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const rootA = fakeRoot();
    const rootB = fakeRoot();
    const rootC = fakeRoot();

    const scopeA = interaction.scope(rootA);
    const scopeB = interaction.scope(rootB);
    const scopeC = interaction.scope(rootC);

    interaction.suspend();
    (app.interaction.popScope as MockInstance).mockClear();
    (app.interaction.pushScope as MockInstance).mockClear();

    scopeB.release(); // out-of-order release while suspended: must not touch the live manager at all

    expect(app.interaction.popScope).not.toHaveBeenCalled();
    expect(app.interaction.pushScope).not.toHaveBeenCalled();
    expect(scopeA.active).toBe(true);
    expect(scopeB.active).toBe(false);
    expect(scopeC.active).toBe(true);

    interaction.resume();

    // resume() re-pushes the corrected, deduplicated stack from scratch: A then C, not a stale/duplicated sequence.
    expect(app.interaction.pushScope).toHaveBeenCalledTimes(2);
    expect(app.interaction.pushScope).toHaveBeenNthCalledWith(1, rootA);
    expect(app.interaction.pushScope).toHaveBeenNthCalledWith(2, rootC);
  });
});

describe('SceneInteraction — dormancy (registration while not Active)', () => {
  test('observe() while Ready tracks the observation but never calls app.interaction.attachRoot', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Ready);
    const root = fakeRoot();

    interaction.observe(root);

    expect(app.interaction.attachRoot).not.toHaveBeenCalled();
  });

  test('releasing an observation created while dormant never calls app.interaction.detachRoot', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Ready);
    const root = fakeRoot();

    const observation = interaction.observe(root);
    observation.release();

    expect(app.interaction.detachRoot).not.toHaveBeenCalled();
  });

  test('resume() attaches every observation registered while dormant, in registration order', () => {
    const app = createAppStub();
    let state: SceneState = SceneState.Ready;
    const interaction = new SceneInteraction(app, () => state);
    const rootA = fakeRoot();
    const rootB = fakeRoot();

    interaction.observe(rootA);
    interaction.observe(rootB);

    expect(app.interaction.attachRoot).not.toHaveBeenCalled();

    state = SceneState.Active;
    interaction.resume();

    expect(app.interaction.attachRoot).toHaveBeenNthCalledWith(1, rootA);
    expect(app.interaction.attachRoot).toHaveBeenNthCalledWith(2, rootB);
  });

  test('resume() is idempotent — calling it twice does not re-attach an already-attached observation', () => {
    const app = createAppStub();
    let state: SceneState = SceneState.Ready;
    const interaction = new SceneInteraction(app, () => state);
    const root = fakeRoot();

    interaction.observe(root);

    state = SceneState.Active;
    interaction.resume();
    interaction.resume();

    expect(app.interaction.attachRoot).toHaveBeenCalledTimes(1);
  });

  test('capture() while Suspended (a new registration while already dormant) buffers instead of pushing', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Suspended);
    const root = fakeRoot();

    interaction.scope(root);

    expect(app.interaction.pushScope).not.toHaveBeenCalled();
  });

  test('suspend() then resume() re-pushes captures in original order', () => {
    const app = createAppStub();
    let state: SceneState = SceneState.Active;
    const interaction = new SceneInteraction(app, () => state);
    const rootA = fakeRoot();
    const rootB = fakeRoot();

    interaction.scope(rootA);
    interaction.scope(rootB);
    (app.interaction.pushScope as MockInstance).mockClear();

    state = SceneState.Suspended;
    interaction.suspend();
    expect(app.interaction.popScope).toHaveBeenCalledTimes(2);

    state = SceneState.Active;
    interaction.resume();

    expect(app.interaction.pushScope).toHaveBeenNthCalledWith(1, rootA);
    expect(app.interaction.pushScope).toHaveBeenNthCalledWith(2, rootB);
  });

  test('releasing a still-dormant capture never touches the app-wide capture stack', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Ready);
    const root = fakeRoot();

    const scope = interaction.scope(root);
    scope.release();

    expect(app.interaction.pushScope).not.toHaveBeenCalled();
    expect(app.interaction.popScope).not.toHaveBeenCalled();
  });
});
