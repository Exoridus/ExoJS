// #region guide:minimal-main
import { Application, Color } from '@codexo/exojs';

import { MainScene } from './scenes/MainScene';

const app = new Application({
  scenes: { MainScene },
  canvas: {
    width: 800,
    height: 600,
    mount: 'body',
  },
  clearColor: new Color(0x6495ed),
});

await app.start(MainScene);
// #endregion guide:minimal-main
