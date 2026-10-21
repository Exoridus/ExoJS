import { getAudioContext } from '@codexo/exojs';

import { BeatDetector } from '../src/BeatDetector';

describe('beat schedule interpretation', () => {
  it('retains generation metadata, advances future entries and removes expired meter independently', async () => {
    const context = getAudioContext();
    (context as unknown as { audioWorklet: { addModule: ReturnType<typeof vi.fn> } }).audioWorklet.addModule = vi
      .fn()
      .mockResolvedValue(undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:schedule-view');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clock = vi.spyOn(context, 'currentTime', 'get').mockReturnValue(10);
    const detector = new BeatDetector();

    try {
      await detector.ready;
      expect(detector.schedule).toBeNull();
      const port = (detector as unknown as { _workletNode: AudioWorkletNode })._workletNode.port;
      port.onmessage!.call(port, {
        data: {
          type: 'state',
          epoch: 0,
          predictionValidUntil: 11,
          lookaheadRevision: 7,
          predictionGeneratedAtAudioTime: 9.9,
          predictionEvidenceThroughAudioTime: 9.9,
          predictionPulsePeriodSeconds: 0.5,
          predictionStatus: 'provisional',
          meterEstimate: {
            selected: { cyclePulses: 3, phasePulses: 2, pulsePeriodSeconds: 0.5, denominator: null },
            alternatives: [],
            score: 0.8,
            origin: 'estimated',
            reason: 'available',
            evidenceThroughAudioTime: 10,
            validUntilAudioTime: 10.7,
          },
          lookahead: [
            { audioTime: 10.5, tempo: 120, beatInBar: 1, isDownbeat: true, meterKnown: true },
            { audioTime: 11, tempo: 120, beatInBar: 2, isDownbeat: false, meterKnown: true },
          ],
        },
      } as MessageEvent);
      const original = detector.schedule!;
      expect(original).toMatchObject({
        epoch: 0,
        revision: 7,
        generatedAtAudioTime: 9.9,
        evidenceThroughAudioTime: 9.9,
        validUntilAudioTime: 10.7,
        horizonAudioTime: 11,
        pulsePeriodSeconds: 0.5,
        status: 'provisional',
        nextBeat: { audioTime: 10.5 },
        nextDownbeat: { audioTime: 10.5 },
      });
      expect(detector.schedule).toBe(original);
      expect(Object.isFrozen(original)).toBe(true);
      expect(Object.isFrozen(original.beats[0])).toBe(true);
      clock.mockReturnValue(10.6);
      expect(detector.schedule).toMatchObject({ revision: 7, nextBeat: { audioTime: 11 }, nextDownbeat: null });
      clock.mockReturnValue(10.8);
      expect(detector.schedule!.validUntilAudioTime).toBe(11);
      expect(detector.schedule!.beats.every(beat => !beat.meterKnown && !beat.isDownbeat)).toBe(true);
      expect(detector.schedule!.nextDownbeat).toBeNull();
      expect(original.beats[0]!.isDownbeat).toBe(true);
      clock.mockReturnValue(11);
      expect(detector.schedule).toBeNull();
      detector.reset();
      expect(detector.schedule).toBeNull();
    } finally {
      detector.destroy();
      vi.restoreAllMocks();
    }
  });
});
