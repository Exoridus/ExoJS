import type { Application } from '#core/Application';
import { SceneInteraction } from '#core/scene/SceneInteraction';
import { SceneState } from '#core/SceneState';
import type { RenderNode } from '#rendering/RenderNode';

const createAppStub = (): Application =>
  ({
    interaction: {
      attachRoot: vi.fn(),
      detachRoot: vi.fn(),
      pushInputCapture: vi.fn(),
      popInputCapture: vi.fn(),
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

describe('SceneInteraction.capture()', () => {
  test('capture() pushes the root onto the manager capture stack', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const root = fakeRoot();

    interaction.capture(root);

    expect(app.interaction.pushInputCapture).toHaveBeenCalledWith(root);
  });

  test('release() pops the top capture and is idempotent', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const capture = interaction.capture(fakeRoot());

    capture.release();
    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(1);
    expect(capture.active).toBe(false);

    capture.release();
    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(1); // idempotent
  });

  test('destroy() on the capture is an alias for release()', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const capture = interaction.capture(fakeRoot());

    capture.destroy();
    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(1);
  });

  test('nested captures: releasing the top restores the previous one (net stack effect)', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const rootA = fakeRoot();
    const rootB = fakeRoot();

    const captureA = interaction.capture(rootA);
    const captureB = interaction.capture(rootB);

    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(1, rootA);
    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(2, rootB);

    captureB.release();

    // Popped B, nothing needed re-pushing below it (A was never popped).
    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(1);
    expect(captureA.active).toBe(true);
  });

  test('releasing a non-top capture pops down to it, removes it, and re-pushes the ones above in order', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const rootA = fakeRoot();
    const rootB = fakeRoot();
    const rootC = fakeRoot();

    const captureA = interaction.capture(rootA);
    const captureB = interaction.capture(rootB);
    const captureC = interaction.capture(rootC);

    (app.interaction.pushInputCapture as MockInstance).mockClear();

    captureA.release(); // out-of-order: A is at the bottom, B and C are above it

    // Pop C, pop B, pop A (removing A), then re-push B, then C, restoring relative order.
    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(3);
    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(1, rootB);
    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(2, rootC);
    expect(captureA.active).toBe(false);
    expect(captureB.active).toBe(true);
    expect(captureC.active).toBe(true);
  });

  test('destroy() on the facade releases every remaining capture', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);

    interaction.capture(fakeRoot());
    interaction.capture(fakeRoot());

    interaction.destroy();

    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(2);
  });

  test('suspend() pops every active capture; resume() re-pushes them in original order', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const rootA = fakeRoot();
    const rootB = fakeRoot();

    interaction.capture(rootA);
    interaction.capture(rootB);
    (app.interaction.pushInputCapture as MockInstance).mockClear();

    interaction.suspend();
    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(2);

    interaction.resume();
    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(1, rootA);
    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(2, rootB);
  });

  test('releasing a non-top capture while suspended only updates local bookkeeping; resume() re-pushes the corrected stack', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Active);
    const rootA = fakeRoot();
    const rootB = fakeRoot();
    const rootC = fakeRoot();

    const captureA = interaction.capture(rootA);
    const captureB = interaction.capture(rootB);
    const captureC = interaction.capture(rootC);

    interaction.suspend();
    (app.interaction.popInputCapture as MockInstance).mockClear();
    (app.interaction.pushInputCapture as MockInstance).mockClear();

    captureB.release(); // out-of-order release while suspended: must not touch the live manager at all

    expect(app.interaction.popInputCapture).not.toHaveBeenCalled();
    expect(app.interaction.pushInputCapture).not.toHaveBeenCalled();
    expect(captureA.active).toBe(true);
    expect(captureB.active).toBe(false);
    expect(captureC.active).toBe(true);

    interaction.resume();

    // resume() re-pushes the corrected, deduplicated stack from scratch: A then C, not a stale/duplicated sequence.
    expect(app.interaction.pushInputCapture).toHaveBeenCalledTimes(2);
    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(1, rootA);
    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(2, rootC);
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

    interaction.capture(root);

    expect(app.interaction.pushInputCapture).not.toHaveBeenCalled();
  });

  test('suspend() then resume() re-pushes captures in original order', () => {
    const app = createAppStub();
    let state: SceneState = SceneState.Active;
    const interaction = new SceneInteraction(app, () => state);
    const rootA = fakeRoot();
    const rootB = fakeRoot();

    interaction.capture(rootA);
    interaction.capture(rootB);
    (app.interaction.pushInputCapture as MockInstance).mockClear();

    state = SceneState.Suspended;
    interaction.suspend();
    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(2);

    state = SceneState.Active;
    interaction.resume();

    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(1, rootA);
    expect(app.interaction.pushInputCapture).toHaveBeenNthCalledWith(2, rootB);
  });

  test('releasing a still-dormant capture never touches the app-wide capture stack', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app, () => SceneState.Ready);
    const root = fakeRoot();

    const capture = interaction.capture(root);
    capture.release();

    expect(app.interaction.pushInputCapture).not.toHaveBeenCalled();
    expect(app.interaction.popInputCapture).not.toHaveBeenCalled();
  });
});
