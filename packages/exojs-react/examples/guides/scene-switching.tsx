import { FadeSceneTransition } from '@codexo/exojs';
import { ExoCanvas, Scene, Scenes } from '@codexo/exojs-react';

import { Hud } from './active-scene-hud';
import { GameScene, TitleScene } from './scenes';

// #region guide:scene-switching
function Game({ screen }: { screen: 'title' | 'game' }) {
  return (
    <ExoCanvas options={{ canvas: { width: 1280, height: 720 } }} style={{ width: 1280, height: 720 }}>
      <Scenes active={screen} transition={new FadeSceneTransition({ duration: 300 })}>
        <Scene name="title" component={TitleScene} />
        <Scene name="game" component={GameScene}>
          <Hud />
        </Scene>
      </Scenes>
    </ExoCanvas>
  );
}
// #endregion guide:scene-switching

export { Game };
