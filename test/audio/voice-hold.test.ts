/**
 * An owner's hold (`_setHeld`) silences a pausable voice without touching the
 * caller's own pause: `paused` keeps reporting the caller's request, a voice
 * the caller paused stays paused when the hold lifts, and one the caller
 * resumed while held starts only then.
 */
import { getAudioContext } from '#audio/audioContext';
import { AudioGenerator } from '#audio/AudioGenerator';
import type { AudioGeneratorVoice } from '#audio/AudioGeneratorVoice';
import { AudioStream } from '#audio/AudioStream';
import type { AudioStreamVoice } from '#audio/AudioStreamVoice';
import { AudioSystem } from '#audio/AudioSystem';
import { Sound } from '#audio/Sound';
import type { SoundVoice } from '#audio/SoundVoice';
import { Time } from '#core/units';

const halted = (voice: SoundVoice | AudioGeneratorVoice): boolean => (voice as unknown as { _halted: boolean })._halted;

const createAudioElementStub = (): HTMLAudioElement => {
  const element = document.createElement('audio');

  Object.defineProperty(element, 'duration', { configurable: true, value: 30 });
  Object.defineProperty(element, 'currentTime', { configurable: true, writable: true, value: 0 });
  Object.defineProperty(element, 'paused', { configurable: true, writable: true, value: true });
  element.play = vi.fn(() => {
    Object.defineProperty(element, 'paused', { configurable: true, writable: true, value: false });

    return Promise.resolve();
  });
  element.pause = vi.fn(() => {
    Object.defineProperty(element, 'paused', { configurable: true, writable: true, value: true });
  });

  return element;
};

describe.each([
  ['SoundVoice', (system: AudioSystem) => system.play(new Sound({ duration: 10 } as AudioBuffer), { loop: true }) as SoundVoice],
  ['AudioGeneratorVoice', (system: AudioSystem) => system.play(new AudioGenerator({ frequency: 440 })) as AudioGeneratorVoice],
] as const)('%s hold', (_name, play) => {
  let system: AudioSystem;

  beforeEach(async () => {
    await getAudioContext().resume();
    system = new AudioSystem();
  });

  afterEach(() => {
    system.destroy();
  });

  test('a held voice is silent while paused keeps reporting the caller', () => {
    const voice = play(system);

    voice._setHeld(true);

    expect(halted(voice)).toBe(true);
    expect(voice.paused).toBe(false);

    voice._setHeld(false);

    expect(halted(voice)).toBe(false);
  });

  test('a voice paused by its caller while held stays paused when the hold lifts', () => {
    const voice = play(system);

    voice._setHeld(true);
    voice.pause();
    voice._setHeld(false);

    expect(voice.paused).toBe(true);
    expect(halted(voice)).toBe(true);
  });

  test('a voice resumed by its caller while held plays only once the hold lifts', () => {
    const voice = play(system);

    voice.pause();
    voice._setHeld(true);
    voice.resume();

    expect(voice.paused).toBe(false);
    expect(halted(voice)).toBe(true);

    voice._setHeld(false);

    expect(halted(voice)).toBe(false);
  });

  test('lifting a hold on a voice its caller paused before keeps it paused', () => {
    const voice = play(system);

    voice.pause();
    voice._setHeld(true);
    voice._setHeld(false);

    expect(voice.paused).toBe(true);
    expect(halted(voice)).toBe(true);
  });

  test('a voice stopped while held ends, and lifting the hold afterwards starts nothing', () => {
    const voice = play(system);

    voice._setHeld(true);
    voice.stop();
    voice._setHeld(false);

    expect(voice.ended).toBe(true);
  });

  test('a hold on an ended voice is ignored', () => {
    const voice = play(system);

    voice.stop();
    voice._setHeld(true);

    expect(voice.ended).toBe(true);
    expect(voice.paused).toBe(false);
  });
});

test('holding a generator note that is already releasing ends it, as a caller pause would', async () => {
  await getAudioContext().resume();

  const system = new AudioSystem();
  const voice = system.play(new AudioGenerator({ frequency: 440 })) as AudioGeneratorVoice;

  voice.stop(Time.seconds(1));
  voice._setHeld(true);

  expect(voice.ended).toBe(true);

  system.destroy();
});

describe('AudioStreamVoice hold', () => {
  let system: AudioSystem;

  beforeEach(async () => {
    await getAudioContext().resume();
    system = new AudioSystem();
  });

  afterEach(() => {
    system.destroy();
  });

  test('silences the element without reporting a caller pause, and restarts it when lifted', () => {
    const element = createAudioElementStub();
    const voice = system.play(new AudioStream(element)) as AudioStreamVoice;

    voice._setHeld(true);

    expect(element.paused).toBe(true);
    expect(voice.paused).toBe(false);

    voice._setHeld(false);

    expect(element.paused).toBe(false);
  });

  test('a caller pause made while held survives the hold being lifted', () => {
    const element = createAudioElementStub();
    const voice = system.play(new AudioStream(element)) as AudioStreamVoice;

    voice._setHeld(true);
    voice.pause();
    voice._setHeld(false);

    expect(voice.paused).toBe(true);
    expect(element.paused).toBe(true);
  });

  test('a caller resume made while held waits for the hold to lift', () => {
    const element = createAudioElementStub();
    const voice = system.play(new AudioStream(element)) as AudioStreamVoice;

    voice.pause();
    voice._setHeld(true);
    voice.resume();

    expect(element.paused).toBe(true);

    voice._setHeld(false);

    expect(element.paused).toBe(false);
  });
});
