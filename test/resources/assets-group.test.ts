import '#resources/coreAssetBindings';

import { describe, expect, it } from 'vitest';

import { Texture } from '#rendering/texture/Texture';
import { Assets } from '#resources/Assets';

describe('Assets.group', () => {
  it('spreads same-kind configs into a catalog with shared + per-entry options', () => {
    const assets = Assets.from({
      ...Assets.group(
        'texture',
        {
          player: 'sprites/player.png',
          boss: { source: 'sprites/boss.png', mimeType: 'image/webp' },
        },
        { mimeType: 'image/png' },
      ),
      ...Assets.group('sound', {
        jump: 'audio/jump.wav',
        hit: 'audio/hit.wav',
      }),
    });

    expect(assets.player).toBeInstanceOf(Texture);
    expect(assets.player.state).toBe('idle');
    expect(assets.boss).toBeInstanceOf(Texture);
    expect(assets.jump.state).toBe('idle');
    expect(assets.hit.state).toBe('idle');
  });

  it('stamps the group kind and merges shared under a per-entry override', () => {
    const group = Assets.group('texture', { boss: { source: 'b.png', mimeType: 'image/png' } }, { mimeType: 'image/webp' });

    // per-entry mimeType wins over shared
    expect(group.boss).toEqual({ kind: 'texture', source: 'b.png', mimeType: 'image/png' });
  });
});
