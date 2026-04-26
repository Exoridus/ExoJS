# Scene

`Scene` is the normal unit of application state and frame logic.

## Responsibilities

- load resources through `load(loader)`
- initialize state through `init(resources)`
- update simulation through `update(delta)`
- issue rendering work through `draw(runtime)`
- own a structural `root` container for scene-graph composition
- release scene-owned state through `unload()` and `destroy()`

## Rendering contract

`Scene.draw(...)` receives `SceneRenderRuntime`, not the full frame manager contract.

The scene owns a default `root: Container`, but rendering remains explicit.

The simplest pattern is:

```ts
public override draw(runtime: SceneRenderRuntime): void {
    this.root.render(runtime)
}
```

Selective subtree rendering is still intentionally supported:

```ts
public override draw(runtime: SceneRenderRuntime): void {
    this.world.render(runtime);
    this.ui.render(runtime);
}
```

Do not rely on legacy manager-side draw helpers.

## Lifecycle

- `load(loader)`
- `init(resources)`
- `update(delta)`
- `draw(renderBackend)`
- `handleInput(event)` for stacked-scene routing
- `unload()`
- `destroy()`

`Application` owns frame presentation and backend initialization.

## Scene Stacking

Use `SceneManager` stack operations for overlays/modals instead of replacing every scene:

- `setScene(scene, options?)`
- `pushScene(scene, options?)`
- `popScene(options?)`

`pushScene`/`setScene` support:

- `mode: 'overlay' | 'modal' | 'opaque'`
- `input: 'capture' | 'passthrough' | 'transparent'`
- `transition: { type: 'fade', duration?, color? }`

You can also set per-scene defaults with:

```ts
scene.setParticipationPolicy({
    mode: 'modal',
    input: 'capture',
});
```
