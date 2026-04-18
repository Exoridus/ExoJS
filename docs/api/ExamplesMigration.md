# Examples Migration

This page captures practical migration notes from older ExoJS usage patterns to the current runtime model.

## Rendering Flow

Current model:

1. `Application` drives frame lifecycle
2. `Scene.update(delta)` mutates state
3. `Scene.draw(runtime)` submits drawables
4. `Application` flushes/presents through the active backend runtime

Scene code should render via drawables:

```ts
public override draw(runtime: import('exojs').SceneRenderRuntime): void {
    this.root.render(runtime);
}
```

## Backend Selection

`Application` now defaults to auto backend mode:

- prefer WebGPU when available
- fallback to WebGL2 on unavailable/failed WebGPU initialization

Explicit backend forcing remains available.

## Scene Stacking Instead of Replace-Only Flow

Use `pushScene`/`popScene` for overlays and pause menus rather than replacing every scene:

```ts
await app.sceneManager.pushScene(new PauseScene(), { mode: 'modal' });
await app.sceneManager.popScene();
```

## Loader Bundles

For larger projects, replace hand-maintained preload lists with manifest bundles:

```ts
loader.registerManifest(manifest);
await loader.loadBundle('boot');
```

## Visual Composition

Prefer built-in node/runtime features over custom backend hacks:

- `filters`
- `mask`
- `cacheAsBitmap`
- `RenderTargetPass`

## Audio Workflow

Use `Sound` pooling and audio sprites for frequent UI/gameplay SFX.

## Migration Strategy

- migrate one scene at a time
- keep scene logic in `Scene` lifecycle methods
- keep rendering explicit (`drawable.render(runtime)`)
- verify with `npm test` and `npm run perf:benchmark`
