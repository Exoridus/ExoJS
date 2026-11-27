import { Application } from '@codexo/exojs';

const app = new Application();

// #region guide:warm-sources
await app.loader.cacheSource({ type: 'json', source: 'levels/01.json' });
await app.loader.cacheSource({ type: 'json', source: 'text/dialogue.json' });
// #endregion guide:warm-sources

// #region guide:warm-media
await app.loader.cacheSource({ type: 'music', source: 'theme.mp3' });
// #endregion guide:warm-media
