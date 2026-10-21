import { getAudioContext } from '@codexo/exojs';

import { BeatDetector } from '../src/BeatDetector';

describe('manual meter ownership', () => {
  it('snapshots configuration, validates before mutation and resets the epoch on changes', async () => {
    const context = getAudioContext();
    (context as unknown as { audioWorklet: { addModule: ReturnType<typeof vi.fn> } }).audioWorklet.addModule = vi
      .fn()
      .mockResolvedValue(undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:manual-meter');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const value = { cyclePulses: 11, phasePulses: 0, denominator: 8 };
    const detector = new BeatDetector({ manualMeter: value });

    try {
      await detector.ready;
      value.cyclePulses = 3;
      expect(detector.manualMeter).toEqual({ cyclePulses: 11, phasePulses: 0, denominator: 8 });
      expect(Object.isFrozen(detector.manualMeter)).toBe(true);
      expect(detector.meterEstimate).toMatchObject({ selected: null, reason: 'acquiring', origin: 'manual' });
      const port = (detector as unknown as { _workletNode: AudioWorkletNode })._workletNode.port;
      const post = vi.spyOn(port, 'postMessage');

      for (const invalid of [
        { cyclePulses: 0 },
        { cyclePulses: 33 },
        { cyclePulses: NaN },
        { cyclePulses: 3, phasePulses: 3 },
        { cyclePulses: 3, denominator: 3 },
      ]) {
        expect(() => {
          detector.manualMeter = invalid;
        }).toThrow(RangeError);
      }

      expect(post).not.toHaveBeenCalled();
      detector.manualMeter = { cyclePulses: 3 };
      expect(post).toHaveBeenLastCalledWith({
        type: 'reset',
        epoch: 1,
        manualMeter: { cyclePulses: 3, phasePulses: null, denominator: null },
        stopped: false,
      });
      detector.reset();
      expect(post).toHaveBeenLastCalledWith({ type: 'reset', epoch: 2, manualMeter: detector.manualMeter, stopped: false });
      detector.manualMeter = null;
      expect(post).toHaveBeenLastCalledWith({ type: 'reset', epoch: 3, manualMeter: null, stopped: false });
    } finally {
      detector.destroy();
      vi.restoreAllMocks();
    }
  });
});
