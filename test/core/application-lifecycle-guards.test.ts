import type { MockInstance } from 'vitest';

/**
 * Lifecycle guards around teardown: the terminal states must stay terminal
 * whatever a startup run that is still in flight goes on to write.
 */
import { Application, ApplicationState } from '#core/Application';

const backendControl = vi.hoisted(() => ({
  initialize: (): Promise<void> => Promise.resolve(),
}));

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
      initialize: vi.fn(() => backendControl.initialize()),
      destroy: vi.fn(),
      resize: vi.fn().mockReturnThis(),
      view: { getBounds: vi.fn().mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600 }) },
      renderTarget: {},
      rendererRegistry: { bindRenderer: vi.fn() },
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
      supportedTextureFormats: [],
      rootResolution: 1,
      clearColor: { copy: vi.fn() },
    };
  }),
}));

/** Turn the microtask queue over `turns` times without letting any timer run. */
const flush = async (turns = 10): Promise<void> => {
  for (let index = 0; index < turns; index++) {
    await Promise.resolve();
  }
};

describe('Application lifecycle guards', () => {
  let rafSpy: MockInstance;
  let cafSpy: MockInstance;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    backendControl.initialize = (): Promise<void> => Promise.resolve();
    rafCallbacks = [];
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
      rafCallbacks.push(callback);

      return rafCallbacks.length;
    });
    cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  test('a start() that fails after destroy() settled leaves the application Destroyed', async () => {
    let failInitialize: (error: Error) => void = () => {};

    backendControl.initialize = (): Promise<void> =>
      new Promise<void>((_resolve, reject) => {
        failInitialize = reject;
      });

    const app = new Application({ backend: { type: 'webgl2' } });
    const startPromise = app.start().catch(() => undefined);

    await flush(3);

    await app.destroy();

    expect(app.state).toBe(ApplicationState.Destroyed);

    failInitialize(new Error('backend initialization failed'));

    await startPromise;
    await flush(5);

    // The startup catch resets the state to Stopped; on a destroyed instance
    // that would resurrect it and let start() reinitialize a destroyed backend.
    expect(app.state).toBe(ApplicationState.Destroyed);
    await expect(app.start()).rejects.toThrow(/after destroy/);
  });
});
