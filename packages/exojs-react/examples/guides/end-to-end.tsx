// #region guide:end-to-end
import { FadeSceneTransition } from '@codexo/exojs';
import { ExoCanvas, Scene, Scenes, useActiveScene } from '@codexo/exojs-react';
import { useState } from 'react';

import { GameScene, TitleScene } from './scenes';

function Hud() {
  const scene = useActiveScene();
  return <div style={{ position: 'absolute', top: 8, left: 8, color: 'white' }}>{scene?.constructor.name}</div>;
}

export function App() {
  const [screen, setScreen] = useState<'title' | 'game'>('title');

  return (
    <ExoCanvas options={{ canvas: { width: 1280, height: 720 } }} style={{ width: 1280, height: 720 }}>
      <Scenes active={screen} transition={new FadeSceneTransition({ duration: 300 })}>
        <Scene name="title" component={TitleScene}>
          <button style={{ position: 'absolute', inset: 0 }} onClick={() => setScreen('game')}>
            Start
          </button>
        </Scene>
        <Scene name="game" component={GameScene}>
          <Hud />
        </Scene>
      </Scenes>
    </ExoCanvas>
  );
}
// #endregion guide:end-to-end
