export const vocoderWorkletSource = `
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
        const bandCount = opts.numBands ?? 16;
        const minHz = opts.minHz ?? 80;
        const maxHz = opts.maxHz ?? 8000;
        const Q = opts.bandQ ?? 4;

        // Log-spaced band centers + biquad coefficients
        this._bands = [];
        for (let i = 0; i < bandCount; i++) {
            const ratio = bandCount === 1 ? 0 : i / (bandCount - 1);
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
        this._envelopes = new Float32Array(bandCount);
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
        const bandCount = this._bands.length;

        for (let i = 0; i < carrier.length; i++) {
            const carrierSample = carrier[i];
            const modulatorSample = modulator?.[i] ?? 0;

            let bandSum = 0;
            for (let b = 0; b < bandCount; b++) {
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
