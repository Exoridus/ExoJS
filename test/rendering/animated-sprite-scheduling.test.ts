/**
 * AnimatedSprite frame playback is scheduled by the engine, not by hand:
 * a playing sprite attached to an Application's scene tree registers with
 * `app.animations` and is advanced once per frame from the core preUpdate
 * phase - and deregisters again on stop, detach, completion and destroy.
 */
import { Application, ApplicationState } from '#core/Application';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';

// ---------------------------------------------------------------------------
// Backend stubs - keep WebGL2 / WebGPU out of jsdom. The factories must be
// inline because vi.mock() is hoisted above any variable declaration.
// ---------------------------------------------------------------------------

const backendStub = (): Record<string, unknown> => ({
  onContextLost: { add: vi.fn() },
  onContextRestored: { add: vi.fn() },
  onDeviceLost: { add: vi.fn() },
  onDeviceRestored: { add: vi.fn() },
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
  view: {},
  renderTarget: {},
  // Core renderer bindings key their per-backend factory map on this value, so
  // a stub that names a real backend also has to accept the renderers that get
  // bound to it.
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
});

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return backendStub();
  }),
}));

vi.mock('#rendering/webgpu/WebGpuBackend', () => ({
  WebGpuBackend: vi.fn().mockImplementation(function () {
    return backendStub();
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Put the Application into the running state without going through start(). */
const forceRunning = (app: Application): void => {
  const record = app as unknown as Record<string, unknown>;

  record['_state'] = ApplicationState.Running;
  record['_frameLoopActive'] = true;
};

/** Run one frame of the real per-frame loop with a fixed `milliseconds` delta. */
const advanceFrame = (app: Application, milliseconds: number): void => {
  const previous = (app as unknown as Record<string, unknown>)['_lastFrameTimestamp'] as number;

  app.update(previous + milliseconds);
};

const createFrames = (): Rectangle[] => [new Rectangle(0, 0, 16, 16), new Rectangle(16, 0, 16, 16), new Rectangle(32, 0, 16, 16)];

/** A three-frame clip at 10fps - one frame per 100ms of simulated time. */
const createSprite = (): AnimatedSprite => new AnimatedSprite(null, { walk: { frames: createFrames(), fps: 10 } });

describe('AnimatedSprite scheduling', () => {
  let app: Application;
  let root: Container;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as ReturnType<typeof requestAnimationFrame>);

    app = new Application({ backend: { type: 'webgl2' } });
    forceRunning(app);

    // The input subsystem is not under test and jsdom has no gamepad API.
    vi.spyOn(app.input, 'preUpdate').mockImplementation(() => undefined);
    vi.spyOn(app.interaction, 'preUpdate').mockImplementation(() => undefined);

    // A stage-attached root, the way a scene's structural root is bound.
    root = new Container();
    app.interaction.attachRoot(root);
  });

  afterEach(() => {
    (app as unknown as Record<string, unknown>)['_state'] = ApplicationState.Stopped;
    void app.destroy();
    vi.restoreAllMocks();
  });

  test('a playing sprite in the scene tree advances through the application frame loop', () => {
    const sprite = createSprite();

    root.addChild(sprite);
    sprite.play('walk');

    expect(sprite.currentFrame).toBe(0);

    advanceFrame(app, 100);
    expect(sprite.currentFrame).toBe(1);

    advanceFrame(app, 100);
    expect(sprite.currentFrame).toBe(2);
  });

  test('play() before the sprite is attached still starts ticking once it joins the tree', () => {
    const sprite = createSprite();

    // The common shape: build and start the sprite, then parent it.
    sprite.play('walk');
    expect(app.animations.size).toBe(0);

    root.addChild(sprite);
    expect(app.animations.has(sprite)).toBe(true);

    advanceFrame(app, 100);
    expect(sprite.currentFrame).toBe(1);
  });

  test('a paused or stopped sprite is not ticked and holds no registration', () => {
    const sprite = createSprite();

    root.addChild(sprite);
    sprite.play('walk');
    advanceFrame(app, 100);
    expect(sprite.currentFrame).toBe(1);

    sprite.pause();
    expect(app.animations.has(sprite)).toBe(false);

    advanceFrame(app, 200);
    expect(sprite.currentFrame).toBe(1);

    sprite.resume();
    expect(app.animations.has(sprite)).toBe(true);

    advanceFrame(app, 100);
    expect(sprite.currentFrame).toBe(2);

    sprite.stop();
    expect(app.animations.has(sprite)).toBe(false);
    expect(app.animations.size).toBe(0);
  });

  test('detaching a playing sprite from the tree stops it being ticked', () => {
    const sprite = createSprite();

    root.addChild(sprite);
    sprite.play('walk');
    expect(app.animations.size).toBe(1);

    root.removeChild(sprite);

    expect(app.animations.has(sprite)).toBe(false);
    expect(app.animations.size).toBe(0);

    advanceFrame(app, 100);
    expect(sprite.currentFrame).toBe(0);

    // Re-attaching a still-playing sprite resumes automatic advancement.
    root.addChild(sprite);
    expect(app.animations.size).toBe(1);

    advanceFrame(app, 100);
    expect(sprite.currentFrame).toBe(1);
  });

  test('destroying a playing sprite deregisters it, so no destroyed node is ticked afterwards', () => {
    const sprite = createSprite();

    root.addChild(sprite);
    sprite.play('walk');
    expect(app.animations.size).toBe(1);

    sprite.destroy();

    expect(app.animations.has(sprite)).toBe(false);
    expect(app.animations.size).toBe(0);
    expect(() => {
      advanceFrame(app, 100);
    }).not.toThrow();
  });

  test('a clip that completes deregisters itself instead of being ticked forever', () => {
    const sprite = new AnimatedSprite(null, { burst: { frames: createFrames(), fps: 10, repeat: 1 } });

    root.addChild(sprite);
    sprite.play('burst');
    expect(app.animations.size).toBe(1);

    // 3 frames @ 10fps = one 300ms cycle; the frame delta is clamped to 100ms,
    // so drive it with three real frames.
    advanceFrame(app, 100);
    advanceFrame(app, 100);
    advanceFrame(app, 100);

    expect(sprite.playing).toBe(false);
    expect(sprite.currentFrame).toBe(2);
    expect(app.animations.size).toBe(0);
  });

  test('a completed single-frame clip releases its registration too', () => {
    const sprite = new AnimatedSprite(null, { blink: { frames: [new Rectangle(0, 0, 16, 16)], fps: 10, repeat: 1 } });

    root.addChild(sprite);
    sprite.play('blink');
    expect(app.animations.size).toBe(1);

    advanceFrame(app, 100);

    expect(sprite.playing).toBe(false);
    expect(app.animations.size).toBe(0);
  });
});
