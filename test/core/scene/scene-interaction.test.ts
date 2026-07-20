import type { Application } from '#core/Application';
import { SceneInteraction } from '#core/scene/SceneInteraction';
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
    const interaction = new SceneInteraction(app);
    const root = fakeRoot();

    interaction.observe(root);

    expect(app.interaction.attachRoot).toHaveBeenCalledWith(root);
  });

  test('release() detaches the observed root and is idempotent', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app);
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
    const interaction = new SceneInteraction(app);
    const root = fakeRoot();

    const observation = interaction.observe(root);

    observation.destroy();
    expect(app.interaction.detachRoot).toHaveBeenCalledWith(root);
  });

  test('destroy() on the facade releases every remaining observation', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app);
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
    const interaction = new SceneInteraction(app);
    const root = fakeRoot();

    const observation = interaction.observe(root);

    observation.release();
    interaction.destroy();

    expect(app.interaction.detachRoot).toHaveBeenCalledTimes(1);
  });

  test('suspend()/resume() do not throw and do not detach observations (scaffold for a later slice)', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app);

    interaction.observe(fakeRoot());

    expect(() => interaction.suspend()).not.toThrow();
    expect(() => interaction.resume()).not.toThrow();
    expect(app.interaction.detachRoot).not.toHaveBeenCalled();
  });
});

describe('SceneInteraction.capture()', () => {
  test('capture() pushes the root onto the manager capture stack', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app);
    const root = fakeRoot();

    interaction.capture(root);

    expect(app.interaction.pushInputCapture).toHaveBeenCalledWith(root);
  });

  test('release() pops the top capture and is idempotent', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app);
    const capture = interaction.capture(fakeRoot());

    capture.release();
    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(1);
    expect(capture.active).toBe(false);

    capture.release();
    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(1); // idempotent
  });

  test('destroy() on the capture is an alias for release()', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app);
    const capture = interaction.capture(fakeRoot());

    capture.destroy();
    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(1);
  });

  test('nested captures: releasing the top restores the previous one (net stack effect)', () => {
    const app = createAppStub();
    const interaction = new SceneInteraction(app);
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
    const interaction = new SceneInteraction(app);
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
    const interaction = new SceneInteraction(app);

    interaction.capture(fakeRoot());
    interaction.capture(fakeRoot());

    interaction.destroy();

    expect(app.interaction.popInputCapture).toHaveBeenCalledTimes(2);
  });
});
