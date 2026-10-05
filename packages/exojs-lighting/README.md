# @codexo/exojs-lighting

Three 2D lighting models for ExoJS: per-sprite forward lighting, shadowed frame lightmaps, and radiance-cascade light propagation. Lights are scene nodes; occluders describe the geometry that blocks them.

## Install

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-lighting
```

Core is the peer dependency. This package exposes directly constructed systems, not a `lightingExtension` descriptor.

## Start with a scene-owned lightmap

```ts
import { Color, Graphics, Scene } from '@codexo/exojs';
import { LightmapLighting, PointLight } from '@codexo/exojs-lighting';

export class LitScene extends Scene {
  override init(): void {
    const lighting = new LightmapLighting(this.app, { ambient: new Color(25, 25, 35), scene: this });
    const floor = new Graphics();
    const lamp = new PointLight({ radius: 300, color: new Color(255, 190, 100) });

    this.systems.add(lighting);
    floor.fillColor = Color.white;
    floor.drawRectangle(0, 0, this.app.width, this.app.height);
    lamp.setPosition(this.app.width / 2, this.app.height / 2);
    this.root.addChild(floor, lamp);
    lighting.add(lamp);
  }
}
```

Register and start `LitScene` in an `Application`. Construct host-bound lighting in `init`, not in a field initializer that accesses `this.app` before attachment. Pass `scene: this`: the application's frame slot is shared by every scene, and a bound system installs its passes there only while its scene is active, so a scene that is preloaded, retained, or being torn down never lights the frame of the scene on screen. Lighting built without `scene` is application-wide and stays in the frame slot until it is destroyed. The [Lighting guide](https://exoridus.github.io/ExoJS/en/guide/effects/lighting/) includes the complete application and the shadow and normal-map workflows.

## Choose deliberately

| Model              | Main use                                                              | Constraint                                                                                                     |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ForwardLighting`  | A `LitMaterial` shades individual sprites.                            | Capacity-bounded lights; no lightmap shadows or cookies.                                                       |
| `LightmapLighting` | Lights, shadows, and optional normal prepass over the composed frame. | Additional targets and passes; normal surfaces must be registered.                                             |
| `RadianceLighting` | Sampled propagation and source-sized penumbrae.                       | Requires a renderable float target; different image and sampling costs, not a drop-in higher-quality lightmap. |

Authored `NormalMap` sources default to the OpenGL tangent-space convention. Set `{ convention: 'directx' }` for the opposite green-channel convention. A normal map changes shading, not the shadow silhouette.

Colour and data stay separate. Albedo textures are sRGB colour, and light and ambient `Color` values are authored sRGB, converted to linear light once, with the light term accumulated and multiplied against albedo there. Normal maps, lightmap accumulation buffers and radiance records are numeric and never colour-transformed: declare a loaded normal image `colorSpace: 'none'`, or the map is rejected. Lighting can accumulate above display white internally (`lighting.hdr`), but the frame carries that headroom to the output transform only when the application sets `rendering.color.workingFormat: 'hdr'`; on the default SDR working target it clips when the lit frame is written. Exposure and tone mapping belong to the application's output transform, not to a post filter.

Occluder sources can read physics, tilemap, alpha, mesh, or explicit polygon geometry. Rendering an object does not automatically register an occluder. Alpha extraction cannot synchronously trace a GPU-only render texture, and cached silhouettes do not automatically follow arbitrary pixel or mesh deformation.

The lighting system owns its renderer resources. Registered lights remain owned by their scene tree; supplied occluder sources, post filters, normal sources, and textures remain caller-owned. Uncapped light counts do not mean zero per-light or per-scene cost.

## Documentation

[Lighting guide](https://exoridus.github.io/ExoJS/en/guide/effects/lighting/) · [Lighting API](https://exoridus.github.io/ExoJS/en/api/lighting/) · [Shadow Casters playground](https://exoridus.github.io/ExoJS/en/playground/?example=lighting/shadow-casters)

## License

MIT © Codexo
