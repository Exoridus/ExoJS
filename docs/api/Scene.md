# Scene

`Scene` is the normal unit of application state and frame logic.

## Responsibilities

- load resources through `load(loader)`
- initialize state through `init(loader)`
- update simulation through `update(delta)`
- issue rendering work through `draw(runtime)`
- own a structural `root` container for scene-graph composition
- release scene-owned state through `unload(loader)` and `destroy()`

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

## Scene root contract

`Scene.root` is a **structural ownership and traversal anchor**, not an
automatic render-authoritative root. Specifically:

- `root` is created eagerly so `addChild` / `removeChild` always have a
  parent to delegate to and so transform/bounds traversal has a stable
  upward path.
- `root` does **not** render automatically. The framework never calls
  `root.render(runtime)`. The default `Scene.draw` body is empty.
- Choosing what to render each frame is the scene's responsibility. Calling
  `this.root.render(runtime)` from `draw` is the convenient default.
  Rendering only a chosen subtree (e.g. `this.world.render(runtime)`) is
  equally valid and intentionally supported.
- Building hierarchies without `Scene.root` is also valid: own your own
  `Container` instances, render them directly from `draw`. `Scene.root` is
  a default, not a mandate.

This separation is deliberate and aligns with the project identity rule
that explicit draw orchestration must not be replaced by implicit
full-tree rendering. The contract is verified by
`test/core/scene.test.ts:98-121`.

## Lifecycle

- `load(loader)`
- `init(loader)`
- `update(delta)`
- `draw(runtime)`
- `handleInput(event)` for stacked-scene routing
- `unload(loader)`
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
