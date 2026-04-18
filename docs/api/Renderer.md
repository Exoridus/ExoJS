# Renderer

ExoJS uses a drawable-driven rendering flow.

## Normal user-facing model

Normal code should work through drawables and scenes:

- `Scene.draw(runtime)`
- `drawable.render(runtime)`
- `Application` owns presentation

## Core rendering contracts

- `SceneRenderRuntime`: scene-facing runtime used by scenes and drawables
- `WebGl2RendererRuntime`: WebGL2-specific renderer runtime
- `WebGpuRendererRuntime`: WebGPU-specific renderer runtime
- `Renderer`: concrete renderer contract used internally by sprite, primitive, and particle renderers

## Important notes

- `renderManager.draw(...)` is not part of the intended shared model
- `display()` is owned by `Application`
- view switching convenience exists on the runtime manager:
  - `app.renderManager.setView(view)`
- offscreen switching lives on the runtime manager:
  - `app.renderManager.setRenderTarget(target)`

## Phase 2 visual primitives

- Nodes (`Drawable` and `Container`) now support:
  - `filters` (ordered filter chain)
  - `mask` (rectangular mask based on mask node bounds)
  - `cacheAsBitmap` + `invalidateCache()`
- Runtime-level composition helpers:
  - `RenderTargetPass`
  - `CallbackRenderPass`
- Temporary render-target lifecycle for advanced workflows:
  - `runtime.acquireRenderTexture(width, height)`
  - `runtime.releaseRenderTexture(texture)`

## Advanced use

Backend-specific renderer/runtime work lives under:

- `exojs/webgl2`
- `exojs/webgpu`
