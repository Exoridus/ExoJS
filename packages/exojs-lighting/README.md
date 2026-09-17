# @codexo/exojs-lighting

Official ExoJS extension for 2D lighting. Lights are scene nodes, so a torch parents to the player and follows it; materials shade against them inside the sprite fragment stage, so a lit scene costs no extra render pass and no extra draw call and sprites sharing one lit material stay in one batch.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-lighting
```

`@codexo/exojs` is a peer dependency. This package has no other runtime dependencies.

## What this package provides

- `PointLight`, `SpotLight` - scene nodes that emit rather than draw. Position comes from the node's transform, a spot's cone points along its rotation, and every field is an ordinary property, so the engine's tweens animate a light with no lighting-specific animation concept.
- `Lighting` - the system: collects the registered lights, packs them into one `rgba32f` data texture per frame, and carries the ambient term with them. Registers on a `SystemRegistry` like any other system.
- `LitMaterial` - a `SpriteMaterial` (GLSL + WGSL) that shades a sprite against those lights. Normals are optional: without them the surface is lit as a plane rather than left black.
- `Normals` - where a material's surface normals come from. `Normals.map(texture)` binds an authored tangent-space map, `Normals.fromAlpha(texture)` derives one from the texture's own silhouette; the interface is open, so a source of your own is a valid argument without this package knowing about it.

## Usage

```ts
import { Color, Scene, type Seconds, Sprite } from '@codexo/exojs';
import { Lighting, LitMaterial, Normals, PointLight } from '@codexo/exojs-lighting';

class LitScene extends Scene {
  private lighting = new Lighting({ ambient: new Color(30, 30, 45) });
  private player = new Sprite(playerTexture);

  override init(): void {
    // Scene systems tick after Scene.update(), so the packed texture always
    // describes the frame that is about to be drawn.
    this.systems.add(this.lighting);

    // Parented to the player, so the torch follows it with no bookkeeping.
    this.player.addChild(this.lighting.add(new PointLight({ radius: 320, color: new Color(255, 180, 120) })));

    const ground = new Sprite(albedoTexture);

    ground.material = new LitMaterial({ lighting: this.lighting, normals: Normals.map(normalTexture) });
    this.root.addChild(ground, this.player);
  }

  override update(delta: Seconds): void {
    this.player.setPosition(this.player.position.x + 60 * delta, 300);
  }
}
```

## How the lights reach the shader

`Lighting` owns a single `rgba32f` `DataTexture`, `maxLights + 1` texels wide and three rows tall. The light count and the ambient term travel in the texture's header column, so a lit material has no per-frame uniform to write and any number of materials can share one system.

| column  | row 0                         | row 1                               | row 2                              |
| ------- | ----------------------------- | ----------------------------------- | ---------------------------------- |
| `0`     | `(activeLightCount, 0, 0, 0)` | `(ambientR, ambientG, ambientB, 0)` | unused                             |
| `i + 1` | `(x, y, radius, intensity)`   | `(r, g, b, height)`                 | `(dirX, dirY, cosOuter, cosInner)` |

Colour channels are normalized to `0..1`. A point light writes both cone cosines as `-1`, which no direction can fail, so the shader applies one cone term to every light and never branches. This is why the light count is a shader loop bound rather than a compiled-in constant: raising `maxLights` costs texture width, not a recompile.

The shaded result is `albedo * (ambient + sum over lights)`. Each light falls off quadratically to nothing at its `radius`; `height` is how far above the sprite plane it sits, and it controls how grazing the light direction is - small values rake across the surface and exaggerate the normal map, large values flatten it.

## Normal maps

Normals are optional, in three steps. A `LitMaterial` without them binds a shared flat normal and the surface is lit as a plane - a project with no authored maps is lit rather than black. `Normals.fromAlpha(texture)` reads the alpha channel as a height field and derives a map once at load: the silhouette gains edges that turn away from the light, which knows nothing about the interior of a shape but is the difference between art that reacts to light and art that does not. `Normals.map(texture)` binds an authored map, which is what a project with real art direction ships.

A normal map is a **material** binding, not a per-sprite one: every sprite drawn with a given `LitMaterial` shares it, so in practice there is one material per atlas. The map must have the same layout as the albedo atlas, frame for frame, and encodes tangent-space normals as `rgb = n * 0.5 + 0.5` with `+x` right and `+y` down the texture. Rotation and mirroring are handled in the shader: the normal is rotated by the sprite's local-to-world basis, so a spinning or negatively-scaled sprite keeps its bumps facing the right way.

Sprites from a second atlas need a second `LitMaterial`, which breaks the batch at the material boundary. Both materials can shade against the same `Lighting` system.

## Capabilities

| Capability                                  | Status                                       |
| ------------------------------------------- | -------------------------------------------- |
| Point and cone lights on sprites            | yes, WebGL2 and WebGPU                       |
| Lights as scene nodes (parenting, tweens)   | yes                                          |
| Lights per material                         | `maxLights` (default 64), one shader loop    |
| Ambient term                                | yes, carried in the light texture            |
| Normal maps                                 | optional, one per material (= per atlas)     |
| Rotation / flip aware normals               | yes, via the instance's local-to-world basis |
| Extra render passes or draw calls           | none                                         |
| Shadows, occlusion, light volumes           | no                                           |
| Deferred (G-buffer) path                    | no                                           |
| Lit meshes, text, particles, tilemap layers | no - `SpriteMaterial` targets sprites        |

## Cost

Forward lighting costs `fragments x active lights`. With everything on screen lit and many overlapping lights the fragment stage becomes the bottleneck well before the CPU does; measure before raising `maxLights` into the dozens on a full-screen scene.

## Core compatibility

| `@codexo/exojs-lighting` | `@codexo/exojs` |
| ------------------------ | --------------- |
| 0.16.x                   | 0.16.x          |

## Links

- [API reference](https://exojs.dev/api/exojs-lighting)

## License

MIT © Codexo
