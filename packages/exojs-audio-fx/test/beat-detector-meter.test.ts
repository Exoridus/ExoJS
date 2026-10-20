import { getAudioContext } from '@codexo/exojs';

import { BeatDetector } from '../src/BeatDetector';

describe('beat detector meter view', () => {
  it('exposes a nullable current estimate and clears it on expiry and reset', async () => {
    const context = getAudioContext();
    (context as unknown as { audioWorklet: { addModule: ReturnType<typeof vi.fn> } }).audioWorklet.addModule = vi
      .fn()
      .mockResolvedValue(undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:meter-view');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clock = vi.spyOn(context, 'currentTime', 'get').mockReturnValue(10);
    const detector = new BeatDetector();

    try {
      await detector.ready;
      expect(detector.meterEstimate).toMatchObject({ selected: null, reason: 'acquiring', alternatives: [] });
      const port = (detector as unknown as { _workletNode: AudioWorkletNode })._workletNode.port;
      port.onmessage!.call(port, {
        data: {
          type: 'state',
          epoch: 0,
          predictionValidUntil: 11,
          tempo: 120,
          nextBeatTime: 10.5,
          nextDownbeatTime: 12,
          lookaheadRevision: 1,
          lookahead: [{ audioTime: 12, tempo: 120, beatInBar: 1, isDownbeat: true, meterKnown: true }],
          meterEstimate: {
            selected: { cyclePulses: 3, phasePulses: 1, pulsePeriodSeconds: 0.5, denominator: null },
            alternatives: [{ model: { cyclePulses: 4, phasePulses: null, pulsePeriodSeconds: 0.5, denominator: null }, score: 0.2 }],
            reason: 'available',
            score: 0.9,
            origin: 'estimated',
            evidenceThroughAudioTime: 10,
            validUntilAudioTime: 10.8,
          },
        },
      } as MessageEvent);
      expect(detector.meterEstimate.selected).toMatchObject({ cyclePulses: 3, phasePulses: 1, denominator: null });
      expect(Object.isFrozen(detector.meterEstimate.selected)).toBe(true);
      expect(Object.isFrozen(detector.meterEstimate.alternatives[0]!.model)).toBe(true);
      expect(detector.meterKnown).toBe(true);
      clock.mockReturnValue(10.9);
      expect(detector.meterEstimate).toMatchObject({ selected: null, reason: 'expired', alternatives: [] });
      expect(detector.meterEstimate).toBe(detector.meterEstimate);
      expect(detector.meterKnown).toBe(false);
      expect(detector.nextBeatTime).toBe(12);
      expect(detector.nextDownbeatTime).toBe(0);
      expect(detector.barPulse).toBe(0);
      expect(detector.lookahead).toEqual([{ audioTime: 12, tempo: 120, beatInBar: 1, isDownbeat: false, meterKnown: false }]);
      clock.mockReturnValue(10);
      const model = { cyclePulses: 3, phasePulses: null, pulsePeriodSeconds: 0.5, denominator: null };
      const alternatives = [
        { model, score: 0.7 },
        { model: { ...model, cyclePulses: 4 }, score: 0.68 },
      ];

      for (const selected of [model, null]) {
        port.onmessage!.call(port, {
          data: {
            type: 'state',
            epoch: 0,
            predictionValidUntil: 11,
            nextDownbeatTime: 10.5,
            meterEstimate: {
              selected,
              alternatives,
              score: 0.7,
              origin: 'estimated',
              reason: selected ? 'ambiguousPhase' : 'ambiguousCycle',
              evidenceThroughAudioTime: 10,
              validUntilAudioTime: 10.8,
            },
          },
        } as MessageEvent);
        expect(detector.meterEstimate.selected).toEqual(selected);
        expect(detector.meterEstimate.alternatives).toHaveLength(2);
        expect(detector.meterKnown).toBe(false);
        expect(detector.nextDownbeatTime).toBe(0);
      }

      clock.mockReturnValue(10.9);
      expect(detector.meterEstimate).toMatchObject({ selected: null, alternatives: [], reason: 'expired' });
      clock.mockReturnValue(10);
      port.onmessage!.call(port, {
        data: {
          type: 'state',
          epoch: 0,
          tempo: 120,
          predictionValidUntil: 11,
          nextBeatTime: 10.5,
          nextDownbeatTime: 0,
          meterEstimate: {
            selected: { ...model, cyclePulses: 11, phasePulses: 0 },
            alternatives: [],
            score: 1,
            origin: 'manual',
            reason: 'available',
            evidenceThroughAudioTime: 10,
            validUntilAudioTime: 11,
          },
        },
      } as MessageEvent);
      expect(detector.nextDownbeatTime).toBe(0);
      expect(detector.barPulse).toBe(1);
      detector.reset();
      expect(detector.meterEstimate).toMatchObject({ selected: null, reason: 'acquiring' });
    } finally {
      detector.destroy();
      vi.restoreAllMocks();
    }
  });
});
