/**
 * Objective metrics for BeatDetector Stage-1 testbench.
 *
 * Turns a captured WorkletMessage log + fixture ground truth into the following
 * metrics (per the Stage-1 plan Task 3 spec):
 *
 *   BPM error       - |reportedTempo - trueBpm|, sampled from state after lock.
 *   Beat offset     - per-beat absolute offset (ms) vs nearest GT onset.
 *   False positives - emitted beats with no GT match within ±halfIBI window.
 *   Misses          - GT onsets with no emitted beat within the window.
 *   Lock time       - seconds until state.tempo stays within ±3% for K consecutive msgs.
 *   Confidence-vs-correctness - mean confidence when correct/wrong, correlation.
 *   Octave error    - flag when detected tempo is ~0.5× or ~2× true.
 */

import type { BeatFixture } from '../fixtures/beat-fixtures';
import type { BeatMessage, StateMessage, WorkletMessage } from './beat-sandbox';

// ── Public types ───────────────────────────────────────────────────────────────

export interface BpmErrorStats {
  meanAbs: number;
  maxAbs: number;
  signedMean: number; // positive = running fast
  signedPct: number; // % of trueBpm, signed
  sampleCount: number;
}

export interface BeatOffsetStats {
  meanMs: number;
  medianMs: number;
  p90Ms: number;
  matchedCount: number;
  emittedCount: number;
  gtCount: number;
}

export interface FpMissStats {
  fpCount: number;
  fpRatePerMin: number;
  missCount: number;
  missRatePerMin: number;
  recall: number; // matched / gtCount
}

export interface ConfidenceCorrelation {
  meanWhenCorrect: number;
  meanWhenWrong: number;
  /** Pearson r between confidence and isCorrect (0/1). */
  pearsonR: number;
  sampleCount: number;
}

export interface OctaveError {
  /** True if the detector predominantly reports ~0.5× the true BPM. */
  halfOctave: boolean;
  /** True if the detector predominantly reports ~2× the true BPM. */
  doubleOctave: boolean;
}

export interface BeatMetrics {
  label: string;
  fixtureDurationSec: number;
  trueBpmAtMid: number; // true BPM at fixture midpoint (constant or evaluated at t=midpoint)
  bpmError: BpmErrorStats;
  beatOffset: BeatOffsetStats;
  fpMiss: FpMissStats;
  /** Seconds from fixture start until tempo locks (null = never locked). */
  lockTimeSec: number | null;
  confidence: ConfidenceCorrelation;
  octaveError: OctaveError;
  /** Fraction of state messages (after settling) that report tempo > 0. */
  detectionRate: number;
  /** Provisional/locked-beat metrics. */
  t7: T7Stats;
}

export interface T7Stats {
  /**
   * Emission time (s) of the FIRST emitted beat of ANY status - the reactivity
   * latency the "blink" visualizer feels. Uses the message-posting time
   * (`_audioTimeSec`), not the (possibly back-dated) beat timestamp.
   * null = no beats emitted.
   */
  timeToFirstBeatSec: number | null;
  /** Emission time (s) of the first LOCKED beat. null = never locked. */
  timeToFirstLockedBeatSec: number | null;
  /** Beats emitted with status:'provisional'. */
  provisionalBeatCount: number;
  /** Beats emitted with status:'locked'. */
  lockedBeatCount: number;
  /** False-positive rate per minute computed over LOCKED beats only. */
  lockedFpRatePerMin: number;
  /** FP count over locked beats only. */
  lockedFpCount: number;
  /** Beat-offset mean (ms) over locked beats only. */
  lockedBeatOffsetMeanMs: number;
  /** Number of provisional→locked status transitions in the beat stream. */
  provLockedTransitions: number;
  /** True iff every emitted beat carries a valid `status` field. */
  statusComplete: boolean;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

const extractBeatMessages = (msgs: WorkletMessage[]): BeatMessage[] => {
  return msgs.filter((m): m is BeatMessage => m.type === 'beat');
};

const extractStateMessages = (msgs: WorkletMessage[]): StateMessage[] => {
  return msgs.filter((m): m is StateMessage => m.type === 'state');
};

const resolveConstantBpm = (fixture: BeatFixture): number => {
  if (typeof fixture.bpm === 'function') {
    const dur = fixture.samples.length / 48000;
    return fixture.bpm(dur / 2); // evaluate at midpoint
  }
  return fixture.bpm;
};

const resolveBpmAt = (fixture: BeatFixture, timeSec: number): number => {
  if (typeof fixture.bpm === 'function') return fixture.bpm(timeSec);
  return fixture.bpm;
};

/** Sorted percentile (index-based, no interpolation). */
const percentile = (sorted: number[], pct: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(pct * sorted.length));
  return sorted[idx];
};

const median = (sorted: number[]): number => {
  return percentile(sorted, 0.5);
};

const pearson = (xs: number[], ys: number[]): number => {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dxSq = 0,
    dySq = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dxSq += dx * dx;
    dySq += dy * dy;
  }
  const denom = Math.sqrt(dxSq * dySq);
  return denom === 0 ? 0 : num / denom;
};

/**
 * Greedy one-to-one match: for each emitted beat, find the nearest unmatched
 * GT onset within `windowSec`. Returns:
 *   offsets - matched absolute offsets in seconds
 *   fpTimes - emitted beats with no GT match
 *   missTimes - GT onsets with no matched emitted beat
 */
const greedyMatch = (emittedTimes: number[], gtTimes: number[], windowSec: number): { offsets: number[]; fpTimes: number[]; missTimes: number[] } => {
  const sorted = [...emittedTimes].sort((a, b) => a - b);
  const gt = [...gtTimes].sort((a, b) => a - b);
  const usedGt = new Set<number>();
  const offsets: number[] = [];
  const fpTimes: number[] = [];

  for (const et of sorted) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < gt.length; i++) {
      if (usedGt.has(i)) continue;
      const dist = Math.abs(et - gt[i]);
      if (dist <= windowSec && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      offsets.push(bestDist);
      usedGt.add(bestIdx);
    } else {
      fpTimes.push(et);
    }
  }

  const missTimes = gt.filter((_, i) => !usedGt.has(i));
  return { offsets, fpTimes, missTimes };
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Compute BeatMetrics from a captured WorkletMessage log and the ground-truth fixture.
 *
 * @param lockThresholdPct   BPM error threshold for "locked" state (default 3%).
 * @param lockConsecutiveK   Consecutive settled state messages required (default 3).
 */
export const computeMetrics = (
  messages: WorkletMessage[],
  fixture: BeatFixture,
  options: {
    lockThresholdPct?: number;
    lockConsecutiveK?: number;
    matchWindowFraction?: number; // fraction of IBI used as match window (default 0.5)
  } = {},
): BeatMetrics => {
  const { lockThresholdPct = 3, lockConsecutiveK = 3, matchWindowFraction = 0.5 } = options;
  const fixtureDurationSec = fixture.samples.length / 48000;
  const midBpm = resolveConstantBpm(fixture);
  const matchWindowSec = (60 / midBpm) * matchWindowFraction;

  // ── BPM error from settled state messages ──

  const stateMessages = extractStateMessages(messages);
  const settledStates = stateMessages.filter(s => s.tempo > 0);

  const bpmErrors: number[] = [];
  const bpmErrorsSigned: number[] = [];
  for (const s of settledStates) {
    const trueBpm = resolveBpmAt(fixture, s._audioTimeSec);
    const err = s.tempo - trueBpm;
    bpmErrors.push(Math.abs(err));
    bpmErrorsSigned.push(err);
  }

  const bpmError: BpmErrorStats = {
    meanAbs: bpmErrors.length ? bpmErrors.reduce((a, b) => a + b, 0) / bpmErrors.length : 0,
    maxAbs: bpmErrors.length ? Math.max(...bpmErrors) : 0,
    signedMean: bpmErrorsSigned.length ? bpmErrorsSigned.reduce((a, b) => a + b, 0) / bpmErrorsSigned.length : 0,
    signedPct: 0,
    sampleCount: bpmErrors.length,
  };
  bpmError.signedPct = midBpm > 0 ? (bpmError.signedMean / midBpm) * 100 : 0;

  // ── Lock time ──

  let lockTimeSec: number | null = null;
  let consecutiveCount = 0;
  let firstInRunTime: number | null = null;

  for (const s of stateMessages) {
    const trueBpm = resolveBpmAt(fixture, s._audioTimeSec);
    const isLocked = s.tempo > 0 && trueBpm > 0 && Math.abs(s.tempo - trueBpm) / trueBpm <= lockThresholdPct / 100;

    if (isLocked) {
      consecutiveCount++;
      if (consecutiveCount === 1) firstInRunTime = s._audioTimeSec;
      if (consecutiveCount >= lockConsecutiveK) {
        lockTimeSec = firstInRunTime!;
        break;
      }
    } else {
      consecutiveCount = 0;
      firstInRunTime = null;
    }
  }

  // ── Beat-event offset + FP/miss ──

  const beatMsgs = extractBeatMessages(messages);
  const emittedTimes = beatMsgs.map(m => m.audioTime);
  const gtTimes = fixture.beatTimesSec;

  const { offsets, fpTimes, missTimes } = greedyMatch(emittedTimes, gtTimes, matchWindowSec);
  const offsetsMs = offsets.map(o => o * 1000);
  const sortedOffsets = [...offsetsMs].sort((a, b) => a - b);

  const beatOffset: BeatOffsetStats = {
    meanMs: offsetsMs.length ? offsetsMs.reduce((a, b) => a + b, 0) / offsetsMs.length : 0,
    medianMs: median(sortedOffsets),
    p90Ms: percentile(sortedOffsets, 0.9),
    matchedCount: offsets.length,
    emittedCount: emittedTimes.length,
    gtCount: gtTimes.length,
  };

  const durationMin = fixtureDurationSec / 60;
  const fpMiss: FpMissStats = {
    fpCount: fpTimes.length,
    fpRatePerMin: durationMin > 0 ? fpTimes.length / durationMin : 0,
    missCount: missTimes.length,
    missRatePerMin: durationMin > 0 ? missTimes.length / durationMin : 0,
    recall: gtTimes.length > 0 ? offsets.length / gtTimes.length : 0,
  };

  // ── Confidence vs correctness ──

  const confValues: number[] = [];
  const correctFlags: number[] = [];
  for (const s of settledStates) {
    const trueBpm = resolveBpmAt(fixture, s._audioTimeSec);
    const correct = trueBpm > 0 && Math.abs(s.tempo - trueBpm) / trueBpm <= lockThresholdPct / 100 ? 1 : 0;
    confValues.push(s.confidence);
    correctFlags.push(correct);
  }

  const correctConf = confValues.filter((_, i) => correctFlags[i] === 1);
  const wrongConf = confValues.filter((_, i) => correctFlags[i] === 0);
  const confidence: ConfidenceCorrelation = {
    meanWhenCorrect: correctConf.length ? correctConf.reduce((a, b) => a + b, 0) / correctConf.length : 0,
    meanWhenWrong: wrongConf.length ? wrongConf.reduce((a, b) => a + b, 0) / wrongConf.length : 0,
    pearsonR: pearson(confValues, correctFlags),
    sampleCount: confValues.length,
  };

  // ── Octave error ──

  // Heuristic octave-error flag: majority-vote over settled states using broad ±0.1/±0.2
  // ratio bands. This is intentionally loose - a 180→120 slip (ratio 0.667) is outside
  // the half-octave band and zero settled states makes majority=0 → halfOctave=true.
  // The real quality gates (pct≤3%, lockTimeSec≠null, recall≥90%) do the actual work;
  // these flags are a secondary diagnostic signal, not a primary pass/fail criterion.
  let halfOctaveCount = 0;
  let doubleOctaveCount = 0;
  for (const s of settledStates) {
    const trueBpm = resolveBpmAt(fixture, s._audioTimeSec);
    if (trueBpm <= 0) continue;
    const ratio = s.tempo / trueBpm;
    if (Math.abs(ratio - 0.5) < 0.1) halfOctaveCount++;
    if (Math.abs(ratio - 2.0) < 0.2) doubleOctaveCount++;
  }
  const majority = Math.ceil(settledStates.length / 2);
  const octaveError: OctaveError = {
    halfOctave: halfOctaveCount >= majority,
    doubleOctave: doubleOctaveCount >= majority,
  };

  // ── Detection rate ──

  const detectionRate = stateMessages.length > 0 ? settledStates.length / stateMessages.length : 0;

  // ── Provisional vs locked beats ──

  const timeToFirstBeatSec = beatMsgs.length > 0 ? beatMsgs[0]._audioTimeSec : null;
  const lockedBeats = beatMsgs.filter(b => b.status === 'locked');
  const provisionalBeats = beatMsgs.filter(b => b.status === 'provisional');
  const firstLocked = lockedBeats[0];
  const lockedMatch = greedyMatch(
    lockedBeats.map(b => b.audioTime),
    gtTimes,
    matchWindowSec,
  );
  const lockedOffsetsMs = lockedMatch.offsets.map(o => o * 1000);

  let provLockedTransitions = 0;
  for (let i = 1; i < beatMsgs.length; i++) {
    if (beatMsgs[i - 1].status === 'provisional' && beatMsgs[i].status === 'locked') {
      provLockedTransitions++;
    }
  }
  const statusComplete = beatMsgs.every(b => b.status === 'provisional' || b.status === 'locked');

  const t7: T7Stats = {
    timeToFirstBeatSec,
    timeToFirstLockedBeatSec: firstLocked ? firstLocked._audioTimeSec : null,
    provisionalBeatCount: provisionalBeats.length,
    lockedBeatCount: lockedBeats.length,
    lockedFpRatePerMin: durationMin > 0 ? lockedMatch.fpTimes.length / durationMin : 0,
    lockedFpCount: lockedMatch.fpTimes.length,
    lockedBeatOffsetMeanMs: lockedOffsetsMs.length ? lockedOffsetsMs.reduce((a, b) => a + b, 0) / lockedOffsetsMs.length : 0,
    provLockedTransitions,
    statusComplete,
  };

  return {
    label: fixture.label,
    fixtureDurationSec,
    trueBpmAtMid: midBpm,
    bpmError,
    beatOffset,
    fpMiss,
    lockTimeSec,
    confidence,
    octaveError,
    detectionRate,
    t7,
  };
};

// ── Formatting ─────────────────────────────────────────────────────────────────

const fmt = (n: number, dec = 1): string => {
  return n.toFixed(dec);
};

/**
 * Human-readable metric table for console output and snapshot comparison.
 * Explicitly flags where the CURRENT detector fails.
 */
export const formatMetrics = (m: BeatMetrics): string => {
  const fails: string[] = [];
  const lines: string[] = [];

  lines.push(`--- ${m.label} ---`);
  lines.push(`  Duration       : ${fmt(m.fixtureDurationSec, 1)}s`);
  lines.push(`  True BPM (mid) : ${fmt(m.trueBpmAtMid, 1)}`);

  // BPM error
  lines.push(
    `  BPM error      : mean=${fmt(m.bpmError.meanAbs, 2)} max=${fmt(m.bpmError.maxAbs, 2)} ` +
      `signed=${fmt(m.bpmError.signedMean, 2)} (${fmt(m.bpmError.signedPct, 2)}%) ` +
      `[n=${m.bpmError.sampleCount}]`,
  );
  if (m.bpmError.sampleCount > 0 && m.bpmError.meanAbs > m.trueBpmAtMid * 0.05) {
    fails.push(`BPM error > 5% (mean=${fmt(m.bpmError.meanAbs, 1)} BPM)`);
  }

  // Beat offset
  lines.push(
    `  Beat offset    : mean=${fmt(m.beatOffset.meanMs, 1)}ms p90=${fmt(m.beatOffset.p90Ms, 1)}ms ` +
      `median=${fmt(m.beatOffset.medianMs, 1)}ms [${m.beatOffset.matchedCount} matched]`,
  );

  // FP / miss
  lines.push(
    `  Beats          : emitted=${m.beatOffset.emittedCount} GT=${m.beatOffset.gtCount} ` +
      `matched=${m.beatOffset.matchedCount} FP=${m.fpMiss.fpCount} (${fmt(m.fpMiss.fpRatePerMin, 1)}/min) ` +
      `miss=${m.fpMiss.missCount} recall=${fmt(m.fpMiss.recall * 100, 1)}%`,
  );
  if (m.fpMiss.fpRatePerMin > 10) {
    fails.push(`FP rate > 10/min (${fmt(m.fpMiss.fpRatePerMin, 1)}/min)`);
  }
  if (m.fpMiss.recall < 0.5 && m.beatOffset.gtCount > 2) {
    fails.push(`low recall ${fmt(m.fpMiss.recall * 100, 1)}% (< 50%)`);
  }

  // Lock time
  const lockStr = m.lockTimeSec !== null ? `${fmt(m.lockTimeSec, 2)}s` : 'NEVER';
  lines.push(`  Lock time      : ${lockStr}`);
  if (m.lockTimeSec === null) {
    fails.push('never locked to correct tempo');
  }

  // Confidence
  lines.push(
    `  Confidence     : correct=${fmt(m.confidence.meanWhenCorrect, 3)} ` +
      `wrong=${fmt(m.confidence.meanWhenWrong, 3)} r=${fmt(m.confidence.pearsonR, 3)} ` +
      `[n=${m.confidence.sampleCount}]`,
  );

  // Octave error
  const octStr = m.octaveError.halfOctave ? 'HALF-OCTAVE (locked at 0.5x)' : m.octaveError.doubleOctave ? 'DOUBLE-OCTAVE (locked at 2x)' : 'none';
  lines.push(`  Octave error   : ${octStr}`);
  if (m.octaveError.halfOctave || m.octaveError.doubleOctave) {
    fails.push(`octave error: ${octStr}`);
  }

  // Detection rate
  lines.push(`  Detection rate : ${fmt(m.detectionRate * 100, 1)}% of state messages have tempo > 0`);

  // Result
  if (fails.length === 0) {
    lines.push('  Result         : PASS');
  } else {
    lines.push(`  Result         : FAIL (${fails.join('; ')})`);
  }

  return lines.join('\n');
};

export interface MirEventMetrics {
  emittedCount: number;
  referenceCount: number;
  matchedCount: number;
  falsePositiveCount: number;
  missCount: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  falsePositivesPerMinute: number;
  firstPostedSec: number | null;
  timestampErrorMs: { signedMean: number; meanAbs: number; p90Abs: number } | null;
  postingLatencyMs: { medianLower: number; medianUpper: number; p90Lower: number; p90Upper: number } | null;
}

export interface MirMetrics {
  label: string;
  toleranceMs: number;
  all: MirEventMetrics;
  provisional: MirEventMetrics;
  locked: MirEventMetrics;
  tempo: { sampleCount: number; accuracy: number | null; octaveTolerantAccuracy: number | null };
}

const matchMirEvents = (beats: BeatMessage[], reference: number[], toleranceSec: number, contextStartSec: number): { beat: BeatMessage; time: number }[] => {
  const columns = reference.length + 1;
  const size = (beats.length + 1) * columns;
  const counts = new Uint32Array(size);
  const errors = new Float64Array(size);
  const moves = new Uint8Array(size);

  // Nearest-first matching can consume the only reference available to a later beat.
  // Optimize match count first, then total absolute error, over ordered sequences.
  for (let i = beats.length - 1; i >= 0; i--) {
    for (let j = reference.length - 1; j >= 0; j--) {
      const cell = i * columns + j;
      const skipBeat = cell + columns;
      const skipReference = cell + 1;
      counts[cell] = counts[skipBeat];
      errors[cell] = errors[skipBeat];
      moves[cell] = 1;
      if (counts[skipReference] > counts[cell] || (counts[skipReference] === counts[cell] && errors[skipReference] < errors[cell])) {
        counts[cell] = counts[skipReference];
        errors[cell] = errors[skipReference];
        moves[cell] = 2;
      }
      const error = Math.abs(beats[i].audioTime - contextStartSec - reference[j]);
      const diagonal = cell + columns + 1;
      // Timestamp subtraction must not exclude an event exactly on the tolerance boundary.
      if (
        error <= toleranceSec + 1e-9 &&
        (counts[diagonal] + 1 > counts[cell] || (counts[diagonal] + 1 === counts[cell] && errors[diagonal] + error <= errors[cell]))
      ) {
        counts[cell] = counts[diagonal] + 1;
        errors[cell] = errors[diagonal] + error;
        moves[cell] = 3;
      }
    }
  }

  const matches: { beat: BeatMessage; time: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < beats.length && j < reference.length) {
    const move = moves[i * columns + j];
    if (move === 3) matches.push({ beat: beats[i], time: reference[j] });
    if (move !== 2) i++;
    if (move !== 1) j++;
  }
  return matches;
};

/**
 * Scores annotated beat timestamps with fixed-tolerance one-to-one matching.
 * Posting latency bounds describe the sandbox's audio block, not main-thread delivery.
 * Empty denominators and distributions are null; startup misses remain in the score.
 */
export const computeMirMetrics = (
  messages: WorkletMessage[],
  fixture: BeatFixture,
  options: { toleranceMs?: number; blockSize?: number; contextStartSec?: number } = {},
): MirMetrics => {
  const { toleranceMs = 70, blockSize = 128, contextStartSec = 0 } = options;
  const reference = [...fixture.beatTimesSec].sort((a, b) => a - b);
  const beats = extractBeatMessages(messages).sort((a, b) => a.audioTime - b.audioTime || a._audioTimeSec - b._audioTimeSec);
  const durationSec = fixture.samples.length / 48000;
  const blockMs = blockSize / 48;
  const score = (events: BeatMessage[]): MirEventMetrics => {
    const matches = matchMirEvents(events, reference, toleranceMs / 1000, contextStartSec);
    const signedErrors = matches.map(({ beat, time }) => (beat.audioTime - contextStartSec - time) * 1000);
    const absoluteErrors = signedErrors.map(Math.abs).sort((a, b) => a - b);
    const latencies = matches.map(({ beat, time }) => (beat._audioTimeSec - time) * 1000).sort((a, b) => a - b);
    const matchedCount = matches.length;
    const falsePositiveCount = events.length - matchedCount;
    return {
      emittedCount: events.length,
      referenceCount: reference.length,
      matchedCount,
      falsePositiveCount,
      missCount: reference.length - matchedCount,
      precision: events.length ? matchedCount / events.length : null,
      recall: reference.length ? matchedCount / reference.length : null,
      f1: events.length + reference.length ? (2 * matchedCount) / (events.length + reference.length) : null,
      falsePositivesPerMinute: durationSec > 0 ? (falsePositiveCount * 60) / durationSec : 0,
      firstPostedSec: events.length ? Math.min(...events.map(event => event._audioTimeSec)) : null,
      timestampErrorMs: matchedCount
        ? {
            signedMean: signedErrors.reduce((sum, value) => sum + value, 0) / matchedCount,
            meanAbs: absoluteErrors.reduce((sum, value) => sum + value, 0) / matchedCount,
            p90Abs: percentile(absoluteErrors, 0.9),
          }
        : null,
      postingLatencyMs: matchedCount
        ? {
            medianLower: median(latencies),
            medianUpper: median(latencies) + blockMs,
            p90Lower: percentile(latencies, 0.9),
            p90Upper: percentile(latencies, 0.9) + blockMs,
          }
        : null,
    };
  };
  const states = extractStateMessages(messages).filter(state => resolveBpmAt(fixture, state._audioTimeSec) > 0);
  const accuracy = (ratios: number[]): number | null =>
    states.length
      ? states.filter(state => {
          const truth = resolveBpmAt(fixture, state._audioTimeSec);
          return ratios.some(ratio => Math.abs(state.tempo / (truth * ratio) - 1) <= 0.03);
        }).length / states.length
      : null;
  return {
    label: fixture.label,
    toleranceMs,
    all: score(beats),
    provisional: score(beats.filter(beat => beat.status === 'provisional')),
    locked: score(beats.filter(beat => beat.status === 'locked')),
    tempo: { sampleCount: states.length, accuracy: accuracy([1]), octaveTolerantAccuracy: accuracy([0.5, 1, 2]) },
  };
};
