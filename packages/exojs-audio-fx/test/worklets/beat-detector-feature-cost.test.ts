import { clicktrack } from '../fixtures/beat-fixtures';
import { runDetector } from '../harness/beat-sandbox';

describe('meter feature demand', () => {
  it('avoids new meter observations and fitting for manual and fixed counting', () => {
    const audio = clicktrack(120, 6).samples;
    const automatic = runDetector(audio)
      .messages.filter(message => message.type === 'beat')
      .map(beat => beat.audioTime);

    for (const processorOptions of [{ enableTimeSignatureDetection: false }, { manualMeter: { cyclePulses: 3, phasePulses: 0 } }]) {
      let observe: ReturnType<typeof vi.spyOn>;
      let update: ReturnType<typeof vi.spyOn>;
      const { messages } = runDetector(audio, {
        processorOptions,
        prepare: processor => {
          observe = vi.spyOn(processor['_onsets'] as { observePower: () => void }, 'observePower');
          update = vi.spyOn(processor['_meter'] as { update: () => void }, 'update');
        },
      });
      expect(observe!).not.toHaveBeenCalled();
      expect(update!).not.toHaveBeenCalled();
      expect(messages.filter(message => message.type === 'beat').map(beat => beat.audioTime)).toEqual(automatic);
    }
  });

  it.each([44_100, 48_000])('keeps regular state transport at or below 20 Hz at %i Hz', sampleRate => {
    const { messages } = runDetector(new Float32Array(2 * sampleRate), { sampleRate });
    const times = messages.filter(message => message.type === 'state').map(state => state.analysisTime);
    expect(times.length).toBeGreaterThan(20);

    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(0.05 - 1e-9);
    }
  });
});
