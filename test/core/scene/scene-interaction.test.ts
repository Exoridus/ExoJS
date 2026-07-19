import type { Application } from '#core/Application';
import { SceneInteraction } from '#core/scene/SceneInteraction';
import type { RenderNode } from '#rendering/RenderNode';

const createAppStub = (): Application =>
  ({
    interaction: {
      attachRoot: vi.fn(),
      detachRoot: vi.fn(),
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
