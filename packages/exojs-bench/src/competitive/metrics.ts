import { createRng } from '../shared/rng';
import { median, percentile } from '../shared/timing';

export type FrameTimeSource = 'webgl2-time-elapsed' | 'webgpu-render-pass-timestamps' | 'raf-cadence' | 'unavailable';

export interface SampleSummary {
  readonly count: number;
  readonly mean: number;
  readonly median: number;
  readonly p95: number;
  readonly p99: number;
  readonly min: number;
  readonly max: number;
  readonly variance: number;
  readonly stutterThresholdMs: number;
  readonly stutters: number;
}

const validateSamples = (samples: readonly number[]): void => {
  if (samples.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error('Samples must be finite and non-negative.');
  }
};

/** Descriptive frame statistics; these samples are not independent experimental runs. */
export const summarizeSamples = (samples: readonly number[], stutterThresholdMs = 1000 / 30): SampleSummary | null => {
  validateSamples(samples);

  if (!Number.isFinite(stutterThresholdMs) || stutterThresholdMs <= 0) {
    throw new Error('The stutter threshold must be positive and finite.');
  }

  if (samples.length === 0) {
    return null;
  }

  const mean = samples.reduce((total, value) => total + value, 0) / samples.length;

  return {
    count: samples.length,
    mean,
    median: median(samples),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    min: percentile(samples, 0),
    max: percentile(samples, 100),
    variance: samples.reduce((total, value) => total + (value - mean) ** 2, 0) / samples.length,
    stutterThresholdMs,
    stutters: samples.filter(value => value > stutterThresholdMs).length,
  };
};

/** Legacy or cadence-only measurements cannot populate a field named GPU time. */
export const hardwareGpuMedian = (result: {
  readonly frameMsMedian: number | null;
  readonly frameTimeSource?: FrameTimeSource;
}): number | null =>
  result.frameTimeSource === 'webgl2-time-elapsed' || result.frameTimeSource === 'webgpu-render-pass-timestamps'
    ? result.frameMsMedian
    : null;

export interface RunComparison {
  readonly runs: number;
  /** Competitor / reference, computed from paired run medians. Above one favors the reference. */
  readonly ratio: number | null;
  readonly interval95: readonly [number, number] | null;
  readonly signTestP: number | null;
  readonly status: 'REFERENCE_FASTER' | 'COMPETITOR_FASTER' | 'INCONCLUSIVE' | 'UNRESOLVED';
}

const signTest = (ratios: readonly number[]): number => {
  const positive = ratios.filter(value => value > 1).length;
  const negative = ratios.filter(value => value < 1).length;
  const count = positive + negative;
  const tail = Math.min(positive, negative);
  let term = 2 ** -count;
  let probability = term;

  for (let index = 1; index <= tail; index++) {
    term *= (count - index + 1) / index;
    probability += term;
  }

  return Math.min(1, probability * 2);
};

/** Exploratory paired-run comparison, with a two-sided sign test and seeded bootstrap of run ratios. */
export const compareRunMedians = (reference: readonly number[], competitor: readonly number[]): RunComparison => {
  if (reference.length !== competitor.length) {
    throw new Error('Comparison requires paired independent runs of equal length.');
  }

  validateSamples(reference);
  validateSamples(competitor);

  if (reference.length === 0 || reference.includes(0) || competitor.includes(0)) {
    return { runs: reference.length, ratio: null, interval95: null, signTestP: null, status: 'UNRESOLVED' };
  }

  const ratios = reference.map((value, index) => competitor[index]! / value);
  const ratio = median(ratios);
  const rng = createRng(0xc0ffee);
  const bootstraps: number[] = [];

  for (let iteration = 0; iteration < 2000; iteration++) {
    const resample = ratios.map(() => ratios[Math.floor(rng() * ratios.length)]!);
    bootstraps.push(median(resample));
  }

  const interval95 = [percentile(bootstraps, 2.5), percentile(bootstraps, 97.5)] as const;
  const signTestP = signTest(ratios);
  const sufficient = ratios.length >= 5 && signTestP < 0.05;
  let status: RunComparison['status'] = 'INCONCLUSIVE';

  if (sufficient && interval95[0] > 1.05) {
    status = 'REFERENCE_FASTER';
  } else if (sufficient && interval95[1] < 1 / 1.05) {
    status = 'COMPETITOR_FASTER';
  }

  return { runs: ratios.length, ratio, interval95, signTestP, status };
};
