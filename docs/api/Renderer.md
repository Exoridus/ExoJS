# Renderer

ExoJS uses a drawable-driven rendering flow.

## Normal user-facing model

Normal code should work through drawables and scenes:

- `Scene.draw(renderBackend)`
- `drawable.render(renderBackend)`
- `Application` owns presentation

## Core rendering contracts

- `RenderBackend`: renderer-facing surface used by drawables and renderers
- `RenderRuntime`: broader frame/runtime surface used by `Application`
- `Renderer`: concrete renderer contract used internally by sprite, primitive, and particle renderers

## Important notes

- `renderManager.draw(...)` is not part of the intended shared model
- `display()` is owned by `Application`
- view switching convenience exists on the runtime manager:
  - `app.renderManager.setView(view)`
- offscreen switching lives on the runtime manager:
  - `app.renderManager.setRenderTarget(target)`

## Advanced use

Backend-specific renderer/runtime work lives under:

- `exojs/webgl2`
- `exojs/webgpu`
