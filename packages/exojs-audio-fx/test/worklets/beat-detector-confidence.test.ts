import { runDetector } from '../harness/beat-sandbox';

describe('beat detector pulse confidence', () => {
  it('does not depend on the meter posterior while preserving legacy confidence', () => {
    runDetector(new Float32Array(0), {
      prepare: value => {
        value['_candidates'] = [
          { bpm: 120, score: 0.5 },
          { bpm: 90, score: 0.25 },
        ];
        (value['_ibiHistory'] as Float32Array).fill(24_000);
        const update = value['_updateConfidence'] as () => void;
        update.call(value);
        const pulse = value['_beatConfidence'];
        const legacy = value['_confidence'];
        expect(pulse).toBeTypeOf('number');
        (value['_legacyBars'] as { posterior4: Float32Array }).posterior4.set([1, 0, 0, 0]);
        update.call(value);
        expect(value['_beatConfidence']).toBe(pulse);
        expect(value['_confidence']).not.toBe(legacy);
      },
    });
  });

  it('reports no pulse confidence without tempo candidates', () => {
    runDetector(new Float32Array(0), {
      prepare: value => {
        (value['_updateConfidence'] as () => void).call(value);
        expect(value['_beatConfidence']).toBe(0);
      },
    });
  });
});
