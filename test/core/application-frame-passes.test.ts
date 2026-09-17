/**
 * The frame pass slot: while `app.framePasses` holds passes, the frame is drawn
 * into `app.frameTexture` and the pipeline is played against it.
 */
import { Application } from '#core/Application';
import type { RenderingContext } from '#rendering/RenderingContext';
import { RenderPass } from '#rendering/RenderPass';

const backendCalls = {
  clear: 0,
  execute: 0,
};

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
      view: { getBounds: vi.fn().mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600 }) },
      renderTarget: {},
      rendererRegistry: { bindRenderer: vi.fn() },
      backendType: 'webgl2',
      setView: vi.fn().mockReturnThis(),
      setRenderTarget: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      execute: vi.fn().mockImplementation(function (this: unknown) {
        backendCalls.execute++;

        return this;
      }),
      clear: vi.fn().mockImplementation(function (this: unknown) {
        backendCalls.clear++;

        return this;
      }),
      pushScissorRect: vi.fn().mockReturnThis(),
      popScissorRect: vi.fn().mockReturnThis(),
      acquireRenderTexture: vi.fn(),
      releaseRenderTexture: vi.fn().mockReturnThis(),
      composeWithAlphaMask: vi.fn().mockReturnThis(),
    };
  }),
}));

class CountingPass extends RenderPass {
  public executions = 0;
  public constructor() {
    super();
  }

  public resizes: Array<[number, number]> = [];
  public destroyed = 0;

  public override execute(_context: RenderingContext): void {
    this.executions++;
  }

  public override resize(width: number, height: number): void {
    this.resizes.push([width, height]);
  }

  public override destroy(): void {
    this.destroyed++;
  }
}

/** Run the private per-frame draw without scheduling a host frame. */
const drawFrame = (app: Application): void => {
  (app as unknown as { _drawFrame: () => void })._drawFrame();
};

describe('Application — frame passes', () => {
  beforeEach(() => {
    backendCalls.clear = 0;
    backendCalls.execute = 0;
  });

  test('an application that never asks for them holds neither a pipeline nor a target', () => {
    const app = new Application({ backend: { type: 'webgl2' } });
    const internals = app as unknown as Record<string, unknown>;

    drawFrame(app);

    expect(internals['_framePasses']).toBeNull();
    expect(internals['_frameTexture']).toBeNull();
    // The plain path still clears the canvas itself.
    expect(backendCalls.clear).toBe(1);
    expect(backendCalls.execute).toBe(0);

    void app.destroy();
  });

  test('an empty pipeline leaves the frame on the canvas', () => {
    const app = new Application({ backend: { type: 'webgl2' } });

    expect(app.framePasses.size).toBe(0);

    drawFrame(app);

    expect(backendCalls.clear).toBe(1);
    expect(backendCalls.execute).toBe(0);
    expect((app as unknown as Record<string, unknown>)['_frameTexture']).toBeNull();

    void app.destroy();
  });

  test('a registered pass redirects the frame and runs after it', () => {
    const app = new Application({ backend: { type: 'webgl2' } });
    const pass = new CountingPass();

    app.framePasses.addPass(pass);
    drawFrame(app);

    // The redirect carries the clear, so the canvas is not cleared separately.
    expect(backendCalls.clear).toBe(0);
    expect(backendCalls.execute).toBe(1);
    expect(pass.executions).toBe(1);

    void app.destroy();
  });

  test('the frame target follows the surface in texels and stays logical in its view', () => {
    const app = new Application({ canvas: { width: 400, height: 300, pixelRatio: 2 }, backend: { type: 'webgl2' } });
    const texture = app.frameTexture;

    expect(texture.width).toBe(800);
    expect(texture.height).toBe(600);
    expect(texture.view.size.width).toBe(400);
    expect(texture.view.size.height).toBe(300);

    app.resize(500, 200);

    expect(texture.width).toBe(1000);
    expect(texture.height).toBe(400);
    expect(texture.view.size.width).toBe(500);
    expect(texture.view.size.height).toBe(200);

    void app.destroy();
  });

  test('a resize reaches the registered passes', () => {
    const app = new Application({ canvas: { width: 400, height: 300 }, backend: { type: 'webgl2' } });
    const pass = new CountingPass();

    app.framePasses.addPass(pass);
    app.resize(640, 480);

    expect(pass.resizes.at(-1)).toEqual([640, 480]);

    void app.destroy();
  });

  test('destroying the application destroys the passes it was given', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });
    const pass = new CountingPass();

    app.framePasses.addPass(pass);
    void app.frameTexture;

    await app.destroy();

    expect(pass.destroyed).toBe(1);

    const internals = app as unknown as Record<string, unknown>;

    expect(internals['_framePasses']).toBeNull();
    expect(internals['_frameTexture']).toBeNull();
  });
});
