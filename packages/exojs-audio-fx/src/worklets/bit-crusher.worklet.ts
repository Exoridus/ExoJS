export const bitCrusherWorkletSource = `
class BitCrusherProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'bits',     defaultValue: 8,   minValue: 1,   maxValue: 16,  automationRate: 'k-rate' },
            { name: 'normFreq', defaultValue: 0.5, minValue: 0,   maxValue: 1,   automationRate: 'k-rate' },
        ];
    }

    constructor() {
        super();
        // Phase accumulator for sample-and-hold; held keeps the last latched value.
        this._phase = 0;
        this._held  = 0;
    }

    process(inputs, outputs, parameters) {
        const input  = inputs[0]?.[0];
        const output = outputs[0]?.[0];
        if (!input || !output) return true;

        const bits     = Math.round(Math.max(1, Math.min(16, parameters.bits[0])));
        const normFreq = Math.max(0, Math.min(1, parameters.normFreq[0]));
        // Quantization step: 2 / 2^bits  (maps [-1, 1] onto 2^bits levels)
        const step = 2 / Math.pow(2, bits);

        for (let i = 0; i < input.length; i++) {
            // Advance the sample-and-hold phase accumulator.
            this._phase += normFreq;
            if (this._phase >= 1) {
                // Wrap phase and latch a fresh, quantized sample.
                this._phase -= 1;
                this._held = step * Math.round(input[i] / step);
            }
            // Emit the held (quantized) sample — pure wet, no dry mixing here.
            output[i] = this._held;
        }
        return true;
    }
}
registerProcessor('exojs-bit-crusher', BitCrusherProcessor);
`;
