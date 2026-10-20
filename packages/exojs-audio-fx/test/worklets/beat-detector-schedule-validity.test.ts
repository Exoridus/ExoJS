import { clicktrack, SAMPLE_RATE } from '../fixtures/beat-fixtures';
import { runDetector } from '../harness/beat-sandbox';

describe('beat processor prediction validity', () => {
  it('expires predictions and current confidence during a long recorded silence', () => {
    const audio = new Float32Array(12 * SAMPLE_RATE);
    audio.set(clicktrack(120, 6).samples);
    const { messages } = runDetector(audio);
    const before = messages.filter(message => message.type === 'state' && message.analysisTime > 4 && message.analysisTime < 5);
    expect(before.some(message => message.type === 'state' && message.lookahead.length > 0)).toBe(true);
    const after = messages.filter(message => message.type === 'state' && message.analysisTime > 9);
    expect(after.length).toBeGreaterThan(0);

    for (const message of after) {
      expect(message).toMatchObject({ lookahead: [], nextBeatTime: 0, nextDownbeatTime: 0, confidence: 0 });
    }
  });

  it('does not invent a downbeat when a schedule has no downbeat entry', () => {
    const { messages } = runDetector(new Float32Array(0), {
      prepare: value => {
        value['_locked'] = true;
        value['_bestBpm'] = 120;
        value['_lastBeatSample'] = 48_000;
        value['_lastBeatContextTime'] = 1;
        value['_lastOnsetSample'] = 48_000;
        value['_sampleCount'] = 48_000;
        value['_predictionValidUntilSample'] = 96_000;
        value['_lookahead'] = [{ audioTime: 1.5, tempo: 120, beatInBar: 2, isDownbeat: false }];
        (value['_sendStateMessage'] as () => void).call(value);
      },
    });
    expect(messages[0]).toMatchObject({ nextBeatTime: 1.5, nextDownbeatTime: 0 });
  });
});
