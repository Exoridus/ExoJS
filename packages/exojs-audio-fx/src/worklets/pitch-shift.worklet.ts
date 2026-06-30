export const pitchShiftWorkletSource = `
class PitchShiftProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'pitch', defaultValue: 1.0, minValue: 0.25, maxValue: 4.0, automationRate: 'k-rate' },
        ];
    }

    // Pitch shift = SOLA time-stretch by \`pitch\` followed by resampling by
    // \`pitch\`. SOLA (synchronized overlap-add) realigns each synthesis grain by
    // cross-correlation so grain restarts stay phase coherent — this is what
    // keeps the carrier exactly at f_in * pitch. A naive granular delay drifts
    // the pitch because its grain-boundary phase jumps accumulate into a
    // frequency offset.
    constructor(options) {
        super();
        const grainSize = options.processorOptions?.grainSize ?? 1024;
        this._frameLen = grainSize;        // analysis/synthesis frame
        this._hop = grainSize >> 1;        // synthesis hop (50% overlap)
        this._overlap = grainSize - this._hop;
        this._seek = grainSize >> 2;       // correlation search radius (±)
        this._win = this._buildHannWindow(grainSize);

        // Input ring buffer: holds enough past input for the correlation search.
        this._inLen = grainSize * 4 + 2 * this._seek;
        this._inBuf = new Float32Array(this._inLen);
        this._inCount = 0;                 // total input samples written

        // Stretched-stream overlap-add accumulator (also a ring).
        this._outLen = grainSize * 4;
        this._outBuf = new Float32Array(this._outLen);
        this._synthPos = 0;                // total stretched samples synthesized
        this._readPos = 0;                 // fractional resample read position
        this._aPos = 0;                    // analysis position (absolute input coords)
        this._first = true;
    }

    _buildHannWindow(n) {
        // Periodic Hann: w(p) + w(p + n/2) === 1, i.e. constant-overlap-add at
        // 50% overlap, so two adjacent grains reconstruct unity amplitude.
        const w = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / n));
        }
        return w;
    }

    // Find the input offset (within ±seek of \`nominal\`) whose grain head best
    // matches the existing output overlap region — the waveform-similarity step
    // that keeps successive grains in phase.
    _correlate(nominal) {
        const ov = this._overlap;
        const ib = this._inBuf, iL = this._inLen;
        const ob = this._outBuf, oL = this._outLen;
        const sp = this._synthPos, seek = this._seek;
        let bestD = 0, bestC = -Infinity;
        for (let d = -seek; d <= seek; d++) {
            const base = nominal + d;
            if (base < 0 || base + ov > this._inCount) continue;
            let c = 0;
            for (let k = 0; k < ov; k++) c += ob[(sp + k) % oL] * ib[(base + k) % iL];
            if (c > bestC) { bestC = c; bestD = d; }
        }
        return bestD;
    }

    // True once the input buffer covers the next analysis frame plus its search.
    _canGenerate() {
        const nominal = Math.round(this._aPos);
        const oldest = this._inCount - this._inLen;
        return nominal >= 0
            && nominal + this._frameLen + this._seek <= this._inCount
            && nominal - this._seek >= oldest;
    }

    // Emit one phase-aligned grain into the stretched-stream accumulator.
    _generate(pitch) {
        const F = this._frameLen, H = this._hop, win = this._win;
        const ib = this._inBuf, iL = this._inLen;
        const ob = this._outBuf, oL = this._outLen;
        const nominal = Math.round(this._aPos);
        const d = this._first ? 0 : this._correlate(nominal);
        this._first = false;
        const base = nominal + d;
        // Zero the newly exposed tail, then overlap-add the windowed grain.
        for (let j = H; j < F; j++) ob[(this._synthPos + j) % oL] = 0;
        for (let j = 0; j < F; j++) ob[(this._synthPos + j) % oL] += ib[(base + j) % iL] * win[j];
        this._synthPos += H;
        this._aPos += H / pitch;           // analysis hop = synthesis hop / stretch
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0]?.[0];
        const output = outputs[0]?.[0];
        if (!input || !output) return true;

        const pitch = parameters.pitch[0];
        const ob = this._outBuf, oL = this._outLen;

        for (let i = 0; i < input.length; i++) {
            this._inBuf[this._inCount % this._inLen] = input[i];
            this._inCount++;

            // Pull-generate stretched samples until the read pointer has a margin.
            let guard = 0;
            while (this._synthPos < this._readPos + 2 && this._canGenerate() && guard++ < 64) {
                this._generate(pitch);
            }

            let shifted = 0;
            if (this._readPos + 1 < this._synthPos) {
                const p = this._readPos;
                const i0 = Math.floor(p), frac = p - i0;
                const a = ob[((i0 % oL) + oL) % oL];
                const b = ob[(((i0 + 1) % oL) + oL) % oL];
                shifted = a + (b - a) * frac;
                this._readPos += pitch;
            }

            output[i] = shifted;
        }
        return true;
    }
}
registerProcessor('exojs-pitch-shift', PitchShiftProcessor);
`;
