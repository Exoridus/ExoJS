import type { Application } from '#core/Application';
import { Scene } from '#core/Scene';
import type { SceneScope } from '#core/SceneScope';
import { SceneState } from '#core/SceneState';
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

const fakeApp = { id: 'app' } as unknown as Application;

/** A fake `SceneScope` exposing recognizable sentinel objects for every facility, so tests can assert `Scene.<facility>` forwards to it without depending on real SceneScope wiring (covered separately in scene-scope.test.ts). */
const makeFakeScope = (): SceneScope<void> =>
  ({
    systems: { sentinel: 'systems' },
    loader: { sentinel: 'loader' },
    inputs: { sentinel: 'inputs' },
    interaction: { sentinel: 'interaction' },
    tweens: { sentinel: 'tweens' },
    audio: { sentinel: 'audio' },
    state: SceneState.Active,
  }) as unknown as SceneScope<void>;

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

  // Scene.app is a throwing non-null accessor (like Scene.inputs/tweens/
  // loader), not `Application | null` — the framework guarantees attachment
  // before any lifecycle hook, so scene code never needs a null guard.
  describe('app accessor', () => {
    test('throws when accessed before the scene is attached', () => {
      const scene = new Scene();

      expect(() => scene.app).toThrow(/unavailable before the scene is attached to an Application/);
    });

    test('returns the Application once attached', () => {
      const scene = new Scene();

      scene._attach(fakeApp, makeFakeScope());

      expect(scene.app).toBe(fakeApp);
    });

    test('attached reflects lifecycle without throwing (the legitimate null check)', () => {
      const scene = new Scene();

      expect(scene.attached).toBe(false);

      scene._attach(fakeApp, makeFakeScope());
      expect(scene.attached).toBe(true);

      scene._teardownInternals();
      expect(scene.attached).toBe(false);
      expect(() => scene.app).toThrow();
    });
  });

  // Every scene-bound facility getter is attach-gated: it throws a clear,
  // property-naming error before attachment and forwards to the owning
  // SceneScope once attached (definition §4.3, impl-spec §7.2).
  describe('facility getters', () => {
    const facilities = ['systems', 'loader', 'inputs', 'interaction', 'tweens', 'audio', 'state'] as const;

    test.each(facilities)('%s throws before the scene is attached, naming the property', name => {
      const scene = new Scene();

      expect(() => scene[name]).toThrow(new RegExp(`Scene\\.${name} is unavailable`));
    });

    test.each(facilities.filter(name => name !== 'state'))('%s forwards to the owning SceneScope once attached', name => {
      const scene = new Scene();
      const scope = makeFakeScope();

      scene._attach(fakeApp, scope);

      expect(scene[name]).toBe(scope[name]);
    });

    test('state forwards to the owning SceneScope once attached', () => {
      const scene = new Scene();
      const scope = makeFakeScope();

      scene._attach(fakeApp, scope);

      expect(scene.state).toBe(SceneState.Active);
    });
  });

  describe('destroy()', () => {
    test('is an empty user hook by default — no infrastructure side effects', () => {
      const scene = new Scene();

      expect(() => scene.destroy()).not.toThrow();
    });
  });
});
