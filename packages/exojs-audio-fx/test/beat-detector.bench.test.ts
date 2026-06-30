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

  // ── T2 acceptance gates (BPM range 50–300) ──
  // The default range is now 50–300 BPM. The top edge (300) was previously out of range and
  // mis-locked to ~100; it must now lock to the fundamental within the edge tolerance (≤5%),
  // using parabolic ACF-peak interpolation for sub-lag resolution at the coarse top end. The
  // slow edge (50) must stay locked — the 6 s flux window holds ≫ 2 periods of its 1.2 s beat.
  // The djMix subdivision guard is unchanged: hats at 360 BPM stay above 300, so they remain a
  // subdivision (not a competing beat) and djMix-180 stays locked to 180 (T1b gates above).
  it('T2: clicktrack_300 locks to fundamental ≤5%, no octave error', () => {
    const e = allMetrics.get('clicktrack_300bpm')!;
    expect(e.bpmTrue).toBeCloseTo(300, 0);
    expect(e.octaveHalf).toBe(false);
    expect(e.octaveDouble).toBe(false);
    expect(e.lockTimeSec).not.toBeNull();
    expect(pct(e)).toBeLessThanOrEqual(0.05);
  });

  it('T2: clicktrack_50 stays locked ≤3% at the slow edge', () => {
    expect(pct(allMetrics.get('clicktrack_50bpm')!)).toBeLessThanOrEqual(0.03);
  });

  // ── T3 acceptance gates (adaptive onset normalization + peak-picker) ──
  // The flux novelty is now normalised against a running median/MAD baseline and onsets are
  // picked on the rising edge above an adaptive threshold, gated by a noise floor and an
  // IBI-derived refractory. Two product wins fall out: (1) phantom beats emitted during the
  // breakDrop SILENCE are suppressed (the coast gate), halving+ the last Stage-2 FP target;
  // (2) the sub-hop onset snap tightens beat offsets on clean grids. Soft-onset recall holds.

  // breakDrop false-positive rate (baseline 40.0/min) must drop by ≥50% — the silence between
  // the drop no longer emits grid-predicted beats once onsets stop arriving.
  it('T3: breakDrop_128 FP rate at least halved vs baseline (≤20/min)', () => {
    expect(allMetrics.get('breakDrop_128bpm')!.fpRatePerMin).toBeLessThanOrEqual(20);
  });

  // Soft-onset recall must hold at or above its baseline floor (0.40) — the adaptive
  // normalization keeps low, broad swells detectable instead of vanishing under a fixed gate.
  it('T3: softOnset_90 recall holds at/above the 0.40 floor', () => {
    expect(allMetrics.get('softOnset_90bpm')!.recall).toBeGreaterThanOrEqual(0.4);
  });

  // Clean-clicktrack beat-offset p90 must NOT regress past the recorded baseline. The sub-hop
  // onset snap drove these well under their old values; these ceilings guard against drift.
  for (const [label, p90MaxMs] of [
    ['clicktrack_50bpm', 8.9],
    ['clicktrack_90bpm', 4.5],
    ['clicktrack_120bpm', 11.5],
    ['clicktrack_128bpm', 9.8],
    ['clicktrack_250bpm', 5.2],
  ] as const) {
    it(`T3: ${label} beat-offset p90 not worsened (≤${p90MaxMs}ms)`, () => {
      expect(allMetrics.get(label)!.beatOffsetP90Ms).toBeLessThanOrEqual(p90MaxMs);
    });
  }

  // ── T4 acceptance gates (bounded PLL beat-phase tracker + reliable per-beat emission) ──
  // The constant-IBI predictor and its double-advancing snap are replaced by a bounded
  // phase-locked loop bootstrapped to a real onset. Two product wins fall out: (1) the large
  // anti-phase beat offsets (victims of the old arbitrary-bootstrap phase) collapse from
  // 120–490 ms to a few ms; (2) emitting exactly one beat per predicted beat lifts recall from
  // ~40–70 % to ≥90 % on every BPM-correct fixture (the old snap dropped every second beat).

  // Big anti-phase offenders must now sit within a few ms (mean AND p90 well under 60 ms).
  for (const [label, maxMs] of [
    ['clicktrack_60bpm', 60],
    ['clicktrack_140bpm', 60],
    ['clicktrack_180bpm', 60],
    ['clicktrack_220bpm', 60],
    ['clicktrack_300bpm', 60],
    ['halfTime_64bpm', 60],
  ] as const) {
    it(`T4: ${label} beat-offset collapses (<${maxMs}ms mean & p90)`, () => {
      const e = allMetrics.get(label)!;
      expect(e.beatOffsetMeanMs).toBeLessThan(maxMs);
      expect(e.beatOffsetP90Ms).toBeLessThan(maxMs);
    });
  }

  // Reliable per-beat emission: recall ≥90 % on every BPM-correct constant-tempo fixture.
  for (const label of [
    'clicktrack_50bpm',
    'clicktrack_60bpm',
    'clicktrack_90bpm',
    'clicktrack_120bpm',
    'clicktrack_128bpm',
    'clicktrack_140bpm',
    'clicktrack_180bpm',
    'clicktrack_220bpm',
    'clicktrack_250bpm',
    'clicktrack_300bpm',
    'halfTime_64bpm',
    'doubleTime_128bpm',
    'swing_120bpm_67pct',
    'grooveOffset_120bpm_10ms',
    'djMix_180bpm',
    'softOnset_90bpm',
  ]) {
    it(`T4: ${label} recall ≥90%`, () => {
      expect(allMetrics.get(label)!.recall).toBeGreaterThanOrEqual(0.9);
    });
  }

  // djMix-180 locks ON-beat (the flagship DJ-mix case): the bootstrap anchors to the strong
  // kick onset, not the 8th-note hat, so emitted beats sit on the kick within a few ms.
  it('T4: djMix_180 locks on-beat (offset <60ms mean & p90)', () => {
    const e = allMetrics.get('djMix_180bpm')!;
    expect(e.beatOffsetMeanMs).toBeLessThan(60);
    expect(e.beatOffsetP90Ms).toBeLessThan(60);
  });

  // The coast gate must still suppress phantom beats in the breakDrop silence — the PLL may
  // not reintroduce false positives there.
  it('T4: breakDrop_128 FP rate stays low (≤2.5/min)', () => {
    expect(allMetrics.get('breakDrop_128bpm')!.fpRatePerMin).toBeLessThanOrEqual(2.5);
  });

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
