import { Application, Color } from '@codexo/exojs';

import { AudioReactiveScene } from './scenes/AudioReactiveScene';

const app = new Application({
  scenes: { AudioReactiveScene },
  canvas: {
    width: 800,
    height: 600,
    mount: 'body',
  },
  clearColor: new Color(8, 8, 16),
});

await app.start(AudioReactiveScene);
