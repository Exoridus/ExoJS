import { computeTempoCandidates, type TempoCandidateResult } from '../../src/dsp/tempogram';
import { TempoCandidateScorer } from '../../src/worklets/TempoCandidateScorer';
import { runDetector } from '../harness/beat-sandbox';

interface CandidateProcessor {
  _fluxWindow: Float32Array;
  _fluxCount: number;
  _fluxWritePos: number;
  _minLag: number;
  _maxLag: number;
  _minBpm: number;
  _maxBpm: number;
  _hopSize: number;
  _sampleRate: number;
  _candidates: TempoCandidateResult[];
  _fastCandidates: TempoCandidateResult[];
  _candidateCount?: number;
  _computeACFAndCandidates(): void;
  _resetAnalysis(epoch: number): void;
}

const fillNovelty = (processor: CandidateProcessor, seed: number): void => {
  let state = seed;

  for (let i = 0; i < processor._fluxWindow.length; i++) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    processor._fluxWindow[i] = (state / 0x1_0000_0000) * 0.3 + (i % (17 + (seed % 42)) === 0 ? 1 : 0);
  }

  processor._fluxCount = processor._fluxWindow.length;
  processor._fluxWritePos = (seed * 29) % processor._fluxWindow.length;
};

describe('beat detector candidate storage', () => {
  it('reuses the candidate container and slots across ACF updates', () => {
    runDetector(new Float32Array(0), {
      prepare: value => {
        const processor = value as unknown as CandidateProcessor;
        fillNovelty(processor, 3);
        processor._computeACFAndCandidates();
        const candidates = processor._candidates;
        const slots = candidates.slice();
        const fastCandidates = processor._fastCandidates;
        const fastSlots = fastCandidates.slice();
        expect(slots).toHaveLength(3);

        for (let seed = 4; seed < 12; seed++) {
          fillNovelty(processor, seed);
          processor._computeACFAndCandidates();
          expect(processor._candidates).toBe(candidates);
          expect(processor._fastCandidates).toBe(fastCandidates);

          for (let i = 0; i < slots.length; i++) {
            expect(processor._candidates[i]).toBe(slots[i]);
            expect(processor._fastCandidates[i]).toBe(fastSlots[i]);
          }
        }
      },
    });
  });

  it.each([
    { raw: [0.01, 0.02], order: [1, 5, 3] },
    { raw: [0.02, 0.02], order: [1, 3, 5] },
  ])('retains canonical raw-peak and lag order for zero final-score ties: $order', ({ raw, order }) => {
    const scorer = new TempoCandidateScorer(48_000, 512, 1, 10_000);
    const candidates = Array.from({ length: 3 }, () => ({ bpm: 0, score: 0, lag: 0 }));
    const acf = new Float32Array([1, 0, raw[0]!, 0, raw[1]!, 0]);
    expect(scorer.scoreInto(acf, 1, candidates)).toBe(3);
    expect(candidates.map(candidate => candidate.lag)).toEqual(order);
    expect(candidates.slice(1).map(candidate => candidate.score)).toEqual([0, 0]);
  });

  it('keeps published candidate snapshots unchanged by subsequent pooled updates', () => {
    runDetector(new Float32Array(0), {
      prepare: value => {
        const processor = value as unknown as CandidateProcessor;
        fillNovelty(processor, 3);
        processor._computeACFAndCandidates();
        value['_locked'] = true;
        value['_predictionValidUntilSample'] = 48_000;
        let snapshot: Array<{ bpm: number; score: number }> = [];

        (value['port'] as { postMessage: (message: { type: string; tempoCandidates: typeof snapshot }) => void }).postMessage = message => {
          if (message.type === 'state') {
            snapshot = message.tempoCandidates;
          }
        };

        (value['_sendStateMessage'] as () => void).call(value);
        const expected = snapshot.map(candidate => ({ ...candidate }));
        expect(snapshot).toHaveLength(3);
        fillNovelty(processor, 7);
        processor._computeACFAndCandidates();
        expect(snapshot).toEqual(expected);
        expect(processor._candidates[0]!.bpm).not.toBe(snapshot[0]!.bpm);
      },
    });
  });

  it('retains allocated storage while reset and silence clear active candidates', () => {
    runDetector(new Float32Array(0), {
      prepare: value => {
        const processor = value as unknown as CandidateProcessor;
        fillNovelty(processor, 7);
        processor._computeACFAndCandidates();
        const candidates = processor._candidates;
        const slots = candidates.slice();
        processor._resetAnalysis(1);
        expect(processor._candidates).toBe(candidates);
        processor._computeACFAndCandidates();
        expect(processor._candidateCount ?? processor._candidates.length).toBe(0);

        for (let i = 0; i < slots.length; i++) {
          expect(processor._candidates[i]).toBe(slots[i]);
        }
      },
    });
  });

  it('preserves canonical candidates across ring wraps, short histories and empty input', () => {
    runDetector(new Float32Array(0), {
      prepare: value => {
        const processor = value as unknown as CandidateProcessor;

        for (let seed = 1; seed <= 80; seed++) {
          fillNovelty(processor, seed);
          processor._fluxCount = seed % 5 === 0 ? Math.min(seed, processor._fluxWindow.length) : processor._fluxWindow.length;

          if (seed % 8 === 0) {
            processor._fluxWindow.fill(0);
          }

          const buffer = processor._fluxWindow;
          const linear = Float32Array.from({ length: processor._fluxCount }, (_, i) => {
            const index = (processor._fluxWritePos - processor._fluxCount + i + buffer.length) % buffer.length;

            return buffer[index]!;
          });
          const expected = computeTempoCandidates(linear, processor._minLag, processor._maxLag, processor._hopSize, processor._sampleRate, {
            minBpm: processor._minBpm,
            maxBpm: processor._maxBpm,
          });
          processor._computeACFAndCandidates();
          const actual = processor._candidates.slice(0, processor._candidateCount ?? processor._candidates.length);
          expect(actual).toHaveLength(expected.length);

          for (let i = 0; i < expected.length; i++) {
            expect(actual[i]!.lag).toBe(expected[i]!.lag);
            expect(actual[i]!.bpm).toBeCloseTo(expected[i]!.bpm, 12);
            expect(actual[i]!.score).toBeCloseTo(expected[i]!.score, 14);
          }
        }
      },
    });
  });
});
