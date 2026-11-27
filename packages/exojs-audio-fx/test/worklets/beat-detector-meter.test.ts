import type { MeterEstimate } from '../../src/meterTypes';
import { type BarStartMessage, type BeatMessage, runDetector, type StateMessage } from '../harness/beat-sandbox';

const accents = (bpm: number, cycle: number, offset = 0.173, seconds = 24, gain = 1, carrier = 1400): Float32Array => {
  const pcm = new Float32Array(seconds * 48_000);

  for (let beat = 0; offset + (beat * 60) / bpm < seconds; beat++) {
    const start = Math.round((offset + (beat * 60) / bpm) * 48_000);

    for (let j = 0; j < 960 && start + j < pcm.length; j++) {
      pcm[start + j] += gain * (beat % cycle === 0 ? 0.9 : 0.3) * Math.exp(-j / 180) * Math.cos((j * 2 * Math.PI * carrier) / 48_000);
    }
  }

  return pcm;
};

interface MeterState extends StateMessage {
  meterEstimate: MeterEstimate;
}

describe('automatic meter from full audio', () => {
  it.each([50, 59, 60, 61].flatMap(bpm => [3, 4].map(cycle => ({ bpm, cycle }))))(
    'emits known downbeats and bar starts at slow $bpm BPM in a $cycle-pulse cycle',
    ({ bpm, cycle }) => {
      const { messages } = runDetector(accents(bpm, cycle, 0.173, 40), {
        processorOptions: { minBpm: bpm * 0.9, maxBpm: bpm * 1.3 },
      });
      const beats = messages.filter((message): message is BeatMessage => message.type === 'beat' && message.audioTime >= 20);
      expect(beats.length).toBeGreaterThan(10);
      expect(beats.every(beat => beat.status === 'locked' && beat.meterKnown)).toBe(true);
      const downbeats = beats.filter(beat => beat.isDownbeat);
      const reference = Array.from({ length: Math.ceil((40 * bpm) / (60 * cycle)) }, (_, i) => 0.173 + (i * 60 * cycle) / bpm).filter(
        time => time >= 20 && time < 39,
      );
      expect(downbeats.filter(beat => beat.audioTime < 39)).toHaveLength(reference.length);

      for (const time of reference) {
        expect(downbeats.some(beat => Math.abs(beat.audioTime - time) < 0.07)).toBe(true);
      }

      const bars = messages.filter((message): message is BarStartMessage => message.type === 'barStart' && message.audioTime >= 20);
      expect(bars.map(bar => bar.audioTime)).toEqual(downbeats.map(beat => beat.audioTime));
    },
  );

  it.each([3, 4])('bridges a missing slow pulse in a %i-pulse cycle and expires in silence', cycle => {
    const bpm = 50;
    const pcm = accents(bpm, cycle, 0.173, 40);
    const missing = Math.round((0.173 + 17 * 1.2) * 48_000);
    pcm.fill(0, missing, missing + 960);
    pcm.fill(0, 32 * 48_000);
    const { messages } = runDetector(pcm, { processorOptions: { minBpm: 45, maxBpm: 65 } });
    const reference = [18, 19, 20, 21, 22, 23, 24, 25, 26].filter(index => index % cycle === 0).map(index => 0.173 + index * 1.2);
    const downbeats = messages.filter(
      (message): message is BeatMessage =>
        message.type === 'beat' && message.isDownbeat && message.audioTime > 21 && message.audioTime < 32,
    );
    expect(downbeats).toHaveLength(reference.length);

    for (const time of reference) {
      expect(downbeats.some(beat => Math.abs(beat.audioTime - time) < 0.07 && beat.meterKnown)).toBe(true);
    }

    const silent = messages.filter((message): message is MeterState => message.type === 'state' && message.analysisTime > 36);
    expect(silent.length).toBeGreaterThan(0);
    expect(
      silent.every(state => state.meterEstimate.selected === null && state.nextDownbeatTime === 0 && state.lookahead.length === 0),
    ).toBe(true);
    expect(messages.some(message => message.type === 'barStart' && message.audioTime > 36)).toBe(false);
  });

  it('counts every fourth beat under the explicit fixed convention', () => {
    const { messages } = runDetector(accents(120, 1), { processorOptions: { enableTimeSignatureDetection: false } });
    const beats = messages.filter((message): message is BeatMessage => message.type === 'beat');
    expect(beats.length).toBeGreaterThan(20);

    for (let index = 1; index < beats.length; index++) {
      expect(beats[index]!.beatInBar).toBe((beats[index - 1]!.beatInBar % 4) + 1);
      expect(beats[index]!.isDownbeat).toBe(beats[index]!.beatInBar === 1);
    }
  });

  it.each([90, 120, 180].flatMap(bpm => [3, 4].map(cycle => ({ bpm, cycle }))))(
    'finds $cycle pulses at $bpm BPM without a prepared meter',
    ({ bpm, cycle }) => {
      const { messages } = runDetector(accents(bpm, cycle));
      const states = messages.filter((message): message is MeterState => message.type === 'state');
      expect(states.at(-1)!.meterEstimate).toMatchObject({ selected: { cyclePulses: cycle }, origin: 'estimated' });
      const downbeats = messages.filter(
        (message): message is BeatMessage => message.type === 'beat' && message.isDownbeat && message.audioTime > 10,
      );
      const reference = Array.from({ length: Math.ceil((24 * bpm) / (60 * cycle)) }, (_, i) => 0.173 + (i * 60 * cycle) / bpm).filter(
        time => time > 10 && time < 23.8,
      );
      expect(downbeats.filter(beat => beat.audioTime < 23.8)).toHaveLength(reference.length);

      for (const time of reference) {
        expect(downbeats.some(beat => Math.abs(beat.audioTime - time) < 0.07)).toBe(true);
      }

      for (const beat of downbeats) {
        const nearestBar = Math.round(((beat.audioTime - 0.173) * bpm) / (60 * cycle));
        expect(Math.abs(beat.audioTime - (0.173 + (nearestBar * 60 * cycle) / bpm))).toBeLessThan(0.07);
      }
    },
  );

  it('keeps equal-accent meter unknown and emits beats without invented downbeats', () => {
    const { messages } = runDetector(accents(120, 1));
    const beats = messages.filter((message): message is BeatMessage => message.type === 'beat');
    expect(beats.length).toBeGreaterThan(20);
    expect(beats.every(beat => !beat.isDownbeat)).toBe(true);
    const states = messages.filter((message): message is MeterState => message.type === 'state');
    expect(states.at(-1)!.meterEstimate.selected).toBeNull();
    expect(states.at(-1)!.nextDownbeatTime).toBe(0);
    expect(messages.some(message => message.type === 'barStart')).toBe(false);
  });

  it.each([3, 4])('recognizes a quiet %i-pulse control with another attack spectrum', cycle => {
    const { messages } = runDetector(accents(120, cycle, 0, 24, 0.02, 440));
    const states = messages.filter((message): message is MeterState => message.type === 'state');
    expect(states.at(-1)!.meterEstimate).toMatchObject({ selected: { cyclePulses: cycle } });
  });

  it.each([
    [4, 3],
    [3, 4],
  ])('reacquires after an actual %i-to-%i audio transition', (before, afterCycle) => {
    const pcm = new Float32Array(60 * 48_000);
    pcm.set(accents(120, before, 0.173, 24));
    pcm.set(accents(120, afterCycle, 0.173, 36), 24 * 48_000);
    const { messages } = runDetector(pcm);
    const states = messages.filter((message): message is MeterState => message.type === 'state');
    expect(
      states
        .filter(state => state.analysisTime > 18 && state.analysisTime < 22)
        .every(state => state.meterEstimate.selected?.cyclePulses === before),
    ).toBe(true);
    const after = states.filter(state => state.analysisTime > 24 + 32 * 0.5 + 0.2);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(state => state.meterEstimate.selected?.cyclePulses === afterCycle)).toBe(true);
  });
});
