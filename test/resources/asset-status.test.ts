import { assertType, describe, it } from 'vitest';

import { Sound } from '#audio/Sound';
import { Texture } from '#rendering/texture/Texture';
import { AssetRef } from '#resources/AssetRef';
import type { AssetStatus } from '#resources/AssetStatus';

describe('AssetStatus is satisfied by every handle/ref', () => {
  it('AssetRef, Texture, Sound are assignable to AssetStatus', () => {
    assertType<AssetStatus>(new AssetRef<number>());
    assertType<AssetStatus>(new Texture(null));
    assertType<AssetStatus>(new Sound(null));
  });
});
