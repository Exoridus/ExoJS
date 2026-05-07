import { WorkletFilter } from './WorkletFilter';
import type { AudioBus } from '../AudioBus';

const vocoderWorkletSource = `
const sampleRate = globalThis.sampleRate;

class VocoderProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'wet', defaultValue: 1.0, minValue: 0, maxValue: 1.0, automationRate: 'k-rate' },
            { name: 'envelopeSmoothing', defaultValue: 0.005, minValue: 0.0001, maxValue: 0.1, automationRate: 'k-rate' },
        ];
    }

    constructor(options) {
        super();
        const opts = options.processorOptions ?? {};
        const numBands = opts.numBands ?? 16;
        const minHz = opts.minHz ?? 80;
        const maxHz = opts.maxHz ?? 8000;
        const Q = opts.bandQ ?? 4;

        // Log-spaced band centers + biquad coefficients
        this._bands = [];
        for (let i = 0; i < numBands; i++) {
            const ratio = numBands === 1 ? 0 : i / (numBands - 1);
            const centerHz = minHz * Math.pow(maxHz / minHz, ratio);
            const omega = 2 * Math.PI * centerHz / sampleRate;
            const cos = Math.cos(omega);
            const sin = Math.sin(omega);
            const alpha = sin / (2 * Q);

            // Bandpass (constant 0 dB peak) biquad
            const a0 = 1 + alpha;
            const b0 = alpha / a0;
            const b1 = 0;
            const b2 = -alpha / a0;
            const a1 = (-2 * cos) / a0;
            const a2 = (1 - alpha) / a0;
            this._bands.push({ b0, b1, b2, a1, a2 });
        }

        // Per-band biquad state (one for carrier, one for modulator)
        this._carrierStates = this._bands.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
        this._modulatorStates = this._bands.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));

        // Per-band envelope follower
        this._envelopes = new Float32Array(numBands);
    }

    _processBiquad(state, coef, x) {
        const y = coef.b0 * x + coef.b1 * state.x1 + coef.b2 * state.x2 - coef.a1 * state.y1 - coef.a2 * state.y2;
        state.x2 = state.x1; state.x1 = x;
        state.y2 = state.y1; state.y1 = y;
        return y;
    }

    process(inputs, outputs, parameters) {
        const carrier = inputs[0]?.[0];
        const modulator = inputs[1]?.[0];
        const output = outputs[0]?.[0];
        if (!carrier || !output) return true;

        const wet = parameters.wet[0];
        const envSmoothing = parameters.envelopeSmoothing[0];
        const numBands = this._bands.length;

        for (let i = 0; i < carrier.length; i++) {
            const carrierSample = carrier[i];
            const modulatorSample = modulator?.[i] ?? 0;

            let bandSum = 0;
            for (let b = 0; b < numBands; b++) {
                const coef = this._bands[b];

                // Modulator band → envelope follower
                const modBand = this._processBiquad(this._modulatorStates[b], coef, modulatorSample);
                const target = Math.abs(modBand);
                this._envelopes[b] += (target - this._envelopes[b]) * envSmoothing;

                // Carrier band, scaled by modulator envelope
                const carBand = this._processBiquad(this._carrierStates[b], coef, carrierSample);
                bandSum += carBand * this._envelopes[b];
            }

            output[i] = (1 - wet) * carrierSample + wet * bandSum;
        }
        return true;
    }
}
registerProcessor('exojs-vocoder', VocoderProcessor);
`;

export interface VocoderFilterOptions {
    /** Modulator AudioBus — its output drives the spectral envelope.
     *  Typically routed from a microphone or voice sample. */
    modulator: AudioBus;
    /** Number of frequency bands. More bands = better resolution, more CPU. Default 16. */
    numBands?: number;
    /** Lowest band center frequency in Hz. Default 80. */
    minHz?: number;
    /** Highest band center frequency in Hz. Default 8000. */
    maxHz?: number;
    /** Bandpass Q factor. Higher = narrower bands. Default 4. */
    bandQ?: number;
    /** Dry/wet mix, 0..1. Default 1.0. */
    wet?: number;
    /** Envelope follower smoothing factor (one-pole coefficient).
     *  Smaller = smoother / slower. Default 0.005. */
    envelopeSmoothing?: number;
}

/**
 * Phase-vocoder-style effect implemented as a {@link WorkletFilter}. Analyzes
 * the spectral envelope of a `modulator` {@link AudioBus} across a bank of
 * log-spaced bandpass filters and applies that envelope to the carrier signal
 * (the main input). The result is the classic "robot voice" or talking-synth
 * effect. Band count, frequency range, and Q are compile-time parameters set
 * at construction; only `wet` and `envelopeSmoothing` are adjustable at
 * runtime.
 */
export class VocoderFilter extends WorkletFilter {
    // Declared nullable because super() may trigger _onWorkletReady before the
    // subclass constructor body runs (if construction is aborted by a throw).
    private readonly _modulator: AudioBus | null = null;
    private readonly _numBands: number;
    private readonly _minHz: number;
    private readonly _maxHz: number;
    private readonly _bandQ: number;
    private _wet: number;
    private _envelopeSmoothing: number;

    public constructor(options: VocoderFilterOptions) {
        super();
        if (!options.modulator) {
            throw new Error('VocoderFilter requires a modulator AudioBus.');
        }
        this._modulator = options.modulator;
        this._numBands = options.numBands ?? 16;
        this._minHz = options.minHz ?? 80;
        this._maxHz = options.maxHz ?? 8000;
        this._bandQ = options.bandQ ?? 4;
        this._wet = Math.max(0, Math.min(1, options.wet ?? 1.0));
        this._envelopeSmoothing = Math.max(0.0001, Math.min(0.1, options.envelopeSmoothing ?? 0.005));
    }

    protected get _workletName(): string { return 'exojs-vocoder'; }
    protected get _workletSource(): string { return vocoderWorkletSource; }
    protected override get _workletOptions(): AudioWorkletNodeOptions {
        return {
            numberOfInputs: 2,
            numberOfOutputs: 1,
            processorOptions: {
                numBands: this._numBands,
                minHz: this._minHz,
                maxHz: this._maxHz,
                bandQ: this._bandQ,
            },
        };
    }

    protected override _onWorkletReady(audioContext: AudioContext): void {
        // Guard against partially-constructed instances (constructor threw after super()).
        if (!this._modulator) return;

        this._setAudioParam('wet', this._wet);
        this._setAudioParam('envelopeSmoothing', this._envelopeSmoothing);

        // Wire modulator bus output to input 1 of the worklet
        const modulator = this._modulator;
        const modOutput = modulator._getOutputNode();
        if (modOutput && this._workletNode) {
            modOutput.connect(this._workletNode, 0, 1);
        } else {
            modulator.onceSetup(() => {
                const node = modulator._getOutputNode();
                if (node && this._workletNode) {
                    node.connect(this._workletNode, 0, 1);
                }
            });
        }
    }

    /** Wet (vocoded) mix level, 0..1. Default 1.0. */
    public get wet(): number { return this._wet; }
    public set wet(value: number) {
        this._wet = Math.max(0, Math.min(1, value));
        this._setAudioParam('wet', this._wet);
    }

    /** One-pole envelope follower coefficient. Smaller values produce slower, smoother envelope tracking. Range 0.0001..0.1, default 0.005. */
    public get envelopeSmoothing(): number { return this._envelopeSmoothing; }
    public set envelopeSmoothing(value: number) {
        this._envelopeSmoothing = Math.max(0.0001, Math.min(0.1, value));
        this._setAudioParam('envelopeSmoothing', this._envelopeSmoothing);
    }
}
