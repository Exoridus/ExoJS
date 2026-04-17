# ExoJS

ExoJS is a TypeScript-first browser multimedia and rendering framework built around a clean `Application` entrypoint, a scene-driven runtime model, and explicit advanced backend surfaces when you need them.

The normal user path is package-based ESM usage through `exojs`.
Advanced backend-specific access lives under dedicated subpaths.

## Package Surface

- Core package: `exojs`
- Advanced WebGL2 surface: `exojs/webgl2`
- Advanced WebGPU surface: `exojs/webgpu`

## Current Built-In Runtime Features

- Application / Scene / drawable rendering flow
- Graphics / DrawableShape rendering
- Sprite rendering
- Animated sprite clip playback
- zIndex-based sortable child ordering
- ParticleSystem rendering
- Text rendering through the normal texture-backed path
- Video rendering through the normal texture-backed path
- RenderTexture / offscreen rendering
- Scene stacking with overlay/modal/opaque participation modes
- Fade scene transitions
- Camera helpers (follow, bounds, shake, zoom)
- Blend modes including normal, additive, subtract, multiply, and screen
- Audio playback and analysis
- Sound pooling and audio sprite clips
- Resource loading and typed factories
- IndexedDB-backed persistence support
- Input handling for pointer and gamepad
- Collision detection / response utilities

## Backend Model

ExoJS now treats WebGPU as the preferred built-in backend when available, with automatic fallback to WebGL2.

Normal users typically do not need to choose a backend explicitly:

```ts
import { Application } from 'exojs';

const app = new Application();
```

If you need to force a backend:

```ts
import { Application } from 'exojs';

const webGpuApp = new Application({ backend: { type: 'webgpu' } });
const webGlApp = new Application({ backend: { type: 'webgl2' } });
const autoApp = new Application({ backend: { type: 'auto' } });
```

## Quick Start

Install:

```bash
npm install exojs
```

Minimal example:

```ts
import { Application, Color, Graphics, Scene } from 'exojs';

class DemoScene extends Scene {
    private readonly graphics = new Graphics()
        .beginFill(Color.white)
        .drawRect(-64, -64, 128, 128)
        .endFill();

    public override draw(runtime: import('exojs').SceneRenderRuntime): void {
        this.graphics.rotation += 0.01;
        this.graphics.render(runtime);
    }
}

const app = new Application();
app.start(new DemoScene());
```

## Examples

Primary real-world consumer and validation surface:

- Examples repository: https://github.com/Exoridus/ExoJS-examples
- Live examples: https://exoridus.github.io/ExoJS-examples/

The examples repository covers:

- normal built-in engine usage
- advanced backend-specific extension cases
- WebGL2 and WebGPU validation paths
- smoke-tested browser consumption through the real package surface

## API Docs

Class-focused runtime docs live under [docs/api](docs/api/README.md).

Key pages:

- [Application](docs/api/Application.md)
- [Examples Migration](docs/api/ExamplesMigration.md)
- [Game Feel](docs/api/GameFeel.md)
- [Scene](docs/api/Scene.md)
- [Loader](docs/api/Loader.md)
- [Renderer](docs/api/Renderer.md)
- [Sprite](docs/api/Sprite.md)
- [Input](docs/api/Input.md)

## Advanced Backend Access

Use advanced backend-specific APIs only when you actually need them.

WebGL2 advanced surface:

```ts
import { RenderManager, SpriteRenderer } from 'exojs/webgl2';
```

WebGPU advanced surface:

```ts
import { WebGpuRenderManager, type WebGpuRenderAccess } from 'exojs/webgpu';
```

These subpaths exist for custom renderers and backend-specific systems. They are not required for normal `Application`-centric usage.

## Development

Common validation commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run build:declarations
npm run verify:package
```

Repository-specific contributor guidance:

- AI / agent workflow: [AGENTS.md](AGENTS.md)
- Claude-specific repo guidance: [CLAUDE.md](CLAUDE.md)

## Project Links

- Repository: https://github.com/Exoridus/ExoJS
- Issues: https://github.com/Exoridus/ExoJS/issues
- Examples repository: https://github.com/Exoridus/ExoJS-examples
- Live examples: https://exoridus.github.io/ExoJS-examples/
