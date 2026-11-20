import { type Application, Color, Container, Graphics, LoadingSceneTransition, Scene } from '@codexo/exojs';

class GameScene extends Scene {}

export const startGame = async (app: Application): Promise<void> => {
  // #region guide:loading-transition
  const transition = new LoadingSceneTransition({
    createOverlay: () => {
      const fill = new Graphics();

      fill.fillColor = Color.white;
      fill.drawRectangle(0, 0, 1, 1);

      return {
        node: new Container().addChild(fill),
        update(_delta, rendering, progress) {
          const { left, top, width } = rendering.screenView.getBounds();
          const fraction = progress === undefined || progress.total === 0 ? 0 : progress.loaded / progress.total;

          fill.setPosition(left, top).setScale(width * fraction, 8);
        },
      };
    },
  });

  await app.scenes.change(GameScene, { transition });
  // #endregion guide:loading-transition
};
