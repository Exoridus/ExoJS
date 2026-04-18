# Renderer Runtime

ExoJS uses a drawable-driven rendering model.

## Normal User Path

Most app code should stay inside:

- `Scene.draw(runtime)`
- `drawable.render(runtime)`
- `Application` frame lifecycle

## Core Contracts

- `SceneRenderRuntime`: scene-facing runtime used by scenes/drawables
- `WebGl2RendererRuntime`: WebGL2 runtime contract
- `WebGpuRendererRuntime`: WebGPU runtime contract
- `Renderer`: internal renderer interface for built-in paths

## Runtime Operations

Common runtime operations:

- `runtime.clear(color?)`
- `runtime.setView(view | null)`
- `runtime.setRenderTarget(target | null)`
- `runtime.execute(pass)`
- `runtime.flush()`

## Visual Composition Features

Render nodes support:

- `filters`
- `mask`
- `cacheAsBitmap` + `invalidateCache()`

Runtime composition helpers:

- `RenderTargetPass`
- `CallbackRenderPass`

Temporary render textures:

- `runtime.acquireRenderTexture(width, height)`
- `runtime.releaseRenderTexture(texture)`

## Stats

`runtime.stats` exposes draw-call/batch/pass counters and frame timing fields.

See [Performance](./Performance.md) for details.

## Backend Notes

Backend selection is normally handled by `Application` (`auto` mode by default).

Most projects do not need backend-specific runtime code.
