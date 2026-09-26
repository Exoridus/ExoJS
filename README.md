<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Exoridus/ExoJS/main/site/public/brand/wordmark-ExoJS.svg">
  <img src="https://raw.githubusercontent.com/Exoridus/ExoJS/main/site/public/brand/wordmark-ExoJS-mono.svg" alt="ExoJS" width="284" height="86">
</picture>

[![Latest release](https://img.shields.io/github/v/release/Exoridus/ExoJS?style=for-the-badge&label=Latest&logo=github&color=44cc11)](https://github.com/Exoridus/ExoJS/releases/latest)
[![npm version](https://img.shields.io/npm/v/%40codexo%2Fexojs?style=for-the-badge&logo=npm&label=npm&color=44cc11)](https://www.npmjs.com/package/@codexo/exojs)
[![CI on main](https://img.shields.io/github/actions/workflow/status/Exoridus/ExoJS/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=fff&label=CI)](https://github.com/Exoridus/ExoJS/actions/workflows/ci.yml?query=branch%3Amain)
[![Coverage on main](https://img.shields.io/codecov/c/github/Exoridus/ExoJS/main?style=for-the-badge&logo=codecov&logoColor=fff&label=Coverage)](https://app.codecov.io/gh/Exoridus/ExoJS/tree/main)
[![MIT license](https://img.shields.io/github/license/Exoridus/ExoJS?style=for-the-badge&color=44cc11)](https://github.com/Exoridus/ExoJS/blob/main/LICENSE)

**A TypeScript-first 2D runtime for browser games and interactive applications.**

**[Try the Playground](https://exoridus.github.io/ExoJS/en/playground/)** · **[Read the Guide](https://exoridus.github.io/ExoJS/en/guide/)** · **[Browse the API](https://exoridus.github.io/ExoJS/en/api/)**

[Benchmarks](https://exoridus.github.io/ExoJS/en/benchmarks/) · [Release notes](https://github.com/Exoridus/ExoJS/releases) · [Download the Full ZIP](https://github.com/Exoridus/ExoJS/releases/latest/download/exojs-full.zip)

</div>

<img src="https://raw.githubusercontent.com/Exoridus/ExoJS/main/site/public/brand/companion-hero.webp" alt="The ExoJS companion, a small waving robot" width="150" align="right">

ExoJS brings scenes, rendering, input, audio, UI, and asset lifetimes into one application model. Build a game, a visualization, or an interactive canvas inside an existing web application. Keep the surrounding page in your web framework; use ExoJS for the canvas.

> **Pre-1.0:** minor releases may change public APIs. Pin exact package versions, keep official runtime packages on a compatible release line, and read the release notes before upgrading. `main` tracks the latest release; `next` can contain work that is not yet published on npm. The CI and coverage badges above describe `main`.

## Start a project

```sh
npm create exo-app@latest my-game -- --template minimal
cd my-game
npm install
npm run dev
```

The starter is a Vite + TypeScript project with a visible, animated scene. Choose `minimal`, `game-starter`, `platformer`, `top-down`, `ui-app`, or `audio-reactive`. The [Setup guide](https://exoridus.github.io/ExoJS/en/guide/getting-started/setup/) explains the templates, project layout, and installation into an existing application.

A scene contains ordinary TypeScript state and explicitly chooses what to render. This example needs no external assets:

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

Follow [Your first scene](https://exoridus.github.io/ExoJS/en/guide/getting-started/your-first-scene/) for the walkthrough. Use the [Playground](https://exoridus.github.io/ExoJS/en/playground/) to experiment and the [API reference](https://exoridus.github.io/ExoJS/en/api/) to check exact contracts.

## Why ExoJS

| Capability | What it means for your project |
| --- | --- |
| **One runtime, explicit lifetimes** | Scene-scoped assets, input, systems, animation, and audio follow scene teardown. Application-level resources can outlive an individual scene. |
| **WebGPU and WebGL2** | Choose a backend or use automatic selection. Share the high-level scene API and check capability-specific features on target devices. |
| **Rendering beyond sprites** | Compose text, geometry, masks, filters, render targets, multiple views, and custom materials. Reach for the renderer SDK when the high-level paths do not fit. |
| **Optional gameplay and visual systems** | Add physics, tilemaps, pathfinding, particles, lighting, or editor-format adapters without making them mandatory Core dependencies. |
| **TypeScript throughout** | Typed scene navigation, asset loading, extension contracts, and declarations fit an ordinary editor and build pipeline. |
| **Measured performance** | Structural gates and browser benchmark profiles describe specific workloads, with provenance and limitations alongside the results. |

ExoJS is a code-first runtime, not a visual game editor. Its benchmarks describe particular workloads, not a guarantee that every application will be faster than one built with another engine.

## Packages

Core owns the application, scenes, scene graph, rendering, input, UI, asset loading, and basic audio. Install only the optional systems you use. Runtime packages follow the Core release line; check their declared peer dependencies when choosing versions.

### Runtime and integrations

| Package | Purpose | Documentation |
| --- | --- | --- |
| [`@codexo/exojs`](https://www.npmjs.com/package/@codexo/exojs) | Core runtime: scenes, rendering, input, UI, assets, and audio | [Guide](https://exoridus.github.io/ExoJS/en/guide/) |
| [`@codexo/exojs-physics`](https://www.npmjs.com/package/@codexo/exojs-physics) | 2D rigid bodies, colliders, joints, and queries | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-physics/README.md) |
| [`@codexo/exojs-particles`](https://www.npmjs.com/package/@codexo/exojs-particles) | Particle emitters, CPU simulation, and eligible WebGPU compute paths | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-particles/README.md) |
| [`@codexo/exojs-tilemap`](https://www.npmjs.com/package/@codexo/exojs-tilemap) | Format-neutral tilemaps, chunk rendering, and world loading | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-tilemap/README.md) |
| [`@codexo/exojs-tiled`](https://www.npmjs.com/package/@codexo/exojs-tiled) | Tiled JSON maps, tilesets, and authored objects | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-tiled/README.md) |
| [`@codexo/exojs-ldtk`](https://www.npmjs.com/package/@codexo/exojs-ldtk) | LDtk worlds, levels, IntGrid data, and level streaming | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-ldtk/README.md) |
| [`@codexo/exojs-aseprite`](https://www.npmjs.com/package/@codexo/exojs-aseprite) | Aseprite sprite sheets and tagged animations | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-aseprite/README.md) |
| [`@codexo/exojs-tilemap-physics`](https://www.npmjs.com/package/@codexo/exojs-tilemap-physics) | Static physics colliders from tilemap geometry | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-tilemap-physics/README.md) |
| [`@codexo/exojs-lighting`](https://www.npmjs.com/package/@codexo/exojs-lighting) | Forward, shadowed lightmap, and radiance-cascade lighting | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-lighting/README.md) |
| [`@codexo/exojs-pathfinding`](https://www.npmjs.com/package/@codexo/exojs-pathfinding) | A* search over weighted grids and waypoint graphs | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-pathfinding/README.md) |
| [`@codexo/exojs-audio-fx`](https://www.npmjs.com/package/@codexo/exojs-audio-fx) | Audio effects, analysis, worklets, and beat detection | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-audio-fx/README.md) |
| [`@codexo/exojs-react`](https://www.npmjs.com/package/@codexo/exojs-react) | React canvas hosting, declarative scenes, and hooks | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-react/README.md) |

### Project tooling

| Package | Purpose | Documentation |
| --- | --- | --- |
| [`create-exo-app`](https://www.npmjs.com/package/create-exo-app) | Project scaffolding and maintained starters | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/create-exo-app/README.md) |
| [`@codexo/exojs-cli`](https://www.npmjs.com/package/@codexo/exojs-cli) | Static serving, project checks, scaffolding, and asset packs | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-cli/README.md) |
| [`@codexo/exojs-build`](https://www.npmjs.com/package/@codexo/exojs-build) | Vite/Rollup transforms for shaders, workers, and AudioWorklets | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-build/README.md) |
| [`@codexo/eslint-plugin-exojs`](https://www.npmjs.com/package/@codexo/eslint-plugin-exojs) | Lifecycle and engine-specific correctness checks | [README](https://github.com/Exoridus/ExoJS/blob/main/packages/eslint-plugin-exojs/README.md) |

Package names open npm; documentation links describe the released packages. In a checkout of `next`, read the matching local package README for unreleased changes. Runtime libraries such as physics and pathfinding are constructed directly; renderer and asset extensions use explicit application descriptors. Each package documents its setup.

## Installation and distribution

For a bundler-based application:

```sh
npm install --save-exact @codexo/exojs
```

The package provides ESM and TypeScript declarations. It also includes script-tag bundles:

| Bundle | Contents |
| --- | --- |
| `dist/exo.iife.js` | Core runtime on the `Exo` global |
| `dist/exo.full.iife.js` | Core plus the official runtime extensions except React, on the same `Exo` global |

Minified variants are provided alongside them. Use one Core instance per application; do not load both bundles into the same page.

The [Full Release ZIP](https://github.com/Exoridus/ExoJS/releases/latest/download/exojs-full.zip) includes a built runtime, examples, and documentation. See [Deployment](https://exoridus.github.io/ExoJS/en/guide/shipping/deployment/) for static hosting and script-tag setup.

## Performance evidence

The [benchmark pages](https://exoridus.github.io/ExoJS/en/benchmarks/) show measured scenarios and their limitations. The [versioned profiles](https://github.com/Exoridus/ExoJS/tree/main/packages/exojs-bench/results) preserve provenance, and the [harness documentation](https://github.com/Exoridus/ExoJS/blob/main/packages/exojs-bench/docs/harness.md) explains reproduction. Structural counters and browser timings answer different questions; neither produces an overall engine winner.

## Contributing

Repository development requires Node 24 and the pnpm version pinned in `package.json`:

```sh
pnpm bootstrap:dev
pnpm doctor
```

Read [CONTRIBUTING.md](https://github.com/Exoridus/ExoJS/blob/main/CONTRIBUTING.md) for package boundaries, code conventions, and change-specific validation. Product changes belong in the relevant Guide, package README, or source JSDoc; development history belongs in pull requests, [releases](https://github.com/Exoridus/ExoJS/releases), [CHANGELOG.md](https://github.com/Exoridus/ExoJS/blob/main/CHANGELOG.md), and Git.

Report a reproducible problem in [GitHub Issues](https://github.com/Exoridus/ExoJS/issues).

## License

[MIT](https://github.com/Exoridus/ExoJS/blob/main/LICENSE) © Codexo
