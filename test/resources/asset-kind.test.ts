import { describe, expect, it } from 'vitest';

import { Asset } from '#resources/Asset';

describe('Asset.kind()', () => {
  it('builds a descriptor carrying source + options', () => {
    const descriptor = Asset.kind('texture', 'sprites/player.png', { mimeType: 'image/png' });

    expect(descriptor.source).toBe('sprites/player.png');
  });

  it('builds a value descriptor', () => {
    const descriptor = Asset.kind('json', 'levels/01.json');

    expect(descriptor.source).toBe('levels/01.json');
  });
});
