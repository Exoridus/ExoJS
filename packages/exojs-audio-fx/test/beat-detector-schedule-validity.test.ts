import { getAudioContext } from '@codexo/exojs';

import { BeatDetector } from '../src/BeatDetector';

describe('beat detector cached prediction expiry', () => {
  beforeEach(() => {
    const context = getAudioContext();
    (context as unknown as { audioWorklet: { addModule: ReturnType<typeof vi.fn> } }).audioWorklet.addModule = vi
      .fn()
      .mockResolvedValue(undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:beat-expiry');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps next-time getters unavailable while the tempo grid is provisional', async () => {
    const detector = new BeatDetector();
    await detector.ready;
    vi.spyOn(getAudioContext(), 'currentTime', 'get').mockReturnValue(1);
    const port = (detector as unknown as { _workletNode: AudioWorkletNode })._workletNode.port;
    port.onmessage!.call(port, {
      data: {
        type: 'state',
        epoch: 0,
        tempo: 0,
        nextBeatTime: 0,
        nextDownbeatTime: 0,
        predictionValidUntil: 2,
        lookahead: [{ audioTime: 1.5, tempo: 120, isDownbeat: true, beatInBar: 1 }],
      },
    } as MessageEvent);
    expect(detector.nextBeatTime).toBe(0);
    expect(detector.nextDownbeatTime).toBe(0);
    detector.destroy();
  });

  it('expires retained schedules without requiring another port message', async () => {
    const detector = new BeatDetector();
    await detector.ready;
    const context = getAudioContext();
    const clock = vi.spyOn(context, 'currentTime', 'get').mockReturnValue(10);
    const port = (detector as unknown as { _workletNode: AudioWorkletNode })._workletNode.port;
    const receive = port.onmessage!;
    receive.call(port, {
      data: {
        type: 'state',
        epoch: 0,
        tempo: 120,
        confidence: 0.9,
        analysisTime: 10,
        predictionValidUntil: 11,
        nextBeatTime: 10.5,
        nextDownbeatTime: 12,
        lookaheadRevision: 1,
        lookahead: [{ audioTime: 10.5, tempo: 120, isDownbeat: false, beatInBar: 2 }],
      },
    } as MessageEvent);
    expect(detector.lookahead).toHaveLength(1);
    clock.mockReturnValue(11.1);
    expect(detector.lookahead).toEqual([]);
    expect(detector.nextBeatTime).toBe(0);
    expect(detector.nextDownbeatTime).toBe(0);
    expect(detector.barPulse).toBe(0);
    detector.destroy();
  });

  it('ignores already expired schedules and preserves new-revision deduplication', async () => {
    const detector = new BeatDetector();
    await detector.ready;
    const clock = vi.spyOn(getAudioContext(), 'currentTime', 'get').mockReturnValue(20);
    const predict = vi.fn();
    detector.onBeatPredicted.add(predict);
    const port = (detector as unknown as { _workletNode: AudioWorkletNode })._workletNode.port;
    const receive = port.onmessage!;
    const state = {
      type: 'state',
      epoch: 0,
      predictionValidUntil: 19,
      lookaheadRevision: 1,
      lookahead: [{ audioTime: 18, tempo: 120, isDownbeat: true, beatInBar: 1 }],
    };
    receive.call(port, { data: state } as MessageEvent);
    expect(predict).not.toHaveBeenCalled();
    clock.mockReturnValue(18);
    const fresh = { ...state, lookaheadRevision: 2, predictionValidUntil: 21, lookahead: [{ ...state.lookahead[0], audioTime: 20 }] };
    receive.call(port, { data: fresh } as MessageEvent);
    receive.call(port, { data: fresh } as MessageEvent);
    expect(predict).toHaveBeenCalledTimes(1);
    detector.destroy();
  });
});
