# @codexo/exojs-lighting

Official ExoJS extension for forward, normal-mapped 2D lighting. Point lights shade sprites
inside the sprite fragment stage, so a lit scene costs no extra render pass and no extra draw
call: sprites sharing one lit material stay in one batch.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-lighting
```

`@codexo/exojs` is a peer dependency. This package has no other runtime dependencies.

## What this package provides

- `PointLight` - plain mutable world-space light data (`x`, `y`, `radius`, `color`,
  `intensity`, `height`). Not a scene node.
- `LightingSystem` - collects lights, packs them into one `rgba32f` data texture per frame, and
  carries the ambient term with them. Registers on a `SystemRegistry` like any other system.
- `LitSpriteMaterial` - a `SpriteMaterial` (GLSL + WGSL) that samples a tangent-space normal map
  next to the sprite's albedo and shades it against the system's lights.

## Usage

```ts
import { Color, Scene, type Seconds, Sprite } from '@codexo/exojs';
import { LightingSystem, LitSpriteMaterial, PointLight } from '@codexo/exojs-lighting';

class LitScene extends Scene {
  private lighting = new LightingSystem({ ambient: new Color(30, 30, 45) });
  private torch = new PointLight({ x: 400, y: 300, radius: 320, color: new Color(255, 180, 120) });
  private elapsed = 0;

  override init(): void {
    this.lighting.add(this.torch);
    // Scene systems tick after Scene.update(), so the packed texture always
    // describes the frame that is about to be drawn.
    this.systems.add(this.lighting);

    const sprite = new Sprite(albedoTexture);

    sprite.material = new LitSpriteMaterial({ lighting: this.lighting, normalMap: normalTexture });
    this.root.addChild(sprite);
  }

  override update(delta: Seconds): void {
    this.elapsed += delta;
    this.torch.setPosition(400 + Math.cos(this.elapsed) * 200, 300);
  }
}
```

## How the lights reach the shader

`LightingSystem` owns a single `rgba32f` `DataTexture`, `maxLights + 1` texels wide and two rows
tall. The light count and the ambient term travel in the texture's header column, so a lit
material has no per-frame uniform to write and any number of materials can share one system.

| column  | row 0                         | row 1                               |
| ------- | ----------------------------- | ----------------------------------- |
| `0`     | `(activeLightCount, 0, 0, 0)` | `(ambientR, ambientG, ambientB, 0)` |
| `i + 1` | `(x, y, radius, intensity)`   | `(r, g, b, height)`                 |

Colour channels are normalized to `0..1`. This is why the light count is a shader loop bound
rather than a compiled-in constant: raising `maxLights` costs texture width, not a recompile.

The shaded result is `albedo * (ambient + sum over lights)`. Each light falls off quadratically
to nothing at its `radius`; `height` is how far above the sprite plane it sits, and it controls
how grazing the light direction is - small values rake across the surface and exaggerate the
normal map, large values flatten it.

## Normal maps

A normal map is a **material** binding, not a per-sprite one: every sprite drawn with a given
`LitSpriteMaterial` shares it, so in practice there is one material per atlas. The map must have
the same layout as the albedo atlas, frame for frame, and encodes tangent-space normals as
`rgb = n * 0.5 + 0.5` with `+x` right and `+y` down the texture. Rotation and mirroring are
handled in the shader: the normal is rotated by the sprite's local-to-world basis, so a spinning
or negatively-scaled sprite keeps its bumps facing the right way.

Sprites from a second atlas need a second `LitSpriteMaterial`, which breaks the batch at the
material boundary. Both materials can shade against the same `LightingSystem`.

## Capabilities

| Capability                                  | Status                                       |
| ------------------------------------------- | -------------------------------------------- |
| Forward point lights on sprites             | yes, WebGL2 and WebGPU                       |
| Lights per material                         | `maxLights` (default 64), one shader loop    |
| Ambient term                                | yes, carried in the light texture            |
| Normal maps                                 | one per material (= per atlas)               |
| Rotation / flip aware normals               | yes, via the instance's local-to-world basis |
| Extra render passes or draw calls           | none                                         |
| Shadows, occlusion, light volumes           | no                                           |
| Deferred (G-buffer) path                    | no                                           |
| Lit meshes, text, particles, tilemap layers | no - `SpriteMaterial` targets sprites        |

## Cost

Forward lighting costs `fragments x active lights`. With everything on screen lit and many
overlapping lights the fragment stage becomes the bottleneck well before the CPU does; measure
before raising `maxLights` into the dozens on a full-screen scene.

## Core compatibility

| `@codexo/exojs-lighting` | `@codexo/exojs` |
| ------------------------ | --------------- |
| 0.16.x                   | 0.16.x          |

## Links

- [API reference](https://exojs.dev/api/exojs-lighting)

## License

MIT © Codexo
