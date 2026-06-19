import { getAudioContext } from '#audio/audio-context';
import { AudioBus } from '#audio/AudioBus';
import { AudioManager } from '#audio/AudioManager';
import { AudioStream } from '#audio/AudioStream';
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

describe('Bus routing (Sound / AudioStream / Video)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Default bus for a Sound voice (via manager.play)
  test('manager.play(sound) routes the voice output to the sound bus by default', () => {
    // Create manager BEFORE spy so bus setup doesn't consume the firstCall slot.
    const manager = new AudioManager();
    const spy = spyOnGainConnect();
    const sound = new Sound(createAudioBufferStub());

    manager.play(sound);

    // The voice's output gain should connect to the sound bus input.
    const soundBusInput = manager.sound._getInputNode();
    expect(spy.gainNode.connect).toHaveBeenCalledWith(soundBusInput);

    spy.restore();
    sound.destroy();
  });

  // 2. Passing a bus option to manager.play() routes to that bus
  test('manager.play(sound, { bus }) routes the voice to the specified bus — voice is created alive', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    const customBus = new AudioBus('custom');
    const voice = manager.play(sound, { bus: customBus });
    expect(voice.ended).toBe(false);
    expect(voice.bus).toBe(customBus);

    voice.stop();
    sound.destroy();
    customBus.destroy();
  });

  // 3. Playing same sound twice: each voice is independent
  test('each play() call creates an independent voice with its own bus routing', () => {
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub());

    const customBus = new AudioBus('custom2');
    const voice1 = manager.play(sound);
    const voice2 = manager.play(sound, { bus: customBus });

    expect(voice1.ended).toBe(false);
    expect(voice2.ended).toBe(false);
    expect(voice1.bus).toBe(manager.sound);
    expect(voice2.bus).toBe(customBus);

    sound.destroy();
    customBus.destroy();
  });

  // 4. AudioStream voice routes to the music bus by default
  test('manager.play(stream) routes the voice output to the music bus by default', () => {
    const manager = new AudioManager();
    const spy = spyOnGainConnect();
    const stream = new AudioStream(createAudioElementStub());

    const voice = manager.play(stream);

    const musicBusInput = manager.music._getInputNode();
    expect(spy.gainNode.connect).toHaveBeenCalledWith(musicBusInput);
    expect(voice.bus).toBe(manager.music);

    spy.restore();
    stream.destroy();
  });

  // 5. Reassigning voice.bus reconnects the output to the new bus
  test('setting voice.bus reconnects the output to a custom bus inputNode', () => {
    const manager = new AudioManager();
    const spy = spyOnGainConnect();
    const stream = new AudioStream(createAudioElementStub());
    const voice = manager.play(stream);

    const customBus = new AudioBus('custom3');
    voice.bus = customBus;

    expect(spy.gainNode.disconnect).toHaveBeenCalled();
    expect(spy.gainNode.connect).toHaveBeenCalledWith(customBus._getInputNode());

    spy.restore();
    stream.destroy();
    customBus.destroy();
  });

  // 6. Setting voice.bus to the same bus is a no-op
  test('setting voice.bus to the same bus is a no-op', () => {
    const manager = new AudioManager();
    const spy = spyOnGainConnect();
    const stream = new AudioStream(createAudioElementStub());
    const voice = manager.play(stream);

    const customBus = new AudioBus('custom-noop');
    voice.bus = customBus;
    spy.gainNode.disconnect.mockClear();
    spy.gainNode.connect.mockClear();

    voice.bus = customBus;
    expect(spy.gainNode.disconnect).not.toHaveBeenCalled();
    expect(spy.gainNode.connect).not.toHaveBeenCalled();

    spy.restore();
    stream.destroy();
    customBus.destroy();
  });

  // 7. Playing a stream again stops the previous voice (single playhead)
  test('playing an AudioStream again stops the previous voice', () => {
    const manager = new AudioManager();
    const stream = new AudioStream(createAudioElementStub());

    const first = manager.play(stream);
    const second = manager.play(stream);

    expect(first.ended).toBe(true);
    expect(second.ended).toBe(false);

    stream.destroy();
  });

  // 8. Video defaults to no bus (routes to destination until assigned)
  test('new Video has bus === null by default', () => {
    const video = new Video(createVideoElementStub());
    expect(video.bus).toBeNull();
    video.destroy();
  });

  test('setting video.bus routes its gain to that bus inputNode', () => {
    const manager = new AudioManager();
    const spy = spyOnGainConnect();
    const video = new Video(createVideoElementStub());

    video.bus = manager.master;

    expect(spy.gainNode.connect).toHaveBeenCalledWith(manager.master._getInputNode());

    spy.restore();
    video.destroy();
  });
});
