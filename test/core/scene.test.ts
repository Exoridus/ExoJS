import { Scene } from '#core/Scene';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderingContext } from '#rendering/RenderingContext';
import { createRenderStats, resetRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';

class DummyDrawable extends Drawable {}

const createRuntime = (): { backend: RenderBackend; context: RenderingContext } => {
  const renderTarget = new RenderTarget(200, 200, true);
  const stats = createRenderStats();

  const backend: RenderBackend = {
    backendType: RenderBackendType.WebGl2,
    stats,
    renderTarget,
    get view() {
      return renderTarget.view;
    },
    async initialize() {
      return this;
    },
    clear() {
      return this;
    },
    resize(width: number, height: number) {
      renderTarget.resize(width, height);

      return this;
    },
    setView(view) {
      renderTarget.setView(view);

      return this;
    },
    setRenderTarget() {
      return this;
    },
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    composeWithAlphaMask() {
      return this;
    },
    acquireRenderTexture(width: number, height: number) {
      return new RenderTexture(width, height);
    },
    releaseRenderTexture(texture: RenderTexture) {
      texture.destroy();

      return this;
    },
    draw() {
      return this;
    },
    drawInstanced() {
      return this;
    },
    resetStats() {
      resetRenderStats(stats);

      return this;
    },
    execute() {
      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      renderTarget.destroy();
    },
  };

  const context = new RenderingContext(backend);

  return { backend, context };
};

describe('Scene', () => {
  test('owns a root container by default', () => {
    const scene = new Scene();

    expect(scene.root).toBeInstanceOf(Container);
  });

  test('addChild and removeChild delegate to root', () => {
    const scene = new Scene();
    const child = new DummyDrawable();

    scene.addChild(child);

    expect(scene.root.children).toContain(child);
    expect(child.parent).toBe(scene.root);

    scene.removeChild(child);

    expect(scene.root.children).not.toContain(child);
    expect(child.parent).toBeNull();
  });

  // CONTRACT — do not weaken without an explicit identity decision.
  //
  // Scene.root is a structural ownership/traversal anchor. The
  // framework must never auto-render it. This test pins down the
  // "explicit instead of implicit" identity rule: Scene.draw is the
  // user's selection point, and rendering happens only when the user
  // calls context.render() on the chosen subtree.
  //
  // See docs/api/Scene.md#scene-root-contract.
  test('draw(context) remains the explicit rendering orchestration point', () => {
    const { backend, context } = createRuntime();
    const scene = new Scene();
    const world = new Container();
    const ui = new Container();
    const worldSprite = new DummyDrawable();
    const uiSprite = new DummyDrawable();
    const backendDraw = vi.spyOn(backend, 'draw');

    world.addChild(worldSprite);
    ui.addChild(uiSprite);
    scene.addChild(world);
    scene.addChild(ui);

    scene.draw = (ctx): void => {
      ctx.render(world);
    };

    scene.draw(context);

    expect(backendDraw).toHaveBeenCalledWith(worldSprite);
    expect(backendDraw).not.toHaveBeenCalledWith(uiSprite);
  });

  // #313: Scene.app is a throwing non-null accessor (like Scene.inputs/tweens/
  // loader), not `Application | null` — the framework guarantees attachment
  // before any lifecycle hook, so scene code never needs a null guard.
  describe('app accessor (#313)', () => {
    const fakeApp = { id: 'app' } as unknown as import('#core/Application').Application;

    test('throws when accessed before the scene is attached', () => {
      const scene = new Scene();

      expect(() => scene.app).toThrow(/unavailable before the scene is attached to an Application/);
    });

    test('returns the Application once attached', () => {
      const scene = new Scene();

      scene.app = fakeApp;

      expect(scene.app).toBe(fakeApp);
    });

    test('attached reflects lifecycle without throwing (the legitimate null check)', () => {
      const scene = new Scene();

      expect(scene.attached).toBe(false);

      scene.app = fakeApp;
      expect(scene.attached).toBe(true);

      scene.app = null;
      expect(scene.attached).toBe(false);
      expect(() => scene.app).toThrow();
    });
  });
});
