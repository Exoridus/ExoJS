import { Application, Scene } from '@codexo/exojs';

// #region guide:minimal-scene
class HelloScene extends Scene {}

const app = new Application({ scenes: { HelloScene }, canvas: { width: 800, height: 600 } });
await app.start(HelloScene);
// #endregion guide:minimal-scene

export { HelloScene };
