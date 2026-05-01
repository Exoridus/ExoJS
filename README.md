# ExoJS

ExoJS is a TypeScript-first 2D runtime for browser games and interactive apps. It is designed around explicit scene flow, practical rendering features, and predictable runtime behavior.

## Project status

ExoJS is **pre-1.0**. The public API is still under active design — scene graph, rendering pipeline, and resource lifecycle boundaries may change between minor versions. Pin exact versions in downstream experiments. `1.0.0` will mark the first stable API contract.

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
- Rendering composition primitives (`RenderTexture`, `RenderTargetPass`, filter chains, visual masks, cache-as-bitmap)
- Render stats (`submittedNodes`, `culledNodes`, `drawCalls`, `batches`, `renderPasses`, ...)
- Optional Rapier adapter (`createRapierPhysicsWorld`)

## Installation

```bash
npm install @codexo/exojs
```

ExoJS currently publishes an ESM-first package shape. Use `import` syntax with modern bundlers/runtime tooling.
CommonJS `require()` usage is not part of the supported contract for this pre-1.0 line.

## Quickstart

```ts
import { Application, Scene, Graphics, Color, type RenderBackend } from '@codexo/exojs';

class HelloScene extends Scene {
    private readonly box = new Graphics();

    public constructor() {
        super();

        this.box.fillColor = Color.white;
        this.box.drawRectangle(-32, -32, 64, 64);
        this.box.setPosition(400, 300);

        this.addChild(this.box);
    }

    public override update(delta: import('@codexo/exojs').Time): void {
        this.box.rotation += delta.seconds * 45;
    }

    public override draw(backend: RenderBackend): void {
        this.root.render(backend);
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
import { createRapierPhysicsWorld } from '@codexo/exojs';

const physics = await createRapierPhysicsWorld({ gravityY: 9.81 });
```

If Rapier is unavailable, creation fails with a clear setup error.

### Physics scope policy

ExoJS ships **one** physics adapter: Rapier. The integration is intentionally
narrow:

- Physics is **optional**. `@dimforge/rapier2d-compat` is a peer dependency
  marked `optional`. Apps that do not call `createRapierPhysicsWorld` never
  load it and never pay for it at runtime.
- Rendering, application, and core scene code **do not** depend on physics.
  The adapter binds Rapier bodies to scene nodes from the outside; the core
  has no knowledge of physics.
- ExoJS is **not** a physics-engine abstraction layer. There is no
  `PhysicsWorld` interface that spans multiple backends, and no plan to
  add one. If you need a different physics library, integrate it directly
  in your app code without library involvement.
- A second physics adapter (Box2D, Matter.js, Planck, etc.) is **not** on
  the 1.0 roadmap and will not be accepted as a contribution. The honesty
  rule that applies to rendering backends applies here too: one chosen
  physics, not a fake-universal physics layer.

For full integration details see [docs/physics/rapier-integration.md](docs/physics/rapier-integration.md).

## Examples

The runnable live site (Astro + Lit + Monaco preview) lives in [`examples/`](examples/README.md) and is deployed as the repository's GitHub Pages site at <https://exoridus.github.io/ExoJS/>.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:package
npm run perf:benchmark
```

Internal imports use the `@/*` path alias (mapped to `src/*`) — the same convention used by Vite, Next.js, and other modern TypeScript setups. Building the library requires TypeScript 6.

## Links

- Repository: <https://github.com/Exoridus/ExoJS>
- Issues: <https://github.com/Exoridus/ExoJS/issues>
- Changelog: [CHANGELOG.md](CHANGELOG.md)
