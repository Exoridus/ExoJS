import { runDetector } from '../harness/beat-sandbox';

describe('beat detector matched onset evidence', () => {
  it('retains the selected onset raw flux and normalized strength after another hop', () => {
    let matchedSample = 0;
    const { messages } = runDetector(new Float32Array(0), {
      prepare: processor => {
        const detect = processor['_detectOnset'] as (flux: number) => void;
        const nearest = processor['_nearestOnset'] as (sample: number, window: number) => number;

        for (let i = 0; i < 8; i++) {
          processor['_sampleCount'] = i * 64;
          detect.call(processor, 0);
        }

        processor['_sampleCount'] = 1024;
        detect.call(processor, 7);
        processor['_sampleCount'] = 1536;
        detect.call(processor, 0);

        const sample = nearest.call(processor, 800, 512);
        matchedSample = sample;
        expect(sample).toBeGreaterThan(512);
        const evidence = processor['_matchedOnset'] as { sample: number; rawFlux: number; strength: number; id: number };
        expect(evidence).toMatchObject({ sample, rawFlux: 7, id: 1 });
        expect(evidence.strength).toBeGreaterThan(3);
        expect(evidence.strength).not.toBe(evidence.rawFlux);

        processor['_sampleCount'] = 24_000;
        processor['_bestBpm'] = 120;
        processor['_ibiSamples'] = 24_000;
        (processor['_emitBeat'] as (sample: number, flux: number) => void).call(processor, sample, 0);
        expect(processor['_beatEvidence']).toMatchObject({
          onsetId: 1,
          onsetSample: sample,
          rawFlux: 7,
          kind: 'matched',
          phaseResidualSamples: 0,
        });

        nearest.call(processor, 20_000, 100);
        expect(evidence.id).toBe(0);
        (processor['_emitBeat'] as (sample: number, flux: number) => void).call(processor, 24_000, 0);
        expect(processor['_beatEvidence']).toMatchObject({
          onsetId: 0,
          rawFlux: null,
          onsetSample: null,
          kind: 'freeRun',
          phaseResidualSamples: null,
        });
      },
    });
    const beats = messages.filter(message => message.type === 'beat');
    expect(beats[0]).toMatchObject({ energy: 0, onsetEnergy: 7, onsetAudioTime: matchedSample / 48_000 });
    expect(beats[1]).toMatchObject({ onsetEnergy: null, onsetAudioTime: null });
  });

  it('preserves bootstrap identity and sample precision across ring wrap', () => {
    runDetector(new Float32Array(0), {
      prepare: processor => {
        const detect = processor['_detectOnset'] as (flux: number) => void;
        const bootstrap = processor['_bootstrapOnset'] as (age: number) => number;
        const origin = 2 ** 30;

        for (let i = 0; i < 20; i++) {
          for (let j = 0; j < 8; j++) {
            processor['_sampleCount'] = origin + i * 10_000 + j * 64;
            detect.call(processor, 0);
          }

          processor['_sampleCount'] = origin + i * 10_000 + 512;
          detect.call(processor, i + 1);
        }

        const sample = bootstrap.call(processor, 1000);
        const evidence = processor['_matchedOnset'] as { sample: number; rawFlux: number; id: number };
        expect(evidence).toMatchObject({ sample, rawFlux: 20, id: 20 });
        expect(sample).toBeGreaterThan(origin + 190_000);
        expect(sample).not.toBe(Math.fround(sample));
      },
    });
  });
});
