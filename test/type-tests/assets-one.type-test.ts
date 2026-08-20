// Type contract for `Assets.one()` - a single leaf whose type matches the same
// descriptor-set inference as a catalog field (asset-system v2 §5). Compiled by
// `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`.

import { Asset, AssetRef, Assets, type Texture } from '@codexo/exojs';

import type { CatalogResourceLeaf, CatalogValueLeaf } from './helpers/catalog-leaf';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// bare path, resource kind → the resource leaf
const ship = Assets.one('sprites/ship.png');
type _ShipIsTexture = Expect<Equal<typeof ship, CatalogResourceLeaf<Texture>>>;

// bare path, value kind → deferred AssetRef
const level = Assets.one('level.json');
type _LevelIsRef = Expect<Equal<typeof level, CatalogValueLeaf<unknown>>>;

// resource-kind descriptor → the resource leaf
const tex = Assets.one(Asset.type('texture', 'x.png'));
type _TexIsTexture = Expect<Equal<typeof tex, CatalogResourceLeaf<Texture>>>;

export type { _LevelIsRef, _ShipIsTexture, _TexIsTexture };
void AssetRef;
