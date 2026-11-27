import { adversarialFixtures, SAMPLE_RATE } from './beat-fixtures';

describe('adversarial beat fixtures', () => {
  it('reproduces samples and annotations without clipping', () => {
    const first = adversarialFixtures();
    const second = adversarialFixtures();
    expect(first.map(f => f.label)).toEqual(second.map(f => f.label));

    for (let i = 0; i < first.length; i++) {
      expect(Buffer.from(first[i].samples.buffer).equals(Buffer.from(second[i].samples.buffer))).toBe(true);
      expect(first[i].beatTimesSec).toEqual(second[i].beatTimesSec);
      expect(first[i].samples.every(value => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
      expect(first[i].beatTimesSec.every(time => time >= 0 && time < first[i].samples.length / SAMPLE_RATE)).toBe(true);
    }
  });

  it('keeps delayed and attenuated onsets aligned without renormalizing gain', () => {
    const fixtures = adversarialFixtures();
    const delayed = fixtures.find(f => f.label === 'delayed-clicks')!;
    const quiet = fixtures.find(f => f.label === 'quiet-clicks')!;
    expect(delayed.beatTimesSec[0]).toBe(1.137);
    expect(delayed.samples.subarray(0, Math.round(1.137 * SAMPLE_RATE)).every(value => value === 0)).toBe(true);
    expect(quiet.beatTimesSec).toEqual(delayed.beatTimesSec);

    for (let i = 0; i < quiet.samples.length; i++) {
      if (delayed.samples[i] !== 0) {
        expect(quiet.samples[i] / delayed.samples[i]).toBeCloseTo(0.01, 6);
        break;
      }
    }
  });

  it('excludes silent gap and non-beat controls from beat annotations', () => {
    const fixtures = adversarialFixtures();
    const gap = fixtures.find(f => f.label === 'missing-beats')!;
    expect(gap.beatTimesSec.some(time => time >= 4 && time < 6)).toBe(false);
    expect(gap.samples.subarray(4 * SAMPLE_RATE, 6 * SAMPLE_RATE).every(value => value === 0)).toBe(true);

    for (const label of ['silence', 'sustained-tone', 'seeded-noise']) {
      const control = fixtures.find(f => f.label === label)!;
      expect(control.beatTimesSec).toEqual([]);
      expect(control.bpm).toBe(0);
    }
  });
});
