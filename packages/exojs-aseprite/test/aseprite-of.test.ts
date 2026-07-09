import type { Asset } from '@codexo/exojs';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { AsepriteSheet } from '../src/AsepriteSheet';

// The `AsepriteSheet.of(...)` annotation static is the post-token-form load path:
// `loader.load(AsepriteSheet.of('hero.aseprite.json'))`. It builds a typed
// `Asset<AsepriteSheet>` descriptor carrying the `asepriteSheet` kind.
describe('AsepriteSheet.of annotation static', () => {
  it('carries the asepriteSheet kind + source', () => {
    const a = AsepriteSheet.of('hero.aseprite.json');
    expect(a.type).toBe('asepriteSheet');
    expect(a.source).toBe('hero.aseprite.json');
  });

  it('is typed as Asset<AsepriteSheet>', () => {
    expectTypeOf(AsepriteSheet.of('hero.aseprite.json')).toEqualTypeOf<Asset<AsepriteSheet>>();
  });
});
