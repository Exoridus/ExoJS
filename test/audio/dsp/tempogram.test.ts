import { computeAcf, findTempoPeaks, applyTempoHysteresis } from '@/audio/dsp/tempogram';

const SAMPLE_RATE = 48000;
const HOP_SIZE = 512;

/**
 * Generate a synthetic novelty curve that pulses at a given BPM.
 * Places an impulse at every beat position (rounded to nearest hop).
 */
function syntheticNovelty(bpm: number, numHops: number): Float32Array {
    const hopRate = SAMPLE_RATE / HOP_SIZE; // hops per second
    const beatPeriodHops = hopRate / (bpm / 60); // hops between beats
    const flux = new Float32Array(numHops);
    let beatPos = 0;
    while (beatPos < numHops) {
        const idx = Math.round(beatPos);
        if (idx >= 0 && idx < numHops) {
            flux[idx] = 1.0;
        }
        beatPos += beatPeriodHops;
    }
    return flux;
}

describe('computeACF', () => {
    it('returns array of length maxLag - minLag + 1', () => {
        const flux = new Float32Array(200).fill(1);
        const acf = computeAcf(flux, 5, 20);
        expect(acf.length).toBe(20 - 5 + 1);
    });

    it('all values in [0, 1] after normalisation', () => {
        const flux = syntheticNovelty(120, 300);
        const minLag = Math.round(60 / 250 * SAMPLE_RATE / HOP_SIZE);
        const maxLag = Math.round(60 / 50  * SAMPLE_RATE / HOP_SIZE);
        const acf = computeAcf(flux, minLag, maxLag);
        for (const v of acf) {
            expect(v).toBeGreaterThanOrEqual(-0.01);
            expect(v).toBeLessThanOrEqual(1.01);
        }
    });
});

describe('findTempoPeaks — synthetic 120 BPM', () => {
    it('finds a peak near 120 BPM', () => {
        const numHops = 400;
        const flux = syntheticNovelty(120, numHops);
        const minLag = Math.round(60 / 250 * SAMPLE_RATE / HOP_SIZE);
        const maxLag = Math.round(60 / 50  * SAMPLE_RATE / HOP_SIZE);
        const acf = computeAcf(flux, minLag, maxLag);
        const peaks = findTempoPeaks(acf, minLag, HOP_SIZE, SAMPLE_RATE, 3);
        expect(peaks.length).toBeGreaterThan(0);
        // The top peak should be within ±20 BPM of 120
        expect(Math.abs(peaks[0].bpm - 120)).toBeLessThan(20);
    });

    it('does not detect 240 BPM as the top candidate for 120 BPM input', () => {
        const numHops = 400;
        const flux = syntheticNovelty(120, numHops);
        const minLag = Math.round(60 / 250 * SAMPLE_RATE / HOP_SIZE);
        const maxLag = Math.round(60 / 50  * SAMPLE_RATE / HOP_SIZE);
        const acf = computeAcf(flux, minLag, maxLag);
        const peaks = findTempoPeaks(acf, minLag, HOP_SIZE, SAMPLE_RATE, 3);
        if (peaks.length > 0) {
            // 240 BPM (octave above) should not be the top peak
            // (it may appear but with lower score)
            const top = peaks[0];
            expect(Math.abs(top.bpm - 240)).toBeGreaterThan(15);
        }
    });
});

describe('applyTempoHysteresis', () => {
    const makeCandidates = (bpm: number, score: number) => [{ bpm, score, lag: 0 }];

    it('returns first BPM when currentBpm is 0', () => {
        const result = applyTempoHysteresis(makeCandidates(120, 0.9), 0, 0);
        expect(result).toBe(120);
    });

    it('does not switch to candidate with insufficient score improvement', () => {
        // current = 120 at score 0.9; new candidate 130 at score 0.95 (< 1.15x)
        const result = applyTempoHysteresis(makeCandidates(130, 0.95), 120, 0.9);
        expect(result).toBeCloseTo(120, 0);
    });

    it('switches when score is clearly better', () => {
        // New candidate score = 0.9 * 1.2 = 1.08 > threshold
        const result = applyTempoHysteresis(makeCandidates(130, 0.9 * 1.2), 120, 0.9);
        expect(result).toBeCloseTo(130, 0);
    });

    it('requires 1.5x margin to switch to octave-related candidate', () => {
        // 240 is octave of 120; score 1.1 is not enough (needs > 1.5x)
        const result = applyTempoHysteresis(makeCandidates(240, 0.9 * 1.1), 120, 0.9);
        expect(result).toBeCloseTo(120, 0);
    });

    it('switches to octave if score is > 1.5x', () => {
        const result = applyTempoHysteresis(makeCandidates(240, 0.9 * 1.6), 120, 0.9);
        expect(result).toBeCloseTo(240, 0);
    });

    it('returns empty candidates unchanged', () => {
        const result = applyTempoHysteresis([], 120, 0.9);
        expect(result).toBe(120);
    });
});
