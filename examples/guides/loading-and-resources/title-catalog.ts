import { Assets } from '@codexo/exojs';

// #region guide:title-catalog
export const TitleAssets = Assets.from({
  logo: 'sprites/logo.png', // bare path → Texture
  jingle: { type: 'sound', source: 'audio/title.ogg' }, // explicit type; heals in place like a texture
  config: { type: 'json', source: 'data/config.json', parse: (raw: unknown) => raw as { startLevel: string } },
});
// #endregion guide:title-catalog

// #region guide:catalog-members
const logo = TitleAssets.logo; // Texture
const jingle = TitleAssets.jingle; // Sound
const config = TitleAssets.config; // AssetRef<{ startLevel: string }>
// #endregion guide:catalog-members
