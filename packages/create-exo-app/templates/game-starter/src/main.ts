import { Application, Color } from '@codexo/exojs';

import { GameOverScene } from './scenes/GameOverScene';
import { GameScene } from './scenes/GameScene';

const app = new Application({
  scenes: { GameScene, GameOverScene },
  canvas: {
    width: 800,
    height: 600,
    mount: 'body',
  },
  clearColor: new Color(18, 28, 48),
});

await app.start(GameScene);
