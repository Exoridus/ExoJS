import { MeterEvidence } from '../../src/worklets/MeterEvidence';
import { OnsetEvidenceRing } from '../../src/worklets/OnsetEvidenceRing';

describe('finalized onset accent', () => {
  it('uses complete attack power without changing raw crossing novelty', () => {
    const ring = new OnsetEvidenceRing();
    ring.push(100, 0.2, 8);
    ring.observePower(100, 0.01, 2048);
    ring.observePower(612, 0.09, 2048);
    expect(ring.accent(1, 1000, 2048)).toBeNull();
    ring.observePower(2200, 0, 2048);
    expect(ring.accent(1, 2200, 2048)).toBe(0.09);
    ring.nearest(100, 1);
    expect(ring.selected).toMatchObject({ rawFlux: 0.2, strength: 8 });
    ring.reset();
    expect(ring.accent(1, 3000, 2048)).toBeNull();
  });
});

describe('compact meter evidence', () => {
  const period = 24_000;
  const window = 2048;

  const feed = (meter: MeterEvidence, ring: OnsetEvidenceRing, index: number, power: number | null): void => {
    const sample = index * period;
    let id = 0;

    if (power !== null) {
      ring.push(sample, 1, 8);
      ring.nearest(sample, 1);
      id = ring.selected.id;
      ring.observePower(sample + 512, power, window);
    }

    meter.addBeat(sample, period, id);
    meter.update(sample + window, ring, window);
  };

  it.each([3, 4] as const)('recovers every starting phase of a %i-pulse cycle without a gain bias', cycle => {
    for (let offset = 0; offset < cycle; offset++) {
      for (const gain of [0.0001, 1, 100]) {
        const meter = new MeterEvidence();
        const ring = new OnsetEvidenceRing();
        let firstCorrect = -1;
        let stableRun = 0;

        for (let i = 0; i < 48; i++) {
          feed(meter, ring, i, gain * ((i + offset) % cycle === 0 ? 9 : 1));
          const correct = meter.cyclePulses === cycle && meter.phasePulses === (i + offset) % cycle;

          if (correct && firstCorrect < 0) {
            firstCorrect = i;
          }

          stableRun = correct ? stableRun + 1 : 0;
        }

        expect(meter.cyclePulses).toBe(cycle);
        expect(meter.phasePulses).toBe((47 + offset) % cycle);
        expect(firstCorrect).toBeGreaterThanOrEqual(0);
        expect(firstCorrect).toBeLessThan(4 * cycle);
        expect(stableRun).toBeGreaterThanOrEqual(2 * cycle);
      }
    }
  });

  it('abstains on equal accents, missing observations and a two-pulse alias', () => {
    for (const pattern of [[1], [9, 1]]) {
      const meter = new MeterEvidence();
      const ring = new OnsetEvidenceRing();

      for (let i = 0; i < 64; i++) {
        feed(meter, ring, i, i % 11 === 0 ? null : pattern[i % pattern.length]!);
      }

      expect(meter.cyclePulses).toBe(0);
    }
  });

  it('does not infer phase from an unfinished attack and expires without evidence', () => {
    const meter = new MeterEvidence();
    const ring = new OnsetEvidenceRing();

    for (let i = 0; i < 24; i++) {
      feed(meter, ring, i, i % 3 === 0 ? 9 : 1);
    }

    expect(meter.cyclePulses).toBe(3);
    meter.update(30 * period, ring, window);
    expect(meter.cyclePulses).toBe(0);
    expect(meter.validUntilSample).toBe(0);
    meter.reset();
    ring.reset();
    ring.push(40 * period, 1, 8);
    ring.nearest(40 * period, 1);
    meter.addBeat(40 * period, period, ring.selected.id);
    meter.update(40 * period + 512, ring, window);
    expect(meter.cyclePulses).toBe(0);
  });

  it('reacquires after a four-to-three switch without retaining a stale phase', () => {
    const meter = new MeterEvidence();
    const ring = new OnsetEvidenceRing();

    for (let i = 0; i < 48; i++) {
      feed(meter, ring, i, i % 4 === 0 ? 9 : 1);
    }

    expect(meter.cyclePulses).toBe(4);

    for (let i = 48; i < 96; i++) {
      feed(meter, ring, i, i % 3 === 0 ? 9 : 1);
    }

    expect(meter.cyclePulses).toBe(3);
    expect(meter.phasePulses).toBe(2);
  });

  it('retains cycle alignment through missing onsets and skipped grid pulses', () => {
    const meter = new MeterEvidence();
    const ring = new OnsetEvidenceRing();

    for (let i = 0; i < 64; i++) {
      if (i % 13 !== 7) {
        feed(meter, ring, i, i % 11 === 5 ? null : i % 4 === 0 ? 9 : 1);
      }
    }

    expect(meter.cyclePulses).toBe(4);
    expect(meter.phasePulses).toBe(3);
  });

  it.each([3, 4])('handles structured missing positions without invalid scores for a %i-pulse input', cycle => {
    const meter = new MeterEvidence();
    const ring = new OnsetEvidenceRing();

    for (let i = 0; i < 64; i++) {
      feed(meter, ring, i, i % 2 === 0 ? (i % cycle === 0 ? 9 : 1) : null);
    }

    expect([...meter.candidateScores].every(Number.isFinite)).toBe(true);
    expect(meter.candidateScores[1]).toBe(0);
    // All three positions have support; the four-position model has two unseen positions.
    expect(meter.cyclePulses).toBe(cycle === 3 ? 3 : 0);

    if (cycle === 3) {
      expect(meter.phasePulses).toBe(0);
    }
  });

  it('keeps slow-cycle phase through the next pulse and expires after the finalization deadline', () => {
    const meter = new MeterEvidence();
    const ring = new OnsetEvidenceRing();
    const slowPeriod = 57_600;

    for (let i = 0; i < 24; i++) {
      const sample = i * slowPeriod;
      meter.update(sample - 512, ring, window);

      if (i > 15) {
        expect(meter.cyclePulses).toBe(3);
      }

      ring.push(sample, 1, 8);
      ring.nearest(sample, 1);
      ring.observePower(sample + 512, i % 3 === 0 ? 9 : 1, window);
      meter.addBeat(sample, slowPeriod, ring.selected.id);
      meter.update(sample + window, ring, window);
    }

    expect(meter.cyclePulses).toBe(3);
    expect(meter.phasePulses).toBe(2);
    meter.update(25 * slowPeriod + window - 1, ring, window);
    expect(meter.cyclePulses).toBe(3);
    meter.update(25 * slowPeriod + window, ring, window);
    expect(meter.cyclePulses).toBe(0);
  });

  it('does not turn random accent noise into a confident cycle', () => {
    const meter = new MeterEvidence();
    const ring = new OnsetEvidenceRing();
    let seed = 0x7351;
    let known = 0;

    for (let i = 0; i < 200; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      feed(meter, ring, i, 0.5 + seed / 2 ** 32);
      known += meter.cyclePulses > 0 ? 1 : 0;
    }

    expect(known / 200).toBeLessThanOrEqual(0.05);
  });

  it('recognizes a repeating cycle without inventing an anchor between equally strong positions', () => {
    const meter = new MeterEvidence();
    const ring = new OnsetEvidenceRing();

    for (let i = 0; i < 48; i++) {
      feed(meter, ring, i, i % 3 === 2 ? 1 : 9);
    }

    expect(meter.cyclePulses).toBe(3);
    expect(meter.phasePulses).toBeNull();
    expect(meter.reason).toBe('ambiguousPhase');
    expect(meter.candidateScores[0]).toBeGreaterThan(0.5);
  });

  it('uses aligned band attacks when total power is uniform and never substitutes a later onset', () => {
    const meter = new MeterEvidence();
    const ring = new OnsetEvidenceRing();
    const bands = new Float64Array(3);
    const observed = new Float64Array(4);

    for (let i = 0; i < 48; i++) {
      const sample = i * period;
      bands.set(i % 4 === 0 ? [9, 1, 1] : [1, 1, 1]);
      ring.push(sample, 1, 8);
      ring.nearest(sample, 1);
      const id = ring.selected.id;
      ring.observePower(sample + 512, 1, window, bands);
      expect(ring.accentFeatures(id, sample + 512, window, observed)).toBe(false);
      meter.addBeat(sample, period, id);
      meter.update(sample + window, ring, window);
      expect(ring.accentFeatures(id, sample + window, window, observed)).toBe(true);
      expect([...observed]).toEqual([1, ...bands]);
    }

    expect(meter.cyclePulses).toBe(4);
    expect(meter.phasePulses).toBe(3);
    ring.reset();
    expect(ring.accentFeatures(48, 50 * period, window, observed)).toBe(false);
  });
});
