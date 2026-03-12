# Text

`Text` is a dynamic texture-backed sprite.

## Current model

- text is rasterized to a canvas
- that canvas updates a `Texture`
- the result renders through the normal sprite path

## Notes

- WebGPU text support uses the same built-in sprite path
- no dedicated WebGPU text renderer is required for normal use
- `TextStyle` remains the public styling surface

## Practical implication

Treat `Text` as a normal drawable that happens to own a dynamic texture.
