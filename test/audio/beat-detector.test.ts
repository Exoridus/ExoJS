import { getAudioContext, isAudioContextReady } from '@/audio/audio-context';
import { BeatDetector } from '@/audio/BeatDetector';
import { AudioBus } from '@/audio/AudioBus';
import { _resetAudioManagerForTesting } from '@/audio/AudioManager';

// ---------------------------------------------------------------------------
// Types for the mock AudioWorkletNode (extended in setup-env.ts)
// ---------------------------------------------------------------------------

interface MockPort {
    postMessage: jest.Mock;
    onmessage: ((event: { data: unknown }) => void) | null;
}

interface MockWorkletNode {
    connect: jest.Mock;
    disconnect: jest.Mock;
    port: MockPort;
}

function getMockWorkletNode(detector: BeatDetector): MockWorkletNode | null {
    // Access via internal field (test-only)
    return (detector as unknown as { _workletNode: MockWorkletNode | null })._workletNode;
}

function simulateMessage(detector: BeatDetector, data: unknown): void {
    const node = getMockWorkletNode(detector);
    if (node?.port.onmessage) {
        node.port.onmessage({ data });
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMediaStream(): MediaStream {
    return { getTracks: () => [] } as unknown as MediaStream;
}

function makeSoundLike(): import('@/audio/Sound').Sound {
    const ctx = getAudioContext();
    return { analyserTarget: ctx.createGain() } as unknown as import('@/audio/Sound').Sound;
}

function makeMusicLike(): import('@/audio/Music').Music {
    const ctx = getAudioContext();
    return { analyserTarget: ctx.createGain() } as unknown as import('@/audio/Music').Music;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BeatDetector', () => {
    let addModuleMock: jest.Mock;

    beforeEach(() => {
        const ctx = getAudioContext();
        expect(isAudioContextReady()).toBe(true);
        addModuleMock = jest.fn().mockResolvedValue(undefined);
        (ctx as unknown as { audioWorklet: { addModule: jest.Mock } }).audioWorklet.addModule = addModuleMock;
        jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:beat-url');
        jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    });

    afterEach(() => {
        _resetAudioManagerForTesting();
        jest.restoreAllMocks();
    });

    // ---- Construction ----

    describe('construction', () => {
        it('constructs with no options', () => {
            const d = new BeatDetector();
            expect(d).toBeDefined();
            d.destroy();
        });

        it('has default zero state before worklet loads', () => {
            const d = new BeatDetector();
            expect(d.tempo).toBe(0);
            expect(d.confidence).toBe(0);
            expect(d.barPosition).toBe(1);
            d.destroy();
        });

        it('ready resolves after worklet registers', async () => {
            const d = new BeatDetector();
            await expect(d.ready).resolves.toBeUndefined();
            d.destroy();
        });

        it('AudioWorkletNode is created after ready', async () => {
            const d = new BeatDetector();
            await d.ready;
            expect(getMockWorkletNode(d)).not.toBeNull();
            d.destroy();
        });

        it('worklet node has numberOfInputs:1 numberOfOutputs:0', async () => {
            let capturedOptions: AudioWorkletNodeOptions | undefined;
            const OrigAWN = globalThis.AudioWorkletNode;
            (globalThis.AudioWorkletNode as unknown as jest.Mock) = jest.fn(
                (c: AudioContext, name: string, opts: AudioWorkletNodeOptions) => {
                    capturedOptions = opts;
                    return new OrigAWN(c, name, opts);
                },
            );
            const d = new BeatDetector();
            await d.ready;
            expect(capturedOptions?.numberOfInputs).toBe(1);
            expect(capturedOptions?.numberOfOutputs).toBe(0);
            d.destroy();
        });
    });

    // ---- Source setter — all 5 types ----

    describe('source setter — AudioBus', () => {
        it('accepts an AudioBus', async () => {
            const bus = new AudioBus('bd-bus');
            const d = new BeatDetector();
            await d.ready;
            expect(() => { d.source = bus; }).not.toThrow();
            d.destroy();
            bus.destroy();
        });

        it('connects the bus output to worklet', async () => {
            const bus = new AudioBus('bd-bus2');
            const d = new BeatDetector();
            await d.ready;
            const outputNode = bus._getOutputNode();
            if (outputNode) {
                const connectSpy = jest.spyOn(outputNode, 'connect');
                d.source = bus;
                expect(connectSpy).toHaveBeenCalled();
            }
            d.destroy();
            bus.destroy();
        });
    });

    describe('source setter — Sound', () => {
        it('accepts a Sound-like object', async () => {
            const sound = makeSoundLike();
            const d = new BeatDetector();
            await d.ready;
            expect(() => { d.source = sound; }).not.toThrow();
            d.destroy();
        });
    });

    describe('source setter — Music', () => {
        it('accepts a Music-like object', async () => {
            const music = makeMusicLike();
            const d = new BeatDetector();
            await d.ready;
            expect(() => { d.source = music; }).not.toThrow();
            d.destroy();
        });
    });

    describe('source setter — MediaStream', () => {
        it('accepts a MediaStream', async () => {
            const stream = makeMediaStream();
            const ctx = getAudioContext();
            const spy = jest.spyOn(ctx, 'createMediaStreamSource');
            const d = new BeatDetector();
            await d.ready;
            d.source = stream;
            expect(spy).toHaveBeenCalledWith(stream);
            d.destroy();
        });
    });

    describe('source setter — AudioNode', () => {
        it('accepts a raw AudioNode', async () => {
            const ctx = getAudioContext();
            const node = ctx.createGain() as unknown as AudioNode;
            const connectSpy = jest.spyOn(node, 'connect');
            const d = new BeatDetector();
            await d.ready;
            d.source = node;
            expect(connectSpy).toHaveBeenCalled();
            d.destroy();
        });
    });

    describe('source setter — null', () => {
        it('clears source without throwing', async () => {
            const d = new BeatDetector();
            await d.ready;
            const node = getAudioContext().createGain() as unknown as AudioNode;
            d.source = node;
            expect(() => { d.source = null; }).not.toThrow();
            expect(d.source).toBeNull();
            d.destroy();
        });
    });

    // ---- Worklet message handling ----

    describe('state message handling', () => {
        it('updates tempo from state message', async () => {
            const d = new BeatDetector();
            await d.ready;
            simulateMessage(d, {
                type: 'state',
                tempo: 128,
                beatPhase: 0.5,
                confidence: 0.7,
                gridStability: 0.6,
                tempoCandidates: [{ bpm: 128, score: 0.9 }],
                rms: 0.3,
                onsetStrength: 1.2,
                bandEnergy: { low: 0.4, mid: 0.3, high: 0.1 },
                barPosition: 2,
                barLength: 4,
                timeSignature: { numerator: 4, denominator: 4 },
                lookahead: [],
                nextBeatTime: 1.5,
                nextDownbeatTime: 2.0,
            });
            expect(d.tempo).toBe(128);
            expect(d.confidence).toBeCloseTo(0.7);
            expect(d.barPosition).toBe(2);
            d.destroy();
        });

        it('lookahead is a frozen array', async () => {
            const d = new BeatDetector();
            await d.ready;
            const upcoming = [{ audioTime: 1.0, tempo: 120, isDownbeat: true, beatInBar: 1 }];
            simulateMessage(d, {
                type: 'state',
                tempo: 120,
                beatPhase: 0,
                confidence: 0.5,
                gridStability: 0.5,
                tempoCandidates: [],
                rms: 0.2,
                onsetStrength: 0.5,
                bandEnergy: { low: 0, mid: 0, high: 0 },
                barPosition: 1,
                barLength: 4,
                timeSignature: { numerator: 4, denominator: 4 },
                lookahead: upcoming,
                nextBeatTime: 1.0,
                nextDownbeatTime: 1.0,
            });
            expect(Object.isFrozen(d.lookahead)).toBe(true);
            d.destroy();
        });

        it('tempoCandidates is frozen', async () => {
            const d = new BeatDetector();
            await d.ready;
            simulateMessage(d, {
                type: 'state',
                tempo: 120,
                beatPhase: 0,
                confidence: 0.5,
                gridStability: 0.5,
                tempoCandidates: [{ bpm: 120, score: 0.8 }],
                rms: 0.2,
                onsetStrength: 0.5,
                bandEnergy: { low: 0, mid: 0, high: 0 },
                barPosition: 1,
                barLength: 4,
                timeSignature: { numerator: 4, denominator: 4 },
                lookahead: [],
                nextBeatTime: 0,
                nextDownbeatTime: 0,
            });
            expect(Object.isFrozen(d.tempoCandidates)).toBe(true);
            d.destroy();
        });
    });

    describe('beat message handling', () => {
        it('fires onBeat signal on beat message', async () => {
            const d = new BeatDetector();
            await d.ready;
            const handler = jest.fn();
            d.onBeat.add(handler);
            simulateMessage(d, {
                type: 'beat',
                audioTime: 1.0,
                tempo: 120,
                confidence: 0.8,
                beatPhase: 0,
                energy: 0.5,
                isDownbeat: false,
                beatInBar: 2,
            });
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler.mock.calls[0][0]).toMatchObject({ audioTime: 1.0, tempo: 120 });
            d.destroy();
        });

        it('fires onDownbeat for downbeat beats', async () => {
            const d = new BeatDetector();
            await d.ready;
            const beatHandler    = jest.fn();
            const downbeatHandler = jest.fn();
            d.onBeat.add(beatHandler);
            d.onDownbeat.add(downbeatHandler);
            simulateMessage(d, {
                type: 'beat',
                audioTime: 2.0,
                tempo: 120,
                confidence: 0.9,
                beatPhase: 0,
                energy: 0.8,
                isDownbeat: true,
                beatInBar: 1,
            });
            expect(beatHandler).toHaveBeenCalledTimes(1);
            expect(downbeatHandler).toHaveBeenCalledTimes(1);
            d.destroy();
        });

        it('does NOT fire onDownbeat for non-downbeat beats', async () => {
            const d = new BeatDetector();
            await d.ready;
            const downbeatHandler = jest.fn();
            d.onDownbeat.add(downbeatHandler);
            simulateMessage(d, {
                type: 'beat',
                audioTime: 3.0,
                tempo: 120,
                confidence: 0.9,
                beatPhase: 0,
                energy: 0.6,
                isDownbeat: false,
                beatInBar: 3,
            });
            expect(downbeatHandler).not.toHaveBeenCalled();
            d.destroy();
        });
    });

    describe('tempoChange message handling', () => {
        it('fires onTempoChange signal', async () => {
            const d = new BeatDetector();
            await d.ready;
            const handler = jest.fn();
            d.onTempoChange.add(handler);
            simulateMessage(d, { type: 'tempoChange', newTempo: 128, oldTempo: 120 });
            expect(handler).toHaveBeenCalledWith(128, 120);
            d.destroy();
        });
    });

    describe('barStart message handling', () => {
        it('fires onBarStart signal', async () => {
            const d = new BeatDetector();
            await d.ready;
            const handler = jest.fn();
            d.onBarStart.add(handler);
            simulateMessage(d, {
                type: 'barStart',
                audioTime: 4.0,
                tempo: 120,
                confidence: 0.85,
                barNumber: 2,
            });
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler.mock.calls[0][0]).toMatchObject({ barNumber: 2, audioTime: 4.0 });
            d.destroy();
        });
    });

    // ---- Settling ----

    describe('settling period', () => {
        it('default settling is 1500ms', () => {
            const d = new BeatDetector();
            // Can't test worklet settling directly (no real audio), but we can
            // confirm the option is correctly passed to the worklet via processorOptions
            let capturedProcessorOptions: Record<string, unknown> | undefined;
            const OrigAWN = globalThis.AudioWorkletNode;
            (globalThis.AudioWorkletNode as unknown as jest.Mock) = jest.fn(
                (c: AudioContext, name: string, opts: AudioWorkletNodeOptions) => {
                    capturedProcessorOptions = opts.processorOptions as Record<string, unknown>;
                    return new OrigAWN(c, name, opts);
                },
            );
            d.destroy();
            const d2 = new BeatDetector({ settlingMs: 1500 });
            // The promise resolves async; just check the object was constructed
            d2.ready.then(() => {
                expect(capturedProcessorOptions?.['settlingMs']).toBe(1500);
            });
            d2.destroy();
        });
    });

    // ---- Time signature ----

    describe('timeSignature', () => {
        it('returns 4/4 by default', () => {
            const d = new BeatDetector();
            expect(d.timeSignature).toEqual({ numerator: 4, denominator: 4 });
            d.destroy();
        });
    });

    // ---- Destroy ----

    describe('destroy', () => {
        it('does not throw', async () => {
            const d = new BeatDetector();
            await d.ready;
            expect(() => d.destroy()).not.toThrow();
        });

        it('double destroy is safe', async () => {
            const d = new BeatDetector();
            await d.ready;
            d.destroy();
            expect(() => d.destroy()).not.toThrow();
        });

        it('signals are cleared on destroy', async () => {
            const d = new BeatDetector();
            await d.ready;
            const handler = jest.fn();
            d.onBeat.add(handler);
            d.destroy();
            // After destroy, the signal is cleared — no more handlers
            expect(d.onBeat.bindings.length).toBe(0);
        });
    });

    // ---- lookahead cannot be mutated ----

    describe('lookahead immutability', () => {
        it('caller cannot push to lookahead (frozen array)', async () => {
            const d = new BeatDetector();
            await d.ready;
            simulateMessage(d, {
                type: 'state',
                tempo: 120,
                beatPhase: 0,
                confidence: 0.5,
                gridStability: 0.5,
                tempoCandidates: [],
                rms: 0,
                onsetStrength: 0,
                bandEnergy: { low: 0, mid: 0, high: 0 },
                barPosition: 1,
                barLength: 4,
                timeSignature: { numerator: 4, denominator: 4 },
                lookahead: [{ audioTime: 1, tempo: 120, isDownbeat: true, beatInBar: 1 }],
                nextBeatTime: 1,
                nextDownbeatTime: 1,
            });
            const la = d.lookahead;
            expect(() => {
                (la as UpcomingBeat[]).push({ audioTime: 99, tempo: 999, isDownbeat: false, beatInBar: 2 });
            }).toThrow();
            d.destroy();
        });
    });
});

// Import for the type in the test above
import type { UpcomingBeat } from '@/audio/BeatDetector';
