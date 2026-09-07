import { Application, Color, FixedResolutionCanvasSizing } from '@codexo/exojs';
import { tiledExtension } from '@codexo/exojs-tiled';

import { ProceduralMapScene } from './scenes/ProceduralMapScene';
import { TiledMapScene } from './scenes/TiledMapScene';

const app = new Application({
  scenes: { ProceduralMapScene, TiledMapScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: 'body',
    sizing: new FixedResolutionCanvasSizing(),
  },
  // Every path a scene loads is resolved against this, so the sources name
  // assets rather than URLs. Vite serves `public/` at the site root.
  loader: { basePath: 'assets/' },
  // `tiledExtension` registers the `tileMap` and `tiledSource` asset types.
  // It depends on the tilemap extension and pulls it in, so registering this
  // one alone is enough for both scenes.
  extensions: [tiledExtension],
  clearColor: new Color(19, 26, 23),
});

// Two scenes, one level. `ProceduralMapScene` builds the map in code and
// `TiledMapScene` loads it from `town-square.tmj`; both share everything else
// through `TopDownScene`. Start whichever suits the project and delete the
// other - or switch at runtime with `app.scenes.change(TiledMapScene)`.
await app.start(ProceduralMapScene);
