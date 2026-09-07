import { Application, Color, FixedResolutionCanvasSizing } from '@codexo/exojs';

import { PlatformerScene } from './scenes/PlatformerScene';

const app = new Application({
  scenes: { PlatformerScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: 'body',
    sizing: new FixedResolutionCanvasSizing(),
  },
  // Every path the scene loads is resolved against this, so the sources name
  // assets rather than URLs. Vite serves `public/` at the site root.
  loader: { basePath: 'assets/' },
  clearColor: new Color(16, 20, 31),
});

await app.start(PlatformerScene);
