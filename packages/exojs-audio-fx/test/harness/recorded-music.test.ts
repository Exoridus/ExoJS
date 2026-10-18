import type { BeatMessage } from './beat-sandbox';
import { decodeRecordedPcm, evaluateRecordedMusic, type MusicAnnotation } from './recorded-music';

const beat = { type: 'beat', audioTime: 1, _audioTimeSec: 1.1, status: 'locked' } as BeatMessage;
const samples = new Float32Array(48000 * 3);
const evaluate = (annotation: MusicAnnotation) => evaluateRecordedMusic([beat], { label: 'reference-contract', samples, annotation });

describe('recorded music reference contracts', () => {
  it('does not turn unreviewed candidates into quality scores or false positives', () => {
    const result = evaluate({ status: 'unreviewed', candidateBeatTimesSec: [1], notes: 'Independent proposal only.' });
    expect(result.quality).toBeNull();
    expect(result.observed.lockedCount).toBe(1);
    expect(result.observed.firstPostedSec).toBe(1.1);
  });

  it('scores only explicitly reviewed beat references', () => {
    const result = evaluate({
      status: 'reviewed',
      kind: 'beats',
      beatTimesSec: [1, 1.5, 2],
      reviewedBy: 'test oracle',
      notes: 'Analytical fixture.',
    });
    expect(result.quality?.all.precision).toBe(1);
    expect(result.quality?.all.recall).toBeCloseTo(1 / 3);
    expect(result.quality?.all.postingLatencyMs?.medianLower).toBeCloseTo(100);
  });

  it('distinguishes reviewed no-pulse audio from missing annotations', () => {
    const result = evaluate({
      status: 'reviewed',
      kind: 'no-pulse',
      beatTimesSec: [],
      reviewedBy: 'test oracle',
      notes: 'No perceptible pulse.',
    });
    expect(result.quality?.all.falsePositiveCount).toBe(1);
    expect(result.quality?.all.falsePositivesPerMinute).toBe(20);
    expect(result.quality?.tempo.accuracy).toBeNull();
  });

  it.each([
    { kind: 'beats', beatTimesSec: [] },
    { kind: 'beats', beatTimesSec: [1, 1] },
    { kind: 'beats', beatTimesSec: [2, 1] },
    { kind: 'beats', beatTimesSec: [-1, 1] },
    { kind: 'beats', beatTimesSec: [1, 3] },
    { kind: 'beats', beatTimesSec: [1, Number.NaN] },
    { kind: 'no-pulse', beatTimesSec: [1] },
  ] as const)('rejects invalid reviewed references: %j', reference => {
    expect(() =>
      evaluate({
        status: 'reviewed',
        reviewedBy: 'test oracle',
        notes: 'Invalid reference.',
        ...reference,
        beatTimesSec: [...reference.beatTimesSec],
      }),
    ).toThrow();
  });

  it('requires review provenance', () => {
    expect(() => evaluate({ status: 'reviewed', kind: 'beats', beatTimesSec: [1, 2], reviewedBy: '', notes: '' })).toThrow();
  });
});

const wav = (): Buffer => {
  const bytes = Buffer.alloc(50);
  bytes.write('RIFF');
  bytes.writeUInt32LE(42, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(48000, 24);
  bytes.writeUInt32LE(96000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(6, 40);
  bytes.writeInt16LE(-32768, 44);
  bytes.writeInt16LE(0, 46);
  bytes.writeInt16LE(32767, 48);

  return bytes;
};

describe('canonical recorded PCM decoding', () => {
  it('preserves signed PCM scale without normalizing', () => {
    expect([...decodeRecordedPcm(wav())]).toEqual([-1, 0, 32767 / 32768]);
  });

  it('rejects a different sample rate instead of silently changing timing', () => {
    const bytes = wav();
    bytes.writeUInt32LE(44100, 24);
    expect(() => decodeRecordedPcm(bytes)).toThrow();
  });

  it('rejects truncation and incompatible channel/encoding headers', () => {
    expect(() => decodeRecordedPcm(wav().subarray(0, 49))).toThrow();

    for (const offset of [20, 22, 32, 34]) {
      const bytes = wav();
      bytes.writeUInt16LE(3, offset);
      expect(() => decodeRecordedPcm(bytes)).toThrow();
    }
  });
});
