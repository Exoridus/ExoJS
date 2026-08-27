// #region guide:minimal-main
import { Application, Color } from '@codexo/exojs';
import { MainScene } from './scenes/MainScene';

const app = new Application({
  scenes: { MainScene },
  canvas: {
    width: 800,
    height: 600,
  },
  clearColor: new Color(0x6495ed),
});

document.body.append(app.canvas);

app.start(MainScene);
// #endregion guide:minimal-main
