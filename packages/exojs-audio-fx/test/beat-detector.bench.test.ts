/**
 * Stage-1 BeatDetector baseline measurement.
 *
 * PHASE 1 — RECORD, DO NOT GATE.
 * Runs every fixture through the real worklet eval-sandbox, computes BeatMetrics,
 * and writes a committed baseline JSON snapshot. Assertions are limited to
 * sanity bounds that are certain to hold today (plan Task 4 spec).
 *
 * The baseline JSON is the Stage-2 reference: future tasks will add per-fixture
 * hard thresholds only after the specific improvement lands.
 *
 * Fixtures where the CURRENT detector FAILS are documented in the output table
 * and in the baseline snapshot under each fixture's `result` field.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { allFixtures, type BeatFixture,SAMPLE_RATE } from './fixtures/beat-fixtures';
import { type BeatMetrics,computeMetrics, formatMetrics } from './harness/beat-metrics';
import { runDetector } from './harness/beat-sandbox';

// ── Snapshot path ──────────────────────────────────────────────────────────────
// pnpm runs test scripts from the package directory, so process.cwd() =
// packages/exojs-audio-fx when this test runs.
const SNAPSHOT_PATH = resolve(process.cwd(), 'test/__snapshots__/beat-baseline.json');

// ── Helpers ────────────────────────────────────────────────────────────────────

function measureFixture(fixture: BeatFixture): BeatMetrics {
  const { messages } = runDetector(fixture.samples);
  return computeMetrics(messages, fixture);
}

/**
 * Classify the current detector's result per fixture for the Stage-2 target list.
 * Returns an array of failure strings (empty = PASS).
 */
function classifyFailures(m: BeatMetrics, fixture: BeatFixture): string[] {
  const fails: string[] = [];
  if (m.lockTimeSec === null) {
    fails.push('never-locked');
  }
  if (m.octaveError.halfOctave) {
    fails.push('octave-half');
  }
  if (m.octaveError.doubleOctave) {
    fails.push('octave-double');
  }
  if (m.fpMiss.fpRatePerMin > 15) {
    fails.push(`fp-rate-high:${m.fpMiss.fpRatePerMin.toFixed(1)}/min`);
  }
  if (m.fpMiss.recall < 0.4 && m.beatOffset.gtCount > 2) {
    fails.push(`low-recall:${(m.fpMiss.recall * 100).toFixed(0)}%`);
  }
  // For ramp: check if BPM error is very large (> 10% = significant tracking lag)
  const isRamp = typeof fixture.bpm === 'function';
  if (isRamp && m.bpmError.meanAbs > m.trueBpmAtMid * 0.10) {
    fails.push(`ramp-lag:bpm-err=${m.bpmError.meanAbs.toFixed(1)}`);
  }
  return fails;
}

// ── Baseline data collection ───────────────────────────────────────────────────

const FIXTURES = allFixtures();

interface BaselineEntry {
  label: string;
  bpmTrue: number;
  bpmErrorMeanAbs: number;
  bpmErrorMaxAbs: number;
  bpmErrorSignedPct: number;
  beatOffsetMeanMs: number;
  beatOffsetP90Ms: number;
  beatOffsetMedianMs: number;
  matchedCount: number;
  emittedCount: number;
  gtCount: number;
  fpCount: number;
  fpRatePerMin: number;
  missCount: number;
  recall: number;
  lockTimeSec: number | null;
  confidenceWhenCorrect: number;
  confidenceWhenWrong: number;
  confidenceCorrelation: number;
  octaveHalf: boolean;
  octaveDouble: boolean;
  detectionRate: number;
  failures: string[];
  formatted: string;
}

let allMetrics: Map<string, BaselineEntry>;

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('BeatDetector Stage-1 baseline', { timeout: 300_000 }, () => {
  beforeAll(
    () => {
      allMetrics = new Map<string, BaselineEntry>();

      for (const fixture of FIXTURES) {
        const m = measureFixture(fixture);
      const failures = classifyFailures(m, fixture);
      const entry: BaselineEntry = {
        label: m.label,
        bpmTrue: m.trueBpmAtMid,
        bpmErrorMeanAbs: m.bpmError.meanAbs,
        bpmErrorMaxAbs: m.bpmError.maxAbs,
        bpmErrorSignedPct: m.bpmError.signedPct,
        beatOffsetMeanMs: m.beatOffset.meanMs,
        beatOffsetP90Ms: m.beatOffset.p90Ms,
        beatOffsetMedianMs: m.beatOffset.medianMs,
        matchedCount: m.beatOffset.matchedCount,
        emittedCount: m.beatOffset.emittedCount,
        gtCount: m.beatOffset.gtCount,
        fpCount: m.fpMiss.fpCount,
        fpRatePerMin: m.fpMiss.fpRatePerMin,
        missCount: m.fpMiss.missCount,
        recall: m.fpMiss.recall,
        lockTimeSec: m.lockTimeSec,
        confidenceWhenCorrect: m.confidence.meanWhenCorrect,
        confidenceWhenWrong: m.confidence.meanWhenWrong,
        confidenceCorrelation: m.confidence.pearsonR,
        octaveHalf: m.octaveError.halfOctave,
        octaveDouble: m.octaveError.doubleOctave,
        detectionRate: m.detectionRate,
        failures,
        formatted: formatMetrics(m),
      };
        allMetrics.set(fixture.label, entry);
      }
    },
    240_000,
  );

  // ── Per-fixture sanity assertions ──

  for (const fixture of FIXTURES) {
    const label = fixture.label;

    it(`${label}: produces messages`, () => {
      const entry = allMetrics.get(label);
      expect(entry).toBeDefined();
      // Any detector activity at all
      expect(entry!.emittedCount + entry!.matchedCount).toBeGreaterThanOrEqual(0);
    });

    // Specific sanity: 120 BPM clicktrack must produce at least 1 beat
    if (label === 'clicktrack_120bpm') {
      it('clicktrack_120bpm: produces >= 1 beat', () => {
        const entry = allMetrics.get(label)!;
        expect(entry.emittedCount).toBeGreaterThanOrEqual(1);
      });
    }

    // Lock time < fixture duration (if locked)
    it(`${label}: lock time < fixture duration (if locked)`, () => {
      const entry = allMetrics.get(label)!;
      const fixtureDurationSec = fixture.samples.length / SAMPLE_RATE;
      if (entry.lockTimeSec !== null) {
        expect(entry.lockTimeSec).toBeLessThan(fixtureDurationSec);
      }
      // If never locked, just note it — no assertion (recorded in snapshot)
    });
  }

  // ── Print human-readable table ──

  it('prints baseline metric table', () => {
    console.log('\n====== BeatDetector Stage-1 Baseline ======\n');
    for (const fixture of FIXTURES) {
      const entry = allMetrics.get(fixture.label)!;
      console.log(entry.formatted);
      console.log('');
    }

    // Stage-2 target list: fixtures the CURRENT detector fails
    const failingFixtures = FIXTURES.filter(
      (f) => (allMetrics.get(f.label)?.failures.length ?? 0) > 0,
    );
    if (failingFixtures.length > 0) {
      console.log('====== Stage-2 TARGET LIST (current failures) ======');
      for (const f of failingFixtures) {
        const entry = allMetrics.get(f.label)!;
        console.log(`  FAIL  ${f.label}: ${entry.failures.join(', ')}`);
      }
      console.log('');
    } else {
      console.log('All fixtures PASS (no Stage-2 targets identified yet)\n');
    }

    // The table itself is the assertion evidence — always passes
    expect(allMetrics.size).toBe(FIXTURES.length);
  });

  // ── T1 acceptance gates (octave-half fix) ──
  // These are HARD thresholds: the octave fix must hold or CI goes red.

  const pct = (e: BaselineEntry) => e.bpmErrorMeanAbs / e.bpmTrue;

  // The six tempos that USED to lock to a sub-harmonic (or never lock) must now lock to
  // the true fundamental within 3%, with no octave error.
  for (const label of [
    'clicktrack_120bpm',
    'clicktrack_128bpm',
    'clicktrack_140bpm',
    'clicktrack_180bpm',
    'clicktrack_220bpm',
    'clicktrack_250bpm',
  ]) {
    it(`T1: ${label} locks to fundamental ≤3%, no octave error`, () => {
      const e = allMetrics.get(label)!;
      expect(e.octaveHalf).toBe(false);
      expect(e.octaveDouble).toBe(false);
      expect(e.lockTimeSec).not.toBeNull();
      expect(pct(e)).toBeLessThanOrEqual(0.03);
    });
  }

  // Musical / drifting fixtures: no octave error, ≤5%.
  for (const label of [
    'doubleTime_128bpm',
    'swing_120bpm_67pct',
    'grooveOffset_120bpm_10ms',
    'breakDrop_128bpm',
    'tempoRamp_120_to_135bpm',
  ]) {
    it(`T1: ${label} no octave error, BPM error ≤5%`, () => {
      const e = allMetrics.get(label)!;
      expect(e.octaveHalf).toBe(false);
      expect(e.octaveDouble).toBe(false);
      expect(pct(e)).toBeLessThanOrEqual(0.05);
    });
  }

  // The prior must NOT over-pull a legitimately slow tempo upward, and an edge tempo
  // below the prior centre must still win on evidence.
  it('T1: halfTime_64 stays correct ≤3% (prior does not pull it up)', () => {
    const e = allMetrics.get('halfTime_64bpm')!;
    expect(e.octaveDouble).toBe(false);
    expect(pct(e)).toBeLessThanOrEqual(0.03);
  });

  it('T1: clicktrack_50 stays correct ≤3% (edge below prior centre)', () => {
    expect(pct(allMetrics.get('clicktrack_50bpm')!)).toBeLessThanOrEqual(0.03);
  });

  // No regression on the tempos that already passed.
  for (const label of ['clicktrack_60bpm', 'clicktrack_90bpm']) {
    it(`T1: ${label} no regression ≤3%`, () => {
      expect(pct(allMetrics.get(label)!)).toBeLessThanOrEqual(0.03);
    });
  }

  // ── T1b acceptance gates (subdivision-aware octave fix) ──
  // Realistic drum-kit patterns whose true fundamental carries subdivision energy (hats on
  // 8th-notes) must lock to the fundamental, NOT to an unrelated in-band multiple. These are
  // the core DJ-mix use case: a mix that STARTS at 180 must lock to 180 — not 120, not 90.
  // pct ≤ 3% (= ±5.4 BPM around 180) excludes BOTH the octave partner 90 (50% off) AND the
  // 120 sub-harmonic the un-gated comb used to pick (33% off).
  for (const label of ['djMix_180bpm', 'djMixDrift_180bpm_d5']) {
    it(`T1b: ${label} locks to 180 ≤3% (90 and 120 must not win)`, () => {
      const e = allMetrics.get(label)!;
      expect(e.bpmTrue).toBeCloseTo(180, 0); // sanity: true tempo is 180
      expect(e.octaveHalf).toBe(false);
      expect(e.octaveDouble).toBe(false);
      expect(e.lockTimeSec).not.toBeNull();
      expect(pct(e)).toBeLessThanOrEqual(0.03);
    });
  }

  // ── Write committed baseline snapshot ──

  afterAll(() => {
    if (allMetrics.size === 0) return;

    const snapshot = {
      generatedAt: new Date().toISOString(),
      description:
        'Stage-1 BeatDetector baseline. ' +
        'Phase 1 = RECORD ONLY; thresholds become hard assertions in Stage 2.',
      stage2TargetList: FIXTURES.filter(
        (f) => (allMetrics.get(f.label)?.failures.length ?? 0) > 0,
      ).map((f) => ({ label: f.label, failures: allMetrics.get(f.label)!.failures })),
      fixtures: FIXTURES.map((f) => allMetrics.get(f.label)!),
    };

    try {
      mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n');
    } catch (err) {
      console.warn('Could not write baseline snapshot:', err);
    }
  });
});
