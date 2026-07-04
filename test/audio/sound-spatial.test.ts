import { getAudioContext } from '#audio/audio-context';
import { AudioManager } from '#audio/AudioManager';
import { Sound } from '#audio/Sound';
import type { SoundVoice } from '#audio/SoundVoice';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Default position === null, no PannerNode on descriptor
  test('position is null by default', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.position).toBeNull();
  });

  test('no PannerNode is created when playing a non-spatial sound', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound);
    expect(spy.panners.length).toBe(0);
    spy.restore();
    sound.destroy();
  });

  // 2. Setting position = { x, y } on the descriptor; PannerNode created at play time
  test('setting position stores the value on the descriptor', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 10, y: 20 };
    expect(sound.position!.x).toBe(10);
    expect(sound.position!.y).toBe(20);
  });

  test('playing a sound with position creates a PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 10, y: 20 };
    manager.play(sound);
    expect(spy.panners.length).toBe(1);
    spy.restore();
    sound.destroy();
  });

  test('PannerNode is configured with correct default spatial parameters', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    manager.play(sound);
    const panner = spy.panners[0];
    expect(panner.panningModel).toBe('equalpower');
    expect(panner.distanceModel).toBe('linear');
    expect(panner.maxDistance).toBe(1000);
    expect(panner.refDistance).toBe(50);
    expect(panner.rolloffFactor).toBe(1);
    spy.restore();
    sound.destroy();
  });

  // 3. Voice is registered as spatial in mixer; update() ticks it
  test('voice is registered as spatial in the mixer when sound has position at play time', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    const voice = mixer.play(sound) as SoundVoice;
    // Confirm by calling update — should call _tickSpatial on the voice.
    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    mixer.update();
    expect(tickSpy).toHaveBeenCalledTimes(1);
    spy.restore();
    sound.destroy();
  });

  // 4. update() calls _tickSpatial with position coordinates
  test('update() writes sound.position x/y to PannerNode', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 55, y: 66 };
    mixer.play(sound);
    const panner = spy.panners[0];
    panner.positionX.setValueAtTime.mockClear();
    panner.positionY.setValueAtTime.mockClear();
    panner.positionZ.setValueAtTime.mockClear();
    mixer.update();
    expect(panner.positionX.setValueAtTime).toHaveBeenCalledWith(55, expect.any(Number));
    expect(panner.positionY.setValueAtTime).toHaveBeenCalledWith(66, expect.any(Number));
    expect(panner.positionZ.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    spy.restore();
    sound.destroy();
  });

  // 5. Setting position = null removes it from the descriptor
  test('setting position to null clears the descriptor position', () => {
    const spy = setupPannerSpy();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 1, y: 2 };
    sound.position = null;
    expect(sound.position).toBeNull();
    spy.restore();
  });

  test('after setting position to null, new play creates no panner', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 1, y: 2 };
    sound.position = null;
    manager.play(sound);
    expect(spy.panners.length).toBe(0);
    spy.restore();
    sound.destroy();
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

  test('setting velocity to null when already null is a no-op', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.velocity).toBeNull();
    expect(() => (sound.velocity = null)).not.toThrow();
    expect(sound.velocity).toBeNull();
  });

  // 7. Setting position multiple times reuses value (no additional panner per update)
  test('updating position multiple times changes the descriptor value', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 1, y: 2 };
    sound.position = { x: 3, y: 4 };
    sound.position = { x: 5, y: 6 };
    expect(sound.position!.x).toBe(5);
    expect(sound.position!.y).toBe(6);
  });

  test('playing sound twice each gets its own PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    manager.play(sound);
    manager.play(sound);
    // Each play creates one PannerNode
    expect(spy.panners.length).toBe(2);
    spy.restore();
    sound.destroy();
  });

  // 8. voice.stop() disconnects panner
  test('voice.stop() disconnects the PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    const voice = manager.play(sound);
    const panner = spy.panners[0];

    voice.stop();
    expect(panner.disconnect).toHaveBeenCalled();
    spy.restore();
    sound.destroy();
  });

  // 9. Ended voice is pruned from spatial tracking after update()
  test('ended voice is removed from spatial tracking after update()', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    const voice = mixer.play(sound) as SoundVoice;

    voice.stop(); // mark as ended

    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    mixer.update();
    // Ended voice should not be ticked
    expect(tickSpy).not.toHaveBeenCalled();

    spy.restore();
    sound.destroy();
  });

  test('setting position to null when already null is a no-op', () => {
    const spy = setupPannerSpy();
    const sound = new Sound(createAudioBufferStub());
    expect(sound.position).toBeNull();
    sound.position = null; // should not throw
    expect(spy.panners.length).toBe(0);
    spy.restore();
  });

  test('sound.destroy() cleans up position and velocity vectors', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 1, y: 2 };
    sound.velocity = { x: 3, y: 4 };
    expect(() => sound.destroy()).not.toThrow();
  });

  // 10. distanceModel / refDistance / maxDistance / rolloffFactor accessors
  test('distanceModel getter/setter round-trips', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.distanceModel).toBe('linear');
    sound.distanceModel = 'exponential';
    expect(sound.distanceModel).toBe('exponential');
  });

  test('refDistance getter/setter round-trips and clamps to >= 0', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.refDistance).toBe(50);
    sound.refDistance = 20;
    expect(sound.refDistance).toBe(20);
    sound.refDistance = -5;
    expect(sound.refDistance).toBe(0);
  });

  test('maxDistance getter/setter round-trips and clamps to >= 0', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.maxDistance).toBe(1000);
    sound.maxDistance = 500;
    expect(sound.maxDistance).toBe(500);
    sound.maxDistance = -1;
    expect(sound.maxDistance).toBe(0);
  });

  test('rolloffFactor getter/setter round-trips and clamps to >= 0', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.rolloffFactor).toBe(1);
    sound.rolloffFactor = 2.5;
    expect(sound.rolloffFactor).toBe(2.5);
    sound.rolloffFactor = -3;
    expect(sound.rolloffFactor).toBe(0);
  });

  test('destroy() stops all active voices', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    sound.position = { x: 0, y: 0 };
    const voice = mixer.play(sound);

    sound.destroy();

    expect(voice.ended).toBe(true);

    // Mixer should no longer tick after destroy (voice ended)
    const tickSpy = vi.spyOn(voice as SoundVoice, '_tickSpatial');
    mixer.update();
    expect(tickSpy).not.toHaveBeenCalled();

    spy.restore();
  });
});
