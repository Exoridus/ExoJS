import { describe, expect, test } from 'vitest';

import { LutFilter } from '#rendering/filters/LutFilter';
import { DataTexture } from '#rendering/texture/DataTexture';
import { TextureFormat } from '#rendering/types';

describe('LutFilter identity LUT ownership', () => {
  test('destroy releases the identity LUT the constructor created', () => {
    const filter = new LutFilter();
    const identity = filter.lut;

    filter.destroy();

    expect(identity.destroyed).toBe(true);
  });

  test('setLut releases the replaced identity LUT but never a caller-supplied one', () => {
    const filter = new LutFilter();
    const identity = filter.lut;
    const custom = new DataTexture({ width: 4, height: 1, format: TextureFormat.Rgba8 });

    filter.setLut(custom);

    expect(identity.destroyed).toBe(true);

    filter.destroy();

    expect(custom.destroyed).toBe(false);
  });
});
