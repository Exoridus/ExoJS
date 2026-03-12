# ExoJS

ExoJS is a TypeScript-first browser multimedia and rendering framework built around a clean `Application` entrypoint, a scene-driven runtime model, and explicit advanced backend surfaces when you need them.

The normal user path is package-based ESM usage through `exo-js-core`.
Advanced backend-specific access lives under dedicated subpaths.

## Package Surface

- Core package: `exo-js-core`
- Advanced WebGL2 surface: `exo-js-core/webgl2`
- Advanced WebGPU surface: `exo-js-core/webgpu`

## Current Built-In Runtime Features

- Application / Scene / drawable rendering flow
- Graphics / DrawableShape rendering
- Sprite rendering
- ParticleSystem rendering
- Text rendering through the normal texture-backed path
- Video rendering through the normal texture-backed path
- RenderTexture / offscreen rendering
- Blend modes including normal, additive, subtract, multiply, and screen
- Audio playback and analysis
- Resource loading and typed factories
- IndexedDB-backed persistence support
- Input handling for pointer and gamepad
- Collision detection / response utilities

## Backend Model

ExoJS now treats WebGPU as the preferred built-in backend when available, with automatic fallback to WebGL2.

Normal users typically do not need to choose a backend explicitly:

```ts
import { Application } from 'exo-js-core';

const app = new Application();
```

If you need to force a backend:

```ts
import { Application } from 'exo-js-core';

const webGpuApp = new Application({ backend: { type: 'webgpu' } });
const webGlApp = new Application({ backend: { type: 'webgl2' } });
const autoApp = new Application({ backend: { type: 'auto' } });
```

## Quick Start

Install:

```bash
npm install exo-js-core
```

Minimal example:

```ts
import { Application, Color, Graphics, Scene } from 'exo-js-core';

class DemoScene extends Scene {
    private readonly graphics = new Graphics()
        .beginFill(Color.white)
        .drawRect(-64, -64, 128, 128)
        .endFill();

    public override draw(renderBackend: import('exo-js-core').RenderBackend): void {
        this.graphics.rotation += 0.01;
        this.graphics.render(renderBackend);
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
- [Scene](docs/api/Scene.md)
- [Loader](docs/api/Loader.md)
- [Renderer](docs/api/Renderer.md)
- [Sprite](docs/api/Sprite.md)
- [Input](docs/api/Input.md)

## Advanced Backend Access

Use advanced backend-specific APIs only when you actually need them.

WebGL2 advanced surface:

```ts
import { RenderManager, SpriteRenderer } from 'exo-js-core/webgl2';
```

WebGPU advanced surface:

```ts
import { WebGpuRenderManager, type WebGpuRenderAccess } from 'exo-js-core/webgpu';
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
- AI repository map: [docs/ai/repo-map.md](docs/ai/repo-map.md)

## Project Links

- Repository: https://github.com/Exoridus/ExoJS
- Issues: https://github.com/Exoridus/ExoJS/issues
- Examples repository: https://github.com/Exoridus/ExoJS-examples
- Live examples: https://exoridus.github.io/ExoJS-examples/

