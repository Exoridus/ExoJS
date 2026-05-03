/**
 * Tests for Sound pool behaviour introduced in 0.7.0:
 *  - Default poolSize = 8, poolStrategy = FirstInFirstOut, priority = 0
 *  - play() is multi-instance (pooled) by default
 *  - play({ replace: true }) is singleton-replace mode
 *  - FIFO eviction (FirstInFirstOut strategy)
 *  - LRU eviction (LeastRecentlyUsed strategy — closest to natural end)
 *  - LowestPriority degenerates to FIFO within a single Sound (V1)
 *  - Sources are cleaned up from the pool when they end naturally
 */

import { getAudioContext } from '@/audio/audio-context';
import { Sound, SoundPoolStrategy } from '@/audio/Sound';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createAudioBufferStub = (duration = 2): AudioBuffer =>
    ({ duration } as AudioBuffer);

interface MockBufferSourceNode {
    start: jest.Mock;
    stop: jest.Mock;
    connect: jest.Mock;
    disconnect: jest.Mock;
    playbackRate: { value: number };
    loop: boolean;
    loopStart: number;
    loopEnd: number;
    onended: (() => void) | null;
    buffer: AudioBuffer | null;
}

const createSourceMock = (): MockBufferSourceNode => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    playbackRate: { value: 1 },
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    onended: null,
    buffer: null,
});

interface SourceFactory {
    sources: Array<MockBufferSourceNode>;
    restore: () => void;
}

const setupSourceFactory = (): SourceFactory => {
    const ctx = getAudioContext() as AudioContext & {
        createBufferSource: () => AudioBufferSourceNode;
    };
    const sources: Array<MockBufferSourceNode> = [];
    const spy = jest.spyOn(ctx, 'createBufferSource').mockImplementation(() => {
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
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'currentTime')
        ?? Object.getOwnPropertyDescriptor(ctx, 'currentTime');
    Object.defineProperty(ctx, 'currentTime', {
        get: () => _currentTime,
        configurable: true,
    });
    return {
        setTime: (t: number) => { _currentTime = t; },
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
    afterEach(() => jest.restoreAllMocks());

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
    afterEach(() => jest.restoreAllMocks());

    // 4. play() below pool limit creates new source, no eviction
    test('play() below pool limit creates a new source without stopping others', () => {
        const factory = setupSourceFactory();
        const sound = new Sound(createAudioBufferStub(), { poolSize: 8 });

        sound.play();
        sound.play();
        sound.play();

        expect(factory.sources.length).toBe(3);
        for (const src of factory.sources) {
            expect(src.stop).not.toHaveBeenCalled();
        }

        factory.restore();
    });

    // 5. FIFO eviction when pool is full
    test('play() past pool limit evicts oldest source first (FIFO)', () => {
        const factory = setupSourceFactory();
        const sound = new Sound(createAudioBufferStub(), {
            poolSize: 2,
            poolStrategy: SoundPoolStrategy.FirstInFirstOut,
        });

        sound.play(); // src[0] — oldest
        sound.play(); // src[1]
        sound.play(); // src[2] — pool at 2, so src[0] evicted

        expect(factory.sources.length).toBe(3);
        expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);  // evicted (FIFO)
        expect(factory.sources[1].stop).not.toHaveBeenCalled();
        expect(factory.sources[2].stop).not.toHaveBeenCalled();

        factory.restore();
    });
});

describe('Sound — LeastRecentlyUsed eviction', () => {
    afterEach(() => jest.restoreAllMocks());

    // 6. LRU evicts source closest to its natural end
    test('LRU strategy evicts the source with least remaining time', () => {
        const timeMock = mockCurrentTime(0);
        const factory = setupSourceFactory();

        // Buffer duration = 4 s
        const sound = new Sound(createAudioBufferStub(4), {
            poolSize: 2,
            poolStrategy: SoundPoolStrategy.LeastRecentlyUsed,
        });

        // src[0] — started at t=0, duration=4s → remaining at t=3: 4-3=1s
        timeMock.setTime(0);
        sound.play();

        // src[1] — started at t=2, duration=4s → remaining at t=3: 4-(3-2)=3s
        timeMock.setTime(2);
        sound.play();

        // At t=3, pool is full (2). Next play should evict src[0] (least remaining).
        timeMock.setTime(3);
        sound.play(); // src[2] — triggers eviction

        expect(factory.sources.length).toBe(3);
        expect(factory.sources[0].stop).toHaveBeenCalledTimes(1); // evicted (closest to end)
        expect(factory.sources[1].stop).not.toHaveBeenCalled();
        expect(factory.sources[2].stop).not.toHaveBeenCalled();

        timeMock.restore();
        factory.restore();
    });
});

describe('Sound — LowestPriority eviction', () => {
    afterEach(() => jest.restoreAllMocks());

    // 7. LowestPriority degenerates to FIFO within a single Sound (all instances share priority)
    test('LowestPriority strategy degenerates to FIFO within a single Sound', () => {
        const factory = setupSourceFactory();
        const sound = new Sound(createAudioBufferStub(), {
            poolSize: 2,
            poolStrategy: SoundPoolStrategy.LowestPriority,
        });

        sound.play(); // src[0] — oldest
        sound.play(); // src[1]
        sound.play(); // src[2] — evicts src[0] (FIFO fallback since same priority)

        expect(factory.sources.length).toBe(3);
        expect(factory.sources[0].stop).toHaveBeenCalledTimes(1); // FIFO victim
        expect(factory.sources[1].stop).not.toHaveBeenCalled();
        expect(factory.sources[2].stop).not.toHaveBeenCalled();

        factory.restore();
    });
});

describe('Sound — play({ replace: true })', () => {
    afterEach(() => jest.restoreAllMocks());

    // 8. replace: true stops all prior pooled sources before new play
    test('play({ replace: true }) stops all prior pooled sources before starting', () => {
        const factory = setupSourceFactory();
        const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

        sound.play(); // src[0]
        sound.play(); // src[1]
        sound.play(); // src[2]

        sound.play({ replace: true }); // src[3] — should stop src[0..2]

        expect(factory.sources.length).toBe(4);
        expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
        expect(factory.sources[1].stop).toHaveBeenCalledTimes(1);
        expect(factory.sources[2].stop).toHaveBeenCalledTimes(1);
        expect(factory.sources[3].stop).not.toHaveBeenCalled();

        factory.restore();
    });

    // 9. Subsequent play() after replace starts fresh pooled instance
    test('play() after play({ replace: true }) accumulates normally', () => {
        const factory = setupSourceFactory();
        const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

        sound.play({ replace: true }); // src[0] — replaces nothing (pool was empty)
        sound.play();                  // src[1] — regular pooled
        sound.play();                  // src[2] — regular pooled

        // Now replace again — stops src[0..2], starts src[3]
        sound.play({ replace: true }); // src[3]

        expect(factory.sources.length).toBe(4);
        expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
        expect(factory.sources[1].stop).toHaveBeenCalledTimes(1);
        expect(factory.sources[2].stop).toHaveBeenCalledTimes(1);
        expect(factory.sources[3].stop).not.toHaveBeenCalled();

        factory.restore();
    });

    // play({ replace: true }) with poolSize=1 exactly replicates old singleton behavior
    test('play({ replace: true }) with poolSize=1 replicates old singleton-replace behavior', () => {
        const factory = setupSourceFactory();
        const sound = new Sound(createAudioBufferStub(), { poolSize: 1 });

        sound.play({ replace: true });
        sound.play({ replace: true });
        sound.play({ replace: true });

        expect(factory.sources.length).toBe(3);
        expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
        expect(factory.sources[1].stop).toHaveBeenCalledTimes(1);
        expect(factory.sources[2].stop).not.toHaveBeenCalled();

        factory.restore();
    });
});

describe('Sound — natural pool cleanup', () => {
    afterEach(() => jest.restoreAllMocks());

    // 10. Sources are removed from pool when they end naturally
    test('sources are removed from the pool when they end naturally', () => {
        const factory = setupSourceFactory();
        const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

        sound.play(); // src[0]
        sound.play(); // src[1]

        expect(factory.sources.length).toBe(2);

        // Simulate natural end of src[0]
        factory.sources[0].onended?.();
        // src[0] is removed from pool; src[1] still playing

        // After src[1] also ends
        factory.sources[1].onended?.();

        // Pool should be empty → sound is paused
        expect(sound.paused).toBe(true);

        factory.restore();
    });

    // pause() stops all pooled sources
    test('pause() stops all pooled sources', () => {
        const factory = setupSourceFactory();
        const sound = new Sound(createAudioBufferStub(), { poolSize: 4 });

        sound.play();
        sound.play();
        sound.play();

        sound.pause();

        for (const src of factory.sources) {
            expect(src.stop).toHaveBeenCalledTimes(1);
        }

        expect(sound.paused).toBe(true);

        factory.restore();
    });
});

describe('Sound — SoundPoolStrategy enum values', () => {
    test('enum string values are stable for serialization', () => {
        expect(SoundPoolStrategy.FirstInFirstOut).toBe('fifo');
        expect(SoundPoolStrategy.LeastRecentlyUsed).toBe('lru');
        expect(SoundPoolStrategy.LowestPriority).toBe('priority');
    });
});
