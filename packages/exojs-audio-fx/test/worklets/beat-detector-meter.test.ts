import { type BeatMessage, runDetector, type StateMessage } from '../harness/beat-sandbox';

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
  meterEstimate: { cyclePulses: number; phasePulses: number; origin: string } | null;
}

describe('automatic meter from full audio', () => {
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
      expect(states.at(-1)!.meterEstimate).toMatchObject({ cyclePulses: cycle, origin: 'estimated' });
      const downbeats = messages.filter(
        (message): message is BeatMessage => message.type === 'beat' && message.isDownbeat && message.audioTime > 10,
      );
      expect(downbeats.length).toBeGreaterThan(2);

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
    expect(states.at(-1)!.meterEstimate).toBeNull();
    expect(states.at(-1)!.nextDownbeatTime).toBe(0);
    expect(messages.some(message => message.type === 'barStart')).toBe(false);
  });

  it.each([3, 4])('recognizes a quiet %i-pulse control with another attack spectrum', cycle => {
    const { messages } = runDetector(accents(120, cycle, 0, 24, 0.02, 440));
    const states = messages.filter((message): message is MeterState => message.type === 'state');
    expect(states.at(-1)!.meterEstimate).toMatchObject({ cyclePulses: cycle });
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
        .every(state => state.meterEstimate?.cyclePulses === before),
    ).toBe(true);
    const after = states.filter(state => state.analysisTime > 44);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(state => state.meterEstimate?.cyclePulses === afterCycle)).toBe(true);
  });
});
