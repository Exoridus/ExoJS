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
}

describe('beat detector in real Web Audio', () => {
  it.each([44_100, 48_000])('resets its epoch and expires predictions in silence at %i Hz', async sampleRate => {
    const context = new OfflineAudioContext(1, sampleRate * 12, sampleRate);
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
      } else if (message.type === 'state' && message.analysisTime > 11.8) {
        finish();
      }
    };

    try {
      node.port.postMessage({ type: 'reset', epoch: 1 });
      await Promise.race([acknowledged, failed]);
      const buffer = context.createBuffer(1, sampleRate * 12, sampleRate);
      const pcm = buffer.getChannelData(0);

      for (let time = 0; time < 6; time += 0.5) {
        const start = Math.round(time * sampleRate);

        for (let j = 0; j < sampleRate * 0.02; j++) {
          pcm[start + j] = 0.7 * Math.exp(-j / (sampleRate * 0.004)) * Math.cos((j * 2 * Math.PI * 1400) / sampleRate);
        }
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(node);
      source.start();
      await Promise.race([Promise.all([context.startRendering(), finished]), failed]);

      expect(messages.every(message => message.epoch === 1)).toBe(true);
      expect(messages.some(message => message.type === 'state' && message.tempo > 0)).toBe(true);
      const silent = messages.filter(message => message.type === 'state' && message.analysisTime > 9);
      expect(silent.length).toBeGreaterThan(0);

      for (const message of silent) {
        expect(message).toMatchObject({ confidence: 0, lookahead: [], nextBeatTime: 0, nextDownbeatTime: 0 });
      }
    } finally {
      node.port.postMessage({ type: 'destroy' });
      node.disconnect();
      node.port.close();
    }
  });
});
