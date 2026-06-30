/**
 * Autocorrelation-based tempogram (single source of truth).
 *
 * Given a novelty (onset-strength) curve sampled at rate `hopRate = sampleRate / hopSize`,
 * this module computes the autocorrelation function (ACF) over a sliding window and
 * selects tempo candidates from the resulting periodicity peaks.
 *
 * The same pipeline is transliterated verbatim into the beat-detector worklet source
 * string (worklets cannot import modules). `test/dsp/worklet-parity.test.ts` guards that
 * the worklet's tempo candidates equal `computeTempoCandidates(...)` here, so this file
 * is the canonical implementation and the worklet is a mechanical mirror of it.
 */

export interface TempoCandidateResult {
  /** BPM value. */
  bpm: number;
  /** Selection score (see `computeTempoCandidates`). */
  score: number;
  /** ACF lag in hops that produced this peak. */
  lag: number;
}

/** Options for tempo-candidate selection. */
export interface TempoScoringOptions {
  /** Lowest BPM accepted as a candidate. */
  minBpm?: number;
  /** Highest BPM accepted as a candidate. */
  maxBpm?: number;
  /** Number of candidates to return. */
  topK?: number;
}

/**
 * Compute the normalised autocorrelation function over a novelty curve.
 *
 * The novelty is mean-subtracted (kills the DC pedestal that otherwise sits under every
 * lag), correlated with the BIASED estimator (`sum / n`, not `sum / (n − lag)`) so long
 * lags are tapered rather than inflated, and normalised by the zero-lag energy (variance)
 * so the output is in roughly [-1, 1] with the strongest true period near 1.
 *
 * @param flux       Recent novelty values (oldest first).
 * @param minLag     Minimum lag in hops (inclusive).
 * @param maxLag     Maximum lag in hops (inclusive).
 * @returns          ACF array indexed by lag (index 0 = lag minLag).
 */
export function computeAcf(flux: Float32Array, minLag: number, maxLag: number): Float32Array {
  const n = flux.length;
  const lagCount = maxLag - minLag + 1;
  const acf = new Float32Array(lagCount);

  // Window mean — subtracted before correlation to remove the DC pedestal.
  let mean = 0;
  for (let t = 0; t < n; t++) {
    mean += flux[t]!;
  }
  mean = n > 0 ? mean / n : 0;

  // Zero-lag energy (variance) of the centred signal — the normaliser.
  let zeroLag = 0;
  for (let t = 0; t < n; t++) {
    const c = flux[t]! - mean;
    zeroLag += c * c;
  }
  zeroLag = n > 0 ? zeroLag / n : 1;
  const norm = zeroLag > 0 ? zeroLag : 1;

  // Biased ACF of the centred signal: divide by n (not n − lag).
  for (let lagIndex = 0; lagIndex < lagCount; lagIndex++) {
    const lag = minLag + lagIndex;
    let sum = 0;
    for (let t = lag; t < n; t++) {
      sum += (flux[t]! - mean) * (flux[t - lag]! - mean);
    }
    acf[lagIndex] = n > 0 ? sum / n / norm : 0;
  }

  return acf;
}

/**
 * Find all positive local-maxima peaks in the ACF and convert lags to BPM candidates.
 *
 * Includes the two array endpoints when they exceed their single in-range neighbour
 * (the true high-BPM period can land on minLag, which has no left neighbour). Sorted by
 * raw ACF score descending; pass `topK = acf.length` to retain every peak.
 *
 * @param acf        Normalised ACF from `computeAcf`.
 * @param minLag     The lag (in hops) corresponding to acf[0].
 * @param hopSize    Number of audio samples per hop.
 * @param sampleRate Audio sample rate in Hz.
 * @param topK       Number of peaks to return (default 3).
 */
export function findTempoPeaks(
  acf: Float32Array,
  minLag: number,
  hopSize: number,
  sampleRate: number,
  topK = 3,
): TempoCandidateResult[] {
  const peaks: TempoCandidateResult[] = [];
  const last = acf.length - 1;

  // Leading endpoint (lag === minLag): a peak if it beats its only neighbour.
  if (acf.length > 1 && acf[0]! > acf[1]! && acf[0]! > 0) {
    const lag = minLag;
    peaks.push({ bpm: (60 * sampleRate) / (lag * hopSize), score: acf[0]!, lag });
  }

  // Interior local maxima.
  for (let i = 1; i < last; i++) {
    if (acf[i]! > acf[i - 1]! && acf[i]! > acf[i + 1]! && acf[i]! > 0) {
      const lag = minLag + i;
      peaks.push({ bpm: (60 * sampleRate) / (lag * hopSize), score: acf[i]!, lag });
    }
  }

  // Trailing endpoint (lag === maxLag).
  if (acf.length > 1 && acf[last]! > acf[last - 1]! && acf[last]! > 0) {
    const lag = minLag + last;
    peaks.push({ bpm: (60 * sampleRate) / (lag * hopSize), score: acf[last]!, lag });
  }

  peaks.sort((a, b) => b.score - a.score);
  return peaks.slice(0, topK);
}

/**
 * Full tempo-candidate pipeline: ACF → peaks → BPM-band filter.
 *
 * This is the single function the worklet mirrors and `worklet-parity.test.ts` checks.
 *
 * @param flux       Recent novelty values (oldest first).
 * @param minLag     Minimum lag in hops (inclusive).
 * @param maxLag     Maximum lag in hops (inclusive).
 * @param hopSize    Audio samples per hop.
 * @param sampleRate Audio sample rate in Hz.
 */
export function computeTempoCandidates(
  flux: Float32Array,
  minLag: number,
  maxLag: number,
  hopSize: number,
  sampleRate: number,
  options: TempoScoringOptions = {},
): TempoCandidateResult[] {
  const minBpm = options.minBpm ?? 50;
  const maxBpm = options.maxBpm ?? 250;
  const topK = options.topK ?? 3;

  const acf = computeAcf(flux, minLag, maxLag);
  const peaks = findTempoPeaks(acf, minLag, hopSize, sampleRate, acf.length);
  const inRange = peaks.filter((p) => p.bpm >= minBpm && p.bpm <= maxBpm);
  return inRange.slice(0, topK);
}

/**
 * Apply hysteresis to tempo candidate selection.
 *
 * Prevents rapid switching between tempo estimates:
 * - Only switches to a new best if its score is > currentBestScore * 1.15.
 * - Octave-related candidates (2× or ½×) require a score > 1.5× to switch.
 *
 * @param candidates   Candidates from `computeTempoCandidates` (sorted by score).
 * @param currentBpm   Currently tracked BPM.
 * @param currentScore Currently tracked best score.
 * @returns            The selected best BPM.
 */
export function applyTempoHysteresis(
  candidates: TempoCandidateResult[],
  currentBpm: number,
  currentScore: number,
): number {
  if (candidates.length === 0) return currentBpm;

  const top = candidates[0]!;

  // First-time selection (no current BPM)
  if (currentBpm <= 0) return top.bpm;

  const isOctaveRelated = Math.abs(top.bpm / currentBpm - 2) < 0.1 || Math.abs(top.bpm / currentBpm - 0.5) < 0.05;

  const requiredMargin = isOctaveRelated ? 1.5 : 1.15;

  if (top.score > currentScore * requiredMargin) {
    return top.bpm;
  }

  // Insufficient score to switch — keep current BPM
  return currentBpm;
}
