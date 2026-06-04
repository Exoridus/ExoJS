import { Application, Color } from '@codexo/exojs';
import { AudioReactiveScene } from './scenes/AudioReactiveScene';

const app = new Application({
  canvas: {
    width: 800,
    height: 600,
  },
  clearColor: new Color(8, 8, 16),
});

document.body.append(app.canvas);

app.start(new AudioReactiveScene());
