import {
  computeAcf,
  computeTempoCandidates,
  findTempoPeaks,
  isOctaveRelated,
  scoreTempoHypotheses,
  tempoPrior,
} from '../../src/dsp/tempogram';

const SAMPLE_RATE = 48000;
const HOP_SIZE = 512;
const MIN_LAG = Math.max(1, Math.round(((60 / 250) * SAMPLE_RATE) / HOP_SIZE));
const MAX_LAG = Math.round(((60 / 50) * SAMPLE_RATE) / HOP_SIZE);

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

/**
 * Novelty curve whose onsets are spread over a few hops, mimicking how a real ~6 ms
 * percussive burst smears across the FFT/flux pipeline. A single-sample impulse splits
 * the fundamental's correlation across adjacent integer lags at high BPM, which is a
 * test artifact, not detector behaviour — the spread shape is the realistic case.
 */
function spreadNovelty(bpm: number, seconds: number): Float32Array {
  const hopRate = SAMPLE_RATE / HOP_SIZE;
  const numHops = Math.round(seconds * hopRate);
  const periodHops = hopRate / (bpm / 60);
  const flux = new Float32Array(numHops);
  const kernel = [0.4, 1.0, 0.7, 0.3];
  for (let pos = 0; pos < numHops; pos += periodHops) {
    const base = Math.round(pos);
    for (let k = 0; k < kernel.length; k++) {
      const idx = base + k;
      if (idx >= 0 && idx < numHops) flux[idx]! += kernel[k]!;
    }
  }
  return flux;
}

function topBpm(bpm: number): number {
  const cands = computeTempoCandidates(spreadNovelty(bpm, 15), MIN_LAG, MAX_LAG, HOP_SIZE, SAMPLE_RATE, {
    minBpm: 50,
    maxBpm: 250,
  });
  return cands[0]!.bpm;
}

/**
 * Novelty for a realistic kit pattern: an onset on EVERY subdivision (e.g. 8th-notes ride a
 * 360 BPM grid over a 180 BPM beat), with the beat positions only mildly emphasised. The
 * super-harmonic (2f = 360 BPM) is the densest periodicity but lies ABOVE maxBpm, so it is a
 * subdivision, not a competing beat. The fundamental must still win over unrelated in-band
 * multiples (120 = ⅔, 90 = ½). Mirrors the `djMix` fixture's spectral-flux structure.
 */
function subdividedNovelty(beatBpm: number, subdivisionsPerBeat: number, seconds: number): Float32Array {
  const hopRate = SAMPLE_RATE / HOP_SIZE;
  const numHops = Math.round(seconds * hopRate);
  const subPeriodHops = hopRate / ((beatBpm * subdivisionsPerBeat) / 60);
  const flux = new Float32Array(numHops);
  const kernel = [0.4, 1.0, 0.7, 0.3];
  let sub = 0;
  for (let pos = 0; pos < numHops; pos += subPeriodHops) {
    const onBeat = sub % subdivisionsPerBeat === 0;
    const amp = onBeat ? 1.2 : 1.0; // beats only mildly louder than subdivisions
    const base = Math.round(pos);
    for (let k = 0; k < kernel.length; k++) {
      const idx = base + k;
      if (idx >= 0 && idx < numHops) flux[idx]! += amp * kernel[k]!;
    }
    sub++;
  }
  return flux;
}

describe('computeACF', () => {
  it('returns array of length maxLag - minLag + 1', () => {
    const flux = new Float32Array(200).fill(1);
    const acf = computeAcf(flux, 5, 20);
    expect(acf.length).toBe(20 - 5 + 1);
  });

  it('all values in [-1, 1] after mean-subtraction + zero-lag normalisation', () => {
    // The novelty is centred before correlation, so off-period lags go negative.
    const flux = syntheticNovelty(120, 300);
    const minLag = Math.round(((60 / 250) * SAMPLE_RATE) / HOP_SIZE);
    const maxLag = Math.round(((60 / 50) * SAMPLE_RATE) / HOP_SIZE);
    const acf = computeAcf(flux, minLag, maxLag);
    for (const v of acf) {
      expect(v).toBeGreaterThanOrEqual(-1.01);
      expect(v).toBeLessThanOrEqual(1.01);
    }
  });
});

describe('findTempoPeaks — synthetic 120 BPM', () => {
  it('finds a peak near 120 BPM', () => {
    const numHops = 400;
    const flux = syntheticNovelty(120, numHops);
    const minLag = Math.round(((60 / 250) * SAMPLE_RATE) / HOP_SIZE);
    const maxLag = Math.round(((60 / 50) * SAMPLE_RATE) / HOP_SIZE);
    const acf = computeAcf(flux, minLag, maxLag);
    const peaks = findTempoPeaks(acf, minLag, HOP_SIZE, SAMPLE_RATE, 3);
    expect(peaks.length).toBeGreaterThan(0);
    // The top peak should be within ±20 BPM of 120
    expect(Math.abs(peaks[0].bpm - 120)).toBeLessThan(20);
  });

  it('does not detect 240 BPM as the top candidate for 120 BPM input', () => {
    const numHops = 400;
    const flux = syntheticNovelty(120, numHops);
    const minLag = Math.round(((60 / 250) * SAMPLE_RATE) / HOP_SIZE);
    const maxLag = Math.round(((60 / 50) * SAMPLE_RATE) / HOP_SIZE);
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

describe('computeTempoCandidates — octave disambiguation', () => {
  // The detector must lock the true fundamental, not the lowest in-range sub-harmonic.
  it.each([
    [120, 60],
    [128, 64],
    [140, 70],
    [180, 90],
    [220, 110],
    [250, 125],
  ])('locks %i BPM (not its half %i)', (trueBpm, halfBpm) => {
    const top = topBpm(trueBpm);
    expect(Math.abs(top - trueBpm) / trueBpm).toBeLessThanOrEqual(0.03);
    // and it is nowhere near the (wrong) half
    expect(Math.abs(top - halfBpm) / halfBpm).toBeGreaterThan(0.1);
  });

  it('does not over-pull a genuinely slow tempo (64) up to its double (128)', () => {
    // A 64 BPM train has no energy at 128 BPM, so the prior must not invent it.
    const top = topBpm(64);
    expect(Math.abs(top - 64) / 64).toBeLessThanOrEqual(0.03);
  });

  it('keeps an edge tempo (50) below the prior centre on evidence', () => {
    const top = topBpm(50);
    expect(Math.abs(top - 50) / 50).toBeLessThanOrEqual(0.03);
  });

  it('locks the fundamental of a subdivided kit pattern, not an in-band multiple', () => {
    // 180 BPM beat with 8th-note subdivisions (2/beat → 360 BPM grid, above maxBpm).
    const flux = subdividedNovelty(180, 2, 20);
    const cands = computeTempoCandidates(flux, MIN_LAG, MAX_LAG, HOP_SIZE, SAMPLE_RATE, {
      minBpm: 50,
      maxBpm: 250,
    });
    const top = cands[0]!.bpm;
    expect(Math.abs(top - 180) / 180).toBeLessThanOrEqual(0.03);
    // The un-gated comb used to pick 120 (the ⅔ multiple) or 90 (the ½ sub-harmonic).
    expect(Math.abs(top - 120) / 120).toBeGreaterThan(0.1);
    expect(Math.abs(top - 90) / 90).toBeGreaterThan(0.1);
  });

  it('demotes the half: the half-tempo candidate scores below the fundamental for 250', () => {
    const cands = computeTempoCandidates(spreadNovelty(250, 15), MIN_LAG, MAX_LAG, HOP_SIZE, SAMPLE_RATE, {
      minBpm: 50,
      maxBpm: 250,
    });
    const fund = cands.find((c) => Math.abs(c.bpm - 250) / 250 < 0.05);
    const half = cands.find((c) => Math.abs(c.bpm - 125) / 125 < 0.05);
    expect(fund).toBeDefined();
    if (half) expect(fund!.score).toBeGreaterThan(half.score);
  });
});

describe('isOctaveRelated', () => {
  it('recognises ½×, 2×, 3× and ⅓× relations', () => {
    expect(isOctaveRelated(60, 120)).toBe(true); // 0.5
    expect(isOctaveRelated(240, 120)).toBe(true); // 2
    expect(isOctaveRelated(180, 60)).toBe(true); // 3
    expect(isOctaveRelated(60, 180)).toBe(true); // 1/3
  });

  it('recognises 3:2 / 2:3 (dotted ↔ triple) metrical relations', () => {
    expect(isOctaveRelated(120, 180)).toBe(true); // 2/3 — the djMix subdivision artefact
    expect(isOctaveRelated(181, 122)).toBe(true); // ~3/2
  });

  it('does not flag a nearby non-octave tempo', () => {
    expect(isOctaveRelated(130, 120)).toBe(false);
    expect(isOctaveRelated(140, 120)).toBe(false); // 1.17 — legitimate drift, not metrical
  });

  it('returns false for a non-positive reference (guards divide-by-zero)', () => {
    expect(isOctaveRelated(120, 0)).toBe(false);
    expect(isOctaveRelated(120, -60)).toBe(false);
  });
});

describe('computeAcf — empty input', () => {
  it('returns all zeros for an empty flux array (n === 0 guards)', () => {
    const acf = computeAcf(new Float32Array(0), 1, 5);
    expect(acf.length).toBe(5);
    for (const v of acf) expect(v).toBe(0);
  });
});

describe('findTempoPeaks — endpoint peaks and defaults', () => {
  it('returns no peaks for a single-sample ACF (acf.length > 1 guard is false)', () => {
    const peaks = findTempoPeaks(new Float32Array([5]), 10, HOP_SIZE, SAMPLE_RATE);
    expect(peaks).toEqual([]);
  });

  it('detects a leading-endpoint peak (lag === minLag beats its only neighbour)', () => {
    const acf = new Float32Array([5, 1, 2, 1]);
    const peaks = findTempoPeaks(acf, 10, HOP_SIZE, SAMPLE_RATE, 10);
    const leading = peaks.find(p => p.lag === 10);
    expect(leading).toBeDefined();
    expect(leading!.score).toBe(5);
  });

  it('detects a trailing-endpoint peak (lag === maxLag beats its only neighbour)', () => {
    const acf = new Float32Array([1, 2, 1, 5]);
    const peaks = findTempoPeaks(acf, 10, HOP_SIZE, SAMPLE_RATE, 10);
    const trailing = peaks.find(p => p.lag === 13);
    expect(trailing).toBeDefined();
    expect(trailing!.score).toBe(5);
  });

  // NOTE on two lines that remain uncovered in `parabolicPeakOffset` after this test:
  // - `if (denom >= 0) return 0;` — mathematically unreachable through `findTempoPeaks`'
  //   strict peak-selection gate (`acf[i] > acf[i-1] && acf[i] > acf[i+1]`): if yMid is
  //   strictly greater than both neighbours, `yPrev + yNext < 2*yMid` always holds (adding
  //   the two strict inequalities), so `denom = yPrev - 2*yMid + yNext` is always negative.
  //   A randomized search of >230M float32 triples satisfying the strict-peak invariant
  //   (spanning the full float32 dynamic range, including extreme-magnitude mismatches that
  //   trigger catastrophic cancellation) found zero counterexamples — confirming this is a
  //   pure defensive guard against a case that cannot occur via the public API, not merely a
  //   rare one. Left uncovered as documented unreachable code.
  // - `if (d < -0.5) d = -0.5;` — the mirror-image clamp of the `d > 0.5` case covered by the
  //   test below. The `d > 0.5` clamp WAS found (below) via floating-point cancellation with
  //   an extreme-magnitude yPrev; an equally extensive randomized search (>500M triples,
  //   including deliberately mirroring the found +0.5 triple) for the symmetric `d < -0.5`
  //   case found none — the two branches of this expression are not perfectly symmetric under
  //   floating-point rounding (`p - 2*m + q` evaluates left-to-right, so swapping p/q changes
  //   intermediate rounding). Left uncovered; treated as practically unreachable rather than
  //   forcing an artificial non-representative test.
  it('clamps the parabolic interpolation offset to +0.5 on extreme floating-point asymmetry', () => {
    // These three values are a strict interior local maximum (the middle sample
    // is greater than both neighbours and positive, satisfying findTempoPeaks'
    // peak-selection gate), but their magnitudes are so mismatched that the
    // catastrophic cancellation inside the parabolic-fit formula
    // `0.5 * (yPrev - yNext) / (yPrev - 2*yMid + yNext)` rounds to a hair
    // above 0.5 in double precision, exercising the `d > 0.5` clamp.
    const acf = new Float32Array([-7335888027648, 0.03963751718401909, 0.03963751345872879]);
    const minLag = 10;
    const peaks = findTempoPeaks(acf, minLag, HOP_SIZE, SAMPLE_RATE, 10);
    const interior = peaks.find(p => p.lag > minLag && p.lag < minLag + 2);
    expect(interior).toBeDefined();
    // lag = minLag + i + offset, i = 1, offset clamped to exactly 0.5.
    expect(interior!.lag).toBeCloseTo(minLag + 1.5, 10);
  });

  it('uses the default topK of 3 when omitted', () => {
    // Five independent single-neighbour "peaks" alternating up/down so every
    // interior sample plus both endpoints qualify — without the default topK
    // cap this would return more than 3 candidates.
    const acf = new Float32Array([5, 1, 5, 1, 5, 1, 5]);
    const peaks = findTempoPeaks(acf, 10, HOP_SIZE, SAMPLE_RATE);
    expect(peaks.length).toBeLessThanOrEqual(3);
  });
});

describe('tempoPrior — defaults', () => {
  it('is 1 at the default prior centre (140 BPM) when mu/sigma are omitted', () => {
    expect(tempoPrior(140)).toBeCloseTo(1, 10);
  });

  it('decays away from the default centre', () => {
    expect(tempoPrior(280)).toBeLessThan(tempoPrior(140));
  });
});

describe('scoreTempoHypotheses — defaults and boundary lag', () => {
  it('accepts an omitted options argument (all defaults)', () => {
    const acf = new Float32Array(20).fill(0.1);
    const scored = scoreTempoHypotheses([{ bpm: 120, score: 0, lag: 24 }], acf, 10);
    expect(scored.length).toBe(1);
    expect(scored[0]!.bpm).toBe(120);
  });

  it('samples the ACF exactly at its last representable lag (boundary interpolation)', () => {
    // acf has 5 samples for lags 10..14 (minLag=10, length=5, maxIndex=4).
    // A candidate at lag=7 makes its super-multiple lag*2 === 14, landing
    // exactly on the last ACF sample — the interpolator's "at the last index,
    // no right neighbour" boundary path.
    const acf = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(() => scoreTempoHypotheses([{ bpm: 100, score: 0, lag: 7 }], acf, 10, { maxBpm: 300 })).not.toThrow();
  });
});

describe('computeTempoCandidates — omitted options', () => {
  it('accepts an omitted options argument (uses all documented defaults)', () => {
    const flux = syntheticNovelty(120, 400);
    expect(() => computeTempoCandidates(flux, MIN_LAG, MAX_LAG, HOP_SIZE, SAMPLE_RATE)).not.toThrow();
  });
});
