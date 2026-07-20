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
    mixer.update();
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
    mixer.update();
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
    mixer.update();
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

  test('voice.distanceModel/refDistance/maxDistance/rolloffFactor round-trip and clamp to >= 0', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    expect(voice.distanceModel).toBe('linear');
    voice.distanceModel = 'exponential';
    expect(voice.distanceModel).toBe('exponential');

    expect(voice.refDistance).toBe(50);
    voice.refDistance = 20;
    expect(voice.refDistance).toBe(20);
    voice.refDistance = -5;
    expect(voice.refDistance).toBe(0);

    expect(voice.maxDistance).toBe(1000);
    voice.maxDistance = 500;
    expect(voice.maxDistance).toBe(500);
    voice.maxDistance = -1;
    expect(voice.maxDistance).toBe(0);

    expect(voice.rolloffFactor).toBe(1);
    voice.rolloffFactor = 2.5;
    expect(voice.rolloffFactor).toBe(2.5);
    voice.rolloffFactor = -3;
    expect(voice.rolloffFactor).toBe(0);

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
    mixer.update();
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
});
