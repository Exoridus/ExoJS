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

## Mask

`RenderNode.mask` accepts any of the following sources (the `MaskSource`
type alias):

```ts
type MaskSource = Rectangle | Texture | RenderTexture | RenderNode | null;
```

Each source has different cost and semantics. Pick the cheapest source
that does what you need.

### Rectangle — fast scissor clip

```ts
import { Rectangle } from '@codexo/exojs';

panel.mask = new Rectangle(0, 0, 200, 300);
```

- Implemented internally as a GPU scissor rectangle. O(1) state change.
  No intermediate render targets, no extra passes.
- Coordinates are in the same world-space as the masked node.
- Nested rectangle masks intersect.
- The most common case: clipping a UI panel, a scrolling list, a
  viewport region.

### Texture / RenderTexture — alpha-channel mask

```ts
import { Texture } from '@codexo/exojs';

content.mask = maskTexture;       // sample maskTexture.alpha as the mask
content.mask = renderTexture;     // sample dynamic render-texture alpha
```

- The texture is stretched to fit the masked node's local bounds.
- Sampling has no transform of its own. If you need to position,
  rotate, or scale the alpha mask, use a `Sprite(texture)` source
  instead (see below).
- Implementation: one intermediate render texture (for the masked
  content) plus one composite pass that multiplies content alpha by
  mask alpha.

### RenderNode — visual-output mask

```ts
content.mask = circleSprite;       // Sprite — uses sprite alpha after transform
content.mask = ringGraphics;       // Graphics — uses drawn shape alpha
content.mask = compositeContainer; // Container — uses entire subtree alpha
```

- The mask node is rendered (with its own transform, filters,
  cacheAsBitmap, etc.) into an intermediate render texture. The
  resulting alpha is used as the mask.
- Bare `SceneNode` instances are **not** valid mask sources because
  they are structural-only (no render contract). Use a `Sprite`,
  `Graphics`, or `Container` instead.
- A node cannot use itself as its own mask (throws at runtime). Other
  cycles (mask of mask of self) are not detected — design hierarchies
  to avoid them.
- Implementation: two intermediate render textures (mask + content)
  plus one composite pass per masked render. The most expensive option;
  use sparingly for high-frequency draws or pair with `cacheAsBitmap`
  on the masked content.

### `mask = null`

Removes any active mask. The node renders normally.

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

Useful for expensive static subtrees. Especially valuable when combined
with a `RenderNode` mask — caching the masked content's pre-composite
output amortizes the multi-pass cost.
