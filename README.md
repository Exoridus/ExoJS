# ExoJS

ExoJS is a TypeScript-first 2D runtime for games and interactive apps, built around explicit scenes, practical rendering features, and predictable runtime behavior.

**[Guide](https://exoridus.github.io/ExoJS/en/guide/)** · **[API Reference](https://exoridus.github.io/ExoJS/en/api/)** · **[Playground](https://exoridus.github.io/ExoJS/en/playground/)**

## Project status

ExoJS is **pre-1.0**. The public API is still under active design — scene graph, rendering pipeline, and resource lifecycle boundaries may change between minor versions. Pin exact versions in downstream experiments. `1.0.0` will mark the first stable API contract.

## Features

- `Application`, `Scene`, and scene-manager lifecycle
- Scene stacking (`overlay` / `modal` / `opaque`) with input routing and fade transitions
- Typed `Loader` with manifest/bundle workflow (`defineAssetManifest`, `registerManifest`, `loadBundle`)
- Drawables: `Sprite`, `AnimatedSprite`, `Graphics`, `ParticleSystem`, `Text`, `Video`
- WebGPU-first rendering with automatic WebGL2 fallback
- GPU-driven particles (WebGPU compute) with a CPU fallback for WebGL2
- Rendering composition primitives (`RenderTexture`, `RenderPipeline`, filter chains, visual masks, cache-as-bitmap)
- Linear and radial gradients for `Graphics` fills and strokes (`fillStyle` / `strokeStyle`)
- View/camera helpers (`follow`, bounds clamp, shake, zoom)
- Audio with sprites, spatial panning, and frequency/waveform analysis
- Render stats (`submittedNodes`, `culledNodes`, `drawCalls`, `batches`, `renderPasses`, ...) and a benchmark harness

## Roadmap

Directional work on the way to the `1.0.0` API freeze. Priorities and ordering may change — nothing here is a release commitment.

- Save/load persistence helper
- Screen-level post-processing stack (bloom, CRT, vignette, chromatic aberration)
- Path following with Bézier and Catmull-Rom splines
- Simple 2D lighting and shadows
- Tilemap / tileset support (Tiled JSON)
- Additional scene transitions (slide, crossfade) plus custom transition effects
- UI widget layer (button, label, panel, slider) with keyboard and gamepad navigation
- Localization primitive
- Opt-in `Signal` registry for dev tooling, tree-shakeable in production
- Live documentation, guides, and playground site
- Final pre-1.0 API audit and stabilization pass

## Getting Started

Scaffold a new project with one command:

```bash
npm create exo-app@latest my-game
```

Or pick a template explicitly:

```bash
npm create exo-app@latest my-game -- --template minimal
npm create exo-app@latest my-game -- --template game-starter
npm create exo-app@latest my-game -- --template audio-reactive
```

Then:

```bash
cd my-game
npm install
npm run dev
```

## Installation

```bash
npm install @codexo/exojs
```

ExoJS publishes an ESM-first package shape. Use `import` syntax with modern bundlers/runtime tooling.
CommonJS `require()` usage is not part of the supported contract for this pre-1.0 line.

## Quickstart

```ts
import { Application, Scene, Graphics, Color, type RenderingContext, type Time } from '@codexo/exojs';

class HelloScene extends Scene {
  private readonly box = new Graphics();

  public constructor() {
    super();

    this.box.fillColor = Color.white;
    this.box.drawRectangle(-32, -32, 64, 64);
    this.box.setPosition(400, 300);

    this.addChild(this.box);
  }

  public override update(delta: Time): void {
    this.box.rotation += delta.seconds * 45;
  }

  public override draw(context: RenderingContext): void {
    context.backend.clear();
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
