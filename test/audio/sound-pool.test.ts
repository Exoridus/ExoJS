import type { MockInstance } from 'vitest';

/**
 * Tests for Sound pool behaviour:
 *  - Default poolSize = 8, poolStrategy = FirstInFirstOut, priority = 0
 *  - system.play() is multi-instance (pooled) by default
 *  - _stopAllVoices() stops all active voices (replace mode)
 *  - FIFO eviction (FirstInFirstOut strategy)
 *  - LRU eviction (LeastRecentlyUsed strategy - closest to natural end)
 *  - LowestPriority degenerates to FIFO within a single Sound
 *  - Voices are removed from pool when they end naturally
 */
import { getAudioContext } from '#audio/audio-context';
import { AudioSystem } from '#audio/AudioSystem';
import type { Pausable, Voice } from '#audio/Playable';
import { Sound, SoundPoolStrategy } from '#audio/Sound';

import { mutable } from '../support/mutable';

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

  // setPoolSize() is a no-op when the (normalized) size is unchanged
  test('setPoolSize() is a no-op when the normalized size is unchanged', () => {
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });
    expect(sound.setPoolSize(4)).toBe(sound);
    // Fractional/negative inputs normalize to the same 4 - still a no-op.
    expect(sound.setPoolSize(4.9)).toBe(sound);
    expect(sound.poolSize).toBe(4);
  });

  // setPoolSize() shrinking below the active voice count trims (evicts) the excess
  test('setPoolSize() shrink trims active voices down to the new capacity', () => {
    const factory = setupSourceFactory();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

    system.play(sound); // src[0]
    system.play(sound); // src[1]
    system.play(sound); // src[2]

    sound.setPoolSize(1);

    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[1].stop).toHaveBeenCalledTimes(1);
    expect(factory.sources[2].stop).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
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
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 8 });

    system.play(sound);
    system.play(sound);
    system.play(sound);

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
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), {
      poolSize: 2,
      poolStrategy: SoundPoolStrategy.FirstInFirstOut,
    });

    system.play(sound); // src[0] — oldest
    system.play(sound); // src[1]
    system.play(sound); // src[2] — pool at 2, so src[0] evicted

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
    const system = new AudioSystem();

    // Buffer duration = 4 s
    const sound = new Sound(createAudioBufferStub(4), {
      poolSize: 2,
      poolStrategy: SoundPoolStrategy.LeastRecentlyUsed,
    });

    // src[0] - started at t=0, duration=4s → remaining at t=3: 4-3=1s
    timeMock.setTime(0);
    system.play(sound);

    // src[1] - started at t=2, duration=4s → remaining at t=3: 4-(3-2)=3s
    timeMock.setTime(2);
    system.play(sound);

    // At t=3, pool is full (2). Next play should evict src[0] (least remaining).
    timeMock.setTime(3);
    system.play(sound); // src[2] — triggers eviction

    expect(factory.sources.length).toBe(3);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1); // evicted (closest to end)
    expect(factory.sources[1].stop).not.toHaveBeenCalled();
    expect(factory.sources[2].stop).not.toHaveBeenCalled();

    timeMock.restore();
    factory.restore();
    sound.destroy();
  });
});

describe('Sound — LeastRecentlyUsed eviction while the audio context is not ready', () => {
  afterEach(() => vi.restoreAllMocks());

  // LRU falls back to `now = 0` when the audio context is not running yet.
  // Playing is skipped outright while locked, so the surviving way in is
  // `setPoolSize()` - a pool shrunk while audio is suspended still has to pick
  // a victim, and must do so without spawning a context to read the clock from.
  test('LRU eviction still picks a victim when isAudioContextReady() is false', () => {
    const factory = setupSourceFactory();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(4), {
      poolSize: 2,
      poolStrategy: SoundPoolStrategy.LeastRecentlyUsed,
    });

    system.play(sound); // src[0]
    system.play(sound); // src[1]

    const ctx = getAudioContext();
    const originalState = ctx.state;
    mutable(ctx).state = 'suspended';

    sound.setPoolSize(1); // trims with the context not ready

    mutable(ctx).state = originalState;

    expect(factory.sources.length).toBe(2);
    expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);

    factory.restore();
    sound.destroy();
  });
});

describe('Sound — LowestPriority eviction', () => {
  afterEach(() => vi.restoreAllMocks());

  // 7. LowestPriority degenerates to FIFO within a single Sound (all instances share priority)
  test('LowestPriority strategy degenerates to FIFO within a single Sound', () => {
    const factory = setupSourceFactory();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), {
      poolSize: 2,
      poolStrategy: SoundPoolStrategy.LowestPriority,
    });

    system.play(sound); // src[0] — oldest
    system.play(sound); // src[1]
    system.play(sound); // src[2] — evicts src[0] (FIFO fallback since same priority)

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
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

    system.play(sound); // src[0]
    system.play(sound); // src[1]
    system.play(sound); // src[2]

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
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

    system.play(sound); // src[0]
    sound._stopAllVoices();
    system.play(sound); // src[1] — regular pooled
    system.play(sound); // src[2] — regular pooled

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
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 1 });

    sound._stopAllVoices();
    system.play(sound); // src[0]
    sound._stopAllVoices();
    system.play(sound); // src[1]
    sound._stopAllVoices();
    system.play(sound); // src[2]

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
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

    system.play(sound); // src[0]
    system.play(sound); // src[1]

    expect(factory.sources.length).toBe(2);

    // Simulate natural end of src[0]
    factory.sources[0].onended?.();
    // src[0] is removed from pool via the sourceNode.onended hook;
    // now we can fit one more without eviction

    // After src[1] also ends
    factory.sources[1].onended?.();

    // Pool should now be empty - a 3rd play creates a fresh voice without evicting
    system.play(sound); // src[2]
    expect(factory.sources[2].stop).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
  });

  // Defensive prune path: a stale pool entry whose voice already ended (the
  // normal onEnd-driven removal did not run for some reason) is pruned on the
  // next play() rather than being left to accumulate.
  test('_pruneEndedVoices() removes a stale entry pointing at an already-ended voice', () => {
    const factory = setupSourceFactory();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

    const voice = system.play(sound); // src[0], auto-removed from the pool via onEnd on stop()
    voice.stop();

    // Re-seed a stale entry directly, simulating the pool bookkeeping having
    // missed the automatic onEnd removal.
    (sound as unknown as { _activeVoices: Array<{ voice: unknown; startedAt: number; effectiveDuration: number }> })._activeVoices.push({
      voice,
      startedAt: 0,
      effectiveDuration: 1,
    });

    system.play(sound); // src[1] — _pruneEndedVoices() drops the stale entry first

    expect(factory.sources.length).toBe(2);
    expect(factory.sources[1].stop).not.toHaveBeenCalled();

    factory.restore();
    sound.destroy();
  });

  // voice.stop() ends the voice immediately
  test('voice.stop() marks the voice as ended', () => {
    const factory = setupSourceFactory();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

    const voice = system.play(sound);
    const voice2 = system.play(sound);
    const voice3 = system.play(sound);

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

// A paused voice is frozen exactly where a scene pause or retention suspension
// left it, waiting to be restored - but its pool bookkeeping keeps aging
// against the still-running context clock. Both strategies would otherwise
// single it out: FIFO sees the oldest entry, LRU the one with the least time
// left. Evicting it stops it for good, and `SceneAudio.restore()` skips it
// afterwards because it is `ended`, not `paused`.
describe('Sound — paused voices are deprioritized as eviction victims', () => {
  afterEach(() => vi.restoreAllMocks());

  test('FIFO evicts the oldest UNPAUSED voice, not the paused one in front of it', () => {
    const factory = setupSourceFactory();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(10), { poolSize: 2 });

    const paused = system.play(sound) as Voice & Pausable;
    paused.pause();
    const playing = system.play(sound);

    system.play(sound); // pool is full — someone has to go

    expect(paused.ended).toBe(false);
    expect(paused.paused).toBe(true);
    expect(playing.ended).toBe(true);

    factory.restore();
    sound.destroy();
  });

  test('LRU skips a paused voice even when its stale bookkeeping looks closest to the end', () => {
    const factory = setupSourceFactory();
    const clock = mockCurrentTime(0);
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(10), {
      poolSize: 2,
      poolStrategy: SoundPoolStrategy.LeastRecentlyUsed,
    });

    const paused = system.play(sound) as Voice & Pausable;
    paused.pause();

    // The context clock runs on while the voice is frozen, so its recorded
    // remaining time shrinks to the smallest in the pool.
    clock.setTime(9);
    const playing = system.play(sound);

    clock.setTime(9.1);
    system.play(sound);

    expect(paused.ended).toBe(false);
    expect(playing.ended).toBe(true);

    clock.restore();
    factory.restore();
    sound.destroy();
  });

  test('an all-paused pool still evicts rather than growing past its size', () => {
    const factory = setupSourceFactory();
    const system = new AudioSystem();
    const sound = new Sound(createAudioBufferStub(10), { poolSize: 2 });

    const first = system.play(sound) as Voice & Pausable;
    const second = system.play(sound) as Voice & Pausable;
    first.pause();
    second.pause();

    const third = system.play(sound);

    // Nothing else could go, so the oldest paused voice is the fallback victim.
    expect(first.ended).toBe(true);
    expect(second.ended).toBe(false);
    expect(third.ended).toBe(false);

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
