import {
  type Application,
  BlendModes,
  CallbackRenderPass,
  Color,
  DataTexture,
  type Filter,
  FilterPass,
  Geometry,
  INSTANCE_TRANSFORM_GLSL,
  INSTANCE_TRANSFORM_WGSL,
  Matrix,
  MeshMaterial,
  type PassContext,
  RenderBatch,
  RenderTexture,
  ScaleModes,
  Shader,
  Texture,
  TextureFormat,
} from '@codexo/exojs';

import type { LightingDebugView, LightingQuality } from '../Lighting';
import type { Light } from '../lights/Light';
import { lightFalloff, lightHalfLength, lightHeight, lightRadius } from '../lights/reach';
import { SpotLight } from '../lights/SpotLight';
import type { NormalSurface } from '../normals/NormalSurface';
import type { OccluderField } from '../occluders/OccluderField';
import { buildShadowRow } from '../occluders/shadowMap';
import type { LightingBackend } from './LightingBackend';
import lightCompositeFragment from './shaders/light-composite.frag';
import lightCompositeVertex from './shaders/light-composite.vert';
import lightCompositeWgsl from './shaders/light-composite.wgsl';
import lightQuadFragment from './shaders/light-quad.frag';
import lightQuadVertex from './shaders/light-quad.vert';
import lightQuadWgsl from './shaders/light-quad.wgsl';
import normalPrepassFragment from './shaders/normal-prepass.frag';
import normalPrepassVertex from './shaders/normal-prepass.vert';
import normalPrepassWgsl from './shaders/normal-prepass.wgsl';
import occluderDebugFragment from './shaders/occluder-debug.frag';
import occluderDebugVertex from './shaders/occluder-debug.vert';
import occluderDebugWgsl from './shaders/occluder-debug.wgsl';

/** Cone cosine that no direction can fail, which is how a point light says "no cone". */
const noCone = -1;
/** Shadow row a light without occluders in reach carries: the shader reads it as "nothing blocks". */
const noShadow = -1;
/** Width of a debug occluder line, in world pixels. */
const debugLineWidth = 2;

const scratchPosition = { x: 0, y: 0 };
const scratchDirection = { x: 0, y: 0 };
const scratchInstance = { a_light: [noCone, noCone, 1, 0], a_shadow: [noShadow, 0], a_surface: [1, 0, 1, 0] };
const scratchSurface = { a_frame: [0, 0, 1, 1], a_basis: [1, 0, 0, 1] };

/** Unit quad in `-1..1`, which is the light's own space: distance from its centre in radii. */
const unitQuad = (): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    stride: 8,
    vertexData: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });

/** Screen quad carrying its own texture coordinates, for the composite. */
const screenQuad = (): Geometry =>
  new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
    ],
    stride: 16,
    vertexData: new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });

/** Unit quad in `0..1`, which an instance transform maps onto a drawable's own box. */
const boxQuad = (): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    stride: 8,
    vertexData: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });

/** Quad along `+x` and centred on `y`, which an instance transform maps onto one segment. */
const segmentQuad = (): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    stride: 8,
    vertexData: new Float32Array([0, -0.5, 1, -0.5, 1, 0.5, 0, 0.5]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });

/** Construction options for {@link LightmapBackend}. */
export interface LightmapBackendOptions {
  /** The application whose frame is lit. The backend installs its composite in `app.framePasses`. */
  readonly app: Application;
  /**
   * Texels per logical unit of the light target. Light is low-frequency, so
   * half resolution is hard to tell apart and costs a quarter of the fill.
   */
  readonly resolution: number;
  /** Angular bins in each light's shadow map. */
  readonly shadowResolution: number;
  /**
   * Filters over the composited frame, in order. Empty installs no pass and
   * allocates no intermediate; a non-empty chain makes the composite write an
   * off-screen target the filters read.
   */
  readonly post: readonly Filter[];
}

/**
 * Accumulates every light into a target of its own, then multiplies the drawn
 * frame by it.
 *
 * The trade against the forward renderer is the one that matters for a lit
 * scene: light no longer costs a loop iteration per fragment per light, so
 * there is no light cap, and the accumulated field is a texture a shadow term
 * can be folded into. What it gives up is normal mapping - the light target
 * has no surface normals to shade against, because the frame it multiplies is
 * already flat.
 *
 * One instanced draw covers every visible light. The instance transform
 * carries position, radius and cone rotation, the tint carries colour, and two
 * instance attributes carry the cone, the intensity, the light's row in the
 * shadow map and its softness. The quad is the light's bounding square, so a
 * light costs the fill of its own radius rather than of the screen.
 *
 * # Accumulation
 *
 * The light target is `rgba16f` wherever one can be rendered into, so two
 * lights overlapping reach past `1.0` instead of saturating to white, and a
 * filter over the composite has something above the clipping point to read.
 * Where the format is unavailable - WebGL2 without `EXT_color_buffer_float` -
 * it falls back to `rgba8` and says so through {@link hdr}.
 *
 * # Shadows
 *
 * Each light gets one row of a shadow map: the distance to the nearest
 * occluder along every angular bin around it, computed on the CPU from the
 * occluder field and uploaded as one texture. The light shader reverses the
 * fragment's own direction into a bin and compares. Nothing about it is a
 * second draw, which is the point - a shadow pass per light would break the
 * batch the renderer exists for.
 * @internal
 */
export class LightmapBackend implements LightingBackend {
  public readonly quality: LightingQuality = 'lightmap';
  public readonly castsShadows = true;
  public readonly readsSurfaces = true;
  public readonly hdr: boolean;

  private readonly _app: Application;
  private readonly _resolution: number;
  private readonly _shadowResolution: number;
  private readonly _lightGeometry: Geometry = unitQuad();
  private readonly _normalGeometry: Geometry = boxQuad();
  private readonly _compositeGeometry: Geometry = screenQuad();
  private readonly _debugGeometry: Geometry = segmentQuad();
  /**
   * One batch per cookie texture, with the shared opaque white standing in for
   * "no cookie". A cookie is a texture and a texture is a material binding, so
   * lights shining through different patterns cannot share a draw - but lights
   * sharing one still do, and the uncookied majority stays in a single batch
   * however many of them there are.
   */
  private readonly _lightBatches = new Map<Texture, RenderBatch>();
  private readonly _compositeMaterial: MeshMaterial;
  private readonly _debugMaterial: MeshMaterial;
  private readonly _compositeBatch: RenderBatch;
  private readonly _debugBatch: RenderBatch;
  private readonly _normalTarget: RenderTexture;
  /** One batch per albedo/normal-map pair: a batch binds two textures and draws every surface sharing them. */
  private readonly _normalBatches = new Map<Texture | RenderTexture, Map<Texture, RenderBatch>>();
  private readonly _normalPass: CallbackRenderPass;
  private readonly _lightPass: CallbackRenderPass;
  private readonly _compositePass: CallbackRenderPass;
  private readonly _debugPass: CallbackRenderPass;
  private readonly _transform = new Matrix();
  private readonly _tint = Color.white.clone();
  private readonly _target: RenderTexture;
  /** The composite's destination while `post` has filters, and `null` otherwise. */
  private readonly _shaded: RenderTexture | null;
  private readonly _postPass: FilterPass | null;
  private readonly _ambient: Color = Color.black.clone();
  private _shadowMap: DataTexture<TextureFormat.R32F>;
  private _activeCount = 0;
  private _surfaceCount = 0;
  private _debug: LightingDebugView = null;

  public constructor(options: LightmapBackendOptions) {
    this._app = options.app;
    this._resolution = options.resolution;
    this._shadowResolution = options.shadowResolution;
    this.hdr = options.app.rendering.supportsColorFormat(TextureFormat.Rgba16F);
    // Half-float is filterable and blendable in WebGL2 and WebGPU alike, so the
    // only thing the format changes is the ceiling. It is not the default for a
    // render target, though, and a float target would otherwise point-sample -
    // which on a half-resolution light field is visible as blocky falloff.
    this._target = new RenderTexture(1, 1, {
      format: this.hdr ? TextureFormat.Rgba16F : TextureFormat.Rgba8,
      scaleMode: ScaleModes.Linear,
    });
    this._shadowMap = new DataTexture({ width: this._shadowResolution, height: 1, format: TextureFormat.R32F });

    this._compositeMaterial = new MeshMaterial({
      shader: new Shader({
        glsl: { vertex: `#version 300 es\n${INSTANCE_TRANSFORM_GLSL}\n${lightCompositeVertex}`, fragment: lightCompositeFragment },
        wgsl: `${INSTANCE_TRANSFORM_WGSL}\n${lightCompositeWgsl}`,
      }),
      textures: { u_frame: this._app.frameTexture, u_light: this._target },
      blendMode: BlendModes.Normal,
    });

    this._debugMaterial = new MeshMaterial({
      shader: new Shader({
        glsl: { vertex: `#version 300 es\n${INSTANCE_TRANSFORM_GLSL}\n${occluderDebugVertex}`, fragment: occluderDebugFragment },
        wgsl: `${INSTANCE_TRANSFORM_WGSL}\n${occluderDebugWgsl}`,
      }),
      blendMode: BlendModes.Normal,
    });

    this._compositeBatch = new RenderBatch(this._compositeGeometry, this._compositeMaterial);
    this._debugBatch = new RenderBatch(this._debugGeometry, this._debugMaterial);

    // Stock passes rather than passes of our own: the light field is a draw
    // into a target the engine redirects for us, and the composite and the
    // debug overlay are draws into whatever the frame slot has active.
    // The ambient clear belongs to the pass rather than to a `pass.clear()`
    // inside it: a clear issued from within an open pass is a draw on WebGL2
    // and nothing at all on WebGPU, where a load operation is fixed when the
    // pass begins. The colour is read at execute time, so a scene that fades
    // from day to night just mutates it.
    // Sized with the light target and only while something describes a surface:
    // a lightmap scene that registers none never pays for the attachment. The
    // clear is transparent black because alpha is coverage here - zero means
    // "nothing described a surface", and the rgb under it is never read.
    this._normalTarget = new RenderTexture(1, 1);
    this._normalPass = new CallbackRenderPass(pass => this._drawNormals(pass), {
      target: this._normalTarget,
      clear: Color.transparentBlack,
      label: 'lighting:normals',
      enabled: false,
    });
    this._lightPass = new CallbackRenderPass(pass => this._drawLights(pass), {
      target: this._target,
      clear: this._ambient,
      label: 'lighting:accumulate',
    });
    // A filter reads a texture, so a chain needs the shaded frame to land in
    // one. It carries the light target's format rather than the frame's: the
    // whole reason to filter here instead of on a node is to see the light the
    // system produced, and an `rgba8` intermediate would clip it away again
    // between the composite and the first filter.
    this._shaded = options.post.length === 0 ? null : new RenderTexture(1, 1, { format: this._target.format, scaleMode: ScaleModes.Linear });
    this._compositePass = new CallbackRenderPass(pass => this._drawComposite(pass), {
      label: 'lighting:composite',
      ...(this._shaded !== null && { target: this._shaded, clear: Color.transparentBlack }),
    });
    this._postPass = this._shaded === null ? null : new FilterPass(this._shaded, options.post, { label: 'lighting:post' });
    this._debugPass = new CallbackRenderPass(pass => this._drawOccluders(pass), { label: 'lighting:occluder-debug' });

    this._resize();
    this._app.framePasses.addPass(this._normalPass).addPass(this._lightPass).addPass(this._compositePass);

    if (this._postPass !== null) {
      this._app.framePasses.addPass(this._postPass);
    }

    // Last, so the silhouettes stay legible over whatever the chain did to the
    // frame: a debug overlay a bloom has smeared explains nothing.
    this._app.framePasses.addPass(this._debugPass);
    this._app.onResize.add(this._onResize);
  }

  public get activeLightCount(): number {
    return this._activeCount;
  }

  public get debug(): LightingDebugView {
    return this._debug;
  }

  public set debug(view: LightingDebugView) {
    if (this._debug === view) {
      return;
    }

    this._debug = view;
    // Showing an intermediate is multiplying a white frame by it, so the debug
    // views swap the composite's two inputs rather than carrying a second
    // shader that would have to be kept in step with the first.
    this._compositeMaterial.setTexture('u_frame', view === 'light' || view === 'normals' ? whiteTexture() : this._app.frameTexture);
    this._compositeMaterial.setTexture('u_light', view === 'normals' ? this._normalTarget : this._target);
  }

  /** The accumulated light, for a debug view that wants to show it. @internal */
  public get lightTexture(): RenderTexture {
    return this._target;
  }

  public publish(lights: readonly Light[], ambient: Color, occluders: OccluderField, surfaces: readonly NormalSurface[]): void {
    this._writeSurfaces(surfaces);
    this._resize();
    this._ambient.copy(ambient);
    this._growShadowMap(lights.length);

    for (const batch of this._lightBatches.values()) {
      batch.clear();
    }

    const bins = this._shadowResolution;
    const shadows = occluders.count > 0 ? this._shadowMap.buffer : null;
    const segments = occluders.segments;
    const segmentCount = occluders.count;

    let written = 0;

    for (const light of lights) {
      if (!light.enabled || light.intensity <= 0) {
        continue;
      }

      const radius = lightRadius(light);

      if (radius <= 0) {
        continue;
      }

      const falloff = lightFalloff(light);
      const half = lightHalfLength(light);

      light.getWorldPosition(scratchPosition);
      light.getWorldDirection(scratchDirection);
      writeCone(scratchInstance.a_light, light);
      scratchInstance.a_light[2] = light.intensity;
      scratchInstance.a_light[3] = half / falloff;

      if (shadows === null) {
        scratchInstance.a_shadow[0] = noShadow;
      } else {
        scratchInstance.a_shadow[0] = written;
        buildShadowRow(
          segments,
          segmentCount,
          scratchPosition.x,
          scratchPosition.y,
          scratchDirection.x,
          scratchDirection.y,
          radius,
          shadows.subarray(written * bins, (written + 1) * bins),
          bins,
        );
      }

      scratchInstance.a_shadow[1] = light.softness;
      // What the `N dot L` term needs and the instance transform has already
      // folded away: the radius it normalized the quad by, the height the light
      // sits at, and the axis it rotated the quad onto.
      scratchInstance.a_surface[0] = falloff;
      scratchInstance.a_surface[1] = lightHeight(light);
      scratchInstance.a_surface[2] = scratchDirection.x;
      scratchInstance.a_surface[3] = scratchDirection.y;

      // Position, reach and rotation travel as the instance transform: a unit
      // quad scaled by the falloff radius across the light's axis and by the
      // whole reach along it IS the shape's bounding box, and the fragment
      // stage then measures in radii along that axis without knowing where it
      // is in the world.
      this._transform.set(
        radius * scratchDirection.x,
        -falloff * scratchDirection.y,
        scratchPosition.x,
        radius * scratchDirection.y,
        falloff * scratchDirection.x,
        scratchPosition.y,
      );
      this._tint.set(light.color.r, light.color.g, light.color.b, 255);
      this._lightBatch(light.cookie ?? whiteTexture()).add(this._transform, this._tint, scratchInstance);
      written++;
    }

    if (shadows !== null && written > 0) {
      this._shadowMap.commit();
    }

    this._activeCount = written;
    this._writeOccluderDebug(occluders);
  }

  /** Surfaces the last publish actually wrote - hidden and untextured ones are skipped. */
  public get activeSurfaceCount(): number {
    return this._surfaceCount;
  }

  /** The prepass normals, for a debug view that wants to show them. @internal */
  public get normalTexture(): RenderTexture {
    return this._normalTarget;
  }

  public destroy(): void {
    this._app.onResize.remove(this._onResize);
    this._app.framePasses.removePass(this._normalPass);
    this._app.framePasses.removePass(this._lightPass);
    this._app.framePasses.removePass(this._compositePass);
    this._app.framePasses.removePass(this._debugPass);
    this._normalPass.destroy();
    this._lightPass.destroy();
    this._compositePass.destroy();
    this._debugPass.destroy();

    if (this._postPass !== null) {
      this._app.framePasses.removePass(this._postPass);
      // The filters are the caller's; the pass only releases what it allocated.
      this._postPass.destroy();
    }

    this._shaded?.destroy();
    this._compositeBatch.destroy();
    this._debugBatch.destroy();
    this._compositeMaterial.destroy();
    this._debugMaterial.destroy();
    this._lightGeometry.destroy();
    this._normalGeometry.destroy();
    this._compositeGeometry.destroy();
    this._debugGeometry.destroy();

    for (const batch of this._lightBatches.values()) {
      batch.material?.destroy();
      batch.destroy();
    }

    this._lightBatches.clear();

    for (const byNormal of this._normalBatches.values()) {
      for (const batch of byNormal.values()) {
        batch.material?.destroy();
        batch.destroy();
      }
    }

    this._normalBatches.clear();
    this._shadowMap.destroy();
    this._normalTarget.destroy();
    this._target.destroy();
    this._activeCount = 0;
    this._surfaceCount = 0;
  }

  /**
   * Lay every light onto the ambient the pass cleared to.
   *
   * They are drawn through the frame's own view, not the light target's, so
   * the field lines up with the frame it will multiply however the camera has
   * moved.
   */
  private _drawLights(pass: PassContext): void {
    for (const batch of this._lightBatches.values()) {
      if (batch.count > 0) {
        pass.drawBatch(batch, { view: this._app.rendering.view });
      }
    }
  }

  /**
   * The composite spans the surface, so it is drawn in screen space. The
   * frame slot leaves the world view active, which would put a screen-sized
   * quad wherever the camera happens to be looking.
   */
  private _drawComposite(pass: PassContext): void {
    pass.drawBatch(this._compositeBatch, { view: this._app.rendering.screenView });
  }

  /**
   * Lay every registered surface's normals over the flat field the pass cleared
   * to.
   *
   * Through the frame's own view, like the lights, so the normals line up with
   * the light field that will read them.
   */
  private _drawNormals(pass: PassContext): void {
    for (const byNormal of this._normalBatches.values()) {
      for (const batch of byNormal.values()) {
        if (batch.count > 0) {
          pass.drawBatch(batch, { view: this._app.rendering.view });
        }
      }
    }
  }

  /**
   * One instance per registered surface, mapping the unit quad onto the
   * drawable's own box in world space.
   *
   * Surfaces sharing an albedo and a normal map share a batch, so a scene whose
   * art comes from one atlas draws its whole normal field in one call. Within a
   * batch the order is registration order rather than scene order - overlapping
   * surfaces resolve topmost-wins against that, which is the one thing a
   * screen-space normal buffer cannot take from the scene graph.
   */
  private _writeSurfaces(surfaces: readonly NormalSurface[]): void {
    for (const byNormal of this._normalBatches.values()) {
      for (const batch of byNormal.values()) {
        batch.clear();
      }
    }

    let written = 0;

    for (const { drawable, normals } of surfaces) {
      const albedo = drawable.texture;

      if (albedo === null || !drawable.visible) {
        continue;
      }

      const box = drawable.getLocalBounds();

      if (box.width === 0 || box.height === 0) {
        continue;
      }

      const world = drawable.getWorldTransform();
      const frame = drawable.textureFrame;

      // Local 0..1 onto the drawable's box, then the box onto the world: the
      // fragment stage then works in the drawable's own space without knowing
      // where it sits.
      this._transform.set(
        world.a * box.width,
        world.b * box.height,
        world.a * box.left + world.b * box.top + world.x,
        world.c * box.width,
        world.d * box.height,
        world.c * box.left + world.d * box.top + world.y,
      );

      scratchSurface.a_frame[0] = frame.left / albedo.width;
      scratchSurface.a_frame[1] = frame.top / albedo.height;
      scratchSurface.a_frame[2] = frame.width / albedo.width;
      scratchSurface.a_frame[3] = frame.height / albedo.height;
      // The drawable's own basis, not the composed one: the box scale would
      // survive the shader's normalize either way, but a mirrored box must flip
      // the normal and only the drawable knows whether it is mirrored.
      scratchSurface.a_basis[0] = world.a;
      scratchSurface.a_basis[1] = world.b;
      scratchSurface.a_basis[2] = world.c;
      scratchSurface.a_basis[3] = world.d;

      this._normalBatch(albedo, normals.texture).add(this._transform, Color.white, scratchSurface);
      written++;
    }

    const describes = written > 0;

    if (describes !== this._normalPass.enabled) {
      this._normalPass.enabled = describes;

      // An untouched render target holds whatever the driver left there, so the
      // light shader must never read the one-texel placeholder the prepass is
      // parked at. A texture that is zero everywhere reads as "nothing
      // described a surface", which is the term that changes nothing.
      for (const batch of this._lightBatches.values()) {
        batch.material?.setTexture('u_normal', this._boundNormals());
      }
    }

    this._surfaceCount = written;
  }

  /**
   * The light batch for one cookie, built on first use and kept for the
   * backend's life. A scene that switches a lamp's cookie back and forth keeps
   * both batches rather than rebuilding a material per frame; an unused one
   * holds a material and an empty instance buffer.
   */
  private _lightBatch(cookie: Texture): RenderBatch {
    const existing = this._lightBatches.get(cookie);

    if (existing !== undefined) {
      return existing;
    }

    const material = new MeshMaterial({
      shader: new Shader({
        glsl: { vertex: `#version 300 es\n${INSTANCE_TRANSFORM_GLSL}\n${lightQuadVertex}`, fragment: lightQuadFragment },
        wgsl: `${INSTANCE_TRANSFORM_WGSL}\n${lightQuadWgsl}`,
      }),
      // Declaration order is the group(2) binding order on WebGPU: the shadow
      // rows at bindings 1/2, the normal prepass at 3/4, the cookie at 5/6,
      // matching `light-quad.wgsl`.
      textures: { u_shadow: this._shadowMap, u_normal: this._boundNormals(), u_cookie: cookie },
      blendMode: BlendModes.Additive,
    });
    const batch = new RenderBatch(this._lightGeometry, material, {
      instanceAttributes: [
        { name: 'a_light', format: 'float32x4' },
        { name: 'a_shadow', format: 'float32x2' },
        { name: 'a_surface', format: 'float32x4' },
      ],
    });

    this._lightBatches.set(cookie, batch);

    return batch;
  }

  /** The normal field the light shader should read: the prepass, or nothing at all. */
  private _boundNormals(): Texture | RenderTexture {
    return this._normalPass.enabled ? this._normalTarget : transparentTexture();
  }

  /**
   * The batch for one albedo/normal-map pair, built on first use. Batches are
   * kept for the backend's life: an atlas pair that was drawn once is drawn
   * again, and rebuilding a material per frame would recompile nothing but cost
   * a pipeline lookup on every draw.
   */
  private _normalBatch(albedo: Texture | RenderTexture, normalMap: Texture): RenderBatch {
    let byNormal = this._normalBatches.get(albedo);

    if (byNormal === undefined) {
      byNormal = new Map();
      this._normalBatches.set(albedo, byNormal);
    }

    const existing = byNormal.get(normalMap);

    if (existing !== undefined) {
      return existing;
    }

    const material = new MeshMaterial({
      shader: new Shader({
        glsl: {
          vertex: `#version 300 es
${INSTANCE_TRANSFORM_GLSL}
${normalPrepassVertex}`,
          fragment: normalPrepassFragment,
        },
        wgsl: `${INSTANCE_TRANSFORM_WGSL}
${normalPrepassWgsl}`,
      }),
      // Declaration order is the group(2) binding order on WebGPU: albedo at
      // bindings 1/2, normal map at 3/4, matching `normal-prepass.wgsl`.
      textures: { u_albedo: albedo, u_normalMap: normalMap },
      blendMode: BlendModes.Normal,
    });
    const batch = new RenderBatch(this._normalGeometry, material, {
      instanceAttributes: [
        { name: 'a_frame', format: 'float32x4' },
        { name: 'a_basis', format: 'float32x4' },
      ],
    });

    byNormal.set(normalMap, batch);

    return batch;
  }

  private _drawOccluders(pass: PassContext): void {
    if (this._debug !== 'occluders' || this._debugBatch.count === 0) {
      return;
    }

    pass.drawBatch(this._debugBatch, { view: this._app.rendering.view });
  }

  /** One instance per collected segment, mapping the unit quad onto it. */
  private _writeOccluderDebug(occluders: OccluderField): void {
    this._debugBatch.clear();

    if (this._debug !== 'occluders') {
      return;
    }

    const segments = occluders.segments;

    for (let index = 0; index < occluders.count; index++) {
      const offset = index * 4;
      const x1 = segments[offset]!;
      const y1 = segments[offset + 1]!;
      const edgeX = segments[offset + 2]! - x1;
      const edgeY = segments[offset + 3]! - y1;
      const length = Math.hypot(edgeX, edgeY);

      if (length === 0) {
        continue;
      }

      const dirX = edgeX / length;
      const dirY = edgeY / length;

      this._transform.set(dirX * length, -dirY * debugLineWidth, x1, dirY * length, dirX * debugLineWidth, y1);
      this._debugBatch.add(this._transform, debugColor);
    }
  }

  /**
   * One shadow row per light, so a row index is the light's own index in the
   * batch. The map only ever grows: a scene that once lit with fifty lights
   * keeps the rows, which is a few hundred kilobytes and saves reallocating
   * whenever a light is toggled.
   */
  private _growShadowMap(lights: number): void {
    const rows = Math.max(1, lights);

    if (this._shadowMap.height >= rows) {
      return;
    }

    this._shadowMap.destroy();
    this._shadowMap = new DataTexture({ width: this._shadowResolution, height: rows, format: TextureFormat.R32F });

    for (const batch of this._lightBatches.values()) {
      batch.material?.setTexture('u_shadow', this._shadowMap);
    }
  }

  private readonly _onResize = (): void => {
    this._resize();
  };

  /**
   * Keep the light target on the frame's size at this backend's own resolution,
   * and the composite quad on the frame's size in logical units.
   *
   * The composite is one instance that never changes between resizes, so it is
   * written here rather than per frame: `add` copies into the instance buffer,
   * and re-copying an unchanged quad every frame is work the pass does not owe.
   */
  private _resize(): void {
    const logicalWidth = Math.max(1, this._app.width);
    const logicalHeight = Math.max(1, this._app.height);
    const width = Math.max(1, Math.round(logicalWidth * this._resolution));
    const height = Math.max(1, Math.round(logicalHeight * this._resolution));

    // Ahead of the guard below, and off the frame rather than off the logical
    // size: what a filter reads has to match the frame texel for texel, and the
    // density it is rasterized at is the application's to decide.
    this._shaded?.setSize(this._app.frameTexture.width, this._app.frameTexture.height);
    // The light shader reads the normals at its own fragment position, so the
    // two targets must agree texel for texel. Held at one texel while nothing
    // describes a surface, which is what keeps the attachment free for a scene
    // that registers none.
    this._normalTarget.setSize(this._surfaceCount > 0 ? width : 1, this._surfaceCount > 0 ? height : 1);

    if (this._target.width === width && this._target.height === height && this._compositeBatch.count > 0) {
      return;
    }

    this._target.setSize(width, height);
    this._compositeBatch.clear();
    this._compositeBatch.add(this._transform.set(logicalWidth, 0, 0, 0, logicalHeight, 0), Color.white);
  }
}

/** Colour the `occluders` debug view draws collected silhouettes in. */
const debugColor = new Color(255, 96, 160);

const writeCone = (target: number[], light: Light): void => {
  if (!(light instanceof SpotLight)) {
    target[0] = noCone;
    target[1] = noCone;

    return;
  }

  const outer = Math.cos((Math.max(0, Math.min(90, light.angle)) * Math.PI) / 180);
  // The inner edge sits where the fade begins, so a cone softness of 0 collapses
  // the two and the shader's smoothstep degenerates to a hard edge on its own.
  const inner = Math.cos((Math.max(0, Math.min(90, light.angle * (1 - clamp01(light.coneSoftness)))) * Math.PI) / 180);

  target[0] = outer;
  target[1] = inner;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The shared opaque white the debug view multiplies instead of the frame. One
 * texel, created on first use and never destroyed: it outlives any one system
 * and costs four bytes.
 */
let white: Texture | null = null;

const whiteTexture = (): Texture => (white ??= Texture.fromColor(Color.white, 1));

/** The shared empty normal field, on the same terms: one texel, zero coverage. */
let transparent: Texture | null = null;

const transparentTexture = (): Texture => (transparent ??= Texture.fromColor(Color.transparentBlack, 1));
