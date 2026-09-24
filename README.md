<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Exoridus/ExoJS/main/site/public/brand/wordmark-ExoJS.svg">
  <img src="https://raw.githubusercontent.com/Exoridus/ExoJS/main/site/public/brand/wordmark-ExoJS-mono.svg" alt="ExoJS" width="284" height="86">
</picture>

[![npm](https://img.shields.io/npm/v/%40codexo%2Fexojs?label=npm)](https://www.npmjs.com/package/@codexo/exojs)
[![CI](https://img.shields.io/github/actions/workflow/status/Exoridus/ExoJS/ci.yml?branch=main&label=CI)](https://github.com/Exoridus/ExoJS/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Exoridus/ExoJS)](LICENSE)

**A TypeScript-first 2D runtime for browser games and interactive applications.**

[Guide](https://exoridus.github.io/ExoJS/en/guide/) · [Playground](https://exoridus.github.io/ExoJS/en/playground/) · [API reference](https://exoridus.github.io/ExoJS/en/api/)

</div>

ExoJS brings scenes, rendering, input, audio, UI, and asset lifetimes into one application model. Build a game, a visualization, or an interactive canvas inside an existing web application. Keep the surrounding page in your web framework; use ExoJS for the canvas.

**Pre-1.0:** minor releases may change public APIs. Pin exact package versions, keep official runtime packages on a compatible release line, and read the [release notes](https://github.com/Exoridus/ExoJS/releases) before upgrading. The `next` branch can contain work that is not yet published on npm.

## Start a project

```sh
npm create exo-app@latest my-game -- --template minimal
cd my-game
npm install
npm run dev
```

The starter is a Vite + TypeScript project with a visible, animated scene. The [Setup guide](https://exoridus.github.io/ExoJS/en/guide/getting-started/setup/) explains the other templates, project layout, and installation into an existing application.

A scene contains ordinary TypeScript state and explicitly chooses what to render:

```ts
import { Application, Color, Graphics, type RenderingContext, Scene, type Seconds } from '@codexo/exojs';

class MainScene extends Scene {
  private readonly box = new Graphics();

  override init(): void {
    this.box.fillColor = Color.white;
    this.box.drawRectangle(-40, -40, 80, 80);
    this.box.setPosition(this.app.width / 2, this.app.height / 2);
    this.root.addChild(this.box);
  }

  override update(delta: Seconds): void {
    this.box.rotate(90 * delta);
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const app = new Application({
  scenes: { MainScene },
  canvas: { width: 800, height: 600, mount: 'body' },
  clearColor: new Color(0x6495ed),
});

await app.start(MainScene);
```

Follow [Your first scene](https://exoridus.github.io/ExoJS/en/guide/getting-started/your-first-scene/) for the explanation. The [Playground](https://exoridus.github.io/ExoJS/en/playground/) supplies editable demonstrations; the [API reference](https://exoridus.github.io/ExoJS/en/api/) supplies exact contracts.

## Why investigate ExoJS?

| Capability | What it means for a project |
| --- | --- |
| **One runtime, explicit lifetimes** | Scene-scoped assets, input, systems, animation, and audio follow scene teardown. Application-level resources can outlive an individual scene. |
| **WebGPU and WebGL2** | Choose a backend or use automatic selection. Share the high-level scene API, while checking capability-specific features on target devices. |
| **Rendering beyond sprites** | Compose text, geometry, masks, filters, render targets, multiple views, and custom materials. Use the renderer SDK only when the high-level rendering paths do not fit. |
| **Optional gameplay and visual systems** | Add physics, tilemaps, pathfinding, particles, lighting, or editor-format adapters without making them mandatory Core dependencies. |
| **TypeScript throughout** | Typed scene navigation, asset loading, extension contracts, and declarations make the engine usable from an ordinary editor and build pipeline. |

ExoJS is a code-first runtime, not a visual game editor. Its benchmarks describe particular workloads, not a guarantee that an arbitrary application will be faster than one built with another engine.

## Packages

Core owns the application, scenes, scene graph, rendering, input, UI, asset loading, and basic audio. Install optional packages for the systems you use. Each package README contains its activation example and constraints.

| Package | Use it for |
| --- | --- |
| [`@codexo/exojs`](https://www.npmjs.com/package/@codexo/exojs) | Core runtime |
| [`@codexo/exojs-physics`](packages/exojs-physics/README.md) | 2D rigid bodies, colliders, joints, and queries |
| [`@codexo/exojs-particles`](packages/exojs-particles/README.md) | Particle emitters and simulation |
| [`@codexo/exojs-tilemap`](packages/exojs-tilemap/README.md) | Tile rendering, chunks, and world loading |
| [`@codexo/exojs-tiled`](packages/exojs-tiled/README.md), [`@codexo/exojs-ldtk`](packages/exojs-ldtk/README.md) | Tiled and LDtk imports |
| [`@codexo/exojs-aseprite`](packages/exojs-aseprite/README.md) | Aseprite sheets and tagged animations |
| [`@codexo/exojs-tilemap-physics`](packages/exojs-tilemap-physics/README.md) | Physics colliders from tilemap geometry |
| [`@codexo/exojs-lighting`](packages/exojs-lighting/README.md) | Forward, shadowed lightmap, and radiance-cascade lighting |
| [`@codexo/exojs-pathfinding`](packages/exojs-pathfinding/README.md) | Weighted grids and waypoint graphs |
| [`@codexo/exojs-audio-fx`](packages/exojs-audio-fx/README.md) | Audio effects, analysis, worklets, and beat detection |
| [`@codexo/exojs-react`](packages/exojs-react/README.md) | React hosting and hooks |

Project tooling is separate: [create-exo-app](packages/create-exo-app/README.md) scaffolds projects; [exojs-cli](packages/exojs-cli/README.md) provides project and asset commands; [exojs-build](packages/exojs-build/README.md) transforms shaders, workers, and worklets; [eslint-plugin-exojs](packages/eslint-plugin-exojs/README.md) checks lifecycle and hot-path mistakes.

## Distribution

For a bundler-based application:

```sh
npm install --save-exact @codexo/exojs
```

The package provides ESM and TypeScript declarations. It also includes script-tag bundles: `dist/exo.iife.js` for Core and `dist/exo.full.iife.js` for Core plus official runtime extensions except React, with minified variants alongside them. Both expose the `Exo` global. Do not mix independent copies of Core in one application.

## Performance evidence

The [benchmark pages](https://exoridus.github.io/ExoJS/en/benchmarks/) explain the measured scenarios and limitations. The [versioned results](packages/exojs-bench/results/README.md) preserve provenance; the [harness documentation](packages/exojs-bench/docs/harness.md) explains reproduction. Structural counters and browser timings answer different questions. Neither produces an overall engine winner.

## Contributing

Repository development requires Node 24 and the pnpm version pinned in `package.json`:

```sh
pnpm bootstrap:dev
pnpm doctor
```

Use [CONTRIBUTING.md](CONTRIBUTING.md) for package boundaries, code conventions, and change-specific validation. Product changes belong in the relevant Guide, package README, or source JSDoc; development history belongs in [releases](https://github.com/Exoridus/ExoJS/releases), [CHANGELOG.md](CHANGELOG.md), and Git.

## License

[MIT](LICENSE) © Codexo
