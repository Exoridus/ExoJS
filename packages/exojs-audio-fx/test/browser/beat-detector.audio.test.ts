import beatDetectorWorkletSource from '../../src/worklets/beat-detector.worklet.ts?worklet';

interface DetectorMessage {
  type: string;
  epoch: number;
  analysisTime: number;
  tempo: number;
  audioTime: number;
  meterKnown: boolean;
  isDownbeat: boolean;
  confidence: number;
  lookahead: unknown[];
  nextBeatTime: number;
  nextDownbeatTime: number;
  meterEstimate: { selected: { cyclePulses: number } | null };
}

describe('beat detector in real Web Audio', () => {
  it.each(
    [44_100, 48_000].flatMap(sampleRate =>
      [120, 50].flatMap(bpm => (bpm === 50 ? [3, 4] : [1, 3, 4]).map(cycle => ({ sampleRate, cycle, bpm }))),
    ),
  )('tracks $cycle pulses at $bpm BPM, resets and expires at $sampleRate Hz', async ({ sampleRate, cycle, bpm }) => {
    const seconds = bpm === 50 ? 44 : 16;
    const activeSeconds = bpm === 50 ? 36 : 10;
    const scoringStart = bpm === 50 ? 20 : 8;
    const context = new OfflineAudioContext(1, sampleRate * seconds, sampleRate);
    const url = URL.createObjectURL(new Blob([beatDetectorWorkletSource], { type: 'application/javascript' }));

    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    const node = new AudioWorkletNode(context, 'exojs-beat-detector', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: bpm === 50 ? { minBpm: 45, maxBpm: 65 } : {},
    });
    node.connect(context.destination);
    const messages: DetectorMessage[] = [];
    let acknowledge: () => void;
    let finish: () => void;
    const acknowledged = new Promise<void>(resolve => {
      acknowledge = resolve;
    });
    const finished = new Promise<void>(resolve => {
      finish = resolve;
    });
    const failed = new Promise<never>((_resolve, reject) => {
      node.onprocessorerror = () => reject(new Error('Beat detector worklet failed'));
    });

    node.port.onmessage = event => {
      const message = event.data as DetectorMessage;
      messages.push(message);

      if (message.type === 'reset' && message.epoch === 1) {
        acknowledge();
      } else if (message.type === 'state' && message.analysisTime > seconds - 0.2) {
        finish();
      }
    };

    try {
      node.port.postMessage({ type: 'reset', epoch: 1 });
      await Promise.race([acknowledged, failed]);
      const buffer = context.createBuffer(1, sampleRate * seconds, sampleRate);
      const pcm = buffer.getChannelData(0);

      for (let beat = 0; 0.173 + (beat * 60) / bpm < activeSeconds; beat++) {
        const time = 0.173 + (beat * 60) / bpm;
        const start = Math.round(time * sampleRate);

        for (let j = 0; j < sampleRate * 0.02; j++) {
          pcm[start + j] =
            (beat % cycle === 0 ? 0.9 : 0.3) * Math.exp(-j / (sampleRate * 0.004)) * Math.cos((j * 2 * Math.PI * 1400) / sampleRate);
        }
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(node);
      source.start();
      await Promise.race([Promise.all([context.startRendering(), finished]), failed]);

      expect(messages.every(message => message.epoch === 1)).toBe(true);
      expect(messages.some(message => message.type === 'state' && message.tempo > 0)).toBe(true);
      const active = messages.filter(
        message => message.type === 'state' && message.analysisTime > scoringStart && message.analysisTime < activeSeconds,
      );
      expect(active.length).toBeGreaterThan(0);

      if (cycle === 1) {
        expect(active.every(message => message.meterEstimate.selected === null)).toBe(true);
      } else {
        expect(active.every(message => message.meterEstimate.selected?.cyclePulses === cycle)).toBe(true);
      }

      if (bpm === 50) {
        const beats = messages.filter(
          message => message.type === 'beat' && message.audioTime >= scoringStart && message.audioTime < activeSeconds,
        );
        expect(beats.length).toBeGreaterThan(10);
        expect(beats.every(beat => beat.meterKnown)).toBe(true);
        const downbeats = beats.filter(beat => beat.isDownbeat);
        expect(downbeats.length).toBeGreaterThan(1);
        const bars = messages.filter(
          message => message.type === 'barStart' && message.audioTime >= scoringStart && message.audioTime < activeSeconds,
        );
        expect(bars.map(bar => bar.audioTime)).toEqual(downbeats.map(beat => beat.audioTime));
      }

      const silent = messages.filter(message => message.type === 'state' && message.analysisTime > activeSeconds + 3);
      expect(silent.length).toBeGreaterThan(0);

      for (const message of silent) {
        expect(message).toMatchObject({
          confidence: 0,
          lookahead: [],
          nextBeatTime: 0,
          nextDownbeatTime: 0,
          meterEstimate: { selected: null },
        });
      }
    } finally {
      node.port.postMessage({ type: 'destroy' });
      node.disconnect();
      node.port.close();
    }
  });
});
