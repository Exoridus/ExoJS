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
      expect(detector.meterEstimate).toBeNull();
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
            cyclePulses: 3,
            phasePulses: 1,
            score: 0.9,
            origin: 'estimated',
            evidenceThroughAudioTime: 10,
            validUntilAudioTime: 10.8,
          },
        },
      } as MessageEvent);
      expect(detector.meterEstimate).toMatchObject({ cyclePulses: 3, phasePulses: 1 });
      expect(detector.meterKnown).toBe(true);
      clock.mockReturnValue(10.9);
      expect(detector.meterEstimate).toBeNull();
      expect(detector.meterKnown).toBe(false);
      expect(detector.nextBeatTime).toBe(12);
      expect(detector.nextDownbeatTime).toBe(0);
      expect(detector.barPulse).toBe(0);
      expect(detector.lookahead).toEqual([{ audioTime: 12, tempo: 120, beatInBar: 1, isDownbeat: false, meterKnown: false }]);
      detector.reset();
      expect(detector.meterEstimate).toBeNull();
    } finally {
      detector.destroy();
      vi.restoreAllMocks();
    }
  });
});
