import { getAudioContext } from '#audio/audio-context';
import { AudioManager } from '#audio/AudioManager';
import { Sound } from '#audio/Sound';

const makeBuffer = (duration = 2): AudioBuffer => ({ duration }) as AudioBuffer;

const makeParam = (value = 0) => ({
  value,
  setValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
});

interface MockSource {
  start: MockInstance;
  stop: MockInstance;
  connect: MockInstance;
  disconnect: MockInstance;
  playbackRate: ReturnType<typeof makeParam>;
  detune: ReturnType<typeof makeParam>;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  buffer: AudioBuffer | null;
}

const setupSourceSpy = (): { sources: MockSource[]; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext & { createBufferSource: () => AudioBufferSourceNode };
  const sources: MockSource[] = [];
  const spy = vi.spyOn(ctx, 'createBufferSource').mockImplementation(() => {
    const node: MockSource = {
      start: vi.fn(),
      stop: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      playbackRate: makeParam(1),
      detune: makeParam(0),
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      onended: null,
      buffer: null,
    };
    sources.push(node);
    return node as unknown as AudioBufferSourceNode;
  });
  return { sources, restore: () => spy.mockRestore() };
};

describe('Sound.clip', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('clip duration is the sub-range span; the parent is unchanged', () => {
    const sound = new Sound(makeBuffer(2));
    const clip = sound.clip(0.5, 1);
    expect(clip.duration).toBe(1);
    expect(sound.duration).toBe(2);
  });

  test('clip shares the same decoded AudioBuffer', () => {
    const sound = new Sound(makeBuffer(2));
    expect(sound.clip(0, 1).audioBuffer).toBe(sound.audioBuffer);
  });

  test('clip end is clamped to the buffer duration', () => {
    const sound = new Sound(makeBuffer(2));
    expect(sound.clip(1.5, 5).duration).toBe(0.5);
  });

  test('playing a clip starts at the clip offset for the clip duration', () => {
    const factory = setupSourceSpy();
    const manager = new AudioManager();
    const sound = new Sound(makeBuffer(2));
    const clip = sound.clip(0.5, 1);

    manager.play(clip);

    expect(factory.sources[0].start).toHaveBeenCalledWith(0, 0.5, 1);

    factory.restore();
    clip.destroy();
  });

  test('clip inherits the parent default volume/loop settings', () => {
    const sound = new Sound(makeBuffer(2), { volume: 0.5, loop: true });
    const clip = sound.clip(0, 1);
    expect(clip.volume).toBe(0.5);
    expect(clip.loop).toBe(true);
  });
});
