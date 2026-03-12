# Graphics

`Graphics` is the normal immediate-style shape builder that produces drawable primitive content.

## Responsibilities

- build filled/stroked primitive geometry
- expose the result through normal drawable rendering
- work on both WebGL2 and WebGPU through the built-in primitive path

## Typical usage

```ts
const graphics = new Graphics()
  .beginFill(Color.white)
  .drawRect(0, 0, 128, 128)
  .endFill()
```

## Notes

- `Graphics` ultimately renders through the primitive renderer path
- WebGPU currently supports the normal built-in graphics path
- the public API does not require backend-specific access
