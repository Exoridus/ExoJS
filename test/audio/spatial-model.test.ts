/**
 * The parts of the spatial model this engine did not have: the third axis,
 * occlusion, and the send/zone layer.
 *
 * Everything else the original finding listed - distance models, cones, HRTF,
 * Doppler, a virtual listener - already existed, so these cells cover only what
 * was added, plus one re-pin that a voice nobody positions still builds nothing.
 */

import type { MockInstance } from 'vitest';

import { getAudioContext } from '#audio/audio-context';
import { AudioBus } from '#audio/AudioBus';
import { AudioManager } from '#audio/AudioManager';
import { AudioZone } from '#audio/AudioZone';
import { Sound } from '#audio/Sound';
import { Rectangle } from '#math/Rectangle';

const createAudioBufferStub = (): AudioBuffer => ({ duration: 2 }) as AudioBuffer;

interface MockParam {
  setValueAtTime: MockInstance;
  setTargetAtTime: MockInstance;
  cancelScheduledValues: MockInstance;
  value: number;
}

const makeParam = (value = 0): MockParam => ({
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  value,
});

interface MockPanner {
  connect: MockInstance;
  disconnect: MockInstance;
  panningModel: PanningModelType;
  distanceModel: DistanceModelType;
  maxDistance: number;
  refDistance: number;
  rolloffFactor: number;
  coneInnerAngle: number;
  coneOuterAngle: number;
  coneOuterGain: number;
  positionX: MockParam;
  positionY: MockParam;
  positionZ: MockParam;
  orientationX: MockParam;
  orientationY: MockParam;
  orientationZ: MockParam;
}

const spyPanners = (): { panners: MockPanner[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createPanner: () => PannerNode };
  const panners: MockPanner[] = [];
  const spy = vi.spyOn(ctx, 'createPanner').mockImplementation(() => {
    const panner: MockPanner = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      panningModel: 'equalpower',
      distanceModel: 'linear',
      maxDistance: 10000,
      refDistance: 1,
      rolloffFactor: 1,
      coneInnerAngle: 360,
      coneOuterAngle: 360,
      coneOuterGain: 0,
      positionX: makeParam(),
      positionY: makeParam(),
      positionZ: makeParam(),
      orientationX: makeParam(),
      orientationY: makeParam(),
      orientationZ: makeParam(),
    };

    panners.push(panner);

    return panner as unknown as PannerNode;
  });

  return { panners, restore: () => spy.mockRestore() };
};

interface MockFilter {
  type: BiquadFilterType;
  frequency: MockParam;
  Q: MockParam;
  connect: MockInstance;
  disconnect: MockInstance;
}

const spyFilters = (): { filters: MockFilter[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createBiquadFilter: () => BiquadFilterNode };
  const filters: MockFilter[] = [];
  const spy = vi.spyOn(ctx, 'createBiquadFilter').mockImplementation(() => {
    const filter: MockFilter = {
      type: 'lowpass',
      frequency: makeParam(350),
      Q: makeParam(1),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    filters.push(filter);

    return filter as unknown as BiquadFilterNode;
  });

  return { filters, restore: () => spy.mockRestore() };
};

/** The last value a param was asked to ramp to, or `undefined` if it never was. */
const lastTarget = (param: MockParam): number | undefined => param.setTargetAtTime.mock.calls.at(-1)?.[0] as number | undefined;

/**
 * The last value a param was asked to hold, whichever call made it.
 *
 * The smoothing layer snaps the first write and ramps later ones, so neither
 * spy alone tells the whole story - `invocationCallOrder` decides which came
 * last.
 */
const lastWritten = (param: MockParam): number | undefined => {
  const calls = [...param.setValueAtTime.mock.calls.keys()]
    .map(index => ({ value: param.setValueAtTime.mock.calls[index]![0] as number, order: param.setValueAtTime.mock.invocationCallOrder[index]! }))
    .concat(
      [...param.setTargetAtTime.mock.calls.keys()].map(index => ({
        value: param.setTargetAtTime.mock.calls[index]![0] as number,
        order: param.setTargetAtTime.mock.invocationCallOrder[index]!,
      })),
    )
    .sort((a, b) => a.order - b.order);

  return calls.at(-1)?.value;
};

describe('elevation - the third axis', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a voice with no position still builds no panner', () => {
    const panners = spyPanners();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    manager.play(sound);

    expect(panners.panners).toHaveLength(0);

    panners.restore();
    sound.destroy();
  });

  test('elevation reaches the panner Z param', () => {
    const panners = spyPanners();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 }, elevation: 30 });

    expect(voice.elevation).toBe(30);
    expect(lastWritten(panners.panners[0]!.positionZ)).toBe(30);

    panners.restore();
    sound.destroy();
  });

  test('a three-component position writes elevation, and a two-component one leaves it alone', () => {
    const panners = spyPanners();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.position = { x: 4, y: 5, z: 12 };
    expect(voice.elevation).toBe(12);

    // Deliberate: `follow()` and a plain `{ x, y }` write cannot silently drop a
    // source back onto the plane.
    voice.position = { x: 6, y: 7 };
    expect(voice.elevation).toBe(12);

    panners.restore();
    sound.destroy();
  });

  test('setting elevation alone is enough to spatialize a voice', () => {
    const panners = spyPanners();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound);

    voice.elevation = 8;

    expect(panners.panners).toHaveLength(1);

    panners.restore();
    sound.destroy();
  });

  test('listener elevation shifts the relative Z a voice writes', () => {
    const panners = spyPanners();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 }, elevation: 30 });

    manager.listener.elevation = 10;
    voice._tickSpatial();

    expect(lastWritten(panners.panners[0]!.positionZ)).toBe(20);

    panners.restore();
    sound.destroy();
  });

  test('vertical motion produces a Doppler shift', () => {
    const panners = spyPanners();
    const manager = new AudioManager();

    manager.spatial.dopplerFactor = 1;
    manager.spatial.speedOfSound = 1000;

    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 }, elevation: 100 });
    const ratios: number[] = [];

    // `_applyDopplerRate` is the documented hook a voice type overrides to reach
    // its own rate param, so it is also the honest place to read the ratio.
    (voice as unknown as { _applyDopplerRate(ratio: number): void })._applyDopplerRate = (ratio: number): void => {
      ratios.push(ratio);
    };

    // Receding straight upward from a listener on the plane. A planar projection
    // could never produce this: every component of the motion is out of plane.
    voice.elevationVelocity = 200;
    voice._tickSpatial();

    expect(ratios.at(-1)).toBeCloseTo(0.8, 5);

    voice.elevationVelocity = -200;
    voice._tickSpatial();

    expect(ratios.at(-1)).toBeCloseTo(1.2, 5);

    panners.restore();
    sound.destroy();
  });
});

describe('occlusion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a voice that is never occluded builds no filter', () => {
    const filters = spyFilters();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    expect(voice.occlusion).toBe(0);
    expect(filters.filters).toHaveLength(0);

    filters.restore();
    sound.destroy();
  });

  test('occluding a voice lowers its cutoff and its gain', () => {
    const filters = spyFilters();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    voice.occlusion = 1;

    const filter = filters.filters[0];

    expect(filter).toBeDefined();
    expect(filter!.type).toBe('lowpass');
    expect(lastTarget(filter!.frequency)).toBeCloseTo(manager.spatial.occlusionCutoff, 5);

    voice.occlusion = 0.5;

    // Logarithmic: the halfway point is the geometric mean of the endpoints, not
    // the arithmetic one - a linear sweep would spend half the range inaudible.
    const open = getAudioContext().sampleRate / 2;

    expect(lastTarget(filter!.frequency)).toBeCloseTo(Math.sqrt(open * manager.spatial.occlusionCutoff), 3);

    filters.restore();
    sound.destroy();
  });

  test('occlusion is clamped and idempotent', () => {
    const filters = spyFilters();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    voice.occlusion = 5;
    expect(voice.occlusion).toBe(1);

    voice.occlusion = -3;
    expect(voice.occlusion).toBe(0);

    // Returning to clear does not tear the stage down again - rebuilding the
    // chain on every threshold crossing would be audible.
    expect(filters.filters).toHaveLength(1);

    filters.restore();
    sound.destroy();
  });

  test('PlayOptions.occlusion seeds it', () => {
    const filters = spyFilters();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 }, occlusion: 0.75 });

    expect(voice.occlusion).toBe(0.75);
    expect(filters.filters).toHaveLength(1);

    filters.restore();
    sound.destroy();
  });
});

describe('AudioSend', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a send carries its own level and shows up on the voice', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const reverb = new AudioBus('reverb');
    const voice = manager.play(sound);
    const send = voice.addSend(reverb, 0.4);

    expect(send.bus).toBe(reverb);
    expect(send.level).toBe(0.4);
    expect(voice.sends).toEqual([send]);

    send.level = 0.9;
    expect(send.level).toBe(0.9);

    reverb.destroy();
    sound.destroy();
  });

  test('a negative level is clamped to silence', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const reverb = new AudioBus('reverb');
    const send = manager.play(sound).addSend(reverb, -1);

    expect(send.level).toBe(0);

    reverb.destroy();
    sound.destroy();
  });

  test('removeSend destroys it and drops it from the list', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const reverb = new AudioBus('reverb');
    const voice = manager.play(sound);
    const send = voice.addSend(reverb);

    voice.removeSend(send);

    expect(send.destroyed).toBe(true);
    expect(voice.sends).toHaveLength(0);

    // Idempotent, and a send from nowhere is ignored.
    voice.removeSend(send);

    reverb.destroy();
    sound.destroy();
  });

  test('the voice tears its sends down when it ends', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const reverb = new AudioBus('reverb');
    const voice = manager.play(sound);
    const send = voice.addSend(reverb);

    voice.stop();

    expect(send.destroyed).toBe(true);
    expect(voice.sends).toHaveLength(0);

    reverb.destroy();
    sound.destroy();
  });

  test('PlayOptions.sends opens them at play time', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const reverb = new AudioBus('reverb');
    const echo = new AudioBus('echo');
    const voice = manager.play(sound, { sends: [{ bus: reverb, level: 0.3 }, { bus: echo }] });

    expect(voice.sends.map(({ bus, level }) => [bus.name, level])).toEqual([
      ['reverb', 0.3],
      ['echo', 1],
    ]);

    reverb.destroy();
    echo.destroy();
    sound.destroy();
  });
});

describe('AudioZone geometry', () => {
  test('a rectangle zone is full weight inside and zero past its falloff', () => {
    const bus = new AudioBus('reverb');
    const zone = new AudioZone({ shape: new Rectangle(0, 0, 100, 100), bus, falloff: 50 });

    expect(zone.weightAt(50, 50)).toBe(1);
    expect(zone.weightAt(0, 0)).toBe(1);
    expect(zone.weightAt(125, 50)).toBeCloseTo(0.5, 5);
    expect(zone.weightAt(150, 50)).toBe(0);
    expect(zone.weightAt(400, 400)).toBe(0);

    bus.destroy();
  });

  test('a zero falloff is a hard edge', () => {
    const bus = new AudioBus('reverb');
    const zone = new AudioZone({ shape: new Rectangle(0, 0, 100, 100), bus });

    expect(zone.weightAt(100, 100)).toBe(1);
    expect(zone.weightAt(101, 50)).toBe(0);

    bus.destroy();
  });

  test('a circle zone measures distance to its rim', () => {
    const bus = new AudioBus('reverb');
    const zone = new AudioZone({ shape: { x: 0, y: 0, radius: 100 }, bus, falloff: 100 });

    expect(zone.weightAt(0, 0)).toBe(1);
    expect(zone.weightAt(100, 0)).toBe(1);
    expect(zone.weightAt(150, 0)).toBeCloseTo(0.5, 5);
    expect(zone.weightAt(200, 0)).toBe(0);

    bus.destroy();
  });

  test('height bounds the zone vertically', () => {
    const bus = new AudioBus('reverb');
    const columnar = new AudioZone({ shape: new Rectangle(0, 0, 100, 100), bus });
    const banded = new AudioZone({ shape: new Rectangle(0, 0, 100, 100), bus, height: 20 });

    expect(columnar.weightAt(50, 50, 10_000)).toBe(1);
    expect(banded.weightAt(50, 50, 10)).toBe(1);
    expect(banded.weightAt(50, 50, 25)).toBe(0);

    bus.destroy();
  });
});

describe('SpatialZones', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('does nothing at all while no zone is registered', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    expect(manager.zones.active).toBe(false);
    manager.preUpdate(0.016 as never);

    expect(voice.sends).toHaveLength(0);

    sound.destroy();
  });

  test('a listener inside a zone opens a send on every voice, and leaving closes it', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const reverb = new AudioBus('reverb');
    const zone = new AudioZone({ shape: new Rectangle(0, 0, 100, 100), bus: reverb, send: 0.6 });

    manager.zones.add(zone);
    expect(manager.zones.active).toBe(true);

    const voice = manager.play(sound, { position: { x: 10, y: 10 } });

    manager.listener.position.set(50, 50);
    manager.preUpdate(0.016 as never);

    expect(voice.sends).toHaveLength(1);
    expect(voice.sends[0]!.bus).toBe(reverb);
    expect(voice.sends[0]!.level).toBeCloseTo(0.6, 5);

    const send = voice.sends[0]!;

    manager.listener.position.set(400, 400);
    manager.preUpdate(0.016 as never);

    expect(voice.sends).toHaveLength(0);
    expect(send.destroyed).toBe(true);

    reverb.destroy();
    sound.destroy();
  });

  test('the send level follows the falloff ramp instead of switching', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const reverb = new AudioBus('reverb');

    manager.zones.add(new AudioZone({ shape: new Rectangle(0, 0, 100, 100), bus: reverb, send: 1, falloff: 100 }));

    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    manager.listener.position.set(150, 50);
    manager.preUpdate(0.016 as never);

    expect(voice.sends[0]!.level).toBeCloseTo(0.5, 5);

    // Same send object, new level - a boundary crossing is a crossfade, not a
    // teardown and rebuild.
    const send = voice.sends[0]!;

    manager.listener.position.set(125, 50);
    manager.preUpdate(0.016 as never);

    expect(voice.sends[0]).toBe(send);
    expect(send.level).toBeCloseTo(0.75, 5);

    reverb.destroy();
    sound.destroy();
  });

  test('two overlapping zones each contribute their own send', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const reverb = new AudioBus('reverb');
    const echo = new AudioBus('echo');

    manager.zones
      .add(new AudioZone({ shape: new Rectangle(0, 0, 100, 100), bus: reverb, send: 0.5 }))
      .add(new AudioZone({ shape: { x: 60, y: 60, radius: 80 }, bus: echo, send: 0.25 }));

    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    manager.listener.position.set(70, 70);
    manager.preUpdate(0.016 as never);

    expect(voice.sends.map(({ bus }) => bus.name)).toEqual(['reverb', 'echo']);

    reverb.destroy();
    echo.destroy();
    sound.destroy();
  });

  test('removing a zone closes the sends it held', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const reverb = new AudioBus('reverb');
    const zone = new AudioZone({ shape: new Rectangle(0, 0, 100, 100), bus: reverb });

    manager.zones.add(zone);

    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    manager.listener.position.set(50, 50);
    manager.preUpdate(0.016 as never);
    expect(voice.sends).toHaveLength(1);

    const send = voice.sends[0]!;

    manager.zones.remove(zone);

    expect(manager.zones.active).toBe(false);
    expect(send.destroyed).toBe(true);
    expect(voice.sends).toHaveLength(0);

    reverb.destroy();
    sound.destroy();
  });

  test('an ended voice gets no new sends and is dropped from the bookkeeping', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());
    const reverb = new AudioBus('reverb');

    manager.zones.add(new AudioZone({ shape: new Rectangle(0, 0, 100, 100), bus: reverb }));

    const voice = manager.play(sound, { position: { x: 0, y: 0 } });

    manager.listener.position.set(50, 50);
    voice.stop();
    manager.preUpdate(0.016 as never);

    expect(voice.sends).toHaveLength(0);

    reverb.destroy();
    sound.destroy();
  });
});
