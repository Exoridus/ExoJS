# Visual Capabilities

ExoJS supports practical 2D visual workflows on top of the default sprite/primitive/particle paths.

## Filters

Apply one or more filters to any `RenderNode` (`Drawable` or `Container`).

```ts
import { BlurFilter, ColorFilter, Color } from 'exojs';

sprite.addFilter(new BlurFilter({ radius: 3, quality: 1 }));
sprite.addFilter(new ColorFilter(new Color(255, 180, 180, 1)));
```

Filters execute in declaration order.

## Masks

Masks are rectangular and based on the mask node bounds.

```ts
const mask = new Sprite(maskTexture);
mask.setPosition(100, 40);
mask.width = 200;
mask.height = 120;

content.mask = mask;
```

## Render Targets and Passes

Use `RenderTexture` and `RenderTargetPass` for explicit offscreen workflows.

```ts
import { RenderTexture, RenderTargetPass, Color } from 'exojs';

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
