/**
 * A constructor that throws hands the caller nothing to call `destroy()` on,
 * so everything it had already built has to be released on the way out. These
 * tests drive a real `Application` (only the WebGL2 backend is mocked — jsdom
 * has no GL context) and assert both halves of that contract: the original
 * error propagates untouched, and every subsystem built before the failure is
 * torn down in reverse construction order.
 */
import { AnimationManager } from '#animation/AnimationManager';
import { TweenManager } from '#animation/TweenManager';
import { Loader } from '#assets/Loader';
import { AudioManager } from '#audio/AudioManager';
import { Application } from '#core/Application';
import { SceneDirector } from '#core/SceneDirector';
import type { System } from '#core/System';
import { SystemRegistry } from '#core/SystemRegistry';
import type { ApplicationSystemBinding, AssetBinding, Extension } from '#extensions/Extension';
import { InputManager } from '#input/InputManager';
import { InteractionManager } from '#input/InteractionManager';
import { BrowserPlatform } from '#platform/BrowserPlatform';
import type { PlatformAdapter, PlatformSubscription } from '#platform/PlatformAdapter';
import { RenderingContext } from '#rendering/RenderingContext';

const { destroyOrder } = vi.hoisted(() => ({ destroyOrder: [] as string[] }));

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return {
      onContextLost: { add: vi.fn(), destroy: vi.fn() },
      onContextRestored: { add: vi.fn(), destroy: vi.fn() },
      onRenderError: { add: vi.fn(), destroy: vi.fn() },
      stats: { frameTimeMs: 0, rawFrameDeltaMs: 0 },
      clearColor: { copy: vi.fn() },
      resetStats: vi.fn().mockReturnThis(),
      flush: vi.fn().mockReturnThis(),
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(() => void destroyOrder.push('backend')),
      resize: vi.fn().mockReturnThis(),
      view: { getBounds: vi.fn() },
      renderTarget: {},
      backendType: 'webgl2',
      setView: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      execute: vi.fn().mockReturnThis(),
      clear: vi.fn().mockReturnThis(),
      pushScissorRect: vi.fn().mockReturnThis(),
      popScissorRect: vi.fn().mockReturnThis(),
      acquireRenderTexture: vi.fn(),
      releaseRenderTexture: vi.fn().mockReturnThis(),
      composeWithAlphaMask: vi.fn().mockReturnThis(),
    };
  }),
}));

/** Record `label` when this prototype's `destroy()` runs, then run the real one. */
const recordDestroy = (prototype: { destroy: () => void }, label: string): void => {
  const original = prototype.destroy;

  vi.spyOn(prototype, 'destroy').mockImplementation(function (this: object) {
    destroyOrder.push(label);
    original.call(this);
  });
};

/** Minimal recording adapter — enough surface to construct an `Application`. */
const createRecordingPlatform = (): PlatformAdapter & { readonly calls: string[]; readonly visibilityListenerCount: number } => {
  const calls: string[] = [];
  const visibilityListeners = new Set<(visible: boolean) => void>();

  return {
    calls,
    get visibilityListenerCount(): number {
      return visibilityListeners.size;
    },
    surfaceFocused: false,
    documentVisible: true,
    focusSurface: () => undefined,
    getSurfaceMetrics: () => ({ left: 0, top: 0, width: 800, height: 600, backingWidth: 800, backingHeight: 600 }),
    setCursor: () => undefined,
    setTouchAction: () => undefined,
    capturePointer: () => undefined,
    releasePointer: () => undefined,
    pollGamepads: () => [],
    onVisibilityChange(listener: (visible: boolean) => void): PlatformSubscription {
      visibilityListeners.add(listener);

      return () => void visibilityListeners.delete(listener);
    },
    requestFrame: () => 1,
    cancelFrame: () => undefined,
    onSurfaceEvent: () => () => undefined,
    onWindowEvent: () => () => undefined,
    destroy: () => void calls.push('destroy'),
  };
};

/** An extension whose last app-system binding throws — the real failure mode. */
const throwingSystemExtension = (error: Error, before?: ApplicationSystemBinding): Extension => {
  const failing: ApplicationSystemBinding = {
    create: (): never => {
      throw error;
    },
  };

  return { id: 'rollback-probe', systems: before === undefined ? [failing] : [before, failing] };
};

beforeEach(() => {
  destroyOrder.length = 0;
  vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as ReturnType<typeof requestAnimationFrame>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Application construction rollback', () => {
  test('the error thrown by an extension binding propagates unchanged', () => {
    const failure = new Error('binding exploded');
    let caught: unknown;

    try {
      new Application({ backend: { type: 'webgl2' }, extensions: [throwingSystemExtension(failure)] });
    } catch (error) {
      caught = error;
    }

    // Same instance — not wrapped, not replaced by a teardown error.
    expect(caught).toBe(failure);
  });

  test('every subsystem built before the failure is destroyed, in reverse construction order', () => {
    recordDestroy(BrowserPlatform.prototype, 'platform');
    recordDestroy(Loader.prototype, 'loader');
    recordDestroy(RenderingContext.prototype, 'rendering');
    recordDestroy(InputManager.prototype, 'input');
    recordDestroy(InteractionManager.prototype, 'interaction');
    recordDestroy(SceneDirector.prototype, 'scenes');
    recordDestroy(SystemRegistry.prototype, 'systems');
    recordDestroy(AnimationManager.prototype, 'animations');
    recordDestroy(TweenManager.prototype, 'tweens');
    recordDestroy(AudioManager.prototype, 'audio');

    expect(() => new Application({ backend: { type: 'webgl2' }, extensions: [throwingSystemExtension(new Error('boom'))] })).toThrow('boom');

    expect(destroyOrder).toEqual([
      // App-level registry first: extension systems are the last thing built
      // and may read the core managers from their own destroy().
      'systems',
      'animations',
      'tweens',
      'audio',
      // Then the constructor-built subsystems, newest first.
      'scenes',
      'interaction',
      'input',
      'rendering',
      'backend',
      'loader',
      'platform',
    ]);
  });

  test('a system materialised before the failing binding is destroyed', () => {
    const destroyed = vi.fn();
    const earlier: System = { update: vi.fn(), destroy: destroyed };

    expect(
      () =>
        new Application({
          backend: { type: 'webgl2' },
          extensions: [throwingSystemExtension(new Error('boom'), { create: () => earlier })],
        }),
    ).toThrow('boom');

    expect(destroyed).toHaveBeenCalledTimes(1);
  });

  test('an injected platform adapter is left alive, but its visibility subscription is released', () => {
    const platform = createRecordingPlatform();

    expect(() => new Application({ backend: { type: 'webgl2' }, platform, extensions: [throwingSystemExtension(new Error('boom'))] })).toThrow('boom');

    // Not ours to destroy — the caller injected it and may still be using it.
    expect(platform.calls).not.toContain('destroy');
    // But the subscription we took out on it would otherwise keep this dead
    // Application reachable from a live adapter.
    expect(platform.visibilityListenerCount).toBe(0);
  });

  test('a failure before the backend exists rolls back what does exist, without tripping over the unbuilt rest', () => {
    recordDestroy(BrowserPlatform.prototype, 'platform');
    recordDestroy(Loader.prototype, 'loader');

    const ctor = class Duplicate {} as unknown as AssetBinding['ctor'];
    const binding: AssetBinding = { ctor, create: () => ({}) as never };
    const extension: Extension = { id: 'duplicate-asset', assets: [binding, binding] };

    expect(() => new Application({ backend: { type: 'webgl2' }, extensions: [extension] })).toThrow(/already registered/);

    // Backend, rendering, input, interaction and scenes were never built, so
    // they must not appear — and must not throw on an unassigned field either.
    expect(destroyOrder).toEqual(['loader', 'platform']);
  });

  test('successful construction destroys nothing', () => {
    recordDestroy(BrowserPlatform.prototype, 'platform');
    recordDestroy(Loader.prototype, 'loader');
    recordDestroy(RenderingContext.prototype, 'rendering');
    recordDestroy(InputManager.prototype, 'input');
    recordDestroy(InteractionManager.prototype, 'interaction');
    recordDestroy(SceneDirector.prototype, 'scenes');
    recordDestroy(SystemRegistry.prototype, 'systems');

    const app = new Application({ backend: { type: 'webgl2' }, extensions: [{ id: 'ok', systems: [{ create: () => ({ update: vi.fn() }) }] }] });

    expect(destroyOrder).toEqual([]);

    app.destroy();
  });
});
