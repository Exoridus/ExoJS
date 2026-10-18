import { writeFileSync } from 'node:fs';

import manifest from './fixtures/music/manifest.json';
import { runDetector, type WorkletMessage } from './harness/beat-sandbox';
import { evaluateRecordedMusic, loadRecordedMusic } from './harness/recorded-music';

const measurements: Array<ReturnType<typeof evaluateRecordedMusic>> = [];
const withoutPostingBlock = (messages: WorkletMessage[]) => messages.map(({ _audioTimeSec, ...message }) => message);

describe('recorded music MIR observations', () => {
  for (const fixture of loadRecordedMusic()) {
    it(`${fixture.label}: preserves analysis across render blocks and provisional delivery settings`, () => {
      const normal = runDetector(fixture.samples).messages;
      const largerBlocks = runDetector(fixture.samples, { blockSize: 256 }).messages;
      const lockedOnly = runDetector(fixture.samples, { processorOptions: { emitProvisionalBeats: false } }).messages;

      expect(normal.some(message => message.type === 'state')).toBe(true);
      expect(withoutPostingBlock(largerBlocks)).toEqual(withoutPostingBlock(normal));
      expect(normal.filter(message => message.type === 'state')).toEqual(lockedOnly.filter(message => message.type === 'state'));
      expect(normal.filter(message => message.type === 'beat' && message.status === 'locked')).toEqual(
        lockedOnly.filter(message => message.type === 'beat'),
      );

      for (const message of normal) {
        expect(Number.isFinite(message._audioTimeSec)).toBe(true);

        if (message.type === 'state' || message.type === 'beat') {
          expect(Number.isFinite(message.tempo)).toBe(true);
          expect(message.confidence).toBeGreaterThanOrEqual(0);
          expect(message.confidence).toBeLessThanOrEqual(1);
        }
      }

      measurements.push(evaluateRecordedMusic(normal, fixture));
    });
  }

  afterAll(() => {
    console.table(
      measurements.map(({ label, annotationStatus, observed }) => ({ fixture: label, reference: annotationStatus, ...observed })),
    );

    if (process.env.MIR_MUSIC_REPORT_PATH) {
      writeFileSync(
        process.env.MIR_MUSIC_REPORT_PATH,
        `${JSON.stringify({ schemaVersion: 1, sampleRate: 48000, blockSize: 128, corpus: manifest, measurements }, null, 2)}\n`,
      );
    }
  });
});
