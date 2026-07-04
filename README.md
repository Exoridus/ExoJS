<div align="center">

# ExoJS

[![Latest](https://img.shields.io/github/v/release/Exoridus/ExoJS?style=for-the-badge&label=Latest&logo=github&color=44cc11)](https://github.com/Exoridus/ExoJS/releases/latest)
[![npm](https://img.shields.io/npm/v/%40codexo%2Fexojs?style=for-the-badge&logo=npm&label=npm&color=44cc11)](https://www.npmjs.com/package/@codexo/exojs)
[![CI](https://img.shields.io/github/actions/workflow/status/Exoridus/ExoJS/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=fff&label=CI)](https://github.com/Exoridus/ExoJS/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/codecov/c/github/Exoridus/ExoJS?style=for-the-badge&logo=codecov&logoColor=fff&label=Coverage)](https://app.codecov.io/gh/Exoridus/ExoJS)
[![License](https://img.shields.io/github/license/Exoridus/ExoJS?style=for-the-badge&color=44cc11)](https://github.com/Exoridus/ExoJS/blob/main/LICENSE)

A TypeScript-first 2D engine for games and interactive apps. Explicit scene graph, WebGPU/WebGL2 rendering, native physics, spatial audio, and a strict type system — measured and verified, not just claimed.

**[Guide](https://exoridus.github.io/ExoJS/en/guide/)** · **[API Reference](https://exoridus.github.io/ExoJS/en/api/)** · **[Playground](https://exoridus.github.io/ExoJS/en/playground/)**

</div>

> **Pre-1.0.** The public API is under active design — minor versions may include breaking changes. Pin exact versions in downstream projects. `1.0.0` marks the first stable API contract.

## Packages

| Package                   | Description                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| `@codexo/exojs`           | Core runtime — scene graph, rendering, audio, UI, serialization    |
| `@codexo/exojs-physics`   | Native 2D physics — shapes, constraints, TGS-Soft solver           |
| `@codexo/exojs-particles` | GPU-driven particles (WebGPU compute) with CPU fallback            |
| `@codexo/exojs-tilemap`   | Format-independent tilemap runtime and object layers               |
| `@codexo/exojs-tiled`     | Tiled JSON adapter and scene-graph conversion                      |
| `@codexo/exojs-audio-fx`  | Audio effects — biquad filters, analyser, beat detection, worklets |

## Features

**Rendering**

- WebGPU-first with automatic WebGL2 fallback; force either backend with one option
- Drawables: `Sprite`, `AnimatedSprite`, `NineSliceSprite`, `RepeatingSprite`, `Graphics`, `Text` (SDF), `BitmapText`, `Video`
- Rendering composition: `RenderTexture`, `RenderPipeline`, filter chains, visual masks, cache-as-bitmap
- Immediate-mode rendering: one-off `drawGeometry` and instanced `RenderBatch` collapsing to a single draw call
- Linear and radial gradients, pixel snapping, view/camera helpers (`follow`, shake, zoom, bounds clamp)
- Render stats with GPU memory accounting (`gpuMemoryBytes`, texture/buffer upload bytes)

**Scene & UI**

- `Application`, `Scene`, `SceneManager` — one active scene with `setScene`, fade transitions, and `scene.paused`
- `scene.ui` — screen-fixed widget layer with `Label`, `Panel`, `Button`, `ProgressBar`, `Stack`, anchoring, and a `FocusManager` with keyboard and gamepad navigation

**Physics** (`@codexo/exojs-physics`)

- Circles, boxes, capsules, and convex polygons; static, kinematic, and dynamic bodies
- SAP broadphase, manifold narrow-phase, warm-started TGS-Soft solver (sub-stepped, stable to 20+ box stacks)
- Contact graph, collision events, spatial queries; allocation-free per step (V8-sampler verified)
- Scene-graph binding and a `/debug` draw subpath

**Audio**

- Voice capability matrix across `Sound`, `AudioStream`, and `AudioGenerator`
- Spatial panning, audio sprites, frequency and waveform analysis
- `@codexo/exojs-audio-fx`: `BiquadEffect`, `AudioAnalyser`, `BeatDetector`, worklets, and DSP helpers

**Assets & Storage**

- Typed `Loader` with manifest/bundle workflow (`defineAssetManifest`, `loadBundle`)
- Binary asset containers (`loader.loadContainer`) for bundled distribution
- Key-value persistence: `WebStorageStore` (localStorage/sessionStorage), `IndexedDbKeyValueStore` (structured-clone, binary-safe), `MemoryStore` (tests/ephemeral)

**Serialization**

- `Scene.serialize` / `deserialize` captures scene structure — nodes, drawables, UI, tilemap
- `SerializationRegistry` and `Prefab` for templates; pairs with any `KeyValueStore` for save-slot persistence

**Architecture**

- `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` across the full codebase — zero `as any`, zero `ts-ignore`
- Ordered `SystemRegistry` (`app.systems`, `scene.systems`) with deterministic tick bands
- Deterministic disposal via `Destroyable` / `DisposalScope`; all managers are app-owned, not process singletons

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

ExoJS is ESM-only. Use `import` syntax with a modern bundler or runtime.
Optional packages install independently — add only what your project needs:

```bash
npm install @codexo/exojs-physics
npm install @codexo/exojs-particles
npm install @codexo/exojs-tilemap @codexo/exojs-tiled
npm install @codexo/exojs-audio-fx
```

## Quickstart

```ts
import { Application, Scene, Graphics, Color, Loader, type RenderingContext, type Time } from '@codexo/exojs';

class HelloScene extends Scene {
  private readonly box = new Graphics();

  public override init(loader: Loader): void {
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

const app = new Application({
  canvas: { element: document.querySelector('canvas')!, width: 800, height: 600 },
  clearColor: Color.cornflowerBlue,
});

await app.start(new HelloScene());
```

See the [Guide](https://exoridus.github.io/ExoJS/en/guide/) for physics, audio, UI, and more, or browse the [live examples](https://exoridus.github.io/ExoJS/).

## Roadmap

Directional work toward the `1.0.0` API freeze. Priorities may shift — nothing here is a release commitment.

- Physics joints, sleeping, and CCD (ragdolls, vehicles, ropes, fast projectiles)
- W3C blend mode suite — multiply, screen, overlay, and the full non-separable set
- Additional scene transitions (slide, crossfade, custom)
- Screen-level post-processing (bloom, CRT, vignette, chromatic aberration)
- Path following with Bézier and Catmull-Rom splines
- Tween sequencer and coroutine helpers
- Aseprite and LDtk first-party adapters
- CDN/IIFE bundle for script-tag usage
- Localization primitive
- Final pre-1.0 API audit and stabilization pass

## WebGPU and WebGL2

`Application` auto-selects the best available backend. Force one when needed:

```ts
new Application({ backend: { type: 'webgpu' } });
new Application({ backend: { type: 'webgl2' } });
new Application({ backend: { type: 'auto' } }); // default
```

## Development

```bash
pnpm bootstrap
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm verify:package
```

Package-internal imports use Node `package.json#imports` subpath imports: `./X` for the same directory, `#dir/X` for any other path in the same package, and the public bare specifier (`@codexo/exojs`) across packages. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full import policy, per-package commands, and the shared `@codexo/exojs-config` tooling. Building the library requires TypeScript 6.

This repository uses pnpm workspaces (`site/` is a workspace package). Use root-level commands as the source of truth — avoid running `pnpm install` inside `site/` directly:

```bash
pnpm bootstrap
pnpm site:build
pnpm site:build:api
```

## Links

- Repository: <https://github.com/Exoridus/ExoJS>
- Issues: <https://github.com/Exoridus/ExoJS/issues>
- Changelog: [CHANGELOG.md](CHANGELOG.md)
