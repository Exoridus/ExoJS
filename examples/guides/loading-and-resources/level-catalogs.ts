import { Assets } from '@codexo/exojs';

// #region guide:level-catalogs
export const MenuAssets = Assets.from({
  logo: 'image/logo.png',
  click: { type: 'sound', source: 'audio/click.ogg' },
});

export const Level1Assets = Assets.from({
  tiles: 'image/level-1/tiles.png',
  map: { type: 'json', source: 'data/level-1.json', parse: (raw: unknown) => raw as { spawn: [number, number] } },
});
// #endregion guide:level-catalogs

export const Level2Assets = Assets.from({
  tiles: 'image/level-2/tiles.png',
  map: { type: 'json', source: 'data/level-2.json', parse: (raw: unknown) => raw as { spawn: [number, number] } },
});
