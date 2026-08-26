import { Asset, Assets } from '@codexo/exojs';

// #region guide:title-catalog
export const TitleAssets = Assets.from({
  logo: 'sprites/logo.png', // bare path → Texture
  music: Asset.type('music', 'audio/title.ogg'), // explicit non-leaf type
  config: Asset.type<{ startLevel: string }>('json', 'data/config.json'),
});
// #endregion guide:title-catalog

// #region guide:catalog-members
const logo = TitleAssets.logo; // Texture
const music = TitleAssets.music; // AudioStream
const config = TitleAssets.config; // AssetRef<{ startLevel: string }>
// #endregion guide:catalog-members
