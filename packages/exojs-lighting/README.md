# @codexo/exojs-lighting

Official ExoJS extension for 2D lighting. Lights are scene nodes, so a torch parents to the player and follows it; materials shade against them inside the sprite fragment stage, so a lit scene costs no extra render pass and no extra draw call and sprites sharing one lit material stay in one batch.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-lighting
```

`@codexo/exojs` is a peer dependency. This package has no other runtime dependencies.

## What this package provides

- `PointLight`, `SpotLight` - scene nodes that emit rather than draw. Position comes from the node's transform, a spot's cone points along its rotation, and every field is an ordinary property, so the engine's tweens animate a light with no lighting-specific animation concept.
- `Lighting` - the system: collects the registered lights, hands them to a renderer, and carries the ambient term. Registers on a `SystemRegistry` like any other system.
- `LitMaterial` - a `SpriteMaterial` (GLSL + WGSL) that shades a sprite against those lights. Normals are optional: without them the surface is lit as a plane rather than left black.
- `Normals` - where a material's surface normals come from. `Normals.map(texture)` binds an authored tangent-space map, `Normals.fromAlpha(texture)` derives one from the texture's own silhouette; the interface is open, so a source of your own is a valid argument without this package knowing about it.
- `Occluders` - what blocks light, read out of the description of the world a project already has: physics colliders, tile layers, a sprite's own silhouette, or an outline you author. Occluders are registered sources rather than a flag on a drawable, and `OccluderSource` is an interface you can implement.

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

## Two renderers, one vocabulary

The scene describes what emits; `quality` decides how that becomes pixels. Nothing else changes between them - the same lights, the same materials.

|                         | `forward` (default)                | `lightmap`                                         |
| ----------------------- | ---------------------------------- | -------------------------------------------------- |
| Where light is computed | inside the sprite fragment stage   | in a target of its own, multiplied over the frame  |
| Normal mapping          | yes                                | no - the frame it multiplies is already flat       |
| Lit material            | `LitMaterial`                      | none - the renderer lights the frame, not a sprite |
| Shadows                 | no                                 | yes, soft, from registered occluder sources        |
| Light count             | capped by `maxLights` (default 64) | uncapped                                           |
| Extra passes            | none                               | two, and a third only while debugging              |
| Cost per light          | a loop iteration per lit fragment  | the fill of its own radius                         |

```ts
const lighting = new Lighting({ quality: 'lightmap', app, ambient: new Color(20, 20, 30) });
```

`lightmap` needs the application, because it works on the frame the application drew: it installs its passes in `app.framePasses` and removes them on `destroy()`. `lightResolution` (default `0.5`) sets the light target's density - light is low-frequency, so half resolution is hard to tell apart and costs a quarter of the fill.

`lighting.debug = 'light'` shows the accumulated light field on its own, which is how you see where a light reaches without the scene's colours in the way; `lighting.debug = 'occluders'` draws the silhouettes the sources collected, over the shaded scene.

The `lightmap` light target is `rgba16f`, so two lights overlapping add up past `1.0` instead of saturating to white, and a filter over the composite has something above the clipping point to work with. A WebGL2 context without `EXT_color_buffer_float` cannot render into one; there the target is `rgba8` and `lighting.hdr` reports `false`. The picture is still correct - it clips earlier, and a bloom keyed on a threshold near `1.0` finds little to bloom.

## Shadows you do not model

The work in 2D shadows is data entry, not rendering. Engines that ask for a silhouette per object mostly ship without shadows, because the bookkeeping is not worth it - and a project with physics colliders or a tile layer has described its walls once already.

```ts
const lighting = new Lighting({ quality: 'lightmap', app });

lighting.occludeFrom(Occluders.fromPhysics(world));
lighting.occludeFrom(Occluders.fromTilemap(tilemap.layer('walls')));
lighting.occludeFrom(Occluders.fromAlpha(tree));
lighting.occludeFrom(Occluders.fromMesh(platform));
lighting.occludeFrom(Occluders.fromPolygon(trunkOutline, { node: tree }));
```

| Factory                         | Reads                          | Notes                                                                          |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `Occluders.fromPhysics(world)`  | collider geometry              | static bodies only by default, never sensors; queried per frame by region      |
| `Occluders.fromTilemap(layer)`  | occupied cells of a tile layer | boundary edges only, merged into runs; cached per block, keyed on the revision |
| `Occluders.fromAlpha(sprite)`   | the drawable's own silhouette  | its atlas frame, traced and simplified once, never per frame                   |
| `Occluders.fromMesh(mesh)`      | a triangle mesh's outline      | interior edges dropped, holes kept; extracted once                             |
| `Occluders.fromPolygon(points)` | an outline you author          | the escape hatch, and the right answer when the shadow is not the drawing      |

`fromAlpha` and `fromMesh` take the drawable itself, which then supplies both its geometry and its placement: `fromAlpha` the texture, the frame of it the drawable shows and the box that frame is drawn into, `fromMesh` the vertices and the index stream. The anchor needs no mention - a drawable's transform already carries it. Pass a bare `Texture` to `fromAlpha` instead and the whole of it is traced, placed by `node`; that form cannot know about an atlas frame or a resize, so prefer the drawable wherever there is one.

`fromMesh` extracts once. `fromAlpha` extracts per distinct frame: an animation is a finite set of silhouettes, not a continuous one, so each region of the atlas is traced the first time the clip reaches it and looked up every time after. A rendered frame costs a comparison and the transform; the marching-squares pass happens once per frame of the clip, however long the clip runs. Moving, rotating or scaling either carrier is free.

What neither follows is a change with nothing to key on: deforming a mesh's vertices, or a texture whose pixels move while its frame stays put. That second case is video and anything drawn into every frame - see below.

Two sources give no outline, by construction rather than by omission. A **render target** has no pixels this side of the GPU: reading one back is asynchronous and backend-specific, and its content is dynamic anyway, so `fromAlpha` refuses it - draw into an `HTMLCanvasElement` or `OffscreenCanvas` and wrap that in a `Texture` if you need both a live surface and its outline. **Video** is the opposite case: an `HTMLVideoElement` is a perfectly readable texture source, so `Video` (which extends `Sprite`) traces the frame that was decoded at the time. It will not follow the playback, because a video's frame rectangle never changes while its pixels do, and the per-frame cache has nothing to distinguish one moment from the next. It hardly matters in practice: almost no video carries an alpha channel, so what you get is the frame rectangle, which `fromPolygon` describes with four points and no tracing pass at all.

`Sprite.texture` accepts a `RenderTexture`, so "a sprite that cannot be traced" is a shape the types allow, and a shadow that silently never appears is a bad way to find out. A development build says which of the three it was - no texture, a render target, or a texture that could not be read yet - on the `Occluders` log source. A production build carries neither the check nor the message.

There is no `castsShadow` flag, in this package or in the core. A flag on a drawable would put lighting vocabulary on a class with no lighting concern, and it would tie the shadow silhouette to the sprite's shape - which is wrong often enough that a tree casts the shadow of its trunk, not of its canopy. Sources keep the two apart while letting the common case stay one line.

`Occluders.fromPhysics` and `Occluders.fromTilemap` take structurally typed arguments, so this package depends on neither `@codexo/exojs-physics` nor `@codexo/exojs-tilemap`: a project without them pulls in nothing, and a project with a collision layer of its own can feed shadows from that instead.

### Softness

`softness` is a property of the light, in `0..1`. `0` is a point source with a hard edge; higher values widen the penumbra the way a larger lamp would. It widens the shadow sample kernel rather than adding a pass, so it costs nothing per light and can differ between them.

```ts
lighting.add(new PointLight({ radius: 320, softness: 0.6 }));
```

A spot light's `coneSoftness` is a separate thing: the fade across the edge of its cone, which is the shape of the light rather than the shape of its shadows.

### How a shadow is computed

Every light gets one row of a shadow map: for each of `shadowResolution` angular bins around the light, the distance to the nearest occluding edge as a fraction of the light's radius. The rows are built on the CPU from the segments the sources collected and uploaded as one texture; the light shader turns a fragment's own direction into a bin and compares.

That shape is chosen so the lights stay in a single instanced draw. A shadow pass per light would break the batch the renderer exists for, and the batch is what makes an uncapped light count affordable.

The cost is therefore the visible occluding edges times the lights that can see them, per frame, on top of the fill each light already pays. It is bounded by collecting only the region the visible lights jointly reach, by emitting only boundary edges - a hundred-tile corridor is four segments, not four hundred - and by caching whatever does not change: a traced silhouette is traced once, a tile block is rebuilt only when the layer's revision moves.

`shadowResolution` (default `256`) is the finest shadow edge the renderer can resolve. A bin is accurate to half its own width, which the sample kernel smooths over; a very large light on a high-resolution canvas is the case that wants more bins.

## How the lights reach the shader

The `forward` renderer owns a single `rgba32f` `DataTexture`, `maxLights + 1` texels wide and three rows tall. The light count and the ambient term travel in the texture's header column, so a lit material has no per-frame uniform to write and any number of materials can share one system.

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

| Capability                                  | Status                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| Point and cone lights on sprites            | yes, WebGL2 and WebGPU                                         |
| Lights as scene nodes (parenting, tweens)   | yes                                                            |
| Lights per material                         | `forward`: `maxLights` (default 64); `lightmap`: uncapped      |
| Ambient term                                | yes, carried in the light texture                              |
| Normal maps                                 | optional, one per material (= per atlas)                       |
| Rotation / flip aware normals               | yes, via the instance's local-to-world basis                   |
| Extra render passes or draw calls           | `forward`: none; `lightmap`: two; a `post` chain adds one      |
| Soft shadows from occluder sources          | `lightmap` only, WebGL2 and WebGPU                             |
| Overbright light accumulation               | `lightmap`: `rgba16f`, `rgba8` where floats are not renderable |
| Shadows from physics, tilemaps, alpha, mesh | yes, via `Occluders.*`                                         |
| Filters over the shaded frame (`post`)      | yes, in either renderer, with `app`                            |
| Light cookies, line and sun lights          | no                                                             |
| Deferred (G-buffer) path                    | no                                                             |
| Lit meshes, text, particles, tilemap layers | no - `SpriteMaterial` targets sprites                          |

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
