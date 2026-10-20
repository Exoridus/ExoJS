import { getAudioContext } from '@codexo/exojs';

import { BeatDetector } from '../src/BeatDetector';

describe('beat detector public evidence', () => {
  beforeEach(() => {
    const context = getAudioContext();
    (context as unknown as { audioWorklet: { addModule: ReturnType<typeof vi.fn> } }).audioWorklet.addModule = vi
      .fn()
      .mockResolvedValue(undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:beat-evidence');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps pulse confidence independent and expires cached rhythm without another message', async () => {
    const clock = vi.spyOn(getAudioContext(), 'currentTime', 'get').mockReturnValue(10);
    const detector = new BeatDetector();

    try {
      await detector.ready;
      const port = (detector as unknown as { _workletNode: AudioWorkletNode })._workletNode.port;
      const state = {
        type: 'state',
        epoch: 0,
        tempo: 120,
        beatPhase: 0.01,
        confidence: 0.2,
        beatConfidence: 0.75,
        phaseConfidence: 0.8,
        gridStability: 0.2,
        predictionValidUntil: 11,
        tempoCandidates: [{ bpm: 120, score: 0.5 }],
      };
      port.onmessage!.call(port, { data: state } as MessageEvent);
      expect(detector.beatConfidence).toBe(0.75);
      port.onmessage!.call(port, { data: { ...state, confidence: 0.9, gridStability: 0.9 } } as MessageEvent);
      expect(detector.beatConfidence).toBe(0.75);
      expect(detector.confidence).toBe(0.9);
      clock.mockReturnValue(11);
      expect(detector.beatConfidence).toBe(0);
      expect(detector.tempo).toBe(0);
      expect(detector.confidence).toBe(0);
      expect(detector.phaseConfidence).toBe(0);
      expect(detector.gridStability).toBe(0);
      expect(detector.beatPhase).toBe(0);
      expect(detector.tempoCandidates).toEqual([]);
      expect(detector.pulse).toBe(0);
      expect(detector.justBeat).toBe(false);
      expect(detector.subdivisionPhase(4)).toBe(0);
      detector.reset();
      port.onmessage!.call(port, { data: { ...state, predictionValidUntil: 20 } } as MessageEvent);
      expect(detector.beatConfidence).toBe(0);
    } finally {
      detector.destroy();
    }
  });

  it('delivers matched onset evidence separately from emission energy and preserves missing evidence', async () => {
    const detector = new BeatDetector();
    const receive = vi.fn();
    detector.onBeat.add(receive);

    try {
      await detector.ready;
      const port = (detector as unknown as { _workletNode: AudioWorkletNode })._workletNode.port;
      const beat = {
        type: 'beat',
        epoch: 0,
        audioTime: 10,
        tempo: 120,
        confidence: 0.2,
        beatConfidence: 0.8,
        beatPhase: 0,
        energy: 0,
        onsetEnergy: 7,
        onsetAudioTime: 9.97,
        meterKnown: false,
        isDownbeat: false,
        beatInBar: 1,
        status: 'provisional',
      };
      port.onmessage!.call(port, { data: beat } as MessageEvent);
      expect(receive.mock.calls[0]![0]).toMatchObject({ energy: 0, onsetEnergy: 7, onsetAudioTime: 9.97, beatConfidence: 0.8 });
      port.onmessage!.call(port, { data: { ...beat, onsetEnergy: null, onsetAudioTime: null } } as MessageEvent);
      expect(receive.mock.calls[1]![0]).toMatchObject({ onsetEnergy: null, onsetAudioTime: null });
    } finally {
      detector.destroy();
    }
  });
});
