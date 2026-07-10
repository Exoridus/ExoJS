// Strict:false regression guard for the `Assets.from()` catalog inference
// (S3 Phase 4.5, G2). Compiled by `tsconfig.type-tests.json`, which inherits the
// `strict: false` / `strictNullChecks: false` example project settings — the exact
// configuration under which `Assets.from({ ship: 'ship.png' }).ship` degraded to
// `{}` before the `const` type parameter on `Assets.from` was added.
//
// This file is NOT a vitest test (no `.test.ts` suffix, so vitest never collects
// it) and is not synced into the example catalog. It exists purely so `tsc`
// validates the leaf types under a non-strict project.

import { AssetRef, Assets, type Texture } from '@codexo/exojs';

// Compile-time exact-type assertion, independent of vitest/expectTypeOf so it can
// be validated by a bare `tsc --noEmit`.
type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const catalog = Assets.from({
  ship: 'ship.png', // resource kind (texture) → heal-in-place Texture
  level: 'level.json', // value kind (json) → deferred AssetRef
});

// Before the fix these both degraded to `{}` under strict:false. The literal path
// strings must survive inference so their file suffix classifies the leaf.
type _ShipIsTexture = Expect<Equal<typeof catalog.ship, Texture>>;
type _LevelIsAssetRef = Expect<Equal<typeof catalog.level, AssetRef<unknown>>>;

// Reference the aliases so `noUnusedLocals`-style checks and eslint stay quiet.
export type { _LevelIsAssetRef, _ShipIsTexture };
void AssetRef;
