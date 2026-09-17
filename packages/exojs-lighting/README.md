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
- `Normals` - where a material's surface normals come from. `Normals.map(texture)` binds an authored tangent-space map, `Normals.fromAlpha(texture)` derives one from the texture's own silhouette; the interface is open, so a source of your own is a valid argument without this package knowing about it. Both are also exported as `normalMap` and `normalsFromAlpha`, which is the spelling a bundler can drop what you did not use from.
- `Occluders` - what blocks light, read out of the description of the world a project already has: physics colliders, tile layers, a sprite's own silhouette, or an outline you author. Occluders are registered sources rather than a flag on a drawable, and `OccluderSource` is an interface you can implement. Each factory is also exported by name - `physicsOccluder`, `tilemapOccluder`, `alphaOccluder`, `meshOccluder`, `polygonOccluder`.

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

## Three renderers, one vocabulary

The scene describes what emits; `quality` decides how that becomes pixels. Nothing else changes between them - the same lights, the same materials.

|                         | `forward`                          | `lightmap`                                          | `radiance`                                          |
| ----------------------- | ---------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Where light is computed | inside the sprite fragment stage   | in a target of its own, multiplied over the frame   | the same target, filled by transporting radiance    |
| Normal mapping          | per material, on `LitMaterial`     | per drawable, through a prepass                     | no                                                  |
| Lit material            | `LitMaterial`                      | none - the renderer lights the frame, not a sprite  | none                                                |
| Shadows                 | no                                 | yes, soft, from registered occluder sources         | yes, with a penumbra that follows the source's size |
| Light count             | capped by `maxLights` (default 64) | uncapped                                            | uncapped, and free: the cost is per probe           |
| Extra passes            | none                               | two, a third with normals, a fourth while debugging | four to nine, depending on the view                 |
| Cost per light          | a loop iteration per lit fragment  | the fill of its own radius                          | none - the field costs what the screen costs        |

```ts
const lighting = new Lighting({ quality: 'lightmap', app, ambient: new Color(20, 20, 30) });
```

`quality` defaults to `'auto'`, which takes `lightmap` when you passed `app` and `forward` when you did not - so a scene that describes what it wants rather than how gets shadows wherever it can have them. It resolves once, at construction, and `lighting.quality` reports what it settled on. Name a renderer outright when you need a property only that one has: `'forward'` for normal maps on a `LitMaterial`, `'lightmap'` for shadows and an uncapped light count.

`'auto'` never picks `radiance`: it is the one renderer whose look differs from the other two, so it is only ever had by asking for it. It needs the application and a device that can render into float targets, and is refused at construction without either.

### `radiance`

`radiance` fills the same light field from a chain of radiance cascades. Light PROPAGATES from what emits rather than falling off inside each light's radius, which is a different picture rather than a better one: a lamp lights the whole room it is in, a wall between two rooms leaves the second dark, and a source with a size casts a penumbra that widens with distance the way a real one does.

```ts
const lighting = new Lighting({ quality: 'radiance', app, ambient: new Color(8, 8, 14) });

lighting.add(new PointLight({ radius: 300, intensity: 3, softness: 0.4 }));
lighting.occludeFrom(Occluders.fromTilemap(level.layer('walls')));
```

What a light means here is its SHAPE, not its falloff: `softness` across its reach is the size of the source, and that is what sets how soft its shadows are. `radius` still bounds the region occluders are collected for, and `intensity` and `color` are what it emits.

Three things it does not do, all of them deliberate for now:

- **A surface does not re-emit.** Light is transported from the emitters and occluded by the same field the shadows use, but a lit wall is not itself a source yet - so there is no bounced colour.
- **A `SunLight` is skipped.** It has nowhere to emit from. Use `ambient`.
- **A `SpotLight` emits like a point.** A cone is a property of how a light shades, and this renderer transports from a shape instead.

`probeSpacing`, `cascades` and `interval` are exposed as tuning and all default to something derived from the surface. They change how finely the same scene is sampled, never what is in it.

`lightmap` needs the application, because it works on the frame the application drew: it installs its passes in `app.framePasses` and removes them on `destroy()`. `lightResolution` (default `0.5`) sets the light target's density - light is low-frequency, so half resolution is hard to tell apart and costs a quarter of the fill.

`lighting.debug = 'light'` shows the accumulated light field on its own, which is how you see where a light reaches without the scene's colours in the way; `lighting.debug = 'normals'` shows the prepass normals; `lighting.debug = 'occluders'` draws the silhouettes the sources collected, over the shaded scene; and `lighting.debug = 'mask'` shows those same edges rasterised into a target of their own at the light field's resolution, widened so none can fall between two texels. The mask costs nothing unless you ask for it - it is the input a GPU-resident occluder field would march, and today the debug view is its only reader.

The `lightmap` light target is `rgba16f`, so two lights overlapping add up past `1.0` instead of saturating to white, and a filter over the composite has something above the clipping point to work with. A WebGL2 context without `EXT_color_buffer_float` cannot render into one; there the target is `rgba8` and `lighting.hdr` reports `false`. The picture is still correct - it clips earlier, and a bloom keyed on a threshold near `1.0` finds little to bloom.

### Normals under `lightmap`

`lightmap` multiplies a frame that was already drawn, so by the time the light field is composited there is no per-fragment surface normal anywhere. A **normal prepass** puts one back without asking anything of the scene: register a drawable and the renderer draws its normal map, at the drawable's own place and orientation, into one `rgba8` attachment that the light shader then reads at its own screen position.

```ts
lighting.normalsFrom(crate, normalMap(crateNormals));
lighting.normalsFrom(hero, normalsFromAlpha(heroTexture));
```

Nothing is required of a drawable that is not registered. The attachment's alpha is coverage, and where it is zero the light lands with no `N dot L` term at all - which is exactly how the renderer behaved before the prepass existed, so switching it on cannot darken anything that did not ask for normals. The drawable's own texture supplies that coverage, so a silhouette claims a surface and the empty corners of its quad do not.

What it costs: one pass over the registered drawables, one `rgba8` attachment at the light target's resolution, and one texture fetch in the light shader. A scene that registers nothing pays none of it - the attachment stays at one texel and the pass is switched off. What it inherits from every screen-space normal buffer: one normal per pixel, so overlapping surfaces resolve to the topmost, and within the prepass that order is registration order rather than scene order.

`lighting.debug = 'normals'` shows the field the prepass wrote.

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

### Two spellings, and which one your bundler can act on

Every occluder source and every normal source is exported twice: as a property of `Occluders` / `Normals`, and under its own name.

```ts
import { Occluders, Normals } from '@codexo/exojs-lighting'; // discoverable
import { physicsOccluder, normalMap } from '@codexo/exojs-lighting'; // tree-shakeable
```

They do the same thing. The difference is that reaching one property of a namespace object keeps the whole object, so `Occluders.fromPhysics` also carries the marching-squares tracer, the alpha readback and the tile boundary walker that a physics-only project never runs - measured at 34.0 KB against 25.1 KB minified for the named form. Use the namespace while you are finding your way around, and the named form when the bundle matters.

The renderers do not split this way. `quality` is a string read at runtime, so a `forward` project carries the lightmap and radiance renderers whether or not it runs them; the package as a whole is 28.1 KB gzip, of which a `forward` project uses 23.2 KB. Both figures are budgeted in CI.

### Light shapes

`PointLight` is equal in every direction. `SpotLight` is a cone along the node's own rotation. `LineLight` is a segment: falloff is measured from the nearest point on it, so the pool of light is a capsule rather than a disc - a neon tube, a light strip, a laser.

```ts
sign.addChild(new LineLight({ length: 120, radius: 160, color: Color.cyan }));
```

A line light's `radius` is the distance from the SEGMENT, so it reaches `length / 2 + radius` along its own axis and `radius` across it. Its shadow map is polar around the segment's centre, the same as a point light's: exact for a fragment the segment subtends little of, approximate near a long tube's end, where a real emitter would light an occluder from many points at once. `softness` is the knob that stands in for that.

`SunLight` has a direction and no position: a sun, a moon, a distant floodlight. It reaches everything the camera can see, falls off nowhere, and its shadows are parallel.

```ts
scene.addChild(lighting.add(new SunLight({ intensity: 0.8 }))).setRotation(-35);
```

Its shadow map is a line rather than a circle - there is no centre to measure angles from, so instead of an angular bin per direction it has one bin per strip across the light, holding how far along the light the nearest occluder in that strip sits. The strips span the visible world, which is why registering a sun widens the region the occluder sources are asked for to the camera's own bounds. `height` is a slope rather than a length, because a source at no particular distance has no other meaning for it.

`forward` has no capsule and no directional term in its shader, so it draws a line light as a point light at the segment's centre with the whole reach as its radius, and skips a sun entirely.

Shapes are deliberately not extensible: a shape is instance data a light-pass shader evaluates, and opening it up means either exposing that shader's structure or accepting a draw per shape. Cookies plus parameters cover what people build, and additive extension stays possible later.

### Cookies

Every light takes an optional `cookie` texture, which is the cheapest large visual win here: a window cross, leaf shade, a stained-glass pattern, a projector gobo.

```ts
lighting.add(new PointLight({ radius: 320, cookie: windowCross }));
```

The texture's full `0..1` maps onto the light's own bounding square, so the pattern turns with a cone light and scales with the radius - it is fixed to the lamp, not to the world. It is multiplied into the light, so a transparent part of the cookie casts nothing and an opaque white one changes nothing. Wrapping is the texture's own business; a cookie meant to end at its edge wants `ClampToEdge`.

Lights sharing a cookie share a draw. A scene with three distinct cookies costs three draws rather than one - still one draw per texture, never one per light. `forward` ignores cookies: it shades inside the sprite stage, where a texture per light cannot be reached in one draw.

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

## Emission

A `LitMaterial` takes an `emissive` multiplier: how much light the surface emits of its own, as a multiple of its albedo.

```ts
lava.material = new LitMaterial({ lighting, emissive: 2.4 });
```

It is added to the light term rather than to the colour, so emission scales the albedo the way a light does - a black pixel emits nothing however high it is set, and a transparent one stays transparent instead of glowing through its own alpha. Values above `1` push the surface past what a light could produce, which is what a `post` filter keyed on a threshold is there to catch.

It is a live property (`material.emissive = 0.5`), so a pulsing forge is a tween like any other.

## Capabilities

| Capability                                  | Status                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Point and cone lights on sprites            | yes, WebGL2 and WebGPU                                                              |
| Lights as scene nodes (parenting, tweens)   | yes                                                                                 |
| Lights per material                         | `forward`: `maxLights` (default 64); `lightmap`: uncapped                           |
| Ambient term                                | yes, carried in the light texture                                                   |
| Emissive surfaces                           | `forward`, on `LitMaterial`                                                         |
| Normal maps                                 | `forward`: one per material; `lightmap`: per registered drawable                    |
| Rotation / flip aware normals               | yes, via the instance's local-to-world basis                                        |
| Extra render passes or draw calls           | `forward`: none; `lightmap`: two; `radiance`: four to nine; a `post` chain adds one |
| Soft shadows from occluder sources          | `lightmap` only, WebGL2 and WebGPU                                                  |
| Overbright light accumulation               | `lightmap`: `rgba16f`, `rgba8` where floats are not renderable                      |
| Shadows from physics, tilemaps, alpha, mesh | yes, via `Occluders.*`                                                              |
| Filters over the shaded frame (`post`)      | yes, in either renderer, with `app`                                                 |
| Light cookies                               | `lightmap`, one draw per distinct cookie                                            |
| Line lights (capsule falloff)               | yes; `forward` approximates one as a point light                                    |
| Sun lights (parallel shadows)               | `lightmap` only                                                                     |
| Radiance cascades (propagating light)       | `radiance`, WebGL2 and WebGPU, opt-in                                               |
| Bounced light off lit surfaces              | no - `radiance` transports from emitters only                                       |
| Deferred (G-buffer) path                    | no                                                                                  |
| Lit meshes, text, particles, tilemap layers | no - `SpriteMaterial` targets sprites                                               |

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
