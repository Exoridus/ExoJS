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
- `NormalMap`, `AlphaNormals` - where a material's surface normals come from. `new NormalMap(texture)` binds an authored tangent-space map, `new AlphaNormals(texture)` derives one from the texture's own silhouette; `NormalSource` is an interface, so a source of your own is a valid argument without this package knowing about it.
- `PhysicsOccluder`, `TilemapOccluder`, `AlphaOccluder`, `MeshOccluder`, `PolygonOccluder` - what blocks light, read out of the description of the world a project already has: physics colliders, tile layers, a sprite's own silhouette, or an outline you author. Occluders are registered sources rather than a flag on a drawable, and `OccluderSource` is an interface you can implement.

## Usage

```ts
import { Color, Scene, type Seconds, Sprite } from '@codexo/exojs';
import { Lighting, LitMaterial, NormalMap, PointLight } from '@codexo/exojs-lighting';

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

    ground.material = new LitMaterial({ lighting: this.lighting, normals: new NormalMap(normalTexture) });
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

### `radiance`

`radiance` fills the same light field from a chain of radiance cascades. Light PROPAGATES from what emits rather than falling off inside each light's radius, which is a different picture rather than a better one: a lamp lights the whole room it is in, a wall between two rooms leaves the second dark, and a source with a size casts a penumbra that widens with distance the way a real one does.

It is the one renderer named by a VALUE rather than a string:

```ts
import { Lighting, PointLight, radiance } from '@codexo/exojs-lighting';

const lighting = new Lighting({ quality: radiance({ probeSpacing: 2 }), app, ambient: new Color(8, 8, 14) });

lighting.add(new PointLight({ radius: 300, intensity: 3, softness: 0.4 }));
lighting.occludeFrom(new TilemapOccluder(level.layer('walls')));
```

That is not decoration. The cascades and the transport tables they walk are linked only by a project that imports `radiance`, so a project that does not never pays for them - `'radiance'` as a string would put the whole of it into every bundle that reads `quality` from a config file. `lighting.quality` still reports `'radiance'`, and `'auto'` still never picks it.

Its tuning rides on the factory - `probeSpacing`, `cascades` and `interval`, all optional and all defaulting to something derived from the surface. They change how finely the same scene is sampled, never what is in it.

What a light means here is its SHAPE, not its falloff: `softness` sets the size of the source, and that is what sets how soft its shadows are. `radius` still bounds the region occluders are collected for, and `intensity` and `color` are what it emits - `intensity` scaled so that it means the same brightness it means under the light quads, measured at half the light's radius. Changing `softness` therefore changes how soft the shadows are and not how bright the room is.

What else the transport carries:

- **A lit surface re-emits.** A wall the field lit gives part of that light off again in its own colour, one frame later - `radiance({ bounce: 0.5 })` sets how much, and `0` switches it off. It is the previous frame's light field that says how lit a wall was, so the bounce trails a moving lamp by a frame.
- **A `SunLight` is the sky.** A ray that reaches the top of the chain without hitting anything ends in it, so a directional light comes in wherever the sky is open and every wall blocks it. The first enabled one is taken; `softness` is its angular size.
- **A `SpotLight` emits across its cone** and blocks all round, the way a lamp's body does.
- **The fields reach past the picture.** The occluder mask and the geometry a ray walks cover the view and a margin around it (`fieldMargin`, a quarter of the view per side by default), so a wall or a lamp just outside the picture still shadows or lights what is in it as the camera moves. The probes themselves cover only the view.

One limit is worth knowing before a bright lamp goes in the middle of the picture. Close to a source - within roughly five times its own size - the chain is resolving that source with the few directions the coarsest levels have, and the source's own disc is rasterised at the light field's resolution. Moving the lamp by less than a texel therefore redistributes light there in a way the merge does not smooth over: around a tenth of the arriving brightness per quarter texel, which reads as a shimmer on the lamp's own halo rather than anywhere it lights. Past that radius it settles to within what eight bits can even express. It is a property of the transport rather than of a particular scene.

`lightmap` needs the application, because it works on the frame the application drew: it installs its passes in `app.framePasses` and removes them on `destroy()`. `lightResolution` (default `0.5`) sets the light target's density - light is low-frequency, so half resolution is hard to tell apart and costs a quarter of the fill.

`lighting.debug = 'light'` shows the accumulated light field on its own, which is how you see where a light reaches without the scene's colours in the way; `lighting.debug = 'normals'` shows the prepass normals; `lighting.debug = 'occluders'` draws the silhouettes the sources collected, over the shaded scene; and `lighting.debug = 'mask'` shows those same edges rasterised into a target of their own at the light field's resolution, widened so none can fall between two texels. The mask costs nothing unless you ask for it - it is the input a GPU-resident occluder field would march, and today the debug view is its only reader.

The `lightmap` light target is `rgba16f`, so two lights overlapping add up past `1.0` instead of saturating to white, and a filter over the composite has something above the clipping point to work with. A WebGL2 context without `EXT_color_buffer_float` cannot render into one; there the target is `rgba8` and `lighting.hdr` reports `false`. The picture is still correct - it clips earlier, and a bloom keyed on a threshold near `1.0` finds little to bloom.

### Normals under `lightmap`

`lightmap` multiplies a frame that was already drawn, so by the time the light field is composited there is no per-fragment surface normal anywhere. A **normal prepass** puts one back without asking anything of the scene: register a drawable and the renderer draws its normal map, at the drawable's own place and orientation, into one `rgba8` attachment that the light shader then reads at its own screen position.

```ts
lighting.normalsFrom(crate, new NormalMap(crateNormals));
lighting.normalsFrom(hero, new AlphaNormals(heroTexture));
```

Nothing is required of a drawable that is not registered. The attachment's alpha is coverage, and where it is zero the light lands with no `N dot L` term at all - which is exactly how the renderer behaved before the prepass existed, so switching it on cannot darken anything that did not ask for normals. The drawable's own texture supplies that coverage, so a silhouette claims a surface and the empty corners of its quad do not.

What it costs: one pass over the registered drawables, one `rgba8` attachment at the light target's resolution, and one texture fetch in the light shader. A scene that registers nothing pays none of it - the attachment stays at one texel and the pass is switched off. What it inherits from every screen-space normal buffer: one normal per pixel, so overlapping surfaces resolve to the topmost, and within the prepass that order is registration order rather than scene order.

`lighting.debug = 'normals'` shows the field the prepass wrote.

## Shadows you do not model

The work in 2D shadows is data entry, not rendering. Engines that ask for a silhouette per object mostly ship without shadows, because the bookkeeping is not worth it - and a project with physics colliders or a tile layer has described its walls once already.

```ts
const lighting = new Lighting({ quality: 'lightmap', app });

lighting.occludeFrom(new PhysicsOccluder(world));
lighting.occludeFrom(new TilemapOccluder(tilemap.layer('walls')));
lighting.occludeFrom(new AlphaOccluder(tree));
lighting.occludeFrom(new MeshOccluder(platform));
lighting.occludeFrom(new PolygonOccluder(trunkOutline, { node: tree }));
```

| Source                        | Reads                          | Notes                                                                          |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `new PhysicsOccluder(world)`  | collider geometry              | static bodies only by default, never sensors; queried per frame by region      |
| `new TilemapOccluder(layer)`  | occupied cells of a tile layer | boundary edges only, merged into runs; cached per block, keyed on the revision |
| `new AlphaOccluder(sprite)`   | the drawable's own silhouette  | its atlas frame, traced and simplified once, never per frame                   |
| `new MeshOccluder(mesh)`      | a triangle mesh's outline      | interior edges dropped, holes kept; extracted once                             |
| `new PolygonOccluder(points)` | an outline you author          | the escape hatch, and the right answer when the shadow is not the drawing      |

`AlphaOccluder` and `MeshOccluder` take the drawable itself, which then supplies both its geometry and its placement: `AlphaOccluder` the texture, the frame of it the drawable shows and the box that frame is drawn into, `MeshOccluder` the vertices and the index stream. The anchor needs no mention - a drawable's transform already carries it. Pass a bare `Texture` to `AlphaOccluder` instead and the whole of it is traced, placed by `node`; that form cannot know about an atlas frame or a resize, so prefer the drawable wherever there is one.

`MeshOccluder` extracts once. `AlphaOccluder` extracts per distinct frame: an animation is a finite set of silhouettes, not a continuous one, so each region of the atlas is traced the first time the clip reaches it and looked up every time after. A rendered frame costs a comparison and the transform; the marching-squares pass happens once per frame of the clip, however long the clip runs. Moving, rotating or scaling either carrier is free.

What neither follows is a change with nothing to key on: deforming a mesh's vertices, or a texture whose pixels move while its frame stays put. That second case is video and anything drawn into every frame - see below.

Two sources give no outline, by construction rather than by omission. A **render target** has no pixels this side of the GPU: reading one back is asynchronous and backend-specific, and its content is dynamic anyway, so `AlphaOccluder` refuses it - draw into an `HTMLCanvasElement` or `OffscreenCanvas` and wrap that in a `Texture` if you need both a live surface and its outline. **Video** is the opposite case: an `HTMLVideoElement` is a perfectly readable texture source, so `Video` (which extends `Sprite`) traces the frame that was decoded at the time. It will not follow the playback, because a video's frame rectangle never changes while its pixels do, and the per-frame cache has nothing to distinguish one moment from the next. It hardly matters in practice: almost no video carries an alpha channel, so what you get is the frame rectangle, which `PolygonOccluder` describes with four points and no tracing pass at all.

`Sprite.texture` accepts a `RenderTexture`, so "a sprite that cannot be traced" is a shape the types allow, and a shadow that silently never appears is a bad way to find out. A development build says which of the three it was - no texture, a render target, or a texture that could not be read yet - on the `AlphaOccluder` log source. A production build carries neither the check nor the message.

There is no `castsShadow` flag, in this package or in the core. A flag on a drawable would put lighting vocabulary on a class with no lighting concern, and it would tie the shadow silhouette to the sprite's shape - which is wrong often enough that a tree casts the shadow of its trunk, not of its canopy. Sources keep the two apart while letting the common case stay one line.

`PhysicsOccluder` and `TilemapOccluder` take structurally typed arguments, so this package depends on neither `@codexo/exojs-physics` nor `@codexo/exojs-tilemap`: a project without them pulls in nothing, and a project with a collision layer of its own can feed shadows from that instead.

### What your bundler can drop

Every occluder source and every normal source is a class of its own, exported by name, and nothing gathers them into a namespace object. That is the reason: reaching one property of such an object keeps the whole of it, so a physics-only project would carry the marching-squares tracer, the alpha readback and the tile boundary walker it never runs.

The two built-in renderers do not split this way: `quality` is a string read at runtime, so a `forward` project carries the lightmap renderer whether or not it runs it. `radiance` does split, because it is imported rather than named - the package as a whole is 28.1 KB gzip and a `forward` project that never mentions `radiance` uses 17.0 KB. Both figures are budgeted in CI.

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

A cookie is a mask the LIGHT carries, not a pattern projected onto the world: its full `0..1` lies on the light's own bounding square, so it turns with a cone and scales with a radius - and it travels with the light. That is what you want for a torch with a cut-out and what you do not want for a window, whose bars belong to the wall: keep a light wearing a window still, or the pattern slides across the floor with it. A world-anchored projection is a different feature and is not built.

Lights sharing a cookie share a draw. A scene with three distinct cookies costs three draws rather than one - still one draw per texture, never one per light. `forward` ignores cookies: it shades inside the sprite stage, where a texture per light cannot be reached in one draw.

### Softness

`softness` is a property of the light, in `0..1`, and it means a different quantity in each renderer. Under `lightmap` it is FILTER WIDTH: the light stays a point, and the shadow term is averaged over a band of the angular shadow row up to three percent of a full turn wide. A wider band widens the edge, but the edge widens with distance from the LIGHT rather than from the wall, and it is not a model of an area source. Under `radiance` it is SOURCE SIZE: the emitter is given a width, and the penumbra follows from the geometry - it grows with the distance between the wall and the surface the shadow falls on, the way a real one does.

Neither adds a pass. Under `lightmap` the filter samples every bin under its kernel and spends between 7 and 23 texture fetches per shadowed fragment doing it, which also bounds the kernel at ten bins either side - three percent of a turn at the default `shadowResolution`, and proportionally less as that rises.

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

Normals are optional, in three steps. A `LitMaterial` without them binds a shared flat normal and the surface is lit as a plane - a project with no authored maps is lit rather than black. `new AlphaNormals(texture)` reads the alpha channel as a height field and derives a map once at load: the silhouette gains edges that turn away from the light, which knows nothing about the interior of a shape but is the difference between art that reacts to light and art that does not. `new NormalMap(texture)` binds an authored map, which is what a project with real art direction ships.

### Which way up the green channel is

The canonical input convention is **OpenGL**: green above the midpoint means the normal leans towards the TOP of the image, blue points out of the sprite plane, and a flat texel is `(128, 128, 255)`. This is ExoJS's own choice, not a universal standard: most authoring tools can write either convention and several - Substance's mesh bakers among them - default to DirectX, so check what your exporter is set to rather than assuming. A map authored the other way up lights its vertical detail from the wrong side while its horizontal detail stays correct, which is the shape that symptom always has.

Declare the other convention rather than editing the texture:

```ts
new NormalMap(fromMax, { convention: 'directx' });
```

It is per source, it is carried through both the `forward` shader and the `lightmap` prepass, and it costs no texture copy and no readback. There is no auto-detection and no backend-dependent default: the same asset means the same thing on WebGL2 and WebGPU.

Three things stay separate and are easy to confuse. The CHANNEL convention is which way up green is. The TEXTURE orientation is which way up the image is. And this engine's own coordinates are y-down, which is why a map leaning towards the top of its image leans towards local `-y`. Inverting a green channel is not the same as flipping an image vertically.

A normal map is a **material** binding, not a per-sprite one: every sprite drawn with a given `LitMaterial` shares it, so in practice there is one material per atlas. The map must have the same layout as the albedo atlas, frame for frame, and encodes tangent-space normals as `rgb = n * 0.5 + 0.5` with `+x` towards the right of the image and `+y` towards its top. Rotation and mirroring are handled in the shader: the normal is rotated by the sprite's local-to-world basis, so a spinning or negatively-scaled sprite keeps its bumps facing the right way.

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
| Emissive surfaces                           | `forward`, on `LitMaterial`; `radiance` re-emits from lit occluders (`bounce`)      |
| Normal maps                                 | `forward`: one per material; `lightmap`: per registered drawable                    |
| Rotation / flip aware normals               | yes, via the instance's local-to-world basis                                        |
| Extra render passes or draw calls           | `forward`: none; `lightmap`: two; `radiance`: four to nine; a `post` chain adds one |
| Soft shadows from occluder sources          | `lightmap` only, WebGL2 and WebGPU                                                  |
| Overbright light accumulation               | `lightmap`: `rgba16f`, `rgba8` where floats are not renderable                      |
| Shadows from physics, tilemaps, alpha, mesh | yes, one occluder class per source                                                  |
| Filters over the shaded frame (`post`)      | yes, in either renderer, with `app`                                                 |
| Light cookies                               | `lightmap`, one draw per distinct cookie                                            |
| Line lights (capsule falloff)               | yes; `forward` approximates one as a point light                                    |
| Sun lights (parallel shadows)               | `lightmap`; `radiance` as the sky every open ray ends in                            |
| Radiance cascades (propagating light)       | `radiance`, WebGL2 and WebGPU, opt-in                                               |
| Bounced light off lit surfaces              | `radiance`, one frame late, from lit occluders                                      |
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
