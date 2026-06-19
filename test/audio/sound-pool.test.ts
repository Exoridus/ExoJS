/**
 * Tests for Sound pool behaviour:
 *  - Default poolSize = 8, poolStrategy = FirstInFirstOut, priority = 0
 *  - manager.play() is multi-instance (pooled) by default
 *  - _stopAllVoices() stops all active voices (replace mode)
 *  - FIFO eviction (FirstInFirstOut strategy)
 *  - LRU eviction (LeastRecentlyUsed strategy — closest to natural end)
 *  - LowestPriority degenerates to FIFO within a single Sound (V1)
 *  - Voices are removed from pool when they end naturally
 */

import { getAudioContext } from '#audio/audio-context';
import { AudioManager } from '#audio/AudioManager';
import { Sound, SoundPoolStrategy } from '#audio/Sound';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createAudioBufferStub = (duration = 2): AudioBuffer => ({ duration }) as AudioBuffer;

interface MockBufferSourceNode {
  start: MockInstance;
  stop: MockInstance;
  connect: MockInstance;
  disconnect: MockInstance;
  playbackRate: { value: number };
  detune: { value: number };
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: (() => void) | null;
  buffer: AudioBuffer | null;
}

const createSourceMock = (): MockBufferSourceNode => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  playbackRate: { value: 1 },
  detune: { value: 0 },
  loop: false,
  loopStart: 0,
  loopEnd: 0,
  onended: null,
  buffer: null,
});

interface SourceFactory {
  sources: MockBufferSourceNode[];
  restore: () => void;
}

const setupSourceFactory = (): SourceFactory => {
  const ctx = getAudioContext() as AudioContext & {
    createBufferSource: () => AudioBufferSourceNode;
  };
  const sources: MockBufferSourceNode[] = [];
  const spy = vi.spyOn(ctx, 'createBufferSource').mockImplementation(() => {
    const mock = createSourceMock();
    sources.push(mock);
    return mock as unknown as AudioBufferSourceNode;
  });
  return { sources, restore: () => spy.mockRestore() };
};

/**
 * Mock AudioContext.currentTime so we can control elapsed time in LRU tests.
 * Returns a setter function so tests can advance time.
 */
const mockCurrentTime = (initial = 0): { setTime: (t: number) => void; restore: () => void } => {
  const ctx = getAudioContext() as AudioContext;
  let _currentTime = initial;
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'currentTime') ?? Object.getOwnPropertyDescriptor(ctx, 'currentTime');
  Object.defineProperty(ctx, 'currentTime', {
    get: () => _currentTime,
    configurable: true,
  });
  return {
    setTime: (t: number) => {
      _currentTime = t;
    },
    restore: () => {
      if (descriptor) {
        Object.defineProperty(ctx, 'currentTime', descriptor);
      } else {
        delete (ctx as unknown as Record<string, unknown>).currentTime;
      }
    },
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sound — pool defaults', () => {
  afterEach(() => vi.restoreAllMocks());

  // 1. Default poolSize
  test('default poolSize is 8', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.poolSize).toBe(8);
  });

  // 2. Default poolStrategy
  test('default poolStrategy is FirstInFirstOut', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.poolStrategy).toBe(SoundPoolStrategy.FirstInFirstOut);
  });

  // 3. Default priority
  test('default priority is 0', () => {
    const sound = new Sound(createAudioBufferStub());
    expect(sound.priority).toBe(0);
  });

  // poolSize/poolStrategy/priority can be set via constructor options
  test('constructor options set poolSize, poolStrategy, priority', () => {
    const sound = new Sound(createAudioBufferStub(), {
      poolSize: 4,
      poolStrategy: SoundPoolStrategy.LeastRecentlyUsed,
      priority: 5,
    });
    expect(sound.poolSize).toBe(4);
    expect(sound.poolStrategy).toBe(SoundPoolStrategy.LeastRecentlyUsed);
    expect(sound.priority).toBe(5);
  });

  // poolSize getter/setter round-trip
  test('poolSize setter updates pool size', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.poolSize = 3;
    expect(sound.poolSize).toBe(3);
  });

  // priority getter/setter round-trip
  test('priority setter updates priority', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.priority = 10;
    expect(sound.priority).toBe(10);
  });

  // poolStrategy getter/setter round-trip
  test('poolStrategy setter updates strategy', () => {
    const sound = new Sound(createAudioBufferStub());
    sound.poolStrategy = SoundPoolStrategy.LowestPriority;
    expect(sound.poolStrategy).toBe(SoundPoolStrategy.LowestPriority);
  });
});

describe('Sound — multi-instance play() (pooled default)', () => {
  afterEach(() => vi.restoreAllMocks());

  // 4. play() below pool limit creates new source, no eviction
  test('play() below pool limit creates a new source without stopping others', () => {
    const factory = setupSourceFactory();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 8 });

    manager.play(sound);
    manager.play(sound);
    manager.play(sound);

    expect(factory.sources.length).toBe(3);
    for (const src of factory.sources) {
      expect(src.stop).not.toHaveBeenCalled();
    }

    factory.restore();
    sound.destroy();
  });

  // 5. FIFO eviction when pool is full
  test('play() past pool limit evicts oldest source first (FIFO)', () => {
    const factory = setupSourceFactory();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(), {
      poolSize: 2,
      poolStrategy: SoundPoolStrategy.FirstInFirstOut,
    });

    manager.play(sound); // src[0] — oldest
    manager.play(sound); // src[1]
    manager.play(sound); // src[2] — pool at 2, so src[0] evicted

    expect(factory.sources.length).toBe(3);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1); // evicted (FIFO)
    expect(factory.sources[1].stop).not.toHaveBeenCalled();
    expect(factory.sources[2].stop).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
  });
});

describe('Sound — LeastRecentlyUsed eviction', () => {
  afterEach(() => vi.restoreAllMocks());

  // 6. LRU evicts source closest to its natural end
  test('LRU strategy evicts the source with least remaining time', () => {
    const timeMock = mockCurrentTime(0);
    const factory = setupSourceFactory();
    const manager = new AudioManager();

    // Buffer duration = 4 s
    const sound = new Sound(createAudioBufferStub(4), {
      poolSize: 2,
      poolStrategy: SoundPoolStrategy.LeastRecentlyUsed,
    });

    // src[0] — started at t=0, duration=4s → remaining at t=3: 4-3=1s
    timeMock.setTime(0);
    manager.play(sound);

    // src[1] — started at t=2, duration=4s → remaining at t=3: 4-(3-2)=3s
    timeMock.setTime(2);
    manager.play(sound);

    // At t=3, pool is full (2). Next play should evict src[0] (least remaining).
    timeMock.setTime(3);
    manager.play(sound); // src[2] — triggers eviction

    expect(factory.sources.length).toBe(3);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1); // evicted (closest to end)
    expect(factory.sources[1].stop).not.toHaveBeenCalled();
    expect(factory.sources[2].stop).not.toHaveBeenCalled();

    timeMock.restore();
    factory.restore();
    sound.destroy();
  });
});

describe('Sound — LowestPriority eviction', () => {
  afterEach(() => vi.restoreAllMocks());

  // 7. LowestPriority degenerates to FIFO within a single Sound (all instances share priority)
  test('LowestPriority strategy degenerates to FIFO within a single Sound', () => {
    const factory = setupSourceFactory();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(), {
      poolSize: 2,
      poolStrategy: SoundPoolStrategy.LowestPriority,
    });

    manager.play(sound); // src[0] — oldest
    manager.play(sound); // src[1]
    manager.play(sound); // src[2] — evicts src[0] (FIFO fallback since same priority)

    expect(factory.sources.length).toBe(3);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1); // FIFO victim
    expect(factory.sources[1].stop).not.toHaveBeenCalled();
    expect(factory.sources[2].stop).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
  });
});

describe('Sound — _stopAllVoices() (replace mode)', () => {
  afterEach(() => vi.restoreAllMocks());

  // 8. _stopAllVoices() stops all active voices
  test('_stopAllVoices() stops all active voices', () => {
    const factory = setupSourceFactory();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

    manager.play(sound); // src[0]
    manager.play(sound); // src[1]
    manager.play(sound); // src[2]

    sound._stopAllVoices(); // should stop src[0..2]

    expect(factory.sources.length).toBe(3);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[1].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[2].stop).toHaveBeenCalledTimes(1);

    factory.restore();
    sound.destroy();
  });

  // 9. play() after _stopAllVoices() starts fresh
  test('play() after _stopAllVoices() accumulates normally', () => {
    const factory = setupSourceFactory();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

    manager.play(sound); // src[0]
    sound._stopAllVoices();
    manager.play(sound); // src[1] — regular pooled
    manager.play(sound); // src[2] — regular pooled

    expect(factory.sources.length).toBe(3);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[1].stop).not.toHaveBeenCalled();
    expect(factory.sources[2].stop).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
  });

  // _stopAllVoices() with poolSize=1 exactly replicates old singleton behavior
  test('_stopAllVoices() + play() with poolSize=1 replicates old singleton-replace behavior', () => {
    const factory = setupSourceFactory();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 1 });

    sound._stopAllVoices();
    manager.play(sound); // src[0]
    sound._stopAllVoices();
    manager.play(sound); // src[1]
    sound._stopAllVoices();
    manager.play(sound); // src[2]

    expect(factory.sources.length).toBe(3);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[1].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[2].stop).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
  });
});

describe('Sound — natural pool cleanup', () => {
  afterEach(() => vi.restoreAllMocks());

  // 10. Voices are removed from pool when they end naturally
  test('voices are removed from the pool when they end naturally (no eviction)', () => {
    const factory = setupSourceFactory();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

    manager.play(sound); // src[0]
    manager.play(sound); // src[1]

    expect(factory.sources.length).toBe(2);

    // Simulate natural end of src[0]
    factory.sources[0].onended?.();
    // src[0] is removed from pool via the sourceNode.onended hook;
    // now we can fit one more without eviction

    // After src[1] also ends
    factory.sources[1].onended?.();

    // Pool should now be empty — a 3rd play creates a fresh voice without evicting
    manager.play(sound); // src[2]
    expect(factory.sources[2].stop).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
  });

  // voice.stop() ends the voice immediately
  test('voice.stop() marks the voice as ended', () => {
    const factory = setupSourceFactory();
    const manager = new AudioManager();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

    const voice = manager.play(sound);
    const voice2 = manager.play(sound);
    const voice3 = manager.play(sound);

    voice.stop();
    voice2.stop();
    voice3.stop();

    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[1].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[2].stop).toHaveBeenCalledTimes(1);

    factory.restore();
    sound.destroy();
  });
});

describe('Sound — SoundPoolStrategy enum values', () => {
  test('enum string values are stable for serialization', () => {
    expect(SoundPoolStrategy.FirstInFirstOut).toBe('fifo');
    expect(SoundPoolStrategy.LeastRecentlyUsed).toBe('lru');
    expect(SoundPoolStrategy.LowestPriority).toBe('priority');
  });
});
