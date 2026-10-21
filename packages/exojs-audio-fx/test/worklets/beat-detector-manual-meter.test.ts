import type { MeterEstimate } from '../../src/meterTypes';
import { runDetector } from '../harness/beat-sandbox';

describe('manual worklet schedules', () => {
  it.each([null, 0, 10])('keeps manual phase %s separate from automatic evidence and the eight-beat horizon', phase => {
    runDetector(new Float32Array(0), {
      processorOptions: { manualMeter: { cyclePulses: 11, phasePulses: phase, denominator: 8 } },
      prepare: processor => {
        const meter = processor['_meter'] as { addBeat: () => void; update: () => void };
        const fit = vi.spyOn(meter, 'update');
        const add = vi.spyOn(meter, 'addBeat');
        processor['_bestBpm'] = 120;
        processor['_ibiSamples'] = 24_000;
        processor['_locked'] = true;
        const emit = processor['_emitBeat'] as (sample: number, flux: number) => void;
        const state = processor['_sendStateMessage'] as () => void;
        const port = processor['port'] as { postMessage: (message: unknown) => void };
        const post = vi.spyOn(port, 'postMessage');

        for (let index = 0; index < 24; index++) {
          const sample = 48_000 + index * 24_000;
          processor['_sampleCount'] = sample;
          processor['_lastOnsetSample'] = sample;
          emit.call(processor, sample, 0);
          state.call(processor);
          const snapshot = post.mock.calls.at(-1)![0] as {
            meterEstimate: MeterEstimate;
            lookahead: Array<{ isDownbeat: boolean }>;
            nextDownbeatTime: number;
          };
          expect(snapshot.meterEstimate.origin).toBe('manual');
          expect(snapshot.meterEstimate.selected).toMatchObject({
            cyclePulses: 11,
            denominator: 8,
            phasePulses: phase === null ? null : (phase + index) % 11,
          });
          const expectedDistance = phase === null ? Infinity : 11 - ((phase + index) % 11);
          expect(snapshot.lookahead.filter(beat => beat.isDownbeat)).toHaveLength(expectedDistance <= 8 ? 1 : 0);

          if (expectedDistance > 8) {
            expect(snapshot.nextDownbeatTime).toBe(0);
          }
        }

        expect(fit).not.toHaveBeenCalled();
        expect(add).not.toHaveBeenCalled();
        const receive = (port as unknown as { onmessage: (event: { data: unknown }) => void }).onmessage;
        receive({ data: { type: 'reset', epoch: 1 } });
        expect(processor['_conventionPhase']).toBe(phase ?? 0);
        expect(processor['_manualMeter']).toMatchObject({ cyclePulses: 11, phasePulses: phase });
        receive({ data: { type: 'reset', epoch: 2, manualMeter: { cyclePulses: 3, phasePulses: 1 } } });
        expect(processor['_conventionPhase']).toBe(1);
        receive({ data: { type: 'reset', epoch: 1, manualMeter: null } });
        expect(processor['_manualMeter']).toMatchObject({ cyclePulses: 3, phasePulses: 1 });
      },
    });
  });
});
