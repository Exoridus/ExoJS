import { Application, Scene } from '@codexo/exojs';

// #region guide:minimal-app
class MyScene extends Scene {}

const app = new Application({ scenes: { MyScene } });
await app.start(MyScene);
// #endregion guide:minimal-app

export { MyScene };
