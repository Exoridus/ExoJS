# ExoJS

ExoJS is a TypeScript-first 2D runtime for browser games and interactive apps. It is designed around explicit scene flow, practical rendering features, and predictable runtime behavior.

## Why ExoJS

- TypeScript-first API surface with strong runtime contracts
- Scene and asset workflows built for real game loops
- Modern rendering stack: WebGPU-first with WebGL2 fallback
- Practical visuals: filters, masks, render passes, cache-as-bitmap
- Gameplay tools: animated sprites, scene stacking, camera helpers, audio sprites
- Performance visibility with built-in render stats and benchmark harness
- Optional Rapier physics integration without forcing physics on every app

## What Is Shipped Today

- `Application`, `Scene`, and scene-manager lifecycle
- Typed `Loader` with manifest/bundle workflow (`defineAssetManifest`, `registerManifest`, `loadBundle`)
- Drawables: `Sprite`, `AnimatedSprite`, `Graphics`, `ParticleSystem`, `Text`, `Video`
- Scene stacking (`overlay` / `modal` / `opaque`) with input routing and fade transitions
- View/camera helpers (`follow`, bounds clamp, shake, zoom)
- Rendering composition primitives (`RenderTexture`, `RenderTargetPass`, filter chains, masks, cache-as-bitmap)
- Render stats (`submittedNodes`, `culledNodes`, `drawCalls`, `batches`, `renderPasses`, ...)
- Optional Rapier adapter (`createRapierPhysicsWorld`)

## Installation

```bash
npm install exojs
```

## Quickstart

```ts
import { Application, Scene, Graphics, Color, type SceneRenderRuntime } from 'exojs';

class HelloScene extends Scene {
    private readonly box = new Graphics();

    public constructor() {
        super();

        this.box.fillColor = Color.white;
        this.box.drawRectangle(-32, -32, 64, 64);
        this.box.setPosition(400, 300);

        this.addChild(this.box);
    }

    public override update(delta: import('exojs').Time): void {
        this.box.rotation += delta.seconds * 45;
    }

    public override draw(runtime: SceneRenderRuntime): void {
        this.root.render(runtime);
    }
}

const canvas = document.querySelector('canvas');

if (!canvas) {
    throw new Error('Missing <canvas> element.');
}

const app = new Application({
    canvas,
    width: 800,
    height: 600,
    clearColor: Color.cornflowerBlue,
});

await app.start(new HelloScene());
```

## Next Steps

- Documentation hub: [docs/README.md](docs/README.md)
- Getting started: [docs/getting-started/quickstart.md](docs/getting-started/quickstart.md)
- Core concepts: [docs/core-concepts/overview.md](docs/core-concepts/overview.md)
- Assets and bundles: [docs/assets/loader-and-bundles.md](docs/assets/loader-and-bundles.md)
- Scenes and stack flow: [docs/scenes/scene-flow.md](docs/scenes/scene-flow.md)
- Rendering and visuals: [docs/rendering/visual-capabilities.md](docs/rendering/visual-capabilities.md)
- Audio workflow: [docs/audio/audio-workflow.md](docs/audio/audio-workflow.md)
- Optional physics: [docs/physics/rapier-integration.md](docs/physics/rapier-integration.md)
- Performance/debugging: [docs/performance/performance-and-debugging.md](docs/performance/performance-and-debugging.md)
- API reference: [docs/api/README.md](docs/api/README.md)
- In-repo examples: [examples/README.md](examples/README.md)

## WebGPU and WebGL2

`Application` defaults to backend auto-selection:

- prefers WebGPU when available
- falls back to WebGL2 if WebGPU is unavailable or initialization fails

You can force backend selection when needed:

```ts
new Application({ backend: { type: 'webgpu' } });
new Application({ backend: { type: 'webgl2' } });
new Application({ backend: { type: 'auto' } });
```

## Optional Rapier Physics

Rapier integration is opt-in and loaded only when you use it.

```ts
import { createRapierPhysicsWorld } from 'exojs';

const physics = await createRapierPhysicsWorld({ gravityY: 9.81 });
```

If Rapier is unavailable, creation fails with a clear setup error.

## Examples

The runnable live site (Astro + Lit + Monaco preview) lives in [`examples-site/`](examples-site/README.md) and is deployed as the repository's GitHub Pages site at <https://exoridus.github.io/ExoJS/>.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:package
npm run perf:benchmark
```

## Links

- Repository: <https://github.com/Exoridus/ExoJS>
- Issues: <https://github.com/Exoridus/ExoJS/issues>
- Changelog: [CHANGELOG.md](CHANGELOG.md)
