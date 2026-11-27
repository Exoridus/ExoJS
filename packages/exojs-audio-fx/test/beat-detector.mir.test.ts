import { writeFileSync } from 'node:fs';

import { adversarialFixtures, clicktrack, djMix, softOnset, swing, tempoRamp } from './fixtures/beat-fixtures';
import { computeMirMetrics, type MirMetrics } from './harness/beat-metrics';
import { runDetector } from './harness/beat-sandbox';

const fixtures = [
  clicktrack(120, 12),
  djMix(180, 12),
  tempoRamp(120, 150, 12),
  softOnset(90, 12),
  swing(120, 0.67, 12),
  ...adversarialFixtures(),
];
const measurements: Array<{ default: MirMetrics; lockedOnly: MirMetrics }> = [];

describe('synthetic MIR evaluation', () => {
  for (const fixture of fixtures) {
    it(`${fixture.label}: measures quality and provisional delivery without changing the locked path`, () => {
      const normal = runDetector(fixture.samples).messages;
      const lockedOnly = runDetector(fixture.samples, { processorOptions: { emitProvisionalBeats: false } }).messages;
      const metrics = computeMirMetrics(normal, fixture);
      const lockedMetrics = computeMirMetrics(lockedOnly, fixture);
      measurements.push({ default: metrics, lockedOnly: lockedMetrics });

      expect(normal.filter(message => message.type === 'state')).toEqual(lockedOnly.filter(message => message.type === 'state'));
      expect(normal.filter(message => message.type === 'beat' && message.status === 'locked')).toEqual(
        lockedOnly.filter(message => message.type === 'beat'),
      );
      expect(metrics.locked).toEqual(lockedMetrics.locked);
      expect(metrics.all.matchedCount + metrics.all.falsePositiveCount).toBe(metrics.all.emittedCount);
      expect(metrics.all.matchedCount + metrics.all.missCount).toBe(fixture.beatTimesSec.length);

      if (['clicktrack_120bpm', 'djMix_180bpm', 'softOnset_90bpm', 'delayed-clicks', 'quiet-clicks'].includes(fixture.label)) {
        expect(metrics.all.precision).toBeGreaterThan(0.9);
        expect(metrics.all.recall).toBeGreaterThan(0.8);
        expect(metrics.all.firstPostedSec).toBeLessThan(lockedMetrics.all.firstPostedSec!);
        expect(metrics.all.f1).toBeGreaterThan(lockedMetrics.all.f1!);
      }

      if (fixture.label === 'silence' || fixture.label === 'sustained-tone') {
        expect(metrics.all.emittedCount).toBe(0);
      }

      const f1Floors: Record<string, number> = {
        tempoRamp_120_to_150bpm: 0.45,
        swing_120bpm_67pct: 0.9,
        'missing-beats': 0.9,
      };

      if (fixture.label in f1Floors) {
        expect(metrics.all.f1).toBeGreaterThanOrEqual(f1Floors[fixture.label]);
      }

      if (fixture.label === 'offbeat-distractors') {
        expect(metrics.all.precision).toBeGreaterThanOrEqual(0.45);
        expect(metrics.all.falsePositiveCount).toBeLessThanOrEqual(24);
      }

      if (fixture.label === 'seeded-noise') {
        expect(metrics.all.falsePositiveCount).toBeLessThanOrEqual(10);
      }

      if (fixture.label === 'delayed-clicks' || fixture.label === 'quiet-clicks') {
        expect(metrics.all.firstPostedSec).not.toBeNull();
        const firstDeliveryUpperMs = (metrics.all.firstPostedSec! - fixture.beatTimesSec[0]) * 1000 + 128 / 48;
        expect(firstDeliveryUpperMs).toBeGreaterThanOrEqual(0);
        expect(firstDeliveryUpperMs).toBeLessThanOrEqual(75);
      }
    });
  }

  it('keeps matched timestamp quality under different render blocks and a late context start', () => {
    const fixture = clicktrack(120, 8);
    const regular = computeMirMetrics(runDetector(fixture.samples).messages, fixture);
    const shifted = computeMirMetrics(runDetector(fixture.samples, { blockSize: 256, startFrame: 48000 * 100 }).messages, fixture, {
      blockSize: 256,
      contextStartSec: 100,
    });
    expect(shifted.all.f1).toEqual(regular.all.f1);
    expect(shifted.all.timestampErrorMs?.meanAbs).toBeCloseTo(regular.all.timestampErrorMs!.meanAbs, 6);
    expect(Math.abs(shifted.all.postingLatencyMs!.p90Lower - regular.all.postingLatencyMs!.p90Lower)).toBeLessThanOrEqual(256 / 48);
  });

  afterAll(() => {
    console.table(
      measurements.map(({ default: result, lockedOnly }) => ({
        fixture: result.label,
        precision: result.all.precision?.toFixed(3) ?? null,
        recall: result.all.recall?.toFixed(3) ?? null,
        f1: result.all.f1?.toFixed(3) ?? null,
        falsePositives: result.all.falsePositiveCount,
        firstBeatSec: result.all.firstPostedSec?.toFixed(3) ?? null,
        lockedFirstSec: lockedOnly.all.firstPostedSec?.toFixed(3) ?? null,
        provisionalP90UpperMs: result.provisional.postingLatencyMs?.p90Upper.toFixed(1) ?? null,
        lockedP90UpperMs: result.locked.postingLatencyMs?.p90Upper.toFixed(1) ?? null,
        tempoAccuracy: result.tempo.accuracy?.toFixed(3) ?? null,
      })),
    );

    if (process.env.MIR_REPORT_PATH) {
      writeFileSync(
        process.env.MIR_REPORT_PATH,
        `${JSON.stringify({ schemaVersion: 1, sampleRate: 48000, blockSize: 128, toleranceMs: 70, measurements }, null, 2)}\n`,
      );
    }
  });
});
