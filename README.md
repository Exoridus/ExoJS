# ExoJS

ExoJS is a TypeScript-first 2D runtime for games and interactive apps, built around explicit scenes, practical rendering features, and predictable runtime behavior.

## Project status

ExoJS is **pre-1.0**. The public API is still under active design — scene graph, rendering pipeline, and resource lifecycle boundaries may change between minor versions. Pin exact versions in downstream experiments. `1.0.0` will mark the first stable API contract.

## Why ExoJS

- TypeScript-first API surface with strong runtime contracts
- Scene and asset workflows built for real game loops
- Modern rendering stack: WebGPU-first with WebGL2 fallback
- Practical visuals: filters, masks, render passes, cache-as-bitmap
- Gameplay tools: animated sprites, scene stacking, camera helpers, audio sprites
- Performance visibility with built-in render stats and benchmark harness

## What Is Shipped Today

- `Application`, `Scene`, and scene-manager lifecycle
- Typed `Loader` with manifest/bundle workflow (`defineAssetManifest`, `registerManifest`, `loadBundle`)
- Drawables: `Sprite`, `AnimatedSprite`, `Graphics`, `ParticleSystem`, `Text`, `Video`
- Scene stacking (`overlay` / `modal` / `opaque`) with input routing and fade transitions
- View/camera helpers (`follow`, bounds clamp, shake, zoom)
- Rendering composition primitives (`RenderTexture`, `RenderTargetPass`, filter chains, visual masks, cache-as-bitmap)
- Render stats (`submittedNodes`, `culledNodes`, `drawCalls`, `batches`, `renderPasses`, ...)

## Installation

```bash
npm install @codexo/exojs
```

ExoJS currently publishes an ESM-first package shape. Use `import` syntax with modern bundlers/runtime tooling.
CommonJS `require()` usage is not part of the supported contract for this pre-1.0 line.

## Quickstart

```ts
import { Application, Scene, Graphics, Color, type RenderingContext } from '@codexo/exojs';

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

  public override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const canvas = document.querySelector('canvas');

if (!canvas) {
  throw new Error('Missing <canvas> element.');
}

const app = new Application({
  canvas: {
    element: canvas,
    width: 800,
    height: 600,
  },
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

## Examples

The runnable live site (Astro + Lit + Monaco preview) lives in [`examples/`](examples/README.md) and is deployed as the repository's GitHub Pages site at <https://exoridus.github.io/ExoJS/>.

## Migrating to v0.9.0

ExoJS `v0.9.0` includes pre-1.0 API consolidation changes. See the migration guide for before/after examples:

- <https://exoridus.github.io/ExoJS/en/guide/migration/v0-8-x-to-v0-9-0/>

## Development

```bash
pnpm bootstrap
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm verify:package
```

Internal imports use the `@/*` path alias (mapped to `src/*`) — the same convention used by Vite, Next.js, and other modern TypeScript setups. Building the library requires TypeScript 6.

### Workspace Commands

This repository uses pnpm workspaces (`site/` is a workspace package).
Use root-level commands as the source of truth:

```bash
pnpm bootstrap
pnpm site:build
pnpm site:build:api
```

Avoid running `pnpm install` inside `site/` directly to prevent lockfile drift.

## Links

- Repository: <https://github.com/Exoridus/ExoJS>
- Issues: <https://github.com/Exoridus/ExoJS/issues>
- Changelog: [CHANGELOG.md](CHANGELOG.md)
