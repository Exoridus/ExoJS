# RenderTexture

`RenderTexture` is the normal offscreen rendering surface.

## Current model

- `RenderTexture` is a descriptor-style object
- backend-native resources are owned by the runtime manager
- you can render into it and then display it through a normal `Sprite`

## Important runtime calls

- `app.renderManager.setRenderTarget(renderTexture)`
- `app.renderManager.setRenderTarget(null)`

## Notes

- the first built-in offscreen path is intentionally small
- same-frame render-to-texture plus display through `Sprite` is supported
- broader postprocess/framegraph systems are outside the normal API model
