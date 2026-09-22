/**
 * The BeatDetectorProcessor's timestamps and its phase-confidence estimate.
 *
 * Both are properties of the worklet rather than of the main-thread wrapper, so
 * they are driven here through the eval sandbox against real fixture audio.
 */
import { clicktrack, grooveOffset } from '../fixtures/beat-fixtures';
import { type BeatMessage, runDetector, SAMPLE_RATE, type StateMessage } from '../harness/beat-sandbox';

const beats = (messages: readonly { type: string }[]): BeatMessage[] => messages.filter((m): m is BeatMessage => m.type === 'beat');
const states = (messages: readonly { type: string }[]): StateMessage[] => messages.filter((m): m is StateMessage => m.type === 'state');

describe('beat-detector worklet timestamps', () => {
  test("are on the context clock, not on the processor's own sample count", () => {
    const fixture = clicktrack(120, 10);
    const offsetFrames = 7 * SAMPLE_RATE;

    const fromZero = runDetector(fixture.samples);
    const fromLater = runDetector(fixture.samples, { startFrame: offsetFrames });

    const zeroBeats = beats(fromZero.messages);
    const laterBeats = beats(fromLater.messages);

    expect(zeroBeats.length).toBeGreaterThan(10);
    expect(laterBeats).toHaveLength(zeroBeats.length);

    // A processor created on a context that has been running for seven seconds
    // analyses exactly the same audio; only the clock it names it on moves.
    for (let i = 0; i < zeroBeats.length; i++) {
      expect(laterBeats[i]!.audioTime - zeroBeats[i]!.audioTime).toBeCloseTo(7, 6);
    }

    const zeroStates = states(fromZero.messages);
    const laterStates = states(fromLater.messages);

    expect(laterStates[0]!.analysisTime - zeroStates[0]!.analysisTime).toBeCloseTo(7, 6);
  });

  test('report the newest analysed sample as the analysis time', () => {
    const durationSec = 8;
    const { messages } = runDetector(clicktrack(120, durationSec).samples);
    const captured = states(messages);

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]!.analysisTime).toBeGreaterThan(0);
    expect(captured.at(-1)!.analysisTime).toBeGreaterThan(durationSec - 0.2);
    expect(captured.at(-1)!.analysisTime).toBeLessThanOrEqual(durationSec);

    for (let i = 1; i < captured.length; i++) {
      expect(captured[i]!.analysisTime).toBeGreaterThan(captured[i - 1]!.analysisTime);
    }
  });

  test('put every beat of the state lookahead on the same clock', () => {
    const { messages } = runDetector(clicktrack(120, 10).samples, { startFrame: 3 * SAMPLE_RATE });
    const locked = states(messages).filter(state => state.tempo > 0);

    expect(locked.length).toBeGreaterThan(0);

    const state = locked.at(-1)!;

    expect(state.nextBeatTime).toBeGreaterThan(state.analysisTime - 60 / state.tempo);
    for (const upcoming of state.lookahead) {
      expect(upcoming.audioTime).toBeGreaterThan(3);
    }
  });
});

describe('beat-detector worklet phase confidence', () => {
  const settled = (messages: readonly { type: string }[]): StateMessage[] => states(messages).filter(state => state.tempo > 0);

  test('stays in range and reads zero before the grid locks', () => {
    const { messages } = runDetector(clicktrack(120, 12).samples);
    const captured = states(messages);

    for (const state of captured) {
      expect(state.phaseConfidence).toBeGreaterThanOrEqual(0);
      expect(state.phaseConfidence).toBeLessThanOrEqual(1);
      if (state.tempo === 0) expect(state.phaseConfidence).toBe(0);
    }

    expect(settled(messages).length).toBeGreaterThan(0);
  });

  test('is high when onsets land on the predicted grid', () => {
    const { messages } = runDetector(clicktrack(120, 12).samples);

    expect(settled(messages).at(-1)!.phaseConfidence).toBeGreaterThan(0.8);
  });

  test('collapses on jittered onsets that leave tempo confidence untouched', () => {
    const steady = settled(runDetector(clicktrack(120, 12).samples).messages).at(-1)!;
    const jittered = settled(runDetector(grooveOffset(120, 40, 12).samples).messages).at(-1)!;

    expect(jittered.phaseConfidence).toBeLessThan(steady.phaseConfidence);

    // The reason the two figures exist separately: 40 ms of onset jitter leaves
    // the tempogram sharper than the clicktrack's, so a consumer reading only
    // `confidence` would take this grid for the more trustworthy of the two.
    expect(jittered.confidence).toBeGreaterThan(0.8);
    expect(jittered.phaseConfidence).toBeLessThan(0.3);
  });
});
