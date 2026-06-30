/**
 * Objective metrics for BeatDetector Stage-1 testbench.
 *
 * Turns a captured WorkletMessage log + fixture ground truth into the following
 * metrics (per the Stage-1 plan Task 3 spec):
 *
 *   BPM error       — |reportedTempo - trueBpm|, sampled from state after lock.
 *   Beat offset     — per-beat absolute offset (ms) vs nearest GT onset.
 *   False positives — emitted beats with no GT match within ±halfIBI window.
 *   Misses          — GT onsets with no emitted beat within the window.
 *   Lock time       — seconds until state.tempo stays within ±3% for K consecutive msgs.
 *   Confidence-vs-correctness — mean confidence when correct/wrong, correlation.
 *   Octave error    — flag when detected tempo is ~0.5× or ~2× true.
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
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function extractBeatMessages(msgs: WorkletMessage[]): BeatMessage[] {
  return msgs.filter((m): m is BeatMessage => m.type === 'beat');
}

function extractStateMessages(msgs: WorkletMessage[]): StateMessage[] {
  return msgs.filter((m): m is StateMessage => m.type === 'state');
}

function resolveConstantBpm(fixture: BeatFixture): number {
  if (typeof fixture.bpm === 'function') {
    const dur = fixture.samples.length / 48000;
    return fixture.bpm(dur / 2); // evaluate at midpoint
  }
  return fixture.bpm;
}

function resolveBpmAt(fixture: BeatFixture, timeSec: number): number {
  if (typeof fixture.bpm === 'function') return fixture.bpm(timeSec);
  return fixture.bpm;
}

/** Sorted percentile (index-based, no interpolation). */
function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(pct * sorted.length));
  return sorted[idx];
}

function median(sorted: number[]): number {
  return percentile(sorted, 0.5);
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dxSq = 0, dySq = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dxSq += dx * dx;
    dySq += dy * dy;
  }
  const denom = Math.sqrt(dxSq * dySq);
  return denom === 0 ? 0 : num / denom;
}

/**
 * Greedy one-to-one match: for each emitted beat, find the nearest unmatched
 * GT onset within `windowSec`. Returns:
 *   offsets — matched absolute offsets in seconds
 *   fpTimes — emitted beats with no GT match
 *   missTimes — GT onsets with no matched emitted beat
 */
function greedyMatch(
  emittedTimes: number[],
  gtTimes: number[],
  windowSec: number,
): { offsets: number[]; fpTimes: number[]; missTimes: number[] } {
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
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Compute BeatMetrics from a captured WorkletMessage log and the ground-truth fixture.
 *
 * @param lockThresholdPct   BPM error threshold for "locked" state (default 3%).
 * @param lockConsecutiveK   Consecutive settled state messages required (default 3).
 */
export function computeMetrics(
  messages: WorkletMessage[],
  fixture: BeatFixture,
  options: {
    lockThresholdPct?: number;
    lockConsecutiveK?: number;
    matchWindowFraction?: number; // fraction of IBI used as match window (default 0.5)
  } = {},
): BeatMetrics {
  const { lockThresholdPct = 3, lockConsecutiveK = 3, matchWindowFraction = 0.5 } = options;
  const fixtureDurationSec = fixture.samples.length / 48000;
  const midBpm = resolveConstantBpm(fixture);
  const matchWindowSec = (60 / midBpm) * matchWindowFraction;

  // ── BPM error from settled state messages ──

  const stateMessages = extractStateMessages(messages);
  const settledStates = stateMessages.filter((s) => s.tempo > 0);

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
    signedMean: bpmErrorsSigned.length
      ? bpmErrorsSigned.reduce((a, b) => a + b, 0) / bpmErrorsSigned.length
      : 0,
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
    const isLocked =
      s.tempo > 0 &&
      trueBpm > 0 &&
      Math.abs(s.tempo - trueBpm) / trueBpm <= lockThresholdPct / 100;

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
  const emittedTimes = beatMsgs.map((m) => m.audioTime);
  const gtTimes = fixture.beatTimesSec;

  const { offsets, fpTimes, missTimes } = greedyMatch(emittedTimes, gtTimes, matchWindowSec);
  const offsetsMs = offsets.map((o) => o * 1000);
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
    const correct =
      trueBpm > 0 && Math.abs(s.tempo - trueBpm) / trueBpm <= lockThresholdPct / 100 ? 1 : 0;
    confValues.push(s.confidence);
    correctFlags.push(correct);
  }

  const correctConf = confValues.filter((_, i) => correctFlags[i] === 1);
  const wrongConf = confValues.filter((_, i) => correctFlags[i] === 0);
  const confidence: ConfidenceCorrelation = {
    meanWhenCorrect: correctConf.length
      ? correctConf.reduce((a, b) => a + b, 0) / correctConf.length
      : 0,
    meanWhenWrong: wrongConf.length ? wrongConf.reduce((a, b) => a + b, 0) / wrongConf.length : 0,
    pearsonR: pearson(confValues, correctFlags),
    sampleCount: confValues.length,
  };

  // ── Octave error ──

  // Check if majority of settled states have tempo near 0.5× or 2× true BPM
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

  const detectionRate =
    stateMessages.length > 0 ? settledStates.length / stateMessages.length : 0;

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
  };
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 1): string {
  return n.toFixed(dec);
}

/**
 * Human-readable metric table for console output and snapshot comparison.
 * Explicitly flags where the CURRENT detector fails.
 */
export function formatMetrics(m: BeatMetrics): string {
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
  const octStr =
    m.octaveError.halfOctave ? 'HALF-OCTAVE (locked at 0.5x)'
    : m.octaveError.doubleOctave ? 'DOUBLE-OCTAVE (locked at 2x)'
    : 'none';
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
}
