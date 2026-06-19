import { getAudioContext } from '#audio/audio-context';
import { AudioBus } from '#audio/AudioBus';
import { disposeAudioManager, getAudioManager } from '#audio/AudioManager';
import { Music } from '#audio/Music';
import { Sound } from '#audio/Sound';
import { Video } from '#rendering/video/Video';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createAudioBufferStub = (): AudioBuffer => ({ duration: 2 }) as AudioBuffer;

const createAudioElementStub = (): HTMLAudioElement => {
  const el = document.createElement('audio');
  Object.defineProperty(el, 'duration', { configurable: true, value: 5 });
  return el;
};

const createVideoElementStub = (): HTMLVideoElement => {
  const el = document.createElement('video');
  Object.defineProperty(el, 'duration', { configurable: true, value: 10 });
  Object.defineProperty(el, 'volume', { configurable: true, writable: true, value: 1 });
  Object.defineProperty(el, 'playbackRate', { configurable: true, writable: true, value: 1 });
  Object.defineProperty(el, 'loop', { configurable: true, writable: true, value: false });
  Object.defineProperty(el, 'muted', { configurable: true, writable: true, value: false });
  return el;
};

// Spy on gainNode.connect to capture where it connects to.
interface ConnectSpy {
  gainNode: { connect: MockInstance; disconnect: MockInstance; gain: object };
  restore: () => void;
}

const spyOnGainConnect = (): ConnectSpy => {
  const gainNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: {
      setTargetAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      value: 1,
    },
  };
  const ctx = getAudioContext() as AudioContext & { createGain: () => GainNode };

  // We need to capture only the FIRST createGain call (the media's gainNode),
  // as the bus also calls createGain. To do that we wrap createGain to return
  // the mock only once and fall through for subsequent calls.
  const original = ctx.createGain.bind(ctx);
  let firstCall = true;
  const spy = vi.spyOn(ctx, 'createGain').mockImplementation(() => {
    if (firstCall) {
      firstCall = false;
      return gainNode as unknown as GainNode;
    }
    return original();
  });

  return {
    gainNode,
    restore: () => spy.mockRestore(),
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bus routing (Sound / Music / Video)', () => {
  beforeEach(() => {
    disposeAudioManager();
  });

  afterEach(() => {
    disposeAudioManager();
    vi.restoreAllMocks();
  });

  // 1. Default bus for Sound voice (via manager.play)
  test('manager.play(sound) routes voice to audioManager.sound bus by default', () => {
    // Create manager BEFORE spy so bus setup doesn't consume the firstCall slot.
    const manager = getAudioManager();
    const spy = spyOnGainConnect();
    const sound = new Sound(createAudioBufferStub());

    manager.play(sound);

    // The gainNode for the voice should connect to the sound bus input
    const soundBusInput = manager.sound._getInputNode();
    expect(spy.gainNode.connect).toHaveBeenCalledWith(soundBusInput);

    spy.restore();
    sound.destroy();
  });

  // 2. Default bus for Music
  test('new Music has bus === audioManager.music', () => {
    const music = new Music(createAudioElementStub());
    expect(music.bus).toBe(getAudioManager().music);
    music.destroy();
  });

  // 3. Default bus for Video
  test('new Video has bus === audioManager.master when manager already exists', () => {
    const manager = getAudioManager(); // ensure manager is constructed first
    const video = new Video(createVideoElementStub());
    expect(video.bus).toBe(manager.master);
    video.destroy();
  });

  test('new Video has bus === null when no manager has been constructed yet', () => {
    // disposeAudioManager() called in beforeEach; no manager exists here
    const video = new Video(createVideoElementStub());
    expect(video.bus).toBeNull();
    video.destroy();
  });

  // 4. Passing bus option to manager.play() routes to that bus
  test('manager.play(sound, { bus }) routes voice to the specified bus — voice is created alive', () => {
    const manager = getAudioManager();
    const sound = new Sound(createAudioBufferStub());

    const customBus = new AudioBus('custom');
    // Playing with a custom bus should succeed and return a live voice
    const voice = manager.play(sound, { bus: customBus });
    expect(voice.ended).toBe(false);

    voice.stop();
    sound.destroy();
    customBus.destroy();
  });

  // 5. Playing same sound twice: each voice routes to the bus specified at play time
  test('each play() call creates an independent voice with its own bus routing', () => {
    const manager = getAudioManager();
    const sound = new Sound(createAudioBufferStub());

    const customBus = new AudioBus('custom2');
    // First voice → default sound bus; second → customBus
    const voice1 = manager.play(sound);
    const voice2 = manager.play(sound, { bus: customBus });

    // Both voices should be alive
    expect(voice1.ended).toBe(false);
    expect(voice2.ended).toBe(false);

    sound.destroy();
    customBus.destroy();
  });

  // 6. Music gainNode connects to music bus's inputNode at construction
  test('Music gainNode connects to music bus inputNode at construction time', () => {
    const manager = getAudioManager(); // ensure manager exists before spy
    const spy = spyOnGainConnect();
    const music = new Music(createAudioElementStub());

    const musicBusInput = manager.music._getInputNode();
    expect(spy.gainNode.connect).toHaveBeenCalledWith(musicBusInput);

    spy.restore();
    music.destroy();
  });

  // 7. Setting Music.bus reconnects gainNode to custom bus
  test('setting Music.bus reconnects gainNode to custom bus inputNode', () => {
    getAudioManager(); // ensure manager exists before spy
    const spy = spyOnGainConnect();
    const music = new Music(createAudioElementStub());

    // Now switch to a custom bus.
    const customBus = new AudioBus('custom3');
    music.bus = customBus;

    // The old connection should have been disconnected.
    expect(spy.gainNode.disconnect).toHaveBeenCalled();

    // And reconnected to the custom bus input.
    const customBusInput = customBus._getInputNode();
    expect(spy.gainNode.connect).toHaveBeenCalledWith(customBusInput);

    spy.restore();
    music.destroy();
    customBus.destroy();
  });

  // 8. Setting same bus is a no-op
  test('setting Music.bus to the same explicitly-set bus is a no-op', () => {
    getAudioManager(); // ensure manager exists before spy
    const spy = spyOnGainConnect();
    const music = new Music(createAudioElementStub());
    const customBus = new AudioBus('custom-noop');

    // First set to a custom bus so _bus is assigned.
    music.bus = customBus;
    spy.gainNode.disconnect.mockClear();
    spy.gainNode.connect.mockClear();

    // Setting to the same custom bus should not trigger disconnect/reconnect.
    music.bus = customBus;
    expect(spy.gainNode.disconnect).not.toHaveBeenCalled();
    expect(spy.gainNode.connect).not.toHaveBeenCalled();

    spy.restore();
    music.destroy();
    customBus.destroy();
  });
});
