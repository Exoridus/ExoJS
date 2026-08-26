import { Application, Asset } from '@codexo/exojs';

const app = new Application();

// #region guide:warm-sources
await app.loader.cacheSource(Asset.type('json', 'levels/01.json'));
await app.loader.cacheSource(Asset.type('json', 'text/dialogue.json'));
// #endregion guide:warm-sources

// #region guide:warm-media
await app.loader.cacheSource(Asset.type('music', 'theme.mp3'));
// #endregion guide:warm-media
