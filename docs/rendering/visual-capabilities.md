# Visual Capabilities

ExoJS supports practical 2D visual workflows on top of the default sprite/primitive/particle paths.

## Filters

Apply one or more filters to any `RenderNode` (`Drawable` or `Container`).

```ts
import { BlurFilter, ColorFilter, Color } from '@codexo/exojs';

sprite.addFilter(new BlurFilter({ radius: 3, quality: 1 }));
sprite.addFilter(new ColorFilter(new Color(255, 180, 180, 1)));
```

Filters execute in declaration order.

## Mask

`RenderNode.mask` accepts a unified `MaskSource` union. The source type
determines the implementation path and cost:

```ts
import { Rectangle, Sprite, Texture } from '@codexo/exojs';

// Rectangle — O(1) GPU scissor. Cheap. The most common case.
panel.mask = new Rectangle(100, 40, 200, 120);

// Texture — stretched-fit alpha mask. One extra render pass.
content.mask = alphaTexture;

// Sprite (or any RenderNode) — full visual mask with transform. Two
// extra render passes. Use sparingly or combine with cacheAsBitmap.
content.mask = circularReveal;
```

Bare `SceneNode` instances are not valid mask sources because they are
structural-only. Use `Sprite`, `Graphics`, `Container`, or any other
`RenderNode` subclass.

Setting `node.mask = node` (self-mask) throws at runtime.

For full per-source semantics see
[Visual Effects → Mask](../api/VisualEffects.md#mask).

## Render Targets and Passes

Use `RenderTexture` and `RenderTargetPass` for explicit offscreen workflows.

```ts
import { RenderTexture, RenderTargetPass, Color } from '@codexo/exojs';

const target = new RenderTexture(512, 512);

runtime.execute(new RenderTargetPass(() => {
    worldLayer.render(runtime);
}, {
    target,
    view: target.view,
    clearColor: Color.transparentBlack,
}));
```

## Cache-as-Bitmap

Flatten expensive static subtrees:

```ts
uiPanel.cacheAsBitmap = true;

// later, when content changes:
uiPanel.invalidateCache();
```

Especially useful in combination with non-Rectangle masks. Caching the
masked content amortizes the alpha-compose pass across frames.

## zIndex and Sorting

Enable deterministic ordering with `sortableChildren`:

```ts
container.sortableChildren = true;

background.zIndex = 0;
player.zIndex = 10;
fx.zIndex = 20;
```

When sorting is disabled, insertion order is preserved.

## Backends

Visual features are intended to behave coherently on both backends:

- WebGPU (preferred)
- WebGL2 (fallback)

Both backends implement the alpha-mask compose pipeline via dedicated
single-quad two-texture compositors (`WebGl2MaskCompositor`,
`WebGpuMaskCompositor`). The WebGL2 compositor uses a small custom
GLSL shader pair; the WebGPU compositor uses a WGSL shader with cached
pipelines per (target format, blend mode).
