import { getAudioContext } from 'audio/audio-context';
import { Sound } from 'audio/Sound';

interface MockBufferSourceNode {
    start: jest.Mock;
    stop: jest.Mock;
    connect: jest.Mock;
    disconnect: jest.Mock;
    playbackRate: AudioParam & { value: number; };
    loop: boolean;
    loopStart: number;
    loopEnd: number;
    onended: (() => void) | null;
    buffer: AudioBuffer | null;
}

const createAudioBufferStub = (): AudioBuffer => ({
    duration: 2,
} as AudioBuffer);

const createBufferSourceNodeMock = (): MockBufferSourceNode => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    playbackRate: { value: 1 } as AudioParam & { value: number; },
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    onended: null,
    buffer: null,
} as unknown as MockBufferSourceNode);

const setupSourceFactorySpy = (): {
    sources: Array<MockBufferSourceNode>;
    restore: () => void;
} => {
    const audioContext = getAudioContext() as AudioContext & {
        createBufferSource: () => AudioBufferSourceNode;
    };
    const sources: Array<MockBufferSourceNode> = [];
    const sourceSpy = jest.spyOn(audioContext, 'createBufferSource').mockImplementation(() => {
        const source = createBufferSourceNodeMock();
        sources.push(source);

        return source as unknown as AudioBufferSourceNode;
    });

    return {
        sources,
        restore: () => sourceSpy.mockRestore(),
    };
};

describe('Sound', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('play() keeps single-instance semantics, but can replay after natural completion', () => {
        const factory = setupSourceFactorySpy();
        const sound = new Sound(createAudioBufferStub());

        sound.play();
        sound.play();

        expect(factory.sources.length).toBe(1);

        factory.sources[0].onended?.();
        expect(sound.paused).toBe(true);

        sound.play();
        expect(factory.sources.length).toBe(2);

        factory.restore();
    });

    test('playPooled() supports repeated SFX playback and pool-size limiting', () => {
        const factory = setupSourceFactorySpy();
        const sound = new Sound(createAudioBufferStub(), { poolSize: 2 });

        sound.playPooled();
        sound.playPooled();
        sound.playPooled();

        expect(factory.sources.length).toBe(3);
        expect(factory.sources[0].stop).toHaveBeenCalledTimes(1);
        expect(factory.sources[1].stop).toHaveBeenCalledTimes(0);
        expect(factory.sources[2].stop).toHaveBeenCalledTimes(0);

        factory.restore();
    });

    test('playSprite() plays the requested clip range from one source', () => {
        const factory = setupSourceFactorySpy();
        const sound = new Sound(createAudioBufferStub(), {
            sprites: {
                click: { start: 0.2, end: 0.5 },
            },
        });

        sound.playSprite('click');

        expect(factory.sources.length).toBe(1);

        const args = factory.sources[0].start.mock.calls[0];
        expect(args[0]).toBe(0);
        expect(args[1]).toBeCloseTo(0.2);
        expect(args[2]).toBeCloseTo(0.3);

        factory.restore();
    });

    test('looping audio sprites configure source loop window', () => {
        const factory = setupSourceFactorySpy();
        const sound = new Sound(createAudioBufferStub());

        sound.defineSprite('hum', { start: 0.1, end: 0.6, loop: true });
        sound.playSprite('hum');

        expect(factory.sources.length).toBe(1);
        expect(factory.sources[0].loop).toBe(true);
        expect(factory.sources[0].loopStart).toBeCloseTo(0.1);
        expect(factory.sources[0].loopEnd).toBeCloseTo(0.6);
        expect(factory.sources[0].start).toHaveBeenCalledWith(0, 0.1);

        factory.restore();
    });

    test('unknown sprite names fail clearly', () => {
        const sound = new Sound(createAudioBufferStub());

        expect(() => sound.playSprite('missing')).toThrow('Sound sprite "missing" is not defined.');
    });
});
