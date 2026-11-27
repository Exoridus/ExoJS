import { runInNewContext } from 'node:vm';

import { validateRgba8Payload } from '#rendering/texture/pixelPayload';

const payload = (data: Uint8Array) => ({
  levels: [{ data, width: 2, height: 2 }],
  colorSpace: 'srgb' as const,
  alphaMode: 'straight' as const,
});

describe('validateRgba8Payload', () => {
  test('accepts a Uint8Array level from another realm', () => {
    const data = runInNewContext('new Uint8Array(16)') as Uint8Array;

    expect(validateRgba8Payload(payload(data)).data).toBe(data);
  });

  test('still rejects wrongly sized and non-Uint8Array levels', () => {
    expect(() => validateRgba8Payload(payload(new Uint8Array(15)))).toThrow(/needs 16 bytes, but carries 15/);
    expect(() => validateRgba8Payload(payload(new Uint8ClampedArray(16) as unknown as Uint8Array))).toThrow(/non-Uint8Array value/);
    expect(() => validateRgba8Payload(payload(runInNewContext('new Uint8ClampedArray(16)') as Uint8Array))).toThrow(/non-Uint8Array value/);
  });
});
