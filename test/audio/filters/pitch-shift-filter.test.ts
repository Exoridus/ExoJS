import { getAudioContext } from '@/audio/audio-context';
import { PitchShiftFilter } from '@/audio/filters/PitchShiftFilter';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PitchShiftFilter', () => {
    let addModuleMock: jest.Mock;

    beforeEach(() => {
        const ctx = getAudioContext();
        addModuleMock = jest.fn().mockResolvedValue(undefined);
        (ctx as unknown as { audioWorklet: { addModule: jest.Mock } }).audioWorklet.addModule = addModuleMock;
        jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pitch-shift-url');
        jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('construction with defaults', () => {
        it('uses default pitch of 1.0', () => {
            const filter = new PitchShiftFilter();
            expect(filter.pitch).toBe(1.0);
            filter.destroy();
        });

        it('uses default wet of 1.0', () => {
            const filter = new PitchShiftFilter();
            expect(filter.wet).toBe(1.0);
            filter.destroy();
        });

        it('creates input and output nodes on construction', () => {
            const filter = new PitchShiftFilter();
            expect(filter.inputNode).toBeDefined();
            expect(filter.outputNode).toBeDefined();
            filter.destroy();
        });
    });

    describe('pitch clamping', () => {
        it('clamps pitch to minimum 0.25 on construction', () => {
            const filter = new PitchShiftFilter({ pitch: 0.1 });
            expect(filter.pitch).toBe(0.25);
            filter.destroy();
        });

        it('clamps pitch to maximum 4.0 on construction', () => {
            const filter = new PitchShiftFilter({ pitch: 10 });
            expect(filter.pitch).toBe(4.0);
            filter.destroy();
        });

        it('clamps pitch to minimum 0.25 via setter', () => {
            const filter = new PitchShiftFilter();
            filter.pitch = 0;
            expect(filter.pitch).toBe(0.25);
            filter.destroy();
        });

        it('clamps pitch to maximum 4.0 via setter', () => {
            const filter = new PitchShiftFilter();
            filter.pitch = 100;
            expect(filter.pitch).toBe(4.0);
            filter.destroy();
        });

        it('accepts valid pitch value', () => {
            const filter = new PitchShiftFilter({ pitch: 1.5 });
            expect(filter.pitch).toBe(1.5);
            filter.destroy();
        });
    });

    describe('wet clamping', () => {
        it('clamps wet to minimum 0 on construction', () => {
            const filter = new PitchShiftFilter({ wet: -1 });
            expect(filter.wet).toBe(0);
            filter.destroy();
        });

        it('clamps wet to maximum 1.0 on construction', () => {
            const filter = new PitchShiftFilter({ wet: 2 });
            expect(filter.wet).toBe(1.0);
            filter.destroy();
        });

        it('clamps wet to minimum 0 via setter', () => {
            const filter = new PitchShiftFilter();
            filter.wet = -0.5;
            expect(filter.wet).toBe(0);
            filter.destroy();
        });

        it('clamps wet to maximum 1.0 via setter', () => {
            const filter = new PitchShiftFilter();
            filter.wet = 1.5;
            expect(filter.wet).toBe(1.0);
            filter.destroy();
        });
    });

    describe('worklet lifecycle', () => {
        it('after await filter.ready: workletNode is not null', async () => {
            const filter = new PitchShiftFilter();
            await filter.ready;
            expect(filter['_workletNode']).not.toBeNull();
            filter.destroy();
        });

        it('after await filter.ready: workletNode is an AudioWorkletNode', async () => {
            const filter = new PitchShiftFilter();
            await filter.ready;
            // AudioWorkletNode mock in setup-env has connect/disconnect/parameters
            const node = filter['_workletNode'];
            expect(node).toBeDefined();
            expect(typeof (node as unknown as { connect: unknown })?.connect).toBe('function');
            filter.destroy();
        });

        it('worklet parameters pitch and wet are set on ready', async () => {
            const filter = new PitchShiftFilter({ pitch: 1.5, wet: 0.8 });
            await filter.ready;
            const node = filter['_workletNode']!;
            const pitchParam = node.parameters.get('pitch') as unknown as { setTargetAtTime: jest.Mock };
            const wetParam   = node.parameters.get('wet')   as unknown as { setTargetAtTime: jest.Mock };
            expect(pitchParam.setTargetAtTime).toHaveBeenCalledWith(1.5, expect.anything(), expect.anything());
            expect(wetParam.setTargetAtTime).toHaveBeenCalledWith(0.8, expect.anything(), expect.anything());
            filter.destroy();
        });

        it('processorOptions.grainSize is forwarded to AudioWorkletNode', async () => {
            let capturedOptions: AudioWorkletNodeOptions | undefined;
            const OrigAWN = globalThis.AudioWorkletNode;
            (globalThis.AudioWorkletNode as unknown as jest.Mock) = jest.fn(
                (c: AudioContext, name: string, options: AudioWorkletNodeOptions) => {
                    capturedOptions = options;
                    return new OrigAWN(c, name, options);
                },
            );

            const filter = new PitchShiftFilter({ grainSize: 2048 });
            await filter.ready;
            expect(capturedOptions?.processorOptions?.grainSize).toBe(2048);
            filter.destroy();
        });

        it('default grainSize of 1024 is forwarded', async () => {
            let capturedOptions: AudioWorkletNodeOptions | undefined;
            const OrigAWN = globalThis.AudioWorkletNode;
            (globalThis.AudioWorkletNode as unknown as jest.Mock) = jest.fn(
                (c: AudioContext, name: string, options: AudioWorkletNodeOptions) => {
                    capturedOptions = options;
                    return new OrigAWN(c, name, options);
                },
            );

            const filter = new PitchShiftFilter();
            await filter.ready;
            expect(capturedOptions?.processorOptions?.grainSize).toBe(1024);
            filter.destroy();
        });
    });

    describe('setters after ready', () => {
        it('setting pitch updates worklet param', async () => {
            const filter = new PitchShiftFilter();
            await filter.ready;
            const node = filter['_workletNode']!;
            const param = node.parameters.get('pitch') as unknown as { setTargetAtTime: jest.Mock };
            param.setTargetAtTime.mockClear();
            filter.pitch = 2.0;
            expect(filter.pitch).toBe(2.0);
            expect(param.setTargetAtTime).toHaveBeenCalledWith(2.0, expect.anything(), expect.anything());
            filter.destroy();
        });

        it('setting wet updates worklet param', async () => {
            const filter = new PitchShiftFilter();
            await filter.ready;
            const node = filter['_workletNode']!;
            const param = node.parameters.get('wet') as unknown as { setTargetAtTime: jest.Mock };
            param.setTargetAtTime.mockClear();
            filter.wet = 0.5;
            expect(filter.wet).toBe(0.5);
            expect(param.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.anything(), expect.anything());
            filter.destroy();
        });
    });

    describe('destroy', () => {
        it('destroy cleans up without throwing', async () => {
            const filter = new PitchShiftFilter();
            await filter.ready;
            expect(() => filter.destroy()).not.toThrow();
        });

        it('after destroy, inputNode throws', async () => {
            const filter = new PitchShiftFilter();
            await filter.ready;
            filter.destroy();
            expect(() => filter.inputNode).toThrow();
        });

        it('double destroy is safe', async () => {
            const filter = new PitchShiftFilter();
            await filter.ready;
            filter.destroy();
            expect(() => filter.destroy()).not.toThrow();
        });
    });
});
