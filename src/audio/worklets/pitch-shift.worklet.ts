export const pitchShiftWorkletSource = `
class PitchShiftProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'pitch', defaultValue: 1.0, minValue: 0.25, maxValue: 4.0, automationRate: 'k-rate' },
            { name: 'wet', defaultValue: 1.0, minValue: 0, maxValue: 1.0, automationRate: 'k-rate' },
        ];
    }

    constructor(options) {
        super();
        const grainSize = options.processorOptions?.grainSize ?? 1024;
        this._grainSize = grainSize;
        this._bufferLength = grainSize * 4;
        this._buffer = new Float32Array(this._bufferLength);
        this._writePos = 0;
        // Two staggered read positions for overlap-add
        this._readPosA = 0;
        this._readPosB = grainSize / 2;
        this._hannWindow = this._buildHannWindow(grainSize);
    }

    _buildHannWindow(n) {
        const w = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        }
        return w;
    }

    _readGrain(readPos) {
        const grainSize = this._grainSize;
        const sampleIndex = Math.floor(readPos);
        const phase = sampleIndex % grainSize;  // position within the grain envelope
        const win = this._hannWindow[phase];
        const bufferIndex = ((this._writePos - this._bufferLength + sampleIndex) % this._bufferLength + this._bufferLength) % this._bufferLength;
        return this._buffer[bufferIndex] * win;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0]?.[0];
        const output = outputs[0]?.[0];
        if (!input || !output) return true;

        const pitch = parameters.pitch[0];
        const wet = parameters.wet[0];

        for (let i = 0; i < input.length; i++) {
            // Write to circular buffer
            this._buffer[this._writePos] = input[i];
            this._writePos = (this._writePos + 1) % this._bufferLength;

            // Read two grains and sum
            const grainA = this._readGrain(this._readPosA);
            const grainB = this._readGrain(this._readPosB);
            const shifted = grainA + grainB;

            // Mix with dry
            output[i] = (1 - wet) * input[i] + wet * shifted;

            // Advance read positions at pitch rate
            this._readPosA += pitch;
            this._readPosB += pitch;
            if (this._readPosA >= this._grainSize) this._readPosA -= this._grainSize;
            if (this._readPosB >= this._grainSize) this._readPosB -= this._grainSize;
        }
        return true;
    }
}
registerProcessor('exojs-pitch-shift', PitchShiftProcessor);
`;
