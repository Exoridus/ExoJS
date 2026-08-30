import type { MockInstance } from 'vitest';

import { getAudioContext } from '#audio/audioContext';
import { AudioSystem } from '#audio/AudioSystem';
import { Sound } from '#audio/Sound';
import { Time } from '#core/units';

const createAudioBufferStub = (duration = 10): AudioBuffer => ({ duration }) as AudioBuffer;

const frame = Time.seconds(0.016);

interface MockParam {
  value: number;
  setValueAtTime: MockInstance;
  setTargetAtTime: MockInstance;
  cancelScheduledValues: MockInstance;
}

interface MockPanner {
  connect: MockInstance;
  disconnect: MockInstance;
  positionX: MockParam;
  positionY: MockParam;
  positionZ: MockParam;
  orientationX: MockParam;
  orientationY: MockParam;
  orientationZ: MockParam;
}

const makeParam = (): MockParam => ({
  value: 0,
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
});

const setupPannerSpy = (): { panners: MockPanner[]; restore: () => void } => {
  const ctx = getAudioContext();
  const panners: MockPanner[] = [];
  const spy = vi.spyOn(ctx, 'createPanner').mockImplementation(() => {
    const node: MockPanner = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      positionX: makeParam(),
      positionY: makeParam(),
      positionZ: makeParam(),
      orientationX: makeParam(),
      orientationY: makeParam(),
      orientationZ: makeParam(),
    };
    panners.push(node);
    return node as unknown as PannerNode;
  });
  return { panners, restore: (): void => spy.mockRestore() };
};

const getGlobalListener = (): Record<string, MockParam> => (getAudioContext() as unknown as { listener: Record<string, MockParam> }).listener;

// `ctx.listener` belongs to the process-wide AudioContext, so two
// Applications used to write their own absolute world position into the same
// global object every frame - last writer per frame wins, and both apps pan
// against whichever listener happened to tick last. The fix is a virtual
// listener: the global one is pinned at the origin and each voice writes its
// position RELATIVE to its own system's listener.
describe('per-Application virtual listener', () => {
  afterEach(() => vi.restoreAllMocks());

  test('the global WebAudio listener is pinned at the origin and never moved by a tick', () => {
    const listener = getGlobalListener();
    listener.positionX.setValueAtTime.mockClear();
    listener.positionY.setValueAtTime.mockClear();
    listener.positionZ.setValueAtTime.mockClear();
    listener.positionX.setTargetAtTime.mockClear();

    const system = new AudioSystem();
    expect(listener.positionX.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(listener.positionY.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(listener.positionZ.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));

    listener.positionX.setValueAtTime.mockClear();

    system.listener.target = { x: 500, y: 300 };
    system.preUpdate(frame);
    system.preUpdate(frame);

    expect(listener.positionX.setValueAtTime).not.toHaveBeenCalled();
    expect(listener.positionX.setTargetAtTime).not.toHaveBeenCalled();

    system.destroy();
  });

  test('two systems on the same context each pan their own voices correctly', () => {
    const factory = setupPannerSpy();

    const first = new AudioSystem();
    const second = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());

    first.listener.position.set(1000, 0);
    second.listener.position.set(-1000, 0);

    // Both sources sit at the same world point; each must be heard relative to
    // its OWN app's listener - 800 units left for the first, 1200 right for the second.
    first.play(sound, { position: { x: 200, y: 0 } });
    second.play(sound, { position: { x: 200, y: 0 } });

    expect(factory.panners).toHaveLength(2);
    expect(factory.panners[0].positionX.setValueAtTime).toHaveBeenCalledWith(-800, expect.any(Number));
    expect(factory.panners[1].positionX.setValueAtTime).toHaveBeenCalledWith(1200, expect.any(Number));

    // A frame tick must not let one system's listener bleed into the other's pan.
    first.preUpdate(frame);
    second.preUpdate(frame);

    expect(factory.panners[0].positionX.setValueAtTime).not.toHaveBeenCalledWith(1200, expect.any(Number));
    expect(factory.panners[1].positionX.setValueAtTime).not.toHaveBeenCalledWith(-800, expect.any(Number));

    factory.restore();
    first.destroy();
    second.destroy();
    sound.destroy();
  });

  test('moving the listener re-pans a stationary voice', () => {
    const factory = setupPannerSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());

    system.play(sound, { position: { x: 100, y: 0 } });
    const panner = factory.panners[0];
    expect(panner.positionX.setValueAtTime).toHaveBeenCalledWith(100, expect.any(Number));

    panner.positionX.setValueAtTime.mockClear();
    panner.positionX.setTargetAtTime.mockClear();

    // The source has not moved, but the listener has - the relative offset it
    // is panned by must follow, which is exactly what the old central listener
    // smoothing used to cover.
    system.listener.target = { x: 40, y: 0 };
    system.preUpdate(frame);

    expect(panner.positionX.setTargetAtTime).toHaveBeenCalledWith(60, expect.any(Number), expect.any(Number));

    factory.restore();
    system.destroy();
    sound.destroy();
  });

  test('distance to the listener is preserved, so attenuation is unchanged', () => {
    const factory = setupPannerSpy();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub());

    system.listener.position.set(300, 400);
    system.play(sound, { position: { x: 300 + 30, y: 400 + 40 } });

    const panner = factory.panners[0];
    const x = panner.positionX.setValueAtTime.mock.calls[0][0] as number;
    const y = panner.positionY.setValueAtTime.mock.calls[0][0] as number;

    // Listener is at the origin, so the panner position IS the offset vector.
    expect(Math.hypot(x, y)).toBeCloseTo(50, 6);

    factory.restore();
    system.destroy();
    sound.destroy();
  });

  // The Doppler ratio is computed in JS from absolute world coordinates on both
  // sides, so virtualizing the panner position must not disturb it.
  test('the Doppler path still works off absolute world positions', () => {
    const factory = setupPannerSpy();
    const system = new AudioSystem();
    system.spatial.dopplerFactor = 1;
    system.spatial.speedOfSound = 1000;
    const sound = new Sound(createAudioBufferStub());

    system.listener.position.set(5000, 0);

    const voice = system.play(sound, { position: { x: 5100, y: 0 } });
    // Receding from the listener along +X at 500 u/s => ratio 1 - 0.5 = 0.5.
    voice.velocity = { x: 500, y: 0 };
    system.preUpdate(frame);

    const rate = (voice as unknown as { _source: { playbackRate: MockParam } })._source.playbackRate;
    expect(rate.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number));

    factory.restore();
    system.destroy();
    sound.destroy();
  });
});
