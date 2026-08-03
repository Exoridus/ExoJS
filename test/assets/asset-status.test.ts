import { assertType, describe, it } from 'vitest';

import { AssetRef } from '#assets/AssetRef';
import type { AssetStatus } from '#assets/AssetStatus';
import { Sound } from '#audio/Sound';
import { Texture } from '#rendering/texture/Texture';

describe('AssetStatus is satisfied by every handle/ref', () => {
  it('AssetRef, Texture, Sound are assignable to AssetStatus', () => {
    assertType<AssetStatus>(new AssetRef<number>());
    assertType<AssetStatus>(new Texture(null));
    assertType<AssetStatus>(new Sound(null));
  });
});
