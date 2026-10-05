import { Application, Scene } from '@codexo/exojs';

// #region guide:start-loop
class HelloScene extends Scene {}

const app = new Application({ scenes: { HelloScene } });
await app.start(HelloScene);
// #endregion guide:start-loop

export { HelloScene };
