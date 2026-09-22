<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Exoridus/ExoJS/main/site/public/brand/wordmark-ExoJS.svg">
  <img src="https://raw.githubusercontent.com/Exoridus/ExoJS/main/site/public/brand/wordmark-ExoJS-mono.svg" alt="ExoJS" width="284" height="104">
</picture>

[![Latest](https://img.shields.io/github/v/release/Exoridus/ExoJS?style=for-the-badge&label=Latest&logo=github&color=44cc11)](https://github.com/Exoridus/ExoJS/releases/latest)
[![npm](https://img.shields.io/npm/v/%40codexo%2Fexojs?style=for-the-badge&logo=npm&label=npm&color=44cc11)](https://www.npmjs.com/package/@codexo/exojs)
[![CI](https://img.shields.io/github/actions/workflow/status/Exoridus/ExoJS/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=fff&label=CI)](https://github.com/Exoridus/ExoJS/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/codecov/c/github/Exoridus/ExoJS?style=for-the-badge&logo=codecov&logoColor=fff&label=Coverage)](https://app.codecov.io/gh/Exoridus/ExoJS)
[![License](https://img.shields.io/github/license/Exoridus/ExoJS?style=for-the-badge&color=44cc11)](https://github.com/Exoridus/ExoJS/blob/main/LICENSE)

A TypeScript-first browser 2D engine for games and interactive apps.

**[Try the playground](https://exoridus.github.io/ExoJS/en/playground/)** · **[Read the guide](https://exoridus.github.io/ExoJS/en/guide/)** · **[Browse the API](https://exoridus.github.io/ExoJS/en/api/)**

</div>

<img src="https://raw.githubusercontent.com/Exoridus/ExoJS/main/site/public/brand/companion-hero.webp" alt="The ExoJS companion, a small waving robot" width="150" align="right">

ExoJS combines an explicit scene graph with WebGPU/WebGL2 rendering, physics, audio, UI, assets, serialization, and focused extension packages. It is built as one coherent runtime rather than a renderer surrounded by unrelated integrations.

> **Pre-1.0:** the public API is still being refined, and minor releases may contain breaking changes. Pin exact versions in downstream projects. `1.0.0` will mark the first stable API contract.

## Why ExoJS

|                                    |                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript is the design input** | Strict types, discoverable APIs, typed assets and extension contracts, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` throughout. |
| **Two real graphics backends**     | WebGPU-first rendering with automatic WebGL2 fallback, backend parity tests, custom GLSL/WGSL materials, render targets, filters, and readback.     |
| **A complete 2D runtime**          | Scenes, cameras, input, UI, text, audio, persistence, serialization, coroutines, and deterministic lifetime management ship together.               |
| **Serious optional systems**       | Native rigid-body physics, GPU particles, tilemaps, lighting, pathfinding, React bindings, and format adapters stay opt-in and tree-shakeable.      |
| **Explicit ownership**             | Application-scoped managers, local extension descriptors, and `Destroyable`/`DisposalScope` lifetimes avoid hidden global state.                    |
| **Performance is reproducible**    | Structural CI gates and browser/GPU benchmark profiles record the workload, hardware, browser, versions, medians, p95s, and measurement spread.     |

## Start in 30 seconds

Create a project and choose a starter interactively:

```bash
npm create exo-app@latest my-game
cd my-game
npm install
npm run dev
```

Or select a template directly:

```bash
npm create exo-app@latest my-game -- --template minimal
npm create exo-app@latest my-game -- --template platformer
npm create exo-app@latest my-game -- --template top-down
```

The smallest application is still ordinary TypeScript:

```ts
import { Application, Color, Graphics, type RenderingContext, Scene, type Seconds } from '@codexo/exojs';

class MainScene extends Scene {
  private readonly box = new Graphics();

  public constructor() {
    super();

    this.box.fillColor = Color.white;
    this.box.drawRectangle(-40, -40, 80, 80);
    this.box.setPosition(400, 300);
    this.addChild(this.box);
  }

  public override update(delta: Seconds): void {
    this.box.rotate(delta * 90);
  }

  public override draw(context: RenderingContext): void {
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

Continue with the [guide](https://exoridus.github.io/ExoJS/en/guide/), inspect runnable code in the [playground](https://exoridus.github.io/ExoJS/en/playground/), or look up a symbol in the [API reference](https://exoridus.github.io/ExoJS/en/api/).

## What you can build

### Rendering and presentation

- Sprites, animated sprites, nine-slice and repeating sprites, immediate geometry, instanced batches, SDF text, bitmap text, and video.
- WebGPU and WebGL2 backends selected automatically or explicitly through `ApplicationOptions.backend`.
- Render textures, retained render plans, filter chains, visual masks, cache-as-bitmap, custom sprite materials, and custom renderers through the public renderer SDK.
- Linear and radial gradients, pixel snapping, blend modes, frame passes, asynchronous pixel readback, and render statistics including GPU memory and upload accounting.
- Forward, shadowed lightmap, and radiance-cascade lighting through `@codexo/exojs-lighting`, with normal maps, multiple light shapes, cookies, and reusable occluder sources.

### Worlds and gameplay

- Scene navigation with preload/unload, pause/resume, and built-in or custom transitions.
- Cameras with follow, shake, zoom, bounds clamping, and multiple views.
- Keyboard, pointer, touch, and gamepad input with action bindings, focus traversal, hit areas, and modal focus scopes.
- Native 2D rigid-body physics with continuous collision, joints, sensors, sleeping islands, contact modification, queries, and a debug overlay.
- Weighted-grid and waypoint-graph pathfinding, streamed tilemap worlds, Tiled and LDtk adapters, and Aseprite animation import.

### Player experience and application state

- Screen-fixed UI widgets, themes, anchoring, scrolling, tooltips, progress bars, and labels.
- Spatial audio, audio sprites, generated and streamed sources, buses, effects, analysis, worklets, and beat detection.
- Typed asset catalogs, deduplicated loading, scoped asset lifetimes, binary containers, and persistent key-value stores.
- Scene serialization, prefabs, deterministic systems, tweens, signals, and frame-budgeted coroutines for long-running work.

## Packages

Install only the systems your project uses. Official runtime packages share the Core release line and declare compatible peer ranges.

| Package                                                                                        | Purpose                                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`@codexo/exojs`](https://www.npmjs.com/package/@codexo/exojs)                                 | Core scene, rendering, audio, UI, asset, and serialization runtime        |
| [`@codexo/exojs-physics`](https://www.npmjs.com/package/@codexo/exojs-physics)                 | Native 2D rigid-body physics with a TGS-Soft solver                       |
| [`@codexo/exojs-particles`](https://www.npmjs.com/package/@codexo/exojs-particles)             | GPU-compute particle simulation with a CPU fallback                       |
| [`@codexo/exojs-tilemap`](https://www.npmjs.com/package/@codexo/exojs-tilemap)                 | Format-neutral tilemap runtime, streaming, object spawning, and rendering |
| [`@codexo/exojs-tiled`](https://www.npmjs.com/package/@codexo/exojs-tiled)                     | Tiled JSON adapter                                                        |
| [`@codexo/exojs-ldtk`](https://www.npmjs.com/package/@codexo/exojs-ldtk)                       | LDtk world and level adapter                                              |
| [`@codexo/exojs-aseprite`](https://www.npmjs.com/package/@codexo/exojs-aseprite)               | Aseprite sprite-sheet and animation adapter                               |
| [`@codexo/exojs-tilemap-physics`](https://www.npmjs.com/package/@codexo/exojs-tilemap-physics) | Static physics colliders generated from tilemap collision geometry        |
| [`@codexo/exojs-lighting`](https://www.npmjs.com/package/@codexo/exojs-lighting)               | Forward, shadowed lightmap, and radiance-cascade 2D lighting              |
| [`@codexo/exojs-pathfinding`](https://www.npmjs.com/package/@codexo/exojs-pathfinding)         | A* pathfinding over weighted grids and waypoint graphs                    |
| [`@codexo/exojs-audio-fx`](https://www.npmjs.com/package/@codexo/exojs-audio-fx)               | Audio effects, worklets, analysis, and beat detection                     |
| [`@codexo/exojs-react`](https://www.npmjs.com/package/@codexo/exojs-react)                     | React canvas hosting, scene composition, and hooks                        |

Project tooling is available separately:

| Package                                                                    | Purpose                                                        |
| -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`create-exo-app`](https://www.npmjs.com/package/create-exo-app)           | Interactive project scaffolding and maintained starters        |
| [`@codexo/exojs-cli`](./packages/exojs-cli)                                | Static serving, project checks, scaffolding, and asset packs   |
| [`@codexo/exojs-build`](https://www.npmjs.com/package/@codexo/exojs-build) | Vite/Rollup transforms for shaders, workers, and AudioWorklets |
| [`@codexo/eslint-plugin-exojs`](./packages/eslint-plugin-exojs)            | Lifecycle and hot-path correctness rules for ExoJS projects    |

## Installation and distribution

```bash
npm install @codexo/exojs
```

ExoJS is ESM-first and works with modern bundlers. Optional packages install independently, for example:

```bash
npm install @codexo/exojs @codexo/exojs-physics @codexo/exojs-lighting
```

Prebuilt script-tag bundles are also included: `dist/exo.iife.js` contains Core, while `dist/exo.full.iife.js` contains Core and the official runtime extensions except React. Both expose the `Exo` global. Minified variants are provided alongside them.

## Measured performance

ExoJS maintains two complementary kinds of performance evidence:

- deterministic structural gates for draw calls, batches, binds, uploads, and other exact work counters;
- real-browser comparison profiles for rendering and physics, with pinned competitors and stamped hardware, browser, workload, warmup, sample count, median, p95, and run-to-run spread.

The numbers are deliberately not copied into this README because they change with the engine, competitor versions, browser, and reference machine. Read the [current published profiles](./packages/exojs-bench/results) and the [benchmark methodology](./packages/exojs-bench/docs/harness.md) together.

## Roadmap

Work toward the `1.0.0` API freeze is directional, not a release commitment. Current longer-term areas include:

- rich text with style spans and inline content;
- worker-backed execution through the same coroutine ownership model;
- platform adapters for Worker and headless runtimes;
- the final public API audit and stabilization pass.

## Contributing

Development requires Node 24 and the pnpm version pinned in `package.json`.

```bash
pnpm bootstrap:dev
pnpm doctor
```

`bootstrap:dev` installs dependencies and hooks, builds Core and every package, links benchmark competitors, installs Chromium, and reports anything still missing. During development, use the narrow command for the area you changed:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build:all
pnpm lanes
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch policy, imports, package boundaries, public API conventions, validation, and distribution rules.

## Links

- GitHub Pages: <https://exoridus.github.io/ExoJS/>
- Guide: <https://exoridus.github.io/ExoJS/en/guide/>
- API reference: <https://exoridus.github.io/ExoJS/en/api/>
- Playground: <https://exoridus.github.io/ExoJS/en/playground/>
- Repository: <https://github.com/Exoridus/ExoJS>
- Releases: <https://github.com/Exoridus/ExoJS/releases>
- Issues: <https://github.com/Exoridus/ExoJS/issues>
- Changelog: [CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE) © Codexo
