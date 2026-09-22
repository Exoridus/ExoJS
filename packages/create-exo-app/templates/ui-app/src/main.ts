import { Application, Color, FixedResolutionCanvasSizing } from '@codexo/exojs';

import { SettingsScene } from './scenes/SettingsScene';

const app = new Application({
  scenes: { SettingsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: 'body',
    // Keeps the design resolution above and scales the canvas to its box, so
    // widget positions stay in the coordinates they were authored in.
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(11, 14, 20),
});

await app.start(SettingsScene);
