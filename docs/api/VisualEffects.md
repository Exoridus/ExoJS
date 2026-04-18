# Visual Effects

This page documents visual composition features available on render nodes and runtime passes.

## RenderNode Features

`Drawable` and `Container` inherit from `RenderNode`, which supports:

- `filters`
- `mask`
- `cacheAsBitmap`
- `invalidateCache()`

## Filters

Built-in filters:

- `ColorFilter`
- `BlurFilter`

```ts
sprite.addFilter(new BlurFilter({ radius: 2, quality: 1 }));
```

## Masks

Masks are rectangular and use the mask node's bounds.

```ts
content.mask = maskSprite;
```

## Runtime Composition

Use render passes for explicit target/view switching:

- `RenderTargetPass`
- `CallbackRenderPass`

```ts
runtime.execute(new RenderTargetPass(() => {
    layer.render(runtime);
}, {
    target: renderTexture,
    view: renderTexture.view,
}));
```

## Cache-as-Bitmap

```ts
panel.cacheAsBitmap = true;
panel.invalidateCache();
```

Useful for expensive static subtrees.
