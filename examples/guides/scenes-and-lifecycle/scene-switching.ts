import { Application, FadeSceneTransition, Scene } from '@codexo/exojs';

class GameScene extends Scene {}

// #region guide:scene-switching
const app = new Application({ scenes: { GameScene } });

// Replace the active scene with a fresh instance
await app.scenes.change(GameScene);

// Replace with a fade transition
await app.scenes.change(GameScene, { transition: new FadeSceneTransition() });
// #endregion guide:scene-switching

export { GameScene };
