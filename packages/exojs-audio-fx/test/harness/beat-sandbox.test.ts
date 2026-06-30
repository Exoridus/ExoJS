/**
 * Acceptance tests for the beat-sandbox eval driver.
 *
 * Acceptance criteria (from Stage-1 plan Task 2):
 *   1. DETERMINISM: Feeding the same fixture twice yields an identical message log.
 *   2. BLOCK-INDEPENDENCE: Block sizes {64, 128, 512, whole-buffer} yield identical
 *      beat.audioTime sequences — proving hop timing is block-size-independent.
 *   3. BASIC DETECTION: A 120-BPM clicktrack produces >= 1 beat message after the
 *      settling period and state messages with tempo > 0.
 */

import { clicktrack, SAMPLE_RATE } from '../fixtures/beat-fixtures';
import { type BeatMessage, runDetector,type StateMessage, type WorkletMessage } from './beat-sandbox';

// Use a 15-second 120-BPM clicktrack for all sandbox tests
const FIXTURE = clicktrack(120, 15);
const TOTAL_SAMPLES = FIXTURE.samples.length;

function beatMessages(msgs: WorkletMessage[]): BeatMessage[] {
  return msgs.filter((m): m is BeatMessage => m.type === 'beat');
}

function stateMessages(msgs: WorkletMessage[]): StateMessage[] {
  return msgs.filter((m): m is StateMessage => m.type === 'state');
}

/** Serialize a message log to a stable string for equality comparison. */
function serializeLog(msgs: WorkletMessage[]): string {
  return JSON.stringify(
    msgs.map((m) => {
      // Exclude _audioTimeSec from determinism comparison (it's an annotation
      // that depends on block size; actual message content must be identical).
      const { _audioTimeSec: _ignored, ...rest } = m as WorkletMessage & { _audioTimeSec: number };
      return rest;
    }),
  );
}

// ── 1. Determinism ─────────────────────────────────────────────────────────────

describe('BeatDetector sandbox — determinism', { timeout: 60_000 }, () => {
  it('feeding the same fixture twice yields an identical message log', () => {
    const { messages: run1 } = runDetector(FIXTURE.samples);
    const { messages: run2 } = runDetector(FIXTURE.samples);

    expect(run1.length).toBe(run2.length);
    expect(serializeLog(run1)).toBe(serializeLog(run2));
  });
});

// ── 2. Block-independence ──────────────────────────────────────────────────────

describe('BeatDetector sandbox — block-independence', { timeout: 120_000 }, () => {
  // Run with four different block sizes and collect beat.audioTime sequences
  const blockSizes = [64, 128, 512, TOTAL_SAMPLES] as const;

  let refBeatTimes: number[] = [];

  beforeAll(() => {
    const { messages } = runDetector(FIXTURE.samples, { blockSize: 128 });
    refBeatTimes = beatMessages(messages).map((m) => m.audioTime);
  });

  for (const bs of blockSizes) {
    it(`blockSize=${bs === TOTAL_SAMPLES ? 'whole-buffer' : bs} yields identical beat.audioTime sequence`, () => {
      const { messages } = runDetector(FIXTURE.samples, { blockSize: bs });
      const beatTimes = beatMessages(messages).map((m) => m.audioTime);
      // beat.audioTime is computed from sample counts inside the worklet;
      // block boundaries do not affect the computation, so results must be exact.
      expect(beatTimes).toEqual(refBeatTimes);
    });
  }
});

// ── 3. Basic detection ─────────────────────────────────────────────────────────

describe('BeatDetector sandbox — basic detection (120 BPM)', { timeout: 60_000 }, () => {
  let messages: WorkletMessage[];

  beforeAll(() => {
    const result = runDetector(FIXTURE.samples);
    messages = result.messages;
  });

  it('produces at least 1 beat message', () => {
    expect(beatMessages(messages).length).toBeGreaterThanOrEqual(1);
  });

  it('produces state messages with tempo > 0 after the settling period', () => {
    // Default settling = 1500 ms. Look for state messages beyond that.
    const settlingMs = 1500;
    const settledStates = stateMessages(messages).filter(
      (s) => s._audioTimeSec * 1000 >= settlingMs && s.tempo > 0,
    );
    expect(settledStates.length).toBeGreaterThan(0);
  });

  it('beat messages have valid audioTime values (> 0, < fixture duration)', () => {
    const durationSec = FIXTURE.samples.length / SAMPLE_RATE;
    for (const b of beatMessages(messages)) {
      expect(b.audioTime).toBeGreaterThan(0);
      expect(b.audioTime).toBeLessThan(durationSec + 1); // allow small overshoot
    }
  });

  it('beat messages have tempo > 0', () => {
    for (const b of beatMessages(messages)) {
      expect(b.tempo).toBeGreaterThan(0);
    }
  });
});
