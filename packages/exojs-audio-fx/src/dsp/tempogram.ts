/**
 * Autocorrelation-based tempogram (single source of truth).
 *
 * Given a novelty (onset-strength) curve sampled at rate `hopRate = sampleRate / hopSize`,
 * this module computes the autocorrelation function (ACF) over a sliding window and
 * selects the musically-correct tempo from the resulting periodicity peaks.
 *
 * The same pipeline is transliterated verbatim into the beat-detector worklet source
 * string (worklets cannot import modules). `test/dsp/worklet-parity.test.ts` guards that
 * the worklet's tempo candidates equal `computeTempoCandidates(...)` here, so this file
 * is the canonical implementation and the worklet is a mechanical mirror of it.
 *
 * Octave disambiguation (the core fix)
 * ------------------------------------
 * The ACF of a periodic onset train peaks at the beat lag `p` AND at every sub-harmonic
 * lag `2p, 3p, …` (every other beat also correlates). A naive "biggest peak" or additive
 * harmonic-comb picker therefore drifts down to the lowest in-range sub-harmonic. Three
 * mechanisms cooperate here to lock the true fundamental instead:
 *
 *   1. The novelty is mean-subtracted before correlation (removes the DC pedestal under
 *      every lag) and the ACF uses the BIASED / zero-lag-normalised estimator (÷n, not
 *      ÷(n−lag)) so long lags are gently tapered rather than inflated.  [computeAcf]
 *   2. Each candidate `f` is scored by a periodicity comb over its own SUB-multiples
 *      (`f`, `f/2`, `f/3` → lags `p, 2p, 3p`) MINUS a penalty for energy at its
 *      SUPER-harmonics (`2f`, `3f` → lags `p/2, p/3`). A true fundamental has no
 *      super-harmonic energy, so it keeps its full comb; a sub-harmonic candidate is
 *      demoted because its super-harmonic (the real beat) is strong. This realises the
 *      plan's stated goal — "metrical support reinforces the fundamental rather than a
 *      lone sub-harmonic peak" — over the `{f/2, f, 2f, 3f}` family.  [scoreTempoHypotheses]
 *
 *      The super-harmonic penalty is SUBDIVISION-AWARE: a candidate `kf` (k = 2, 3) only
 *      demotes `f` when `kf` could itself be the beat, i.e. `kf` lies within the tempo
 *      band `[minBpm, maxBpm]`. Energy at a super-harmonic ABOVE `maxBpm` is a subdivision
 *      (e.g. hi-hats on 8th-notes riding over a 180 BPM kick → strong energy at 360 BPM),
 *      NOT a competing fundamental, so it must NOT penalise the true beat. Without this
 *      gate a realistic kit pattern whose fundamental carries subdivision energy is wrongly
 *      demoted in favour of an unrelated in-band multiple (180 → 120). Pure clicktracks
 *      are unaffected: they have no super-harmonic energy, so the gate changes nothing.
 *   3. A soft log-Gaussian tempo prior centred on ~140 BPM breaks residual ties toward
 *      the musical core (100–200 BPM) without hard-clamping the edges.  [tempoPrior]
 */

export interface TempoCandidateResult {
  /** BPM value. */
  bpm: number;
  /** Selection score (periodicity comb × tempo prior; not normalised to 0..1). */
  score: number;
  /** ACF lag in hops that produced this peak. */
  lag: number;
}

/** Tuning knobs for tempo-candidate scoring. Internal constants for now (see plan §4.5). */
export interface TempoScoringOptions {
  /** Lowest BPM accepted as a candidate. */
  minBpm?: number;
  /** Highest BPM accepted as a candidate. */
  maxBpm?: number;
  /** Log-Gaussian prior centre (geometric mean of the precise band). */
  priorMu?: number;
  /** Log-Gaussian prior width in natural-log units. */
  priorSigma?: number;
  /** Number of candidates to return. */
  topK?: number;
}

/** Prior centre — geometric mean of the 100–200 BPM "precise" band. */
export const defaultPriorMu = 140;
/** Prior width: ≈ ±1 octave at ~0.6 weight. */
export const defaultPriorSigma = Math.log(2) * 0.9;
/**
 * Relative tolerance on the candidate-acceptance BPM band. A tempo sitting exactly on
 * the edge (e.g. 300) has an ACF lag (18.75) that straddles the boundary; without slack
 * its peak can round just outside the band and be discarded.
 */
export const candidateEdgeTolerance = 0.05;

/** Periodicity-comb weights for a candidate's own sub-multiples (f, f/2, f/3). */
const combWeightFundamental = 1;
const combWeightHalf = 0.5;
const combWeightThird = 0.3;
/** Super-harmonic penalty weights (2f, 3f) — strong evidence the candidate is a sub-harmonic. */
const combPenaltyDouble = 1;
const combPenaltyTriple = 0.5;

/**
 * The ACF is computed down to a shorter lag than the candidate band needs, so that
 * (a) a high-BPM fundamental whose lag lands on `minLag` is an interior peak with its
 * true height, and (b) the 2f/3f super-harmonic penalty can read energy ABOVE maxBpm
 * (a sub-harmonic candidate's real beat). One third of `minLag` reaches the 3f lag of a
 * candidate at maxBpm.
 */
export function acfExtendedMinLag(minLag: number): number {
  return Math.max(1, Math.round(minLag / 3));
}

/**
 * Compute the normalised autocorrelation function over a novelty curve.
 *
 * The novelty is mean-subtracted (kills the DC pedestal under every lag), correlated with
 * the BIASED estimator (`sum / n`, not `sum / (n − lag)`) so long lags are tapered rather
 * than inflated, and normalised by the zero-lag energy (variance) so the output is in
 * roughly [-1, 1] with the strongest true period near 1.
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
 * Sample the ACF at an arbitrary (possibly fractional) lag with linear interpolation.
 * Returns 0 outside the computed lag range and clamps negative correlation to 0 so
 * anti-correlated harmonics never contribute to (or subtract spuriously from) a comb.
 */
function acfAtLag(acf: Float32Array, minLag: number, lag: number): number {
  const maxIndex = acf.length - 1;
  const f = lag - minLag;
  if (f < 0 || f > maxIndex) return 0;
  const i0 = Math.floor(f);
  const i1 = i0 < maxIndex ? i0 + 1 : maxIndex;
  const frac = f - i0;
  const v = acf[i0]! * (1 - frac) + acf[i1]! * frac;
  return v > 0 ? v : 0;
}

/**
 * Sub-lag peak refinement. Fit a parabola through the three samples around an interior
 * local maximum (acf[i-1], acf[i], acf[i+1]) and return the vertex offset in [-0.5, 0.5].
 *
 * The lag grid is coarse at the top of the BPM band (a 300 BPM beat sits at lag ≈ 18.75
 * hops, ~5 ms / lag), so rounding a peak to its nearest integer lag costs several BPM.
 * Interpolating the vertex recovers sub-hop BPM resolution without shrinking the hop.
 * Returns 0 when the three points are not strictly concave (cannot happen for a genuine
 * strict local maximum, but guards floating-point edge cases).
 */
function parabolicPeakOffset(yPrev: number, yMid: number, yNext: number): number {
  const denom = yPrev - 2 * yMid + yNext;
  if (denom >= 0) return 0;
  let d = (0.5 * (yPrev - yNext)) / denom;
  if (d < -0.5) d = -0.5;
  else if (d > 0.5) d = 0.5;
  return d;
}

/**
 * Find all positive local-maxima peaks in the ACF and convert lags to BPM candidates.
 *
 * Includes the two array endpoints when they exceed their single in-range neighbour
 * (the true high-BPM period can land on minLag, which has no left neighbour). Interior
 * maxima are refined to a fractional lag by {@link parabolicPeakOffset} for sub-hop BPM
 * resolution; endpoints keep their integer lag (they lack a neighbour to interpolate
 * against). Sorted by raw ACF score descending; pass `topK = acf.length` to retain every peak.
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

  // Interior local maxima — refined to a fractional lag for sub-hop BPM resolution.
  for (let i = 1; i < last; i++) {
    if (acf[i]! > acf[i - 1]! && acf[i]! > acf[i + 1]! && acf[i]! > 0) {
      const lag = minLag + i + parabolicPeakOffset(acf[i - 1]!, acf[i]!, acf[i + 1]!);
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

/** Soft log-Gaussian tempo prior: 1 at `mu`, decaying symmetrically in log-BPM. */
export function tempoPrior(bpm: number, mu = defaultPriorMu, sigma = defaultPriorSigma): number {
  const z = Math.log(bpm / mu) / sigma;
  return Math.exp(-0.5 * z * z);
}

/**
 * Re-score raw ACF peaks into musically-disambiguated tempo candidates.
 *
 * For each candidate fundamental `f` (lag `p`):
 *   support  = 1.0·ACF(p) + 0.5·ACF(2p) + 0.3·ACF(3p)      // its own sub-multiples (f, f/2, f/3)
 *   penalty  = 1.0·ACF(p/2)[if 2f ≤ maxBpm] + 0.5·ACF(p/3)[if 3f ≤ maxBpm]   // super-harmonics
 *   comb     = max(0, support − penalty)
 *   score    = comb · prior(bpm)
 *
 * The penalty is what defeats the octave-down bias: a sub-harmonic candidate has a strong
 * super-harmonic (the real beat), so it is demoted; the true fundamental has no
 * super-harmonic energy and keeps its full comb.
 *
 * The penalty is gated to be SUBDIVISION-AWARE (see module header §2): a super-harmonic
 * `kf` only counts against `f` when `kf` is itself a plausible beat (`kf ≤ maxBpm`). Energy
 * at a super-harmonic above the tempo band is a subdivision (e.g. hats on 8th-notes over a
 * 180 BPM kick), not a competing fundamental, and must not demote the true beat. Returns
 * candidates sorted by score.
 */
export function scoreTempoHypotheses(
  peaks: TempoCandidateResult[],
  acf: Float32Array,
  minLag: number,
  options: TempoScoringOptions = {},
): TempoCandidateResult[] {
  const mu = options.priorMu ?? defaultPriorMu;
  const sigma = options.priorSigma ?? defaultPriorSigma;
  const maxBpm = options.maxBpm ?? 300;
  // Super-harmonics above this BPM are subdivisions, not competing beats: they do not penalise.
  const superHarmonicMaxBpm = maxBpm * (1 + candidateEdgeTolerance);

  const scored = peaks.map((p) => {
    const lag = p.lag;
    const aF = acfAtLag(acf, minLag, lag);
    const aHalf = acfAtLag(acf, minLag, lag * 2); // f/2 (slower sub-harmonic)
    const aThird = acfAtLag(acf, minLag, lag * 3); // f/3
    const aDouble = acfAtLag(acf, minLag, lag / 2); // 2f (faster super-harmonic)
    const aTriple = acfAtLag(acf, minLag, lag / 3); // 3f

    const support = combWeightFundamental * aF + combWeightHalf * aHalf + combWeightThird * aThird;
    const penaltyDouble = p.bpm * 2 <= superHarmonicMaxBpm ? combPenaltyDouble * aDouble : 0;
    const penaltyTriple = p.bpm * 3 <= superHarmonicMaxBpm ? combPenaltyTriple * aTriple : 0;
    let comb = support - penaltyDouble - penaltyTriple;
    if (comb < 0) comb = 0;

    return { bpm: p.bpm, score: comb * tempoPrior(p.bpm, mu, sigma), lag: p.lag };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Full tempo-candidate pipeline: ACF → peaks → comb + super-harmonic penalty + prior.
 *
 * This is the single function the worklet mirrors and `worklet-parity.test.ts` checks.
 *
 * @param flux       Recent novelty values (oldest first).
 * @param minLag     Minimum candidate lag in hops (inclusive); the ACF itself extends below it.
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
  const maxBpm = options.maxBpm ?? 300;
  const topK = options.topK ?? 3;

  const acfMinLag = acfExtendedMinLag(minLag);
  const acf = computeAcf(flux, acfMinLag, maxLag);
  const peaks = findTempoPeaks(acf, acfMinLag, hopSize, sampleRate, acf.length);
  const loBpm = minBpm * (1 - candidateEdgeTolerance);
  const hiBpm = maxBpm * (1 + candidateEdgeTolerance);
  const inRange = peaks.filter((p) => p.bpm >= loBpm && p.bpm <= hiBpm);
  const scored = scoreTempoHypotheses(inRange, acf, acfMinLag, options);
  return scored.slice(0, topK);
}

/**
 * True when `bpm` is a metrically-related multiple of `reference` — a ½×, 2×, 3× or ⅓×
 * octave, OR a 3:2 / 2:3 (dotted ↔ triple) relative. Switching across any of these needs the
 * stronger hysteresis margin: they are the same beat counted at a different metrical level
 * (e.g. 180 BPM kick vs the 120 BPM "dotted" grouping its 8th-note subdivisions create), not
 * a genuine tempo change.
 */
export function isOctaveRelated(bpm: number, reference: number): boolean {
  if (reference <= 0) return false;
  const r = bpm / reference;
  return (
    Math.abs(r - 0.5) < 0.05 ||
    Math.abs(r - 2) < 0.1 ||
    Math.abs(r - 3) < 0.15 ||
    Math.abs(r - 1 / 3) < 0.05 ||
    Math.abs(r - 2 / 3) < 0.04 ||
    Math.abs(r - 3 / 2) < 0.06
  );
}

