# Graphics

`Graphics` builds primitive shapes and renders them through the normal drawable flow.

## Responsibilities

- build filled and/or stroked shape geometry
- output `DrawableShape` children internally
- render on both WebGL2 and WebGPU through the built-in primitive path

## Key Properties

- `fillColor`
- `lineColor`
- `lineWidth`

## Typical Usage

```ts
import { Graphics, Color } from '@codexo/exojs';

const graphics = new Graphics();

graphics.fillColor = Color.white;
graphics.lineColor = Color.black;
graphics.lineWidth = 2;

graphics.drawRectangle(0, 0, 128, 128);
graphics.drawCircle(64, 64, 20);
```

## Common Shape Methods

- `drawRectangle(...)`
- `drawCircle(...)`
- `drawEllipse(...)`
- `drawPolygon(...)`
- `drawLine(...)`
- `drawPath(...)`

## Notes

- `Graphics` is a `Container`; each draw call adds internal `DrawableShape` children.
- call `clear()` to remove existing shapes and reset state.
- for deterministic layering among siblings, use `zIndex` + `sortableChildren` on parent containers.
