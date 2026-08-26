import { Asset, Assets } from '@codexo/exojs';

// #region guide:level-catalogs
export const MenuAssets = Assets.from({
  logo: 'image/logo.png',
  music: Asset.type('music', 'audio/theme.ogg'),
});

export const Level1Assets = Assets.from({
  tiles: 'image/level-1/tiles.png',
  map: Asset.type<{ spawn: [number, number] }>('json', 'data/level-1.json'),
});
// #endregion guide:level-catalogs

export const Level2Assets = Assets.from({
  tiles: 'image/level-2/tiles.png',
  map: Asset.type<{ spawn: [number, number] }>('json', 'data/level-2.json'),
});
