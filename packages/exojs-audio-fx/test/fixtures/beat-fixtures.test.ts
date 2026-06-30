/**
 * Tests OF the synthetic fixtures — verifies the invariants the bench relies on:
 *   - beatTimesSec spacing equals 60/bpm within < 1 sample at 48 kHz
 *   - click count = floor(durationSec * bpm / 60) ± 1
 *   - peak amplitude <= 0.99 (no clipping)
 *   - re-generating a fixture twice yields bit-identical Float32Array
 */

import {
  breakDrop,
  clicktrack,
  CLICKTRACK_BPMS,
  doubleTime,
  grooveOffset,
  halfTime,
  SAMPLE_RATE,
  swing,
  tempoRamp,
} from './beat-fixtures';

const ONE_SAMPLE_SEC = 1 / SAMPLE_RATE;

// ── Utility ────────────────────────────────────────────────────────────────────

function peakAmplitude(buf: Float32Array): number {
  let peak = 0;
  for (const v of buf) {
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
  }
  return peak;
}

function arraysEqual(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ── Clicktrack invariants ──────────────────────────────────────────────────────

describe('clicktrack fixtures', () => {
  const DURATION = 15;

  for (const bpm of CLICKTRACK_BPMS) {
    describe(`clicktrack(${bpm} BPM)`, () => {
      const fixture = clicktrack(bpm, DURATION);
      const ibi = 60 / bpm;
      const expectedCount = Math.floor(DURATION * bpm / 60);

      it('beat count = floor(duration * bpm / 60) ± 1', () => {
        expect(fixture.beatTimesSec.length).toBeGreaterThanOrEqual(expectedCount - 1);
        expect(fixture.beatTimesSec.length).toBeLessThanOrEqual(expectedCount + 1);
      });

      it('consecutive beat spacing within < 1 sample of 60/bpm', () => {
        const times = fixture.beatTimesSec;
        for (let i = 1; i < times.length; i++) {
          const spacing = times[i] - times[i - 1];
          expect(Math.abs(spacing - ibi)).toBeLessThan(ONE_SAMPLE_SEC);
        }
      });

      it('peak amplitude <= 0.99', () => {
        expect(peakAmplitude(fixture.samples)).toBeLessThanOrEqual(0.99 + 1e-6);
      });

      it('peak amplitude > 0 (not silence)', () => {
        expect(peakAmplitude(fixture.samples)).toBeGreaterThan(0);
      });

      it('bit-identical on re-generation', () => {
        const f2 = clicktrack(bpm, DURATION);
        expect(arraysEqual(fixture.samples, f2.samples)).toBe(true);
        expect(fixture.beatTimesSec).toEqual(f2.beatTimesSec);
      });

      it('bpm field matches the requested BPM', () => {
        expect(fixture.bpm).toBe(bpm);
      });
    });
  }
});

// ── halfTime / doubleTime ──────────────────────────────────────────────────────

describe('halfTime fixture', () => {
  const f = halfTime(128, 15);

  it('ground-truth bpm = 64', () => {
    expect(f.bpm).toBe(64);
  });

  it('octavePartnerBpm = 128', () => {
    expect(f.octavePartnerBpm).toBe(128);
  });

  it('click count roughly = floor(15 * 64 / 60)', () => {
    const expected = Math.floor(15 * 64 / 60);
    expect(f.beatTimesSec.length).toBeGreaterThanOrEqual(expected - 1);
    expect(f.beatTimesSec.length).toBeLessThanOrEqual(expected + 1);
  });

  it('peak <= 0.99', () => {
    expect(peakAmplitude(f.samples)).toBeLessThanOrEqual(0.99 + 1e-6);
  });

  it('bit-identical on re-generation', () => {
    const f2 = halfTime(128, 15);
    expect(arraysEqual(f.samples, f2.samples)).toBe(true);
  });
});

describe('doubleTime fixture', () => {
  const f = doubleTime(64, 15);

  it('ground-truth bpm = 128', () => {
    expect(f.bpm).toBe(128);
  });

  it('octavePartnerBpm = 64', () => {
    expect(f.octavePartnerBpm).toBe(64);
  });

  it('click count roughly = floor(15 * 128 / 60)', () => {
    const expected = Math.floor(15 * 128 / 60);
    expect(f.beatTimesSec.length).toBeGreaterThanOrEqual(expected - 1);
    expect(f.beatTimesSec.length).toBeLessThanOrEqual(expected + 1);
  });

  it('peak <= 0.99', () => {
    expect(peakAmplitude(f.samples)).toBeLessThanOrEqual(0.99 + 1e-6);
  });

  it('bit-identical on re-generation', () => {
    const f2 = doubleTime(64, 15);
    expect(arraysEqual(f.samples, f2.samples)).toBe(true);
  });
});

// ── tempoRamp ─────────────────────────────────────────────────────────────────

describe('tempoRamp fixture', () => {
  const f = tempoRamp(120, 135, 20);

  it('bpm is a function', () => {
    expect(typeof f.bpm).toBe('function');
  });

  it('bpm(0) == 120', () => {
    expect((f.bpm as (t: number) => number)(0)).toBeCloseTo(120, 5);
  });

  it('bpm(20) == 135', () => {
    expect((f.bpm as (t: number) => number)(20)).toBeCloseTo(135, 5);
  });

  it('has > 40 beat times for a 20-second ramp', () => {
    // At 120 BPM: 20s = 40 beats; at 135: ~45. Expect something in range.
    expect(f.beatTimesSec.length).toBeGreaterThan(38);
    expect(f.beatTimesSec.length).toBeLessThan(50);
  });

  it('beat times are monotonically increasing', () => {
    for (let i = 1; i < f.beatTimesSec.length; i++) {
      expect(f.beatTimesSec[i]).toBeGreaterThan(f.beatTimesSec[i - 1]);
    }
  });

  it('peak <= 0.99', () => {
    expect(peakAmplitude(f.samples)).toBeLessThanOrEqual(0.99 + 1e-6);
  });

  it('bit-identical on re-generation', () => {
    const f2 = tempoRamp(120, 135, 20);
    expect(arraysEqual(f.samples, f2.samples)).toBe(true);
  });
});

// ── breakDrop ─────────────────────────────────────────────────────────────────

describe('breakDrop fixture', () => {
  const f = breakDrop(128, 24);

  it('bpm = 128', () => {
    expect(f.bpm).toBe(128);
  });

  it('has a gap in beat times corresponding to the break', () => {
    // At 128 BPM: bar = 4 * (60/128) = 1.875s
    // Groove: 0 - 7.5s, break: 7.5 - 15s, drop: 15s +
    const grooveEnd = 4 * 4 * (60 / 128); // ~7.5s
    const breakEnd = 8 * 4 * (60 / 128);  // ~15.0s

    const inBreak = f.beatTimesSec.filter(t => t > grooveEnd + 0.1 && t < breakEnd - 0.1);
    expect(inBreak.length).toBe(0);

    const inGroove = f.beatTimesSec.filter(t => t <= grooveEnd);
    const inDrop = f.beatTimesSec.filter(t => t >= breakEnd);
    expect(inGroove.length).toBeGreaterThan(0);
    expect(inDrop.length).toBeGreaterThan(0);
  });

  it('peak <= 0.99', () => {
    expect(peakAmplitude(f.samples)).toBeLessThanOrEqual(0.99 + 1e-6);
  });

  it('bit-identical on re-generation', () => {
    const f2 = breakDrop(128, 24);
    expect(arraysEqual(f.samples, f2.samples)).toBe(true);
  });
});

// ── swing ─────────────────────────────────────────────────────────────────────

describe('swing fixture', () => {
  const f = swing(120, 0.67, 15);

  it('bpm = 120', () => {
    expect(f.bpm).toBe(120);
  });

  it('ground truth beat count = floor(15 * 120 / 60)', () => {
    const expected = Math.floor(15 * 120 / 60);
    expect(f.beatTimesSec.length).toBe(expected);
  });

  it('main beat spacing is exactly 60/120 = 0.5s', () => {
    const ibi = 60 / 120;
    for (let i = 1; i < f.beatTimesSec.length; i++) {
      expect(Math.abs(f.beatTimesSec[i] - f.beatTimesSec[i - 1] - ibi)).toBeLessThan(ONE_SAMPLE_SEC);
    }
  });

  it('peak <= 0.99', () => {
    expect(peakAmplitude(f.samples)).toBeLessThanOrEqual(0.99 + 1e-6);
  });

  it('bit-identical on re-generation', () => {
    const f2 = swing(120, 0.67, 15);
    expect(arraysEqual(f.samples, f2.samples)).toBe(true);
  });
});

// ── grooveOffset ──────────────────────────────────────────────────────────────

describe('grooveOffset fixture', () => {
  const f = grooveOffset(120, 10, 15);

  it('bpm = 120', () => {
    expect(f.bpm).toBe(120);
  });

  it('beat count = floor(15 * 120 / 60)', () => {
    const expected = Math.floor(15 * 120 / 60);
    expect(f.beatTimesSec.length).toBe(expected);
  });

  it('beat times stay within ±jitterMs of the grid', () => {
    const ibi = 60 / 120;
    const jitterSec = 10 * 0.001;
    for (let i = 0; i < f.beatTimesSec.length; i++) {
      const grid = i * ibi;
      expect(Math.abs(f.beatTimesSec[i] - grid)).toBeLessThanOrEqual(jitterSec + ONE_SAMPLE_SEC);
    }
  });

  it('peak <= 0.99', () => {
    expect(peakAmplitude(f.samples)).toBeLessThanOrEqual(0.99 + 1e-6);
  });

  it('bit-identical on re-generation', () => {
    const f2 = grooveOffset(120, 10, 15);
    expect(arraysEqual(f.samples, f2.samples)).toBe(true);
  });
});
