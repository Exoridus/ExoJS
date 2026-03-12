# Sprite

`Sprite` is the normal textured drawable.

## Responsibilities

- render a `Texture` or `RenderTexture`
- apply transform/origin/tint state
- use `textureFrame` for sub-rect rendering
- participate in the normal scene graph through `Container`

## Important properties

- `texture`
- `textureFrame`
- `width`
- `height`
- inherited transform/tint/visibility state

## Rendering

Use it through the normal scene flow:

```ts
sprite.render(renderBackend)
```

or place it in a container and render the container.

## Notes

- WebGPU supports the normal built-in sprite path
- `Text`, `Video`, and `RenderTexture` display all ride on the sprite path
- batching is internal and not part of the public API contract
