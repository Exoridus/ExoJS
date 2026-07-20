import { Application, Color } from '@codexo/exojs';
import { GameOverScene } from './scenes/GameOverScene';
import { GameScene } from './scenes/GameScene';

const app = new Application({
  scenes: { GameScene, GameOverScene },
  canvas: {
    width: 800,
    height: 600,
  },
  clearColor: new Color(18, 28, 48),
});

document.body.append(app.canvas);

app.start(GameScene);
