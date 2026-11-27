import { getAudioContext } from '@codexo/exojs';

import { BeatDetector } from '../src/BeatDetector';

interface TestNode {
  port: { onmessage: ((event: { data: Record<string, unknown> }) => void) | null; postMessage: ReturnType<typeof vi.fn> };
}

const nodeOf = (detector: BeatDetector): TestNode => (detector as unknown as { _workletNode: TestNode })._workletNode;
const epochOf = (detector: BeatDetector): number => (detector as unknown as { _epoch: number })._epoch;

const send = (detector: BeatDetector, data: Record<string, unknown>): void => {
  nodeOf(detector).port.onmessage?.({ data });
};

describe('beat detector analysis lifetime', () => {
  beforeEach(() => {
    const context = getAudioContext();
    (context as unknown as { audioWorklet: { addModule: ReturnType<typeof vi.fn> } }).audioWorklet.addModule = vi
      .fn()
      .mockResolvedValue(undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:beat-lifetime');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('clears cached state on source change and rejects the previous source messages', async () => {
    const detector = new BeatDetector();
    await detector.ready;
    const beat = vi.fn();
    detector.onBeat.add(beat);
    send(detector, { type: 'state', epoch: 0, tempo: 120, confidence: 0.9, predictionValidUntil: getAudioContext().currentTime + 1 });
    expect(detector.tempo).toBe(120);

    detector.source = getAudioContext().createGain();
    expect(detector.tempo).toBe(0);
    expect(detector.confidence).toBe(0);
    expect(detector.lookahead).toEqual([]);
    send(detector, { type: 'state', epoch: 0, tempo: 180 });
    send(detector, { type: 'beat', epoch: 0, audioTime: 0 });
    expect(detector.tempo).toBe(0);
    expect(beat).not.toHaveBeenCalled();
    expect(nodeOf(detector).port.postMessage).toHaveBeenCalledWith({
      type: 'reset',
      epoch: epochOf(detector),
      manualMeter: null,
      stopped: false,
    });
    detector.destroy();
  });

  it('treats reassigning the same source as continuous and null as a change', async () => {
    const source = getAudioContext().createGain();
    const detector = new BeatDetector({ source });
    await detector.ready;
    const epoch = epochOf(detector);
    detector.source = source;
    expect(epochOf(detector)).toBe(epoch);
    detector.source = null;
    expect(epochOf(detector)).toBe(epoch + 1);
    detector.destroy();
  });

  it('resets explicitly, discards in-flight messages and stays disposed', async () => {
    const detector = new BeatDetector();
    await detector.ready;
    const node = nodeOf(detector);
    const receive = node.port.onmessage!;
    (detector as BeatDetector & { reset(): void }).reset();
    expect(epochOf(detector)).toBe(1);
    receive({ data: { type: 'state', epoch: 0, tempo: 120 } });
    expect(detector.tempo).toBe(0);
    detector.destroy();
    detector.destroy();
    receive({ data: { type: 'state', epoch: 1, tempo: 120 } });
    expect(detector.tempo).toBe(0);
    expect(node.port.onmessage).toBeNull();
  });

  it('does not dispatch downbeat after an onBeat listener resets the detector', async () => {
    const detector = new BeatDetector();
    await detector.ready;
    const downbeat = vi.fn();
    detector.onBeat.add(() => (detector as BeatDetector & { reset(): void }).reset());
    detector.onDownbeat.add(downbeat);
    send(detector, { type: 'beat', epoch: 0, isDownbeat: true });
    expect(downbeat).not.toHaveBeenCalled();
    detector.destroy();
  });

  it.each(['eof', 'explicitPause'] as const)('stops current-epoch events after %s until resumed', async reason => {
    const detector = new BeatDetector({ manualMeter: { cyclePulses: 3, phasePulses: 0 } });
    await detector.ready;
    const beat = vi.fn();
    detector.onBeat.add(beat);
    detector.notifyDiscontinuity(reason);
    expect(nodeOf(detector).port.postMessage).toHaveBeenLastCalledWith({
      type: 'reset',
      epoch: 1,
      manualMeter: detector.manualMeter,
      stopped: true,
    });
    send(detector, { type: 'beat', epoch: 1, isDownbeat: true });
    expect(beat).not.toHaveBeenCalled();
    detector.manualMeter = { cyclePulses: 4, phasePulses: 0 };
    expect(nodeOf(detector).port.postMessage).toHaveBeenLastCalledWith({
      type: 'reset',
      epoch: 2,
      manualMeter: detector.manualMeter,
      stopped: true,
    });
    detector.notifyDiscontinuity('resume');
    expect(nodeOf(detector).port.postMessage).toHaveBeenLastCalledWith({
      type: 'reset',
      epoch: 3,
      manualMeter: detector.manualMeter,
      stopped: false,
    });
    send(detector, { type: 'beat', epoch: 3, audioTime: 10, tempo: 120 });
    expect(beat).toHaveBeenCalledTimes(1);
    expect(detector.manualMeter?.cyclePulses).toBe(4);
    detector.destroy();
  });
});
