import { getAudioContext } from '#audio/audio-context';
import { AudioListener } from '#audio/AudioListener';
import { disposeAudioManager } from '#audio/AudioManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getCtx = (): AudioContext => getAudioContext();

const getListenerMock = (): {
  positionX: { setValueAtTime: MockInstance };
  positionY: { setValueAtTime: MockInstance };
  positionZ: { setValueAtTime: MockInstance };
  forwardX: { setValueAtTime: MockInstance };
  forwardY: { setValueAtTime: MockInstance };
  forwardZ: { setValueAtTime: MockInstance };
  upX: { setValueAtTime: MockInstance };
  upY: { setValueAtTime: MockInstance };
  upZ: { setValueAtTime: MockInstance };
  // NO context property — matches real WebAudio spec
} => (getCtx() as unknown as { listener: ReturnType<typeof getListenerMock> }).listener;

const makeSceneNodeStub = (x: number, y: number) => ({
  getGlobalTransform: vi.fn().mockReturnValue({ x, y }),
});

const makeViewStub = (x: number, y: number) => ({
  center: { x, y },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioListener', () => {
  beforeEach(() => {
    disposeAudioManager();
    // Reset mock call history on listener AudioParams
    const l = getListenerMock();
    (l.positionX.setValueAtTime as MockInstance).mockClear();
    (l.positionY.setValueAtTime as MockInstance).mockClear();
    (l.positionZ.setValueAtTime as MockInstance).mockClear();
    (l.forwardX.setValueAtTime as MockInstance).mockClear();
    (l.forwardY.setValueAtTime as MockInstance).mockClear();
    (l.forwardZ.setValueAtTime as MockInstance).mockClear();
    (l.upX.setValueAtTime as MockInstance).mockClear();
    (l.upY.setValueAtTime as MockInstance).mockClear();
    (l.upZ.setValueAtTime as MockInstance).mockClear();
  });

  afterEach(() => {
    disposeAudioManager();
    vi.restoreAllMocks();
  });

  // 1. Construction — listener exists, default position 0,0.
  test('constructs with default position (0, 0)', () => {
    const listener = new AudioListener();
    expect(listener.position.x).toBe(0);
    expect(listener.position.y).toBe(0);
    listener.destroy();
  });

  test('constructs with default velocity (0, 0)', () => {
    const listener = new AudioListener();
    expect(listener.velocity.x).toBe(0);
    expect(listener.velocity.y).toBe(0);
    listener.destroy();
  });

  test('target defaults to null', () => {
    const listener = new AudioListener();
    expect(listener.target).toBeNull();
    listener.destroy();
  });

  // 2. target = sceneNode: _tick() reads sceneNode.getGlobalTransform
  test('_tick() reads position from SceneNode.getGlobalTransform() when target is a SceneNode', () => {
    const listener = new AudioListener();
    const node = makeSceneNodeStub(100, 200);
    listener.target = node as unknown as Parameters<(typeof listener)['target'] extends infer T ? (t: T) => void : never>[0];
    listener._tick();
    expect(node.getGlobalTransform).toHaveBeenCalledTimes(1);
    expect(listener.position.x).toBe(100);
    expect(listener.position.y).toBe(200);
    listener.destroy();
  });

  // 3. target = view: _tick() reads view.center
  test('_tick() reads position from View.center when target is a View', () => {
    const listener = new AudioListener();
    const view = makeViewStub(300, 400);
    listener.target = view as unknown as Parameters<(typeof listener)['target'] extends infer T ? (t: T) => void : never>[0];
    listener._tick();
    expect(listener.position.x).toBe(300);
    expect(listener.position.y).toBe(400);
    listener.destroy();
  });

  // 4. target = { x, y }: _tick() reads plain
  test('_tick() reads position from plain {x, y} object when target is set', () => {
    const listener = new AudioListener();
    listener.target = { x: 50, y: 75 };
    listener._tick();
    expect(listener.position.x).toBe(50);
    expect(listener.position.y).toBe(75);
    listener.destroy();
  });

  // 5. target = null: _tick() does NOT modify position
  test('_tick() does not modify position when target is null', () => {
    const listener = new AudioListener();
    listener.target = { x: 10, y: 20 };
    listener._tick();
    expect(listener.position.x).toBe(10);

    listener.target = null;
    listener.position.set(999, 999);
    listener._tick();
    expect(listener.position.x).toBe(999);
    expect(listener.position.y).toBe(999);
    listener.destroy();
  });

  // 6. _tick() writes position to audioContext.listener.positionX/Y/Z
  test('_tick() calls setValueAtTime on positionX/Y/Z of the WebAudio listener', () => {
    const listener = new AudioListener();
    listener.target = { x: 12, y: 34 };
    listener._tick();

    const l = getListenerMock();
    expect(l.positionX.setValueAtTime).toHaveBeenCalledWith(12, expect.any(Number));
    expect(l.positionY.setValueAtTime).toHaveBeenCalledWith(34, expect.any(Number));
    expect(l.positionZ.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    listener.destroy();
  });

  // 7. Setup writes orientation (forward = -Z, up = +Y)
  test('construction sets up 2D orientation: forward (0,0,-1) and up (0,1,0)', () => {
    // The _setup method is called synchronously when AudioContext is running.
    const l = getListenerMock();
    new AudioListener().destroy();
    expect(l.forwardZ.setValueAtTime).toHaveBeenCalledWith(-1, expect.any(Number));
    expect(l.forwardX.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(l.forwardY.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(l.upX.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(l.upY.setValueAtTime).toHaveBeenCalledWith(1, expect.any(Number));
    expect(l.upZ.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
  });

  // 8. destroy() clears state
  test('destroy() nulls out target and internal listener reference', () => {
    const listener = new AudioListener();
    listener.target = { x: 1, y: 2 };
    listener.destroy();
    expect(listener.target).toBeNull();
  });

  test('destroy() can be called multiple times without throwing', () => {
    const listener = new AudioListener();
    expect(() => {
      listener.destroy();
      listener.destroy();
    }).not.toThrow();
  });

  test('_tick() is a no-op after destroy()', () => {
    const listener = new AudioListener();
    listener.target = { x: 5, y: 10 };
    listener.destroy();
    // Should not throw
    expect(() => listener._tick()).not.toThrow();
  });

  test('changing target updates position on next _tick()', () => {
    const listener = new AudioListener();
    listener.target = { x: 1, y: 2 };
    listener._tick();
    expect(listener.position.x).toBe(1);

    listener.target = { x: 99, y: 88 };
    listener._tick();
    expect(listener.position.x).toBe(99);
    expect(listener.position.y).toBe(88);
    listener.destroy();
  });

  // ---- Regression tests: AudioListener._ctx bugfix ----

  // R1. _tick() does not throw even though WebAudio listener has no .context property
  test('_tick() does not throw when WebAudio listener has no .context property (regression)', () => {
    const listener = new AudioListener();
    // Verify the mock listener has no context property (real-browser parity)
    const l = getListenerMock();
    expect((l as unknown as { context?: unknown }).context).toBeUndefined();
    // _tick() must not crash
    listener.target = { x: 1, y: 2 };
    expect(() => listener._tick()).not.toThrow();
    listener.destroy();
  });

  // R2. position is written to audioListener.positionX/Y/Z via _ctx.currentTime
  test('_tick() writes position to positionX/Y/Z using _ctx (not listener.context)', () => {
    const listener = new AudioListener();
    listener.target = { x: 55, y: 66 };
    listener._tick();
    const l = getListenerMock();
    expect(l.positionX.setValueAtTime).toHaveBeenCalledWith(55, expect.any(Number));
    expect(l.positionY.setValueAtTime).toHaveBeenCalledWith(66, expect.any(Number));
    expect(l.positionZ.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    listener.destroy();
  });

  // R3. _tick() with target = null does not update position and does not throw
  test('_tick() with target=null neither updates position nor throws', () => {
    const listener = new AudioListener();
    expect(() => listener._tick()).not.toThrow();
    expect(listener.position.x).toBe(0);
    expect(listener.position.y).toBe(0);
    listener.destroy();
  });

  // R4. _tick() reads global transform from a SceneNode target
  test('_tick() reads global transform from SceneNode target', () => {
    const listener = new AudioListener();
    const node = makeSceneNodeStub(77, 88);
    listener.target = node as unknown as Parameters<(typeof listener)['target'] extends infer T ? (t: T) => void : never>[0];
    listener._tick();
    expect(node.getGlobalTransform).toHaveBeenCalledTimes(1);
    expect(listener.position.x).toBe(77);
    expect(listener.position.y).toBe(88);
    listener.destroy();
  });
});
