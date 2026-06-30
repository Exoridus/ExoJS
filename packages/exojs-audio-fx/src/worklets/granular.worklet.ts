export const granularWorkletSource = `
const sampleRate = globalThis.sampleRate;

class GranularProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'grainSize', defaultValue: 0.05, minValue: 0.005, maxValue: 0.5, automationRate: 'k-rate' },
            { name: 'density', defaultValue: 50, minValue: 1, maxValue: 500, automationRate: 'k-rate' },
            { name: 'spread', defaultValue: 0.5, minValue: 0, maxValue: 1.0, automationRate: 'k-rate' },
            { name: 'pitchMin', defaultValue: 1.0, minValue: 0.25, maxValue: 4.0, automationRate: 'k-rate' },
            { name: 'pitchMax', defaultValue: 1.0, minValue: 0.25, maxValue: 4.0, automationRate: 'k-rate' },
        ];
    }

    constructor(options) {
        super();
        const opts = options.processorOptions ?? {};
        const bufferSeconds = opts.bufferSeconds ?? 2;
        this._bufferLength = Math.floor(bufferSeconds * sampleRate);
        this._buffer = new Float32Array(this._bufferLength);
        this._writePos = 0;
        this._timeUntilNextGrainSamples = 0;
        this._grains = [];  // { startPos, ageSamples, lengthSamples, pitch }
        this._normalizeGain = opts.normalizeGain ?? false;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0]?.[0];
        const output = outputs[0]?.[0];
        if (!input || !output) return true;

        const grainSize = parameters.grainSize[0];
        const density = parameters.density[0];
        const spread = parameters.spread[0];
        const pitchMin = parameters.pitchMin[0];
        const pitchMax = parameters.pitchMax[0];
        const grainSizeSamples = Math.max(8, Math.floor(grainSize * sampleRate));
        const samplesPerGrain = sampleRate / Math.max(1, density);

        // Optional level normalization. Output RMS scales as sqrt(3/8) (the Hann
        // window RMS) times sqrt(density * grainSize) — overlapping uncorrelated
        // grains add in power. Dividing by that factor holds the wet level near
        // unity regardless of density/grainSize. Default off keeps the expressive
        // density dynamics that make granular sound the way it does.
        let normFactor = 1;
        if (this._normalizeGain) {
            const expectedGrains = density * grainSize; // simultaneous grains (dimensionless)
            normFactor = 1 / (0.6123724356957945 * Math.sqrt(Math.max(1e-6, expectedGrains)));
        }

        for (let i = 0; i < input.length; i++) {
            // Write input to circular buffer
            this._buffer[this._writePos] = input[i];
            this._writePos = (this._writePos + 1) % this._bufferLength;

            // Spawn new grain if scheduled
            this._timeUntilNextGrainSamples -= 1;
            if (this._timeUntilNextGrainSamples <= 0) {
                // Random offset into recent past, biased by spread
                const maxOffset = Math.floor(spread * this._bufferLength);
                const offset = Math.floor(Math.random() * Math.max(1, maxOffset));
                const startPos = (this._writePos - offset - grainSizeSamples + this._bufferLength) % this._bufferLength;
                // Random pitch in [pitchMin, pitchMax]
                const pitch = pitchMin + Math.random() * Math.max(0, pitchMax - pitchMin);

                this._grains.push({ startPos, ageSamples: 0, lengthSamples: grainSizeSamples, pitch });
                this._timeUntilNextGrainSamples = samplesPerGrain;
            }

            // Mix all active grains (apply Hann window)
            let grainSum = 0;
            for (let g = this._grains.length - 1; g >= 0; g--) {
                const grain = this._grains[g];
                if (grain.ageSamples >= grain.lengthSamples) {
                    this._grains.splice(g, 1);
                    continue;
                }

                const phase = grain.ageSamples / grain.lengthSamples;
                const window = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
                const readPos = grain.startPos + grain.ageSamples * grain.pitch;
                const sampleIndex = Math.floor(readPos) % this._bufferLength;
                const safeIndex = (sampleIndex + this._bufferLength) % this._bufferLength;
                grainSum += this._buffer[safeIndex] * window;

                grain.ageSamples++;
            }

            output[i] = grainSum * normFactor;
        }
        return true;
    }
}
registerProcessor('exojs-granular', GranularProcessor);
`;
