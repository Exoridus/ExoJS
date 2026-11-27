import { clicktrack, SAMPLE_RATE } from '../fixtures/beat-fixtures';
import { runDetector } from '../harness/beat-sandbox';

describe('beat processor prediction validity', () => {
  it('timestamps evidence and trust at forecast generation rather than state delivery', () => {
    const { messages } = runDetector(new Float32Array(0), {
      processorOptions: { enableTimeSignatureDetection: false },
      prepare: value => {
        value['_bestBpm'] = 120;
        value['_ibiSamples'] = 24_010;
        value['_lastBeatSample'] = 48_000;
        value['_lastBeatContextTime'] = 1;
        value['_lastOnsetSample'] = 48_000;
        value['_sampleCount'] = 48_000;
        (value['_updateLookahead'] as (time: number) => void).call(value, 1);
        value['_sampleCount'] = 72_000;
        value['_locked'] = true;
        (value['_sendStateMessage'] as () => void).call(value);
      },
    });
    expect(messages[0]).toMatchObject({
      analysisTime: 1.5,
      predictionGeneratedAtAudioTime: 1,
      predictionEvidenceThroughAudioTime: 1,
      predictionPulsePeriodSeconds: 24_010 / 48_000,
      predictionStatus: 'provisional',
      lookaheadRevision: 1,
    });
  });

  it('forecasts on the tracked period the emitted grid advances by, not the tempogram estimate', () => {
    const period = 24_010 / 48_000;
    const { messages } = runDetector(new Float32Array(0), {
      processorOptions: { enableTimeSignatureDetection: false },
      prepare: value => {
        value['_bestBpm'] = 120;
        value['_ibiSamples'] = 24_010;
        value['_lastBeatSample'] = 48_000;
        value['_lastBeatContextTime'] = 1;
        value['_lastOnsetSample'] = 48_000;
        value['_sampleCount'] = 48_000;
        (value['_updateLookahead'] as (time: number) => void).call(value, 1);
        value['_locked'] = true;
        (value['_sendStateMessage'] as () => void).call(value);
      },
    });
    const state = messages[0] as { lookahead: Array<{ audioTime: number; tempo: number }>; nextBeatTime: number };

    expect(state.lookahead).toHaveLength(8);

    for (let i = 0; i < state.lookahead.length; i++) {
      expect(state.lookahead[i]!.audioTime).toBeCloseTo(1 + (i + 1) * period, 9);
      expect(state.lookahead[i]!.tempo).toBeCloseTo(60 / period, 9);
    }

    expect(state.nextBeatTime).toBeCloseTo(state.lookahead[0]!.audioTime, 9);
  });

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
