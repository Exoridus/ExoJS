import { buildMelFilterbank, computeMelBands, hzToMel, melToHz } from '#audio/dsp/mel';

describe('mel scale helpers', () => {
  it('hzToMel(0) === 0', () => {
    expect(hzToMel(0)).toBe(0);
  });

  it('hzToMel is monotonically increasing', () => {
    expect(hzToMel(1000)).toBeGreaterThan(hzToMel(500));
    expect(hzToMel(8000)).toBeGreaterThan(hzToMel(1000));
  });

  it('melToHz is inverse of hzToMel', () => {
    for (const hz of [100, 440, 1000, 4000, 8000]) {
      expect(melToHz(hzToMel(hz))).toBeCloseTo(hz, 3);
    }
  });
});

describe('buildMelFilterbank', () => {
  const BANDS = 24;
  const FFT_SIZE = 2048;
  const SAMPLE_RATE = 48000;

  it('returns exactly `numBands` bands', () => {
    const fb = buildMelFilterbank(BANDS, 80, 8000, FFT_SIZE, SAMPLE_RATE);
    expect(fb.length).toBe(BANDS);
  });

  it('each band has non-negative weights', () => {
    const fb = buildMelFilterbank(BANDS, 80, 8000, FFT_SIZE, SAMPLE_RATE);
    for (const band of fb) {
      for (const w of band.weights) {
        expect(w).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('startBin <= peakBin <= endBin for each band', () => {
    const fb = buildMelFilterbank(BANDS, 80, 8000, FFT_SIZE, SAMPLE_RATE);
    for (const band of fb) {
      expect(band.startBin).toBeLessThanOrEqual(band.peakBin);
      expect(band.peakBin).toBeLessThanOrEqual(band.endBin);
    }
  });

  it('bands are ordered (each startBin >= previous startBin)', () => {
    const fb = buildMelFilterbank(BANDS, 80, 8000, FFT_SIZE, SAMPLE_RATE);
    for (let i = 1; i < fb.length; i++) {
      expect(fb[i].startBin).toBeGreaterThanOrEqual(fb[i - 1].startBin);
    }
  });
});

describe('computeMelBands', () => {
  it('returns log-compressed energies (all >= 0)', () => {
    const fb = buildMelFilterbank(24, 80, 8000, 2048, 48000);
    const mag = new Float32Array(1024).fill(1);
    const out = new Float32Array(24);
    computeMelBands(mag, fb, out);
    for (const v of out) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('zero input magnitude yields near-zero output', () => {
    const fb = buildMelFilterbank(24, 80, 8000, 2048, 48000);
    const mag = new Float32Array(1024).fill(0);
    const out = new Float32Array(24);
    computeMelBands(mag, fb, out);
    for (const v of out) expect(v).toBeCloseTo(0, 3);
  });
});
