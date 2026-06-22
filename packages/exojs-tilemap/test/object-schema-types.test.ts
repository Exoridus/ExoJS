/**
 * Compile-time type contracts for the opt-in ObjectLayer schema (D3).
 *
 * Uses Vitest's built-in `expectTypeOf` (the same convention as
 * pixel-snap-types.test.ts and test/core/type-assertions.test.ts): the
 * assertions are validated by the TypeScript compiler, not at runtime. Imports
 * go through the PUBLIC package specifier so the contracts cover exactly what
 * consumers see.
 *
 * The schema is a developer promise — there is no runtime validation — so these
 * tests assert only the *static* narrowing of `properties` for byType / where
 * and the geometry discriminant narrowing for byKind, plus that the default
 * (un-schematised) form preserves the original untyped behaviour.
 */

import type { PolygonObject, TileMapObject, TileProperties } from '@codexo/exojs-tilemap';
import { ObjectKind, ObjectLayer, TileMap } from '@codexo/exojs-tilemap';
import { describe, expectTypeOf, it } from 'vitest';

const EntityType = { Spawn: 'spawn', Trigger: 'trigger', Pickup: 'pickup' } as const;

interface LevelObjects {
  [EntityType.Spawn]: { team: 'red' | 'blue' };
  [EntityType.Trigger]: { event: string; once?: boolean };
  [EntityType.Pickup]: { item: 'coin' | 'gem'; amount: number };
}

describe('ObjectKind value object', () => {
  it('is a frozen string map whose members are the wire-format literals', () => {
    expectTypeOf(ObjectKind.Rectangle).toEqualTypeOf<'rectangle'>();
    expectTypeOf(ObjectKind.Polygon).toEqualTypeOf<'polygon'>();
    expectTypeOf(ObjectKind.Tile).toEqualTypeOf<'tile'>();
  });

  it('ObjectKind type is the union of the six geometry literals', () => {
    expectTypeOf<ObjectKind>().toEqualTypeOf<
      'rectangle' | 'ellipse' | 'polygon' | 'polyline' | 'point' | 'tile'
    >();
  });

  it('TileMapObjectKind remains a structural alias of ObjectKind', () => {
    expectTypeOf<import('@codexo/exojs-tilemap').TileMapObjectKind>().toEqualTypeOf<ObjectKind>();
  });
});

describe('ObjectLayer typed accessors (schema is opt-in)', () => {
  // `expectTypeOf` evaluates its argument at runtime, so these contracts
  // operate on element *types* (never index into the empty arrays returned by
  // calls on an empty layer). The assertions are checked by `tsc`.
  it('byType narrows properties to the declared schema shape', () => {
    const layer = new ObjectLayer<LevelObjects>({ id: 1 });

    type Spawn = ReturnType<typeof layer.byType<typeof EntityType.Spawn>>[number];
    type Pickup = ReturnType<typeof layer.byType<typeof EntityType.Pickup>>[number];
    type Trigger = ReturnType<typeof layer.byType<typeof EntityType.Trigger>>[number];

    expectTypeOf<Spawn['properties']['team']>().toEqualTypeOf<'red' | 'blue'>();
    expectTypeOf<Pickup['properties']['amount']>().toEqualTypeOf<number>();
    expectTypeOf<Pickup['properties']['item']>().toEqualTypeOf<'coin' | 'gem'>();
    expectTypeOf<Trigger['properties']['once']>().toEqualTypeOf<boolean | undefined>();
  });

  it('byType rejects a type key absent from the schema', () => {
    const layer = new ObjectLayer<LevelObjects>({ id: 1 });
    // @ts-expect-error — 'enemy' is not a key of LevelObjects
    layer.byType('enemy');
  });

  it('where keeps the narrowed properties type inside the predicate', () => {
    const layer = new ObjectLayer<LevelObjects>({ id: 1 });

    type Big = ReturnType<typeof layer.where<typeof EntityType.Pickup>>[number];
    expectTypeOf<Big['properties']['item']>().toEqualTypeOf<'coin' | 'gem'>();
    expectTypeOf<Parameters<Parameters<typeof layer.where<'pickup'>>[1]>[0]['properties']['amount']>().toEqualTypeOf<number>();
  });

  it('byKind narrows to the matching geometry member type', () => {
    const layer = new ObjectLayer<LevelObjects>({ id: 1 });

    type Polys = ReturnType<typeof layer.byKind<typeof ObjectKind.Polygon>>;
    expectTypeOf<Polys>().toEqualTypeOf<PolygonObject[]>();
    // PolygonObject carries `points`; the narrowing exposes it.
    expectTypeOf<Polys[number]['points']>().toEqualTypeOf<readonly { readonly x: number; readonly y: number }[]>();
  });
});

describe('default (un-schematised) ObjectLayer preserves untyped behaviour', () => {
  it('byType yields loose TileProperties when no schema is supplied', () => {
    const layer = new ObjectLayer({ id: 1 });
    // Any string is an acceptable type key on the default schema …
    type AnyObj = ReturnType<typeof layer.byType<'whatever'>>[number];
    expectTypeOf<AnyObj['properties']>().toEqualTypeOf<TileProperties>();
  });

  it('query still returns the generic TileMapObject[] union', () => {
    const layer = new ObjectLayer({ id: 1 });
    expectTypeOf(layer.query()).toEqualTypeOf<TileMapObject[]>();
    expectTypeOf(layer.objects).toEqualTypeOf<readonly TileMapObject[]>();
  });

  it('TileMap.getObjectLayer threads the schema parameter through', () => {
    const map = new TileMap({ width: 2, height: 2, tileWidth: 16, tileHeight: 16 });

    expectTypeOf(map.getObjectLayer('x')).toEqualTypeOf<ObjectLayer<Record<string, TileProperties>> | undefined>();
    expectTypeOf(map.getObjectLayer<LevelObjects>('Entities')).toEqualTypeOf<ObjectLayer<LevelObjects> | undefined>();
  });
});
