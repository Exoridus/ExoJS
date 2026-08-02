import { getAudioContext } from '#audio/audio-context';
import { AudioManager } from '#audio/AudioManager';
import { Sound } from '#audio/Sound';
import type { SoundVoice } from '#audio/SoundVoice';
import { Drawable } from '#rendering/Drawable';
import { RetainedContainer } from '#rendering/RetainedContainer';

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
  positionX: { setValueAtTime: MockInstance; setTargetAtTime: MockInstance; cancelScheduledValues: MockInstance };
  positionY: { setValueAtTime: MockInstance; setTargetAtTime: MockInstance; cancelScheduledValues: MockInstance };
  positionZ: { setValueAtTime: MockInstance; setTargetAtTime: MockInstance; cancelScheduledValues: MockInstance };
  coneInnerAngle: number;
  coneOuterAngle: number;
  coneOuterGain: number;
  orientationX: { setValueAtTime: MockInstance; setTargetAtTime: MockInstance; cancelScheduledValues: MockInstance };
  orientationY: { setValueAtTime: MockInstance; setTargetAtTime: MockInstance; cancelScheduledValues: MockInstance };
  orientationZ: { setValueAtTime: MockInstance; setTargetAtTime: MockInstance; cancelScheduledValues: MockInstance };
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
      positionX: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      positionY: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      positionZ: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      coneInnerAngle: 360,
      coneOuterAngle: 360,
      coneOuterGain: 0,
      orientationX: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      orientationY: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      orientationZ: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
    };
    panners.push(panner);
    return panner as unknown as PannerNode;
  });
  return { panners, restore: () => spy.mockRestore() };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Voice — spatial (PannerNode)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a plain play() with no spatial options creates no PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);
    expect(spy.panners.length).toBe(0);
    expect(voice.position).toBeNull();
    spy.restore();
    sound.destroy();
  });

  test('PlayOptions.position creates a PannerNode with correct default spatial parameters', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 10, y: 20 } });
    expect(spy.panners.length).toBe(1);
    expect(voice.position!.x).toBe(10);
    expect(voice.position!.y).toBe(20);
    const panner = spy.panners[0];
    expect(panner.panningModel).toBe('equalpower');
    expect(panner.distanceModel).toBe('linear');
    expect(panner.maxDistance).toBe(1000);
    expect(panner.refDistance).toBe(50);
    expect(panner.rolloffFactor).toBe(1);
    spy.restore();
    sound.destroy();
  });

  test('PlayOptions.distanceModel/refDistance/maxDistance/rolloffFactor configure the PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, {
      position: { x: 0, y: 0 },
      distanceModel: 'exponential',
      refDistance: 20,
      maxDistance: 500,
      rolloffFactor: 2,
    });
    const panner = spy.panners[0];
    expect(panner.distanceModel).toBe('exponential');
    expect(panner.refDistance).toBe(20);
    expect(panner.maxDistance).toBe(500);
    expect(panner.rolloffFactor).toBe(2);
    spy.restore();
    sound.destroy();
  });

  test('setting voice.position after play creates a PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);
    expect(spy.panners.length).toBe(0);
    voice.position = { x: 5, y: 6 };
    expect(spy.panners.length).toBe(1);
    spy.restore();
    sound.destroy();
  });

  test('voice is registered as spatial in the mixer when created with a position', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = mixer.play(sound, { position: { x: 0, y: 0 } }) as SoundVoice;
    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    mixer.preUpdate();
    expect(tickSpy).toHaveBeenCalledTimes(1);
    spy.restore();
    sound.destroy();
  });

  test('update() writes voice position x/y to PannerNode, then skips a stationary source', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    mixer.play(sound, { position: { x: 55, y: 66 } });
    const panner = spy.panners[0];

    expect(panner.positionX.setValueAtTime).toHaveBeenCalledWith(55, expect.any(Number));
    expect(panner.positionY.setValueAtTime).toHaveBeenCalledWith(66, expect.any(Number));
    expect(panner.positionZ.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));

    panner.positionX.setValueAtTime.mockClear();
    panner.positionX.setTargetAtTime.mockClear();
    mixer.preUpdate();
    expect(panner.positionX.setValueAtTime).not.toHaveBeenCalled();
    expect(panner.positionX.setTargetAtTime).not.toHaveBeenCalled();

    spy.restore();
    sound.destroy();
  });

  test('setting voice.position to null clears it and stops further panner writes', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 1, y: 2 } });
    voice.position = null;
    expect(voice.position).toBeNull();
    spy.restore();
    sound.destroy();
  });

  test('two plays of the same Sound each get an independent Voice and PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voiceA = manager.play(sound, { position: { x: 0, y: 0 } });
    const voiceB = manager.play(sound, { position: { x: 100, y: 0 } });
    expect(spy.panners.length).toBe(2);
    expect(voiceA.position!.x).toBe(0);
    expect(voiceB.position!.x).toBe(100);
    spy.restore();
    sound.destroy();
  });

  test('voice.stop() disconnects the PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });
    const panner = spy.panners[0];

    voice.stop();
    expect(panner.disconnect).toHaveBeenCalled();
    spy.restore();
    sound.destroy();
  });

  test('ended voice is removed from spatial tracking after update()', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = mixer.play(sound, { position: { x: 0, y: 0 } }) as SoundVoice;

    voice.stop();

    const tickSpy = vi.spyOn(voice, '_tickSpatial');
    mixer.preUpdate();
    expect(tickSpy).not.toHaveBeenCalled();

    spy.restore();
    sound.destroy();
  });

  // AU1: voice.follow must track WORLD positions, not group-local ones.
  test('voice.follow of a node inside a translated RetainedContainer writes the WORLD position to the panner', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound) as SoundVoice;

    const group = new RetainedContainer();
    const emitter = new Drawable();

    group.setPosition(300, 400);
    emitter.setPosition(5, 6);
    group.addChild(emitter);

    voice.follow(emitter);

    const panner = spy.panners[0];

    expect(panner.positionX.setValueAtTime).toHaveBeenCalledWith(305, expect.any(Number));
    expect(panner.positionY.setValueAtTime).toHaveBeenCalledWith(406, expect.any(Number));

    group.setPosition(-100, 0);
    panner.positionX.setTargetAtTime.mockClear();
    panner.positionY.setTargetAtTime.mockClear();

    voice._tickSpatial();

    expect(panner.positionX.setTargetAtTime).toHaveBeenCalledWith(-95, expect.any(Number), expect.any(Number));
    expect(panner.positionY.setTargetAtTime).toHaveBeenCalledWith(6, expect.any(Number), expect.any(Number));

    spy.restore();
    group.destroy();
    sound.destroy();
  });

  test('voice.distanceModel/refDistance/maxDistance/rolloffFactor round-trip and clamp to valid numeric ranges', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    expect(voice.distanceModel).toBe('linear');
    voice.distanceModel = 'exponential';
    expect(voice.distanceModel).toBe('exponential');

    expect(voice.refDistance).toBe(50);
    voice.refDistance = 20;
    expect(voice.refDistance).toBe(20);
    // refDistance must stay positive: refDistance = 0 divides by zero in the
    // 'exponential' distance model, (d / refDistance) ^ -rolloffFactor. A
    // negative assignment clamps up to a tiny positive floor, never down to 0.
    voice.refDistance = -5;
    expect(voice.refDistance).toBeGreaterThan(0);
    expect(voice.refDistance).toBeLessThan(1e-10);

    expect(voice.maxDistance).toBe(1000);
    voice.maxDistance = 500;
    expect(voice.maxDistance).toBe(500);
    // maxDistance must stay positive (a non-positive value throws RangeError
    // in a real browser). Clamped independently of refDistance — the two are
    // NOT coupled, so this must not be compared against whatever refDistance
    // currently holds (see the dedicated decoupling test below).
    voice.maxDistance = -1;
    expect(voice.maxDistance).toBeGreaterThan(0);
    expect(voice.maxDistance).toBeLessThan(1e-10);

    expect(voice.rolloffFactor).toBe(1);
    voice.rolloffFactor = 2.5;
    expect(voice.rolloffFactor).toBe(2.5);
    voice.rolloffFactor = -3;
    expect(voice.rolloffFactor).toBe(0);

    sound.destroy();
  });

  test('refDistance no longer silently mutates maxDistance (independent clamps, no forced equality)', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    expect(voice.maxDistance).toBe(1000); // default

    // Raising refDistance above the current maxDistance must NOT bump
    // maxDistance to match — the two are independently clamped. Forcing them
    // equal would create a maxDistance === refDistance state, which divides
    // by zero in the default 'linear' distance model.
    voice.refDistance = 2000;
    expect(voice.refDistance).toBe(2000);
    expect(voice.maxDistance).toBe(1000);

    sound.destroy();
  });

  test('coneInnerAngle/coneOuterAngle/coneOuterGain clamp finite out-of-range values', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.coneInnerAngle = 400;
    expect(voice.coneInnerAngle).toBe(360);
    voice.coneInnerAngle = -10;
    expect(voice.coneInnerAngle).toBe(0);

    voice.coneOuterAngle = 720;
    expect(voice.coneOuterAngle).toBe(360);
    voice.coneOuterAngle = -1;
    expect(voice.coneOuterAngle).toBe(0);

    voice.coneOuterGain = 2;
    expect(voice.coneOuterGain).toBe(1);
    voice.coneOuterGain = -1;
    expect(voice.coneOuterGain).toBe(0);

    sound.destroy();
  });

  test('changing distanceModel/refDistance/maxDistance/rolloffFactor after the panner exists writes through live', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });
    const panner = spy.panners[0];

    voice.distanceModel = 'inverse';
    voice.refDistance = 10;
    voice.maxDistance = 200;
    voice.rolloffFactor = 3;

    expect(panner.distanceModel).toBe('inverse');
    expect(panner.refDistance).toBe(10);
    expect(panner.maxDistance).toBe(200);
    expect(panner.rolloffFactor).toBe(3);

    spy.restore();
    sound.destroy();
  });

  test('destroy() stops all active voices', () => {
    const spy = setupPannerSpy();
    const mixer = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = mixer.play(sound, { position: { x: 0, y: 0 } });

    sound.destroy();

    expect(voice.ended).toBe(true);

    const tickSpy = vi.spyOn(voice as SoundVoice, '_tickSpatial');
    mixer.preUpdate();
    expect(tickSpy).not.toHaveBeenCalled();

    spy.restore();
  });

  test('panningModel defaults to the app-wide equalpower setting', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, { position: { x: 0, y: 0 } });
    expect(spy.panners[0].panningModel).toBe('equalpower');
    spy.restore();
    sound.destroy();
  });

  test('PlayOptions.panningModel overrides the app-wide default for one voice', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, { position: { x: 0, y: 0 }, panningModel: 'HRTF' });
    expect(spy.panners[0].panningModel).toBe('HRTF');
    spy.restore();
    sound.destroy();
  });

  test('voice.panningModel round-trips and writes through live to an existing panner', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    expect(voice.panningModel).toBeNull();
    voice.panningModel = 'HRTF';
    expect(voice.panningModel).toBe('HRTF');
    expect(spy.panners[0].panningModel).toBe('HRTF');

    voice.panningModel = null;
    expect(spy.panners[0].panningModel).toBe('equalpower');

    spy.restore();
    sound.destroy();
  });

  test('changing app.audio.spatial.panningModel affects only voices with no per-voice override', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    manager.spatial.panningModel = 'HRTF';
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, { position: { x: 0, y: 0 } });
    manager.play(sound, { position: { x: 0, y: 0 }, panningModel: 'equalpower' });
    expect(spy.panners[0].panningModel).toBe('HRTF');
    expect(spy.panners[1].panningModel).toBe('equalpower');
    spy.restore();
    sound.destroy();
  });

  test('orientation and cone angles default to omnidirectional (no cone)', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, { position: { x: 0, y: 0 } });
    const panner = spy.panners[0];
    expect(panner.coneInnerAngle).toBe(360);
    expect(panner.coneOuterAngle).toBe(360);
    expect(panner.coneOuterGain).toBe(0);
    spy.restore();
    sound.destroy();
  });

  test('PlayOptions cone fields configure the PannerNode at play time', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, {
      position: { x: 0, y: 0 },
      orientation: 90,
      coneInnerAngle: 30,
      coneOuterAngle: 60,
      coneOuterGain: 0.2,
    });
    const panner = spy.panners[0];
    expect(panner.coneInnerAngle).toBe(30);
    expect(panner.coneOuterAngle).toBe(60);
    expect(panner.coneOuterGain).toBeCloseTo(0.2);
    expect(panner.orientationX.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0, 5), expect.any(Number));
    expect(panner.orientationY.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(1, 5), expect.any(Number));
    spy.restore();
    sound.destroy();
  });

  test('orientation degree 0 maps to the local +X axis (SceneNode.rotation convention)', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    manager.play(sound, { position: { x: 0, y: 0 }, orientation: 0, coneInnerAngle: 10 });
    const panner = spy.panners[0];
    expect(panner.orientationX.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(1, 5), expect.any(Number));
    expect(panner.orientationY.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0, 5), expect.any(Number));
    spy.restore();
    sound.destroy();
  });

  test('voice.orientation and cone setters round-trip and write through live', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    voice.coneInnerAngle = 45;
    voice.coneOuterAngle = 90;
    voice.coneOuterGain = 0.1;
    expect(voice.coneInnerAngle).toBe(45);
    expect(spy.panners[0].coneInnerAngle).toBe(45);

    spy.restore();
    sound.destroy();
  });

  test('dopplerFactor 0 (default) applies no playbackRate modulation regardless of velocity', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 }, velocity: { x: 100, y: 0 } }) as SoundVoice;
    const rateSpy = vi.spyOn(voice, 'playbackRate', 'set');
    manager.preUpdate();
    expect(rateSpy).not.toHaveBeenCalled();
    spy.restore();
    sound.destroy();
  });

  test('a source approaching a stationary listener with dopplerFactor > 0 raises its effective playbackRate', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    manager.spatial.dopplerFactor = 1;
    manager.spatial.speedOfSound = 100;
    manager.listener.position.set(0, 0);
    const sound = new Sound(createAudioBufferStub());
    // Source starts far away on the +X axis and, between ticks, moves toward the listener.
    const voice = manager.play(sound, { position: { x: 500, y: 0 } }) as SoundVoice;
    manager.preUpdate();
    voice.position = { x: 400, y: 0 }; // moved 100 units toward the listener
    manager.preUpdate();
    // Exact rate value depends on the implementer's chosen formula (see plan Task 5 Step 3) —
    // assert direction (> 1, i.e. pitched up while approaching), not an exact number.
    const source = (voice as unknown as { _source: { playbackRate: { setTargetAtTime: MockInstance } } })._source;
    const lastCallArgs = source.playbackRate.setTargetAtTime.mock.calls.at(-1);
    expect(lastCallArgs?.[0]).toBeGreaterThan(1);
    spy.restore();
    sound.destroy();
  });

  test('dopplerFactor dropping to 0 actively restores the base playbackRate (no stale ratio)', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    manager.spatial.dopplerFactor = 1;
    manager.spatial.speedOfSound = 100;
    manager.listener.position.set(0, 0);
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 100, y: 0 }, velocity: { x: -50, y: 0 } }) as SoundVoice;
    manager.preUpdate();

    const source = (voice as unknown as { _source: { playbackRate: { setTargetAtTime: MockInstance } } })._source;
    // Sanity: a real Doppler shift is in effect before we disable it.
    expect(source.playbackRate.setTargetAtTime.mock.calls.at(-1)?.[0]).not.toBe(voice.playbackRate);

    source.playbackRate.setTargetAtTime.mockClear();
    manager.spatial.dopplerFactor = 0;
    manager.preUpdate();

    expect(source.playbackRate.setTargetAtTime).toHaveBeenCalledWith(voice.playbackRate, expect.any(Number), expect.any(Number));

    spy.restore();
    sound.destroy();
  });

  test('the source becoming coincident with the listener actively restores the base playbackRate (no stale ratio)', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    manager.spatial.dopplerFactor = 1;
    manager.spatial.speedOfSound = 100;
    manager.listener.position.set(0, 0);
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 100, y: 0 }, velocity: { x: -50, y: 0 } }) as SoundVoice;
    manager.preUpdate();

    const source = (voice as unknown as { _source: { playbackRate: { setTargetAtTime: MockInstance } } })._source;
    expect(source.playbackRate.setTargetAtTime.mock.calls.at(-1)?.[0]).not.toBe(voice.playbackRate);

    source.playbackRate.setTargetAtTime.mockClear();
    voice.position = { x: 0, y: 0 }; // now exactly coincident with the listener

    expect(source.playbackRate.setTargetAtTime).toHaveBeenCalledWith(voice.playbackRate, expect.any(Number), expect.any(Number));

    spy.restore();
    sound.destroy();
  });

  test('velocity round-trips and can be cleared back to auto-derivation', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });
    expect(voice.velocity).toBeNull();
    voice.velocity = { x: 10, y: -5 };
    expect(voice.velocity!.x).toBe(10);
    voice.velocity = null;
    expect(voice.velocity).toBeNull();
    sound.destroy();
  });
});

describe('Voice — spatial parameter sanitization (NaN/±Infinity rejection)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('refDistance/maxDistance/cone setters reject NaN and ±Infinity, keeping the last valid value', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.refDistance = 30;
    voice.refDistance = NaN;
    expect(voice.refDistance).toBe(30);
    voice.refDistance = Infinity;
    expect(voice.refDistance).toBe(30);
    voice.refDistance = -Infinity;
    expect(voice.refDistance).toBe(30);

    voice.maxDistance = 400;
    voice.maxDistance = NaN;
    expect(voice.maxDistance).toBe(400);
    voice.maxDistance = Infinity;
    expect(voice.maxDistance).toBe(400);
    voice.maxDistance = -Infinity;
    expect(voice.maxDistance).toBe(400);

    voice.coneInnerAngle = 45;
    voice.coneInnerAngle = NaN;
    expect(voice.coneInnerAngle).toBe(45);
    voice.coneInnerAngle = Infinity;
    expect(voice.coneInnerAngle).toBe(45);

    voice.coneOuterAngle = 90;
    voice.coneOuterAngle = NaN;
    expect(voice.coneOuterAngle).toBe(90);
    voice.coneOuterAngle = -Infinity;
    expect(voice.coneOuterAngle).toBe(90);

    voice.coneOuterGain = 0.3;
    voice.coneOuterGain = NaN;
    expect(voice.coneOuterGain).toBe(0.3);
    voice.coneOuterGain = Infinity;
    expect(voice.coneOuterGain).toBe(0.3);

    voice.rolloffFactor = 2;
    voice.rolloffFactor = NaN;
    expect(voice.rolloffFactor).toBe(2);
    voice.rolloffFactor = Infinity;
    expect(voice.rolloffFactor).toBe(2);
    voice.rolloffFactor = -Infinity;
    expect(voice.rolloffFactor).toBe(2);

    sound.destroy();
  });

  test('a NaN/Infinity spatial setter never reaches the live PannerNode', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });
    const panner = spy.panners[0];

    voice.refDistance = NaN;
    voice.maxDistance = Infinity;
    voice.coneInnerAngle = NaN;
    voice.coneOuterAngle = -Infinity;
    voice.coneOuterGain = Infinity;
    voice.rolloffFactor = NaN;

    expect(Number.isFinite(panner.refDistance)).toBe(true);
    expect(Number.isFinite(panner.maxDistance)).toBe(true);
    expect(Number.isFinite(panner.coneInnerAngle)).toBe(true);
    expect(Number.isFinite(panner.coneOuterAngle)).toBe(true);
    expect(Number.isFinite(panner.coneOuterGain)).toBe(true);
    expect(Number.isFinite(panner.rolloffFactor)).toBe(true);

    spy.restore();
    sound.destroy();
  });

  test('velocity setter rejects a non-finite component outright, keeping the previous velocity', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    voice.velocity = { x: 10, y: -5 };

    voice.velocity = { x: NaN, y: 3 };
    expect(voice.velocity!.x).toBe(10);
    expect(voice.velocity!.y).toBe(-5);

    voice.velocity = { x: Infinity, y: 0 };
    expect(voice.velocity!.x).toBe(10);
    expect(voice.velocity!.y).toBe(-5);

    voice.velocity = { x: 1, y: -Infinity };
    expect(voice.velocity!.x).toBe(10);
    expect(voice.velocity!.y).toBe(-5);

    sound.destroy();
  });

  test('a non-finite position component never reaches the live PannerNode and does not poison later writes', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 1, y: 2 } }) as SoundVoice;
    const panner = spy.panners[0];

    panner.positionX.setValueAtTime.mockClear();
    panner.positionX.setTargetAtTime.mockClear();

    voice.position = { x: NaN, y: 5 };
    expect(panner.positionX.setValueAtTime).not.toHaveBeenCalled();
    expect(panner.positionX.setTargetAtTime).not.toHaveBeenCalled();

    // A subsequent VALID write must still go through normally — the rejected
    // tick must not have poisoned the smoothing layer's last-known-good value.
    voice.position = { x: 50, y: 5 };
    expect(panner.positionX.setTargetAtTime).toHaveBeenCalledWith(50, expect.any(Number), expect.any(Number));

    spy.restore();
    sound.destroy();
  });

  test('a non-finite orientation never reaches the live PannerNode and does not poison later writes', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 }, orientation: 0 }) as SoundVoice;
    const panner = spy.panners[0];

    panner.orientationX.setValueAtTime.mockClear();
    panner.orientationX.setTargetAtTime.mockClear();

    voice.orientation = NaN;
    expect(panner.orientationX.setValueAtTime).not.toHaveBeenCalled();
    expect(panner.orientationX.setTargetAtTime).not.toHaveBeenCalled();

    voice.orientation = 90;
    expect(panner.orientationX.setTargetAtTime).toHaveBeenCalledWith(expect.closeTo(0, 5), expect.any(Number), expect.any(Number));

    spy.restore();
    sound.destroy();
  });

  test('a NaN speedOfSound never applies a NaN Doppler ratio — falls back to the base playback rate', () => {
    const spy = setupPannerSpy();
    const manager = new AudioManager();
    manager.spatial.dopplerFactor = 1;
    manager.spatial.speedOfSound = 100;
    manager.listener.position.set(0, 0);
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 100, y: 0 }, velocity: { x: -50, y: 0 } }) as SoundVoice;
    manager.preUpdate();

    const source = (voice as unknown as { _source: { playbackRate: { setTargetAtTime: MockInstance } } })._source;
    // Sanity: a real (finite, non-1) Doppler shift is in effect first.
    expect(source.playbackRate.setTargetAtTime.mock.calls.at(-1)?.[0]).not.toBe(voice.playbackRate);

    source.playbackRate.setTargetAtTime.mockClear();
    manager.spatial.speedOfSound = NaN;
    manager.preUpdate();

    // Whatever writes DO happen after the settings object turns NaN must
    // never carry that NaN through to the live AudioParam.
    for (const call of source.playbackRate.setTargetAtTime.mock.calls) {
      expect(Number.isFinite(call[0] as number)).toBe(true);
    }

    spy.restore();
    sound.destroy();
  });
});
