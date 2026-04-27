# Core Concepts

ExoJS is organized around a small set of explicit runtime boundaries.

## Application

`Application` owns:

- the canvas
- backend initialization
- frame update/render loop
- `loader`, `sceneManager`, and `inputManager`

`Application` is the normal entrypoint.

## Scene

`Scene` is the top-level gameplay/screen owner.

A scene can:

- `load(loader)` assets
- `init(loader)` state
- `update(delta)` simulation
- `draw(runtime)` rendering
- `handleInput(event)` for stacked-scene input routing

The default scene graph root is `scene.root` (`Container`).

## Drawables and Containers

- `Drawable` = renderable node (`Sprite`, `DrawableShape`, `ParticleSystem`, etc.)
- `Container` = structural node containing children

Common scene-node features:

- transform/origin
- visibility
- `zIndex` ordering via `sortableChildren`

Renderable nodes add visual state:

- `tint` and `blendMode`
- optional `filters`, `mask`, and `cacheAsBitmap`

## Loader

`Loader` is class-token based. You load by type and alias/path:

```ts
await loader.load(Texture, { hero: 'hero.png' });
const hero = loader.get(Texture, 'hero');
```

For larger projects, use manifests and named bundles.

## Runtime and Rendering

`Scene.draw(runtime)` receives `SceneRenderRuntime`.

Most projects only use:

- `drawable.render(runtime)`
- `runtime.setRenderTarget(...)` and `RenderTargetPass` for offscreen workflows

`Application` owns frame presentation and backend selection.

## Backends

Default backend mode is automatic:

- prefer WebGPU
- fallback to WebGL2 if needed

Forcing backend is optional and usually unnecessary for normal app code.
