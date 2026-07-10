// Type contract for `Assets.group()` spread into `Assets.from` (asset-system v2
// §6). Compiled by `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`.

import { Assets, type Texture } from '@codexo/exojs';

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const assets = Assets.from({
  ...Assets.group('texture', { player: 'player.png', enemy: 'enemy.png' }, { mimeType: 'image/png' }),
});

type _PlayerIsTexture = Expect<Equal<typeof assets.player, Texture>>;
type _EnemyIsTexture = Expect<Equal<typeof assets.enemy, Texture>>;

export type { _EnemyIsTexture, _PlayerIsTexture };
