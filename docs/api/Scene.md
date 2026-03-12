# Scene

`Scene` is the normal unit of application state and frame logic.

## Responsibilities

- load resources through `load(loader)`
- initialize state through `init(resources)`
- update simulation through `update(delta)`
- issue rendering work through `draw(renderBackend)`
- release scene-owned state through `unload()` and `destroy()`

## Rendering contract

`Scene.draw(...)` receives `RenderBackend`, not the full frame manager contract.

The intended pattern is:

```ts
public override draw(renderBackend: RenderBackend): void {
    this.sprite.render(renderBackend)
}
```

Do not rely on legacy manager-side draw helpers.

## Lifecycle

- `load(loader)`
- `init(resources)`
- `update(delta)`
- `draw(renderBackend)`
- `unload()`
- `destroy()`

`Application` owns frame presentation and backend initialization.
