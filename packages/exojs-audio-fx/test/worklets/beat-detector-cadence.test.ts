import { clicktrack, SAMPLE_RATE } from '../fixtures/beat-fixtures';
import { type BeatMessage, runDetector } from '../harness/beat-sandbox';

describe('beat detector acquisition cadence', () => {
  it('keeps candidate-less ACF retries on the configured cadence', () => {
    const attempts: number[] = [];
    runDetector(new Float32Array(SAMPLE_RATE * 3), {
      prepare: processor => {
        const compute = processor['_computeACFAndCandidates'] as () => void;

        processor['_computeACFAndCandidates'] = function (this: Record<string, unknown>): void {
          attempts.push(this['_sampleCount'] as number);
          compute.call(this);
        };
      },
    });

    expect(attempts.length).toBeLessThanOrEqual(Math.ceil((3 * SAMPLE_RATE) / (512 * 15)) + 1);
    const shortIntervals = attempts.slice(1).filter((sample, i) => sample - attempts[i]! < 512 * 15);
    expect(shortIntervals.length).toBeLessThanOrEqual(1);
  });

  it('respects a long minimum warmup on the full-window acquisition path', () => {
    const { messages } = runDetector(clicktrack(120, 6).samples, { processorOptions: { minSettlingMs: 4000 } });
    const beats = messages.filter((message): message is BeatMessage => message.type === 'beat');

    expect(beats.length).toBeGreaterThan(0);
    expect(beats[0]!._audioTimeSec + 128 / SAMPLE_RATE).toBeGreaterThanOrEqual(4);
  });

  it.each([44_100, 48_000])('respects warmup beyond the flux-ring capacity at %i Hz', sampleRate => {
    const attempts: number[] = [];
    runDetector(new Float32Array(12 * sampleRate), {
      sampleRate,
      processorOptions: { minSettlingMs: 10_001 },
      prepare: processor => {
        const compute = processor['_computeACFAndCandidates'] as () => void;

        processor['_computeACFAndCandidates'] = function (this: Record<string, unknown>): void {
          attempts.push(this['_sampleCount'] as number);
          compute.call(this);
        };
      },
    });
    expect(attempts.length).toBeGreaterThan(2);
    expect(attempts[0]).toBe(Math.ceil((10.001 * sampleRate) / 512) * 512);

    for (let i = 1; i < attempts.length; i++) {
      expect(attempts[i]! - attempts[i - 1]!).toBe(15 * 512);
    }
  });
});
