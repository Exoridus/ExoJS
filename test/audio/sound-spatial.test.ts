import { getAudioContext } from '@/audio/audio-context';
import { AudioBus } from '@/audio/AudioBus';
import { disposeAudioManager, getAudioManager } from '@/audio/AudioManager';
import { Sound } from '@/audio/Sound';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createAudioBufferStub = (): AudioBuffer =>
  ({
    duration: 2,
  }) as AudioBuffer;

interface MockPannerNode {
  connect: MockInstance;
  disconnect: MockInstance;
  context: AudioContext;
  panningModel: PanningModelType;
  distanceModel: DistanceModelType;
  maxDistance: number;
  refDistance: number;
  rolloffFactor: number;
  positionX: { setValueAtTime: MockInstance };
  positionY: { setValueAtTime: MockInstance };
  positionZ: { setValueAtTime: MockInstance };
}

const setupPannerSpy = (): {
  panners: MockPannerNode[];
  restore: () => void;
} => {
  const ctx = getAudioContext() as AudioContext & { createPanner: () => PannerNode };
  const panners: MockPannerNode[] = [];
  const spy = vi.spyOn(ctx, 'createPanner').mockImplementation(() => {
    const panner: MockPannerNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      context: ctx,
      panningModel: 'equalpower',
      distanceModel: 'linear',
      maxDistance: 10000,
      refDistance: 1,
      rolloffFactor: 1,
      positionX: { setValueAtTime: vi.fn() },
      positionY: { setValueAtTime: vi.fn() },
      positionZ: { setValueAtTime: vi.fn() },
    };
    panners.push(panner);
    return panner as unknown as PannerNode;
  });
  return { panners, restore: () => spy.mockRestore() };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sound — spatial (PannerNode)', () => {
  beforeEach(() => {
    disposeAudioManager();
  });

  afterEach(() => {
    disposeAudioManager();
    vi.restoreAllMocks();
  });

  // 1. Default position === null, no PannerNode
  test('position is null by default', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.position).toBeNull();
  });

  test('no PannerNode is created by default (non-spatial)', () => {
    const spy = setupPannerSpy();
    new Sound(createAudioBufferStub());
    expect(spy.panners.length).toBe(0);
    spy.restore();
  });

  // 2. Setting position = { x, y } creates PannerNode
  test('setting position creates a PannerNode', () => {
    const spy = setupPannerSpy();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 10, y: 20 };
    expect(spy.panners.length).toBe(1);
    expect(sound.position!.x).toBe(10);
    expect(sound.position!.y).toBe(20);
    spy.restore();
  });

  test('PannerNode is configured with correct default spatial parameters', () => {
    const spy = setupPannerSpy();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    const panner = spy.panners[0];
    expect(panner.panningModel).toBe('equalpower');
    expect(panner.distanceModel).toBe('linear');
    expect(panner.maxDistance).toBe(1000);
    expect(panner.refDistance).toBe(50);
    expect(panner.rolloffFactor).toBe(1);
    spy.restore();
  });

  // 3. Sound is registered in mixer's _spatialSounds
  test('sound is registered as spatial in the mixer when position is set', () => {
    const spy = setupPannerSpy();
    const mixer = getAudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    // Confirm by calling update — should call _tickSpatial on the sound.
    const tickSpy = vi.spyOn(sound, '_tickSpatial');
    mixer.update();
    expect(tickSpy).toHaveBeenCalledTimes(1);
    spy.restore();
  });

  // 4. _tickSpatial() writes position to panner
  test('_tickSpatial() writes x/y/z to PannerNode positionX/Y/Z', () => {
    const spy = setupPannerSpy();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 55, y: 66 };
    const panner = spy.panners[0];
    panner.positionX.setValueAtTime.mockClear();
    panner.positionY.setValueAtTime.mockClear();
    panner.positionZ.setValueAtTime.mockClear();
    sound._tickSpatial();
    expect(panner.positionX.setValueAtTime).toHaveBeenCalledWith(55, expect.any(Number));
    expect(panner.positionY.setValueAtTime).toHaveBeenCalledWith(66, expect.any(Number));
    expect(panner.positionZ.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    spy.restore();
  });

  // 5. Setting position = null removes PannerNode and unregisters
  test('setting position to null tears down PannerNode and unregisters from mixer', () => {
    const spy = setupPannerSpy();
    const mixer = getAudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 1, y: 2 };
    expect(spy.panners.length).toBe(1);

    sound.position = null;
    expect(sound.position).toBeNull();
    expect(spy.panners[0].disconnect).toHaveBeenCalled();

    // Mixer should no longer tick this sound
    const tickSpy = vi.spyOn(sound, '_tickSpatial');
    mixer.update();
    expect(tickSpy).not.toHaveBeenCalled();
    spy.restore();
  });

  // 6. velocity round-trips
  test('velocity is null by default', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.velocity).toBeNull();
  });

  test('velocity can be set and read back', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.velocity = { x: 10, y: -5 };
    expect(sound.velocity).not.toBeNull();
    expect(sound.velocity!.x).toBe(10);
    expect(sound.velocity!.y).toBe(-5);
  });

  test('velocity can be updated in-place', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.velocity = { x: 1, y: 2 };
    sound.velocity = { x: 3, y: 4 };
    expect(sound.velocity!.x).toBe(3);
    expect(sound.velocity!.y).toBe(4);
  });

  test('velocity can be set to null', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.velocity = { x: 1, y: 2 };
    sound.velocity = null;
    expect(sound.velocity).toBeNull();
  });

  // 7. Setting position multiple times reuses panner (no second panner created)
  test('updating position multiple times reuses the same PannerNode', () => {
    const spy = setupPannerSpy();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 1, y: 2 };
    sound.position = { x: 3, y: 4 };
    sound.position = { x: 5, y: 6 };
    expect(spy.panners.length).toBe(1);
    expect(sound.position!.x).toBe(5);
    expect(sound.position!.y).toBe(6);
    spy.restore();
  });

  // 8. Changing bus while spatial keeps panner intact, reroutes to new bus
  test('changing bus while spatial disconnects from old bus and connects panner to new bus', () => {
    const spy = setupPannerSpy();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    const panner = spy.panners[0];

    const newBus = new AudioBus('sfx');
    const connectSpy = panner.connect;
    const disconnectSpy = panner.disconnect;

    sound.bus = newBus;

    expect(disconnectSpy).toHaveBeenCalled();
    expect(connectSpy).toHaveBeenCalled();
    // panner should still be non-null (not torn down)
    expect(sound.position).not.toBeNull();

    newBus.destroy();
    spy.restore();
  });

  // 9. destroy() cleans up panner + unregisters
  test('destroy() disconnects PannerNode and unregisters from mixer', () => {
    const spy = setupPannerSpy();
    const mixer = getAudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    const panner = spy.panners[0];

    sound.destroy();

    expect(panner.disconnect).toHaveBeenCalled();

    // Mixer should no longer tick after destroy
    const tickSpy = vi.fn();
    (sound as unknown as { _tickSpatial: MockInstance })._tickSpatial = tickSpy;
    mixer.update();
    expect(tickSpy).not.toHaveBeenCalled();

    spy.restore();
  });

  test('destroy() cleans up velocity Vector', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.velocity = { x: 1, y: 2 };
    expect(() => sound.destroy()).not.toThrow();
  });

  test('_tickSpatial() is a no-op when position is null', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(() => sound._tickSpatial()).not.toThrow();
  });

  test('setting position to null when already null is a no-op', () => {
    const spy = setupPannerSpy();
    const sound = new Sound(createAudioBufferStub());
    expect(sound.position).toBeNull();
    sound.position = null; // should not throw
    expect(spy.panners.length).toBe(0);
    spy.restore();
  });
});
