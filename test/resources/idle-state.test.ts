import '#resources/coreAssetBindings';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

describe('idle load state', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unadopted catalog leaves are idle', () => {
    const assets = Assets.from({
      ship: 'sprites/ship.png', // resource leaf
      level: { kind: 'json', source: 'l.json' }, // value leaf
    });

    expect(assets.ship.state).toBe('idle');
    expect(assets.level.state).toBe('idle');
  });

  it('a manually constructed runtime resource is never idle', () => {
    expect(Texture.fromColor(0xff0000).state).toBe('ready');
  });

  it('an idle resource leaf is still a usable placeholder', () => {
    const assets = Assets.from({ ship: 'sprites/ship.png' });

    // idle does not mean unusable — the placeholder is a real, renderable Texture.
    expect(assets.ship).toBeInstanceOf(Texture);
  });

  it('adopting an idle leaf transitions it idle -> loading', () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
    const loader = createCoreLoader();
    loader.setConcurrency(0); // park the background queue so the transition is observable

    const assets = Assets.from({ ship: { kind: 'texture', source: 'ship.png' } });
    expect(assets.ship.state).toBe('idle');

    loader.load(assets, { background: true });
    expect(assets.ship.state).toBe('loading');
  });
});
