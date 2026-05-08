/**
 * Autocorrelation-based tempogram.
 *
 * Given a novelty (onset-strength) curve sampled at rate `hopRate = sampleRate / hopSize`,
 * this module computes the autocorrelation function (ACF) over a sliding window
 * and returns the top tempo candidates.
 *
 * These helpers are also inlined inside the beat-detector worklet source string
 * (worklets cannot import modules).
 */

export interface TempoCandidateResult {
  /** BPM value. */
  bpm: number;
  /** Normalised peak score (0..1). */
  score: number;
  /** ACF lag in hops that produced this peak. */
  lag: number;
}

/**
 * Compute the normalised autocorrelation function over a novelty curve.
 *
 * @param flux       Recent novelty values (ring-buffer contents, oldest first).
 * @param minLag     Minimum lag in samples (inclusive).
 * @param maxLag     Maximum lag in samples (inclusive).
 * @returns          ACF array indexed by lag (index 0 = lag minLag).
 */
export function computeAcf(flux: Float32Array, minLag: number, maxLag: number): Float32Array {
  const n = flux.length;
  const lagCount = maxLag - minLag + 1;
  const acf = new Float32Array(lagCount);

  // Compute ACF[lag] = sum_t flux[t] * flux[t - lag]
  for (let lagIndex = 0; lagIndex < lagCount; lagIndex++) {
    const lag = minLag + lagIndex;
    let sum = 0;
    let count = 0;
    for (let t = lag; t < n; t++) {
      sum += flux[t] * flux[t - lag];
      count++;
    }
    acf[lagIndex] = count > 0 ? sum / count : 0;
  }

  // Normalise by the zero-lag ACF (energy) so output is in [-1, 1]
  let zeroLag = 0;
  for (let t = 0; t < n; t++) {
    zeroLag += flux[t] * flux[t];
  }
  zeroLag = n > 0 ? zeroLag / n : 1;

  const norm = zeroLag > 0 ? zeroLag : 1;
  for (let i = 0; i < lagCount; i++) {
    acf[i] /= norm;
  }

  return acf;
}

/**
 * Find the top-K peaks in the ACF and convert lags to BPM candidates.
 *
 * @param acf        Normalised ACF from `computeACF`.
 * @param minLag     The lag (in hops) corresponding to acf[0].
 * @param hopSize    Number of audio samples per hop.
 * @param sampleRate Audio sample rate in Hz.
 * @param topK       Number of peaks to return (default 3).
 * @returns          Up to `topK` tempo candidates sorted by score descending.
 */
export function findTempoPeaks(acf: Float32Array, minLag: number, hopSize: number, sampleRate: number, topK = 3): TempoCandidateResult[] {
  const peaks: TempoCandidateResult[] = [];

  // Find local maxima (peaks) in the ACF
  for (let i = 1; i < acf.length - 1; i++) {
    if (acf[i] > acf[i - 1] && acf[i] > acf[i + 1] && acf[i] > 0) {
      const lag = minLag + i;
      const bpm = (60 * sampleRate) / (lag * hopSize);
      peaks.push({ bpm, score: acf[i], lag });
    }
  }

  // Also consider endpoints as peaks if they are maxima
  if (acf.length > 0 && acf[0] > (acf[1] ?? 0)) {
    const lag = minLag;
    peaks.push({ bpm: (60 * sampleRate) / (lag * hopSize), score: acf[0], lag });
  }
  if (acf.length > 1) {
    const last = acf.length - 1;
    if (acf[last] > acf[last - 1]) {
      const lag = minLag + last;
      peaks.push({ bpm: (60 * sampleRate) / (lag * hopSize), score: acf[last], lag });
    }
  }

  // Sort by score descending
  peaks.sort((a, b) => b.score - a.score);

  return peaks.slice(0, topK);
}

/**
 * Apply hysteresis to tempo candidate selection.
 *
 * Prevents rapid switching between tempo estimates:
 * - Only switches to a new best if its score is > currentBestScore * 1.15.
 * - Octave-related candidates (2x or 0.5x) require a score > 1.5x to switch.
 *
 * @param candidates   Sorted candidates from `findTempoPeaks`.
 * @param currentBpm   Currently tracked BPM.
 * @param currentScore Currently tracked best score.
 * @returns            The selected best BPM.
 */
export function applyTempoHysteresis(candidates: TempoCandidateResult[], currentBpm: number, currentScore: number): number {
  if (candidates.length === 0) return currentBpm;

  const top = candidates[0];

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
