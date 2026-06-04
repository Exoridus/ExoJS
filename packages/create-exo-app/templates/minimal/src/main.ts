import { Application, Color } from '@codexo/exojs';
import { MainScene } from './scenes/MainScene';

const app = new Application({
  canvas: {
    width: 800,
    height: 600,
  },
  clearColor: Color.cornflowerBlue,
});

document.body.append(app.canvas);

app.start(new MainScene());
