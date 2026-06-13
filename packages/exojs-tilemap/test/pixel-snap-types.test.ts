/**
 * Compile-time type contracts for the render-only pixel-snapping API.
 *
 * Uses Vitest's built-in `expectTypeOf` (the same convention as
 * test/core/type-assertions.test.ts and the type-contract blocks in
 * view.test.ts): the assertions are validated by the TypeScript compiler,
 * not at runtime. Imports go through the PUBLIC package specifiers so the
 * contracts cover exactly what consumers see.
 */

import type { Drawable, NineSliceSprite, PixelSnapMode, Sprite } from '@codexo/exojs';
import type { TileLayerNode, TileMapNode, TileMapView } from '@codexo/exojs-tilemap';
import { describe, expectTypeOf, it } from 'vitest';

describe('PixelSnapMode type contracts', () => {
  it('is exactly the three documented literal modes', () => {
    expectTypeOf<PixelSnapMode>().toEqualTypeOf<'none' | 'position' | 'geometry'>();
  });

  it('core drawables expose pixelSnapMode as PixelSnapMode', () => {
    expectTypeOf<Drawable['pixelSnapMode']>().toEqualTypeOf<PixelSnapMode>();
    expectTypeOf<Sprite['pixelSnapMode']>().toEqualTypeOf<PixelSnapMode>();
    expectTypeOf<NineSliceSprite['pixelSnapMode']>().toEqualTypeOf<PixelSnapMode>();
  });

  it('tilemap composition nodes expose pixelSnapMode as PixelSnapMode', () => {
    expectTypeOf<TileMapView['pixelSnapMode']>().toEqualTypeOf<PixelSnapMode>();
    expectTypeOf<TileMapNode['pixelSnapMode']>().toEqualTypeOf<PixelSnapMode>();
    expectTypeOf<TileLayerNode['pixelSnapMode']>().toEqualTypeOf<PixelSnapMode>();
  });

  it('valid literals are assignable; arbitrary strings are not', () => {
    expectTypeOf<'none'>().toMatchTypeOf<PixelSnapMode>();
    expectTypeOf<'position'>().toMatchTypeOf<PixelSnapMode>();
    expectTypeOf<'geometry'>().toMatchTypeOf<PixelSnapMode>();
    expectTypeOf<'bogus'>().not.toMatchTypeOf<PixelSnapMode>();
    expectTypeOf<string>().not.toMatchTypeOf<PixelSnapMode>();
  });

  it('assigning an invalid literal to pixelSnapMode is a compile error', () => {
    // Shape-only stand-ins: assignments run against plain objects, so the
    // setter checks below stay compile-time-only (no runtime construction).
    const sprite = {} as Sprite;
    const nineSlice = {} as NineSliceSprite;
    const drawable = {} as Drawable;
    const view = {} as TileMapView;
    const mapNode = {} as TileMapNode;
    const layerNode = {} as TileLayerNode;

    // Valid literals compile on every carrier …
    sprite.pixelSnapMode = 'none';
    drawable.pixelSnapMode = 'position';
    view.pixelSnapMode = 'position';
    mapNode.pixelSnapMode = 'geometry';
    layerNode.pixelSnapMode = 'geometry';

    // … invalid ones do not.
    // @ts-expect-error — 'crisp' is not a PixelSnapMode
    sprite.pixelSnapMode = 'crisp';
    // @ts-expect-error — 'Geometry' (wrong case) is not a PixelSnapMode
    nineSlice.pixelSnapMode = 'Geometry';
    // @ts-expect-error — a widened string is not narrowable to PixelSnapMode
    drawable.pixelSnapMode = String('none');
    // @ts-expect-error — 'bogus' is not a PixelSnapMode
    view.pixelSnapMode = 'bogus';
    // @ts-expect-error — 'snap' is not a PixelSnapMode
    mapNode.pixelSnapMode = 'snap';
    // @ts-expect-error — numbers are not PixelSnapMode
    layerNode.pixelSnapMode = 0;
  });
});
