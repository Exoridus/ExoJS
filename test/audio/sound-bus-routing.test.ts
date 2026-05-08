import { getAudioContext } from '@/audio/audio-context';
import { AudioBus } from '@/audio/AudioBus';
import { _resetAudioManagerForTesting, getAudioManager } from '@/audio/AudioManager';
import { Music } from '@/audio/Music';
import { Sound } from '@/audio/Sound';
import { Video } from '@/rendering/video/Video';

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
  gainNode: { connect: jest.Mock; disconnect: jest.Mock; gain: object };
  restore: () => void;
}

const spyOnGainConnect = (): ConnectSpy => {
  const gainNode = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    gain: {
      setTargetAtTime: jest.fn(),
      cancelScheduledValues: jest.fn(),
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      value: 1,
    },
  };
  const ctx = getAudioContext() as AudioContext & { createGain: () => GainNode };

  // We need to capture only the FIRST createGain call (the media's gainNode),
  // as the bus also calls createGain. To do that we wrap createGain to return
  // the mock only once and fall through for subsequent calls.
  const original = ctx.createGain.bind(ctx);
  let firstCall = true;
  const spy = jest.spyOn(ctx, 'createGain').mockImplementation(() => {
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
    _resetAudioManagerForTesting();
  });

  afterEach(() => {
    _resetAudioManagerForTesting();
    jest.restoreAllMocks();
  });

  // 1. Default bus for Sound
  test('new Sound has bus === audioManager.sound', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.bus).toBe(getAudioManager().sound);
    sound.destroy();
  });

  // 2. Default bus for Music
  test('new Music has bus === audioManager.music', () => {
    const music = new Music(createAudioElementStub());
    expect(music.bus).toBe(getAudioManager().music);
    music.destroy();
  });

  // 3. Default bus for Video
  test('new Video has bus === audioManager.master', () => {
    const video = new Video(createVideoElementStub());
    expect(video.bus).toBe(getAudioManager().master);
    video.destroy();
  });

  // 4. Setting sound.bus reconnects gainNode to custom bus input
  test('setting Sound.bus reconnects gainNode to custom bus inputNode', () => {
    const spy = spyOnGainConnect();
    const sound = new Sound(createAudioBufferStub());

    // At construction the gainNode connected to the default sound bus input.
    const soundBusInput = getAudioManager().sound._getInputNode();
    expect(spy.gainNode.connect).toHaveBeenCalledWith(soundBusInput);

    // Now switch to a custom bus.
    const customBus = new AudioBus('custom');
    sound.bus = customBus;

    // The old connection should have been disconnected.
    expect(spy.gainNode.disconnect).toHaveBeenCalled();

    // And reconnected to the custom bus input.
    const customBusInput = customBus._getInputNode();
    expect(spy.gainNode.connect).toHaveBeenCalledWith(customBusInput);

    spy.restore();
    sound.destroy();
    customBus.destroy();
  });

  // 5. Setting back to original bus works
  test('setting Sound.bus back to the default bus re-routes correctly', () => {
    const spy = spyOnGainConnect();
    const sound = new Sound(createAudioBufferStub());
    const mixer = getAudioManager();

    const customBus = new AudioBus('custom2');
    sound.bus = customBus;
    spy.gainNode.connect.mockClear();

    // Set back to the sound bus
    sound.bus = mixer.sound;
    expect(spy.gainNode.connect).toHaveBeenCalledWith(mixer.sound._getInputNode());

    spy.restore();
    sound.destroy();
    customBus.destroy();
  });

  // 6. Setting same bus (after it has been explicitly set) is a no-op
  test('setting Sound.bus to the same explicitly-set bus is a no-op', () => {
    const spy = spyOnGainConnect();
    const sound = new Sound(createAudioBufferStub());
    const customBus = new AudioBus('custom-noop');

    // First set to a custom bus so _bus is assigned.
    sound.bus = customBus;
    spy.gainNode.disconnect.mockClear();
    spy.gainNode.connect.mockClear();

    // Setting to the same custom bus should not trigger disconnect/reconnect.
    sound.bus = customBus;
    expect(spy.gainNode.disconnect).not.toHaveBeenCalled();
    expect(spy.gainNode.connect).not.toHaveBeenCalled();

    spy.restore();
    sound.destroy();
    customBus.destroy();
  });

  // 7. Sound gainNode connects to bus's inputNode at construction
  test('Sound gainNode connects to sound bus inputNode at construction time', () => {
    const spy = spyOnGainConnect();
    const sound = new Sound(createAudioBufferStub());

    const soundBusInput = getAudioManager().sound._getInputNode();
    expect(spy.gainNode.connect).toHaveBeenCalledWith(soundBusInput);

    spy.restore();
    sound.destroy();
  });

  // 8. Music gainNode connects to music bus's inputNode at construction
  test('Music gainNode connects to music bus inputNode at construction time', () => {
    const spy = spyOnGainConnect();
    const music = new Music(createAudioElementStub());

    const musicBusInput = getAudioManager().music._getInputNode();
    expect(spy.gainNode.connect).toHaveBeenCalledWith(musicBusInput);

    spy.restore();
    music.destroy();
  });
});
