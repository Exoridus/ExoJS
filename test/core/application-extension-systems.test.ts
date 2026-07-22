/**
 * Real Application integration tests for the v0.17 Slice F app-system
 * extension bindings (implementation spec §12). Only the WebGL2 backend is
 * mocked (kept out of jsdom) — input, interaction, focus, audio, tweens, and
 * the app SystemRegistry all run for real.
 */

import { Application } from '#core/Application';
import type { System } from '#core/System';
import type { ApplicationSystemBinding, Extension } from '#extensions/Extension';

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return {
      onContextLost: { add: vi.fn() },
      onContextRestored: { add: vi.fn() },
      onRenderError: { add: vi.fn(), destroy: vi.fn() },
      stats: {
        frameTimeMs: 0,
        drawCalls: 0,
        culledNodes: 0,
        submittedNodes: 0,
        batches: 0,
        renderPasses: 0,
        renderTargetChanges: 0,
        frame: 0,
        rawFrameDeltaMs: 0,
      },
      resetStats: vi.fn().mockReturnThis(),
      flush: vi.fn().mockReturnThis(),
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
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

let rafSpy: MockInstance;

beforeEach(() => {
  rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as ReturnType<typeof requestAnimationFrame>);
});

afterEach(() => {
  rafSpy.mockRestore();
});

describe('Application app-system extension bindings (Slice F)', () => {
  test('create() runs after every core manager exists', () => {
    let seenApp: Application | undefined;
    const binding: ApplicationSystemBinding = {
      create: app => {
        seenApp = app;
        return undefined;
      },
    };
    const ext: Extension = { id: 'probe', systems: [binding] };
    const app = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    expect(seenApp).toBe(app);
    expect(seenApp?.input).toBeDefined();
    expect(seenApp?.interaction).toBeDefined();
    expect(seenApp?.focus).toBeDefined();
    expect(seenApp?.audio).toBeDefined();
    expect(seenApp?.tweens).toBeDefined();
    expect(seenApp?.scenes).toBeDefined();
    app.destroy();
  });

  test('the returned system is registered on app.systems', () => {
    const system: System = { update: vi.fn() };
    const binding: ApplicationSystemBinding = { create: () => system };
    const ext: Extension = { id: 'counter', systems: [binding] };
    const app = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    expect(app.systems.has(system)).toBe(true);
    app.destroy();
  });

  test('a binding returning undefined is skipped, not an error', () => {
    const binding: ApplicationSystemBinding = { create: () => undefined };
    const ext: Extension = { id: 'opt-out', systems: [binding] };

    expect(() => new Application({ backend: { type: 'webgl2' }, extensions: [ext] })).not.toThrow();
  });

  test('two applications built from the same extension get independent system instances', () => {
    const created: System[] = [];
    const binding: ApplicationSystemBinding = {
      create: () => {
        const system: System = { update: vi.fn() };
        created.push(system);
        return system;
      },
    };
    const ext: Extension = { id: 'per-app', systems: [binding] };

    const appA = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });
    const appB = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    expect(created).toHaveLength(2);
    expect(appA.systems.has(created[0]!)).toBe(true);
    expect(appA.systems.has(created[1]!)).toBe(false);
    expect(appB.systems.has(created[1]!)).toBe(true);
    expect(appB.systems.has(created[0]!)).toBe(false);

    appA.destroy();
    appB.destroy();
  });

  test('app.destroy() destroys the extension system, in reverse registration order with a later user system', () => {
    const order: string[] = [];
    const extSystem: System = { update: vi.fn(), destroy: () => order.push('extension') };
    const binding: ApplicationSystemBinding = { create: () => extSystem };
    const ext: Extension = { id: 'destroy-order', systems: [binding] };
    const app = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    const userSystem: System = { update: vi.fn(), destroy: () => order.push('user') };
    app.systems.add(userSystem);

    app.destroy();

    expect(order).toEqual(['user', 'extension']);
  });

  test('a renderer-only extension is unaffected — app.systems stays empty', () => {
    const ext: Extension = { id: 'renderer-only', renderers: [] };
    const app = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    expect(app.systems.size).toBe(0);
    app.destroy();
  });
});
