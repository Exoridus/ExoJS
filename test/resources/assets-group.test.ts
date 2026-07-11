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

  it('rejects an entry that carries its own "kind" instead of silently overriding the group kind (A2)', () => {
    expect(() =>
      Assets.group('texture', {
        // A kind-carrying entry contradicts the same-kind contract — previously
        // { kind, ...base, ...entry } let entry.kind silently win.
        boss: { kind: 'sound', source: 'b.png' } as never,
      }),
    ).toThrow(/kind/);
  });

  it('rejects a nested group spread into another group (A2)', () => {
    expect(() =>
      Assets.group('texture', {
        // A nested group produces { kind, source, ... } values — reject them with
        // guidance to spread groups into Assets.from(...) instead.
        ...(Assets.group('sound', { jump: 'jump.wav' }) as never),
      } as never),
    ).toThrow(/kind/);
  });

  it('still composes multiple groups when spread into Assets.from()', () => {
    const assets = Assets.from({
      ...Assets.group('texture', { player: 'player.png' }),
      ...Assets.group('sound', { jump: 'jump.wav' }),
    });

    expect(assets.player).toBeInstanceOf(Texture);
    expect(assets.jump.state).toBe('idle');
  });
});
