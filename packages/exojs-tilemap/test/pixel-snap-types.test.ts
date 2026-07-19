/**
 * Compile-time type contracts for the render-only pixel-snapping API.
 *
 * Uses Vitest's built-in `expectTypeOf` (the same convention as
 * test/core/type-assertions.test.ts and the type-contract blocks in
 * view.test.ts): the assertions are validated by the TypeScript compiler,
 * not at runtime. Imports go through the PUBLIC package specifiers so the
 * contracts cover exactly what consumers see.
 */

import { type Drawable, type NineSliceSprite, PixelSnapMode, type Sprite } from '@codexo/exojs';
import type { TileLayerNode, TileMapNode, TileMapView } from '@codexo/exojs-tilemap';
import { describe, expectTypeOf, it } from 'vitest';

describe('PixelSnapMode type contracts', () => {
  it('is exactly the three documented enum members', () => {
    expectTypeOf<PixelSnapMode>().toEqualTypeOf<PixelSnapMode.None | PixelSnapMode.Position | PixelSnapMode.Geometry>();
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

  it('enum members are assignable; the legacy string literals are not', () => {
    expectTypeOf<PixelSnapMode.None>().toMatchTypeOf<PixelSnapMode>();
    expectTypeOf<PixelSnapMode.Position>().toMatchTypeOf<PixelSnapMode>();
    expectTypeOf<PixelSnapMode.Geometry>().toMatchTypeOf<PixelSnapMode>();
    expectTypeOf<'position'>().not.toMatchTypeOf<PixelSnapMode>();
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

    // Valid enum members compile on every carrier …
    sprite.pixelSnapMode = PixelSnapMode.None;
    drawable.pixelSnapMode = PixelSnapMode.Position;
    view.pixelSnapMode = PixelSnapMode.Position;
    mapNode.pixelSnapMode = PixelSnapMode.Geometry;
    layerNode.pixelSnapMode = PixelSnapMode.Geometry;

    // … invalid ones do not.
    // @ts-expect-error — the legacy 'none' string is not a PixelSnapMode
    sprite.pixelSnapMode = 'none';
    // @ts-expect-error — the legacy 'geometry' string is not a PixelSnapMode
    nineSlice.pixelSnapMode = 'geometry';
    // @ts-expect-error — a widened string is not narrowable to PixelSnapMode
    drawable.pixelSnapMode = String('none');
    // @ts-expect-error — arbitrary strings are not PixelSnapMode
    view.pixelSnapMode = 'bogus';
    // @ts-expect-error — a widened number is not narrowable to PixelSnapMode
    mapNode.pixelSnapMode = Number(1);
    // @ts-expect-error — out-of-domain numeric literals are not PixelSnapMode
    layerNode.pixelSnapMode = 7;
  });
});
