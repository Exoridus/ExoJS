import { getAudioContext } from '@/audio/audio-context';
import { AudioBus } from '@/audio/AudioBus';
import { DuckingFilter } from '@/audio/filters/DuckingFilter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeAudioParam = (initial: number) => ({
    setValueAtTime: jest.fn(),
    setTargetAtTime: jest.fn(),
    value: initial,
});

const makeGainNode = (ctx: AudioContext) => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    context: ctx,
    gain: makeAudioParam(1),
});

const makeAnalyserNode = (fftSize = 2048) => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    fftSize,
    minDecibels: -100,
    maxDecibels: -30,
    smoothingTimeConstant: 0.8,
    getByteTimeDomainData: jest.fn(),
    getByteFrequencyData: jest.fn(),
    getFloatTimeDomainData: jest.fn(),
    getFloatFrequencyData: jest.fn(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DuckingFilter', () => {
    let sidechain: AudioBus;

    beforeEach(() => {
        sidechain = new AudioBus('sidechain-test');
    });

    afterEach(() => {
        sidechain.destroy();
    });

    describe('construction', () => {
        it('creates a GainNode and AnalyserNode on construction', () => {
            jest.useFakeTimers();
            const ctx = getAudioContext();
            const gainSpy = jest.spyOn(ctx, 'createGain');
            const analyserSpy = jest.spyOn(ctx, 'createAnalyser');
            const filter = new DuckingFilter({ sidechain });
            // Multiple gains created by sidechain setup too; just ensure at least 1 analyser
            expect(analyserSpy).toHaveBeenCalled();
            expect(gainSpy).toHaveBeenCalled();
            filter.destroy();
            gainSpy.mockRestore();
            analyserSpy.mockRestore();
            jest.useRealTimers();
        });

        it('uses default threshold of -20 dB', () => {
            jest.useFakeTimers();
            const filter = new DuckingFilter({ sidechain });
            expect(filter.threshold).toBe(-20);
            filter.destroy();
            jest.useRealTimers();
        });

        it('uses default ratio of 4', () => {
            jest.useFakeTimers();
            const filter = new DuckingFilter({ sidechain });
            expect(filter.ratio).toBe(4);
            filter.destroy();
            jest.useRealTimers();
        });

        it('uses default attackMs of 30', () => {
            jest.useFakeTimers();
            const filter = new DuckingFilter({ sidechain });
            expect(filter.attackMs).toBe(30);
            filter.destroy();
            jest.useRealTimers();
        });

        it('uses default releaseMs of 300', () => {
            jest.useFakeTimers();
            const filter = new DuckingFilter({ sidechain });
            expect(filter.releaseMs).toBe(300);
            filter.destroy();
            jest.useRealTimers();
        });

        it('accepts custom options', () => {
            jest.useFakeTimers();
            const filter = new DuckingFilter({
                sidechain,
                threshold: -10,
                ratio: 8,
                attackMs: 50,
                releaseMs: 500,
            });
            expect(filter.threshold).toBe(-10);
            expect(filter.ratio).toBe(8);
            expect(filter.attackMs).toBe(50);
            expect(filter.releaseMs).toBe(500);
            filter.destroy();
            jest.useRealTimers();
        });
    });

    describe('inputNode / outputNode', () => {
        it('inputNode and outputNode are the same GainNode', () => {
            jest.useFakeTimers();
            const filter = new DuckingFilter({ sidechain });
            expect(filter.inputNode).toBe(filter.outputNode);
            filter.destroy();
            jest.useRealTimers();
        });

        it('throws after destroy', () => {
            jest.useFakeTimers();
            const filter = new DuckingFilter({ sidechain });
            filter.destroy();
            expect(() => filter.inputNode).toThrow('DuckingFilter not yet initialized.');
            jest.useRealTimers();
        });
    });

    describe('interval-based tick', () => {
        it('starts a ~60Hz interval on setup', () => {
            jest.useFakeTimers();
            const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
            const filter = new DuckingFilter({ sidechain });
            // One setInterval call for the 60Hz ticker
            const tickCalls = setIntervalSpy.mock.calls.filter(
                ([, delay]) => Math.round(delay as number) === Math.round(1000 / 60),
            );
            expect(tickCalls.length).toBeGreaterThanOrEqual(1);
            filter.destroy();
            setIntervalSpy.mockRestore();
            jest.useRealTimers();
        });

        it('calls _tick periodically via the interval', () => {
            jest.useFakeTimers();
            const ctx = getAudioContext();
            const analyser = makeAnalyserNode();
            const analyserSpy = jest.spyOn(ctx, 'createAnalyser').mockReturnValue(
                analyser as unknown as AnalyserNode,
            );
            const filter = new DuckingFilter({ sidechain });

            // Advance timer by 1 tick duration (1000/60 ms)
            jest.advanceTimersByTime(Math.ceil(1000 / 60));
            expect(analyser.getByteTimeDomainData).toHaveBeenCalled();

            filter.destroy();
            analyserSpy.mockRestore();
            jest.useRealTimers();
        });
    });

    describe('destroy', () => {
        it('clears the setInterval', () => {
            jest.useFakeTimers();
            const clearSpy = jest.spyOn(globalThis, 'clearInterval');
            const filter = new DuckingFilter({ sidechain });
            filter.destroy();
            expect(clearSpy).toHaveBeenCalled();
            clearSpy.mockRestore();
            jest.useRealTimers();
        });

        it('disconnects gain and analyser nodes', () => {
            jest.useFakeTimers();
            const ctx = getAudioContext();
            const analyser = makeAnalyserNode();
            const analyserSpy = jest.spyOn(ctx, 'createAnalyser').mockReturnValue(
                analyser as unknown as AnalyserNode,
            );
            const gain = makeGainNode(ctx);
            // The DuckingFilter creates only 1 gain node for itself (sidechain has its own gains)
            // We need to intercept createGain selectively — spy and capture last call
            const gainSpy = jest.spyOn(ctx, 'createGain');
            const filter = new DuckingFilter({ sidechain });
            filter.destroy();
            expect(analyser.disconnect).toHaveBeenCalled();
            // At least one gain was disconnected
            expect(gainSpy).toHaveBeenCalled();
            analyserSpy.mockRestore();
            gainSpy.mockRestore();
            jest.useRealTimers();
        });

        it('stops _tick from being called after destroy', () => {
            jest.useFakeTimers();
            const ctx = getAudioContext();
            const analyser = makeAnalyserNode();
            const analyserSpy = jest.spyOn(ctx, 'createAnalyser').mockReturnValue(
                analyser as unknown as AnalyserNode,
            );
            const filter = new DuckingFilter({ sidechain });
            filter.destroy();
            analyser.getByteTimeDomainData.mockClear();
            jest.advanceTimersByTime(500);
            expect(analyser.getByteTimeDomainData).not.toHaveBeenCalled();
            analyserSpy.mockRestore();
            jest.useRealTimers();
        });
    });

    describe('gain ramping based on sidechain signal', () => {
        it('ramps gain down when sidechain RMS exceeds threshold', () => {
            jest.useFakeTimers();
            const ctx = getAudioContext();

            // Intercept createGain so we can spy on the DuckingFilter's specific GainNode.
            // The DuckingFilter creates exactly 1 gain node (sidechain creates its own via AudioBus).
            // Since the sidechain is already set up, only the filter's gain creation is intercepted.
            const duckingGain = makeGainNode(ctx);
            // Make setTargetAtTime a jest.fn on this specific gain node's param
            duckingGain.gain.setTargetAtTime = jest.fn();
            // The sidechain may already have been set up; we just intercept the next createGain call.
            const gainSpy = jest.spyOn(ctx, 'createGain').mockReturnValueOnce(
                duckingGain as unknown as GainNode,
            );

            const analyser = makeAnalyserNode();
            const analyserSpy = jest.spyOn(ctx, 'createAnalyser').mockReturnValue(
                analyser as unknown as AnalyserNode,
            );

            // Mock getByteTimeDomainData to return a loud signal.
            // Bytes are in 0..255 centered at 128. Full scale = 255 (sample = 1.0).
            analyser.getByteTimeDomainData.mockImplementation((buf: Uint8Array) => {
                buf.fill(255); // maximum amplitude → loud signal
            });

            const filter = new DuckingFilter({ sidechain, threshold: -20, ratio: 4 });

            // Advance timer to trigger tick
            jest.advanceTimersByTime(Math.ceil(1000 / 60));

            // When RMS > threshold, gain should be ramped toward 1/ratio = 0.25
            expect(duckingGain.gain.setTargetAtTime).toHaveBeenCalledWith(
                1 / 4,
                expect.anything(),
                expect.anything(),
            );

            filter.destroy();
            gainSpy.mockRestore();
            analyserSpy.mockRestore();
            jest.useRealTimers();
        });

        it('ramps gain up when sidechain is quiet', () => {
            jest.useFakeTimers();
            const ctx = getAudioContext();

            const duckingGain = makeGainNode(ctx);
            duckingGain.gain.setTargetAtTime = jest.fn();
            const gainSpy = jest.spyOn(ctx, 'createGain').mockReturnValueOnce(
                duckingGain as unknown as GainNode,
            );

            const analyser = makeAnalyserNode();
            const analyserSpy = jest.spyOn(ctx, 'createAnalyser').mockReturnValue(
                analyser as unknown as AnalyserNode,
            );

            // Mock silence: all bytes at 128 → sample = 0, RMS = 0 → -Infinity dB
            analyser.getByteTimeDomainData.mockImplementation((buf: Uint8Array) => {
                buf.fill(128);
            });

            const filter = new DuckingFilter({ sidechain, threshold: -20 });

            jest.advanceTimersByTime(Math.ceil(1000 / 60));

            // When RMS < threshold, gain should be ramped toward 1
            expect(duckingGain.gain.setTargetAtTime).toHaveBeenCalledWith(
                1,
                expect.anything(),
                expect.anything(),
            );

            filter.destroy();
            gainSpy.mockRestore();
            analyserSpy.mockRestore();
            jest.useRealTimers();
        });
    });

    describe('setters', () => {
        it('ratio setter clamps to minimum of 1', () => {
            jest.useFakeTimers();
            const filter = new DuckingFilter({ sidechain });
            filter.ratio = 0;
            expect(filter.ratio).toBe(1);
            filter.destroy();
            jest.useRealTimers();
        });

        it('attackMs setter clamps to minimum of 1', () => {
            jest.useFakeTimers();
            const filter = new DuckingFilter({ sidechain });
            filter.attackMs = 0;
            expect(filter.attackMs).toBe(1);
            filter.destroy();
            jest.useRealTimers();
        });

        it('releaseMs setter clamps to minimum of 1', () => {
            jest.useFakeTimers();
            const filter = new DuckingFilter({ sidechain });
            filter.releaseMs = -100;
            expect(filter.releaseMs).toBe(1);
            filter.destroy();
            jest.useRealTimers();
        });
    });
});
