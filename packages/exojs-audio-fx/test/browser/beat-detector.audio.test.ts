import beatDetectorWorkletSource from '../../src/worklets/beat-detector.worklet.ts?worklet';

interface DetectorMessage {
  type: string;
  epoch: number;
  analysisTime: number;
  tempo: number;
  confidence: number;
  lookahead: unknown[];
  nextBeatTime: number;
  nextDownbeatTime: number;
  meterEstimate: { cyclePulses: number } | null;
}

describe('beat detector in real Web Audio', () => {
  it.each([44_100, 48_000].flatMap(sampleRate => [1, 3, 4].map(cycle => ({ sampleRate, cycle }))))(
    'tracks $cycle-pulse audio, resets and expires in silence at $sampleRate Hz',
    async ({ sampleRate, cycle }) => {
      const context = new OfflineAudioContext(1, sampleRate * 16, sampleRate);
      const url = URL.createObjectURL(new Blob([beatDetectorWorkletSource], { type: 'application/javascript' }));

      try {
        await context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }

      const node = new AudioWorkletNode(context, 'exojs-beat-detector', { numberOfInputs: 1, numberOfOutputs: 1 });
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
        } else if (message.type === 'state' && message.analysisTime > 15.8) {
          finish();
        }
      };

      try {
        node.port.postMessage({ type: 'reset', epoch: 1 });
        await Promise.race([acknowledged, failed]);
        const buffer = context.createBuffer(1, sampleRate * 16, sampleRate);
        const pcm = buffer.getChannelData(0);

        for (let beat = 0; 0.173 + beat * 0.5 < 10; beat++) {
          const time = 0.173 + beat * 0.5;
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
        const active = messages.filter(message => message.type === 'state' && message.analysisTime > 8 && message.analysisTime < 10);
        expect(active.length).toBeGreaterThan(0);

        if (cycle === 1) {
          expect(active.every(message => message.meterEstimate === null)).toBe(true);
        } else {
          expect(active.every(message => message.meterEstimate?.cyclePulses === cycle)).toBe(true);
        }

        const silent = messages.filter(message => message.type === 'state' && message.analysisTime > 13);
        expect(silent.length).toBeGreaterThan(0);

        for (const message of silent) {
          expect(message).toMatchObject({ confidence: 0, lookahead: [], nextBeatTime: 0, nextDownbeatTime: 0, meterEstimate: null });
        }
      } finally {
        node.port.postMessage({ type: 'destroy' });
        node.disconnect();
        node.port.close();
      }
    },
  );
});
