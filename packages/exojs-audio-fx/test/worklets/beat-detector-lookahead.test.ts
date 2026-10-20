/**
 * The BeatDetectorProcessor's look-ahead schedule, read from the messages the
 * production worklet posts rather than from hand-built main-thread messages.
 */
import { clicktrack, SAMPLE_RATE } from '../fixtures/beat-fixtures';
import { type BeatMessage, runDetector, type StateMessage, type WorkletMessage } from '../harness/beat-sandbox';

const beats = (messages: readonly WorkletMessage[]): BeatMessage[] => messages.filter((m): m is BeatMessage => m.type === 'beat');
const states = (messages: readonly WorkletMessage[]): StateMessage[] => messages.filter((m): m is StateMessage => m.type === 'state');

/** Clicktrack with every `barLength`-th click at full level and the others attenuated. */
const accentedClicktrack = (bpm: number, barLength: number, durationSec: number): Float32Array => {
  const fixture = clicktrack(bpm, durationSec);
  const samples = fixture.samples.slice();
  const clickFrames = Math.round(0.02 * SAMPLE_RATE);

  fixture.beatTimesSec.forEach((time, index) => {
    if (index % barLength === 0) {
      return;
    }

    const start = Math.round(time * SAMPLE_RATE);

    for (let i = start; i < Math.min(start + clickFrames, samples.length); i++) {
      samples[i]! *= 0.3;
    }
  });

  return samples;
};

/** States posted after a beat was emitted and before the next one, paired with both beats. */
const statesBetweenBeats = (messages: readonly WorkletMessage[]): Array<{ state: StateMessage; next: BeatMessage }> => {
  const pairs: Array<{ state: StateMessage; next: BeatMessage }> = [];
  let pending: StateMessage[] = [];
  let seenBeat = false;

  for (const message of messages) {
    if (message.type === 'beat') {
      if (seenBeat) {
        for (const state of pending) {
          pairs.push({ state, next: message });
        }
      }

      seenBeat = true;
      pending = [];
    } else if (message.type === 'state' && seenBeat) {
      pending.push(message);
    }
  }

  return pairs;
};

// A fixed meter isolates scheduling from acquisition and later phase revisions.
const pinTripleMeter = (processor: Record<string, unknown>): void => {
  processor['_activeTs'] = '3/4';
};

describe.each([
  {
    meter: '4/4',
    barLength: 4,
    run: () => runDetector(accentedClicktrack(120, 4, 20), { processorOptions: { enableTimeSignatureDetection: false } }),
  },
  {
    meter: '3/4',
    barLength: 3,
    run: () =>
      runDetector(accentedClicktrack(120, 3, 20), {
        processorOptions: { enableTimeSignatureDetection: false },
        prepare: pinTripleMeter,
      }),
  },
])('beat-detector worklet lookahead in $meter', ({ barLength, run }) => {
  const { messages } = run();
  const settled = states(messages).filter(state => state.tempo > 0);

  test('runs in the fixture meter', () => {
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.at(-1)!.barLength).toBe(barLength);
  });

  test('starts at the beat after the current bar position and cycles through the bar', () => {
    for (const state of settled) {
      expect(state.lookahead).toHaveLength(8);

      state.lookahead.forEach((upcoming, i) => {
        expect(upcoming.beatInBar).toBe(((state.barPosition + i) % state.barLength) + 1);
        expect(upcoming.isDownbeat).toBe(upcoming.beatInBar === 1);
      });
    }
  });

  test('predicts the bar position the next emitted beat actually carries', () => {
    const pairs = statesBetweenBeats(messages).filter(({ state }) => state.tempo > 0);

    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.some(({ next }) => next.isDownbeat)).toBe(true);

    for (const { state, next } of pairs) {
      expect(state.lookahead[0]!.audioTime).toBeCloseTo(next.audioTime, 2);
      expect(state.lookahead[0]!.beatInBar).toBe(next.beatInBar);
      expect(state.lookahead[0]!.isDownbeat).toBe(next.isDownbeat);
    }
  });

  test('reports the next downbeat as the time of the downbeat that follows', () => {
    const emitted = beats(messages);

    for (const state of settled) {
      const upcomingDownbeat = state.lookahead.find(upcoming => upcoming.isDownbeat)!;

      expect(state.nextDownbeatTime).toBe(upcomingDownbeat.audioTime);
      expect(state.nextDownbeatTime).toBeGreaterThan(state.nextBeatTime - 1e-9);

      const actual = emitted.find(beat => beat.isDownbeat && beat.audioTime > state.nextBeatTime - 0.25 * (60 / state.tempo));

      if (actual) {
        expect(state.nextDownbeatTime).toBeCloseTo(actual.audioTime, 1);
      }
    }
  });
});

describe('beat-detector worklet lookahead revision', () => {
  const { messages } = runDetector(clicktrack(120, 12).samples);

  test('repeats while the schedule stands and advances once per emitted beat', () => {
    let revision = 0;
    let beatsSinceState = 0;
    let observedSchedules = 0;

    for (const message of messages) {
      if (message.type === 'beat') {
        beatsSinceState++;
      } else if (message.type === 'state') {
        expect(message.lookaheadRevision - revision).toBe(beatsSinceState);

        if (message.lookaheadRevision !== revision) {
          observedSchedules++;
        }

        revision = message.lookaheadRevision;
        beatsSinceState = 0;
      }
    }

    expect(observedSchedules).toBeGreaterThan(10);
    expect(states(messages).length).toBeGreaterThan(observedSchedules * 2);
  });
});
