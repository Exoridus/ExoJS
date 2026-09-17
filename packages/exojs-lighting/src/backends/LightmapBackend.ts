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
import { SunLight } from '../lights/SunLight';
import type { NormalSurface } from '../normals/NormalSurface';
import type { OccluderField } from '../occluders/OccluderField';
import type { OccluderDrawable } from '../occluders/OccluderSource';
import { buildShadowRow, buildSunShadowRow } from '../occluders/shadowMap';
import type { DistanceField } from './distanceField';
import type { LightingBackend } from './LightingBackend';
import type { LightingFields } from './radiance';
import type { RadianceField } from './radianceField';
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
import sunQuadFragment from './shaders/sun-quad.frag';
import sunQuadVertex from './shaders/sun-quad.vert';
import sunQuadWgsl from './shaders/sun-quad.wgsl';
import { ShadowMarchFiller } from './shadowMarch';

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
const scratchSun = { a_box: [0, 0, 1, 1], a_sun: [1, 0, 1, noShadow], a_range: [0, 1, 0, 1], a_beam: [1, 0] };

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

/**
 * Which filler writes the polar shadow rows: the CPU segment walk, the GPU
 * march over the occluder mask, or the renderer's own choice.
 * @internal
 */
export type ShadowFillerOption = 'auto' | 'cpu' | 'gpu';

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
   * The value-selected renderer's own pieces, or `null` for the light quads.
   * Passing them is what makes this renderer fill the field with cascades, and
   * it is the only way their code is linked at all.
   */
  readonly fields: LightingFields | null;
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
  public readonly quality: LightingQuality;
  public readonly castsShadows = true;
  public readonly readsSurfaces = true;
  public readonly hdr: boolean;

  private readonly _app: Application;
  private readonly _resolution: number;
  private readonly _shadowResolution: number;
  private readonly _compositeGeometry: Geometry = screenQuad();
  private readonly _lightGeometry: Geometry = unitQuad();
  private readonly _normalGeometry: Geometry = boxQuad();
  private readonly _debugGeometry: Geometry = segmentQuad();
  /**
   * One batch per cookie texture, with the shared opaque white standing in for
   * "no cookie". A cookie is a texture and a texture is a material binding, so
   * lights shining through different patterns cannot share a draw - but lights
   * sharing one still do, and the uncookied majority stays in a single batch
   * however many of them there are.
   */
  private readonly _lightBatches = new Map<Texture, RenderBatch>();
  /**
   * The directional lights, in a batch of their own. A sun has no radius to
   * normalize by and no falloff to apply, so it shares neither the light quad's
   * geometry nor its shader - but it shares the target, and additive blending
   * does not care which draw arrived first.
   */
  private readonly _sunBatch: RenderBatch;
  private readonly _sunMaterial: MeshMaterial;
  private readonly _compositeMaterial: MeshMaterial;
  private readonly _debugMaterial: MeshMaterial;
  private readonly _compositeBatch: RenderBatch;
  private readonly _debugBatch: RenderBatch;
  /**
   * The occluder mask: this frame's blocking edges rasterised at the light
   * field's own resolution and size, so a fragment's position in one is its
   * position in the other.
   *
   * Parked at one texel and switched off unless something reads it. Nothing
   * marches it yet - the `mask` debug view is its only consumer - and a pass
   * that runs for nobody is the defect `post` shipped with once already.
   */
  private readonly _maskTarget: RenderTexture;
  private readonly _maskBatch: RenderBatch;
  private readonly _maskPass: CallbackRenderPass;
  /**
   * The drawables this frame's sources handed over, held from `publish` until
   * the mask pass draws them. Copied out of the field rather than read through
   * it, because the field is the system's and is refilled without asking.
   */
  private readonly _maskDrawables: OccluderDrawable[] = [];
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
  /**
   * The directional lights' rows, in a texture of their own. A sun's row is
   * linear where a point light's is polar, so the two are numbered per texture
   * rather than by one counter across both - which is also what lets the polar
   * rows move to a render target without the suns having to follow.
   */
  private _sunShadowMap: DataTexture<TextureFormat.R32F>;
  /** Built only where a float render target exists; `null` pins the renderer to the CPU filler. */
  private readonly _filler: ShadowMarchFiller | null;
  /** The distance field over the mask. Built on the same condition as the filler, and read by the `distance` view. */
  private readonly _distanceField: DistanceField | null;
  /** The cascade chain, when it is what fills the light field rather than the quads. */
  private readonly _radiance: RadianceField | null;
  private _fillerRequest: ShadowFillerOption = 'auto';
  private _activeCount = 0;
  private _surfaceCount = 0;
  private _debug: LightingDebugView = null;

  public constructor(options: LightmapBackendOptions) {
    this._app = options.app;
    this._resolution = options.resolution;
    this._shadowResolution = options.shadowResolution;
    this.hdr = options.app.rendering.supportsColorFormat(TextureFormat.Rgba16F);
    this.quality = options.fields === null ? 'lightmap' : 'radiance';
    // Half-float is filterable and blendable in WebGL2 and WebGPU alike, so the
    // only thing the format changes is the ceiling. It is not the default for a
    // render target, though, and a float target would otherwise point-sample -
    // which on a half-resolution light field is visible as blocky falloff.
    this._target = new RenderTexture(1, 1, {
      format: this.hdr ? TextureFormat.Rgba16F : TextureFormat.Rgba8,
      scaleMode: ScaleModes.Linear,
    });
    this._shadowMap = new DataTexture({ width: this._shadowResolution, height: 1, format: TextureFormat.R32F });
    this._sunShadowMap = new DataTexture({ width: this._shadowResolution, height: 1, format: TextureFormat.R32F });

    this._sunMaterial = new MeshMaterial({
      shader: new Shader({
        glsl: {
          vertex: `#version 300 es
${INSTANCE_TRANSFORM_GLSL}
${sunQuadVertex}`,
          fragment: sunQuadFragment,
        },
        wgsl: `${INSTANCE_TRANSFORM_WGSL}
${sunQuadWgsl}`,
      }),
      // Declaration order is the group(2) binding order on WebGPU: the shadow
      // rows at bindings 1/2 and the normal prepass at 3/4, matching
      // `sun-quad.wgsl`.
      textures: { u_shadow: this._sunShadowMap, u_normal: transparentTexture() },
      blendMode: BlendModes.Additive,
    });

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

    this._sunBatch = new RenderBatch(this._lightGeometry, this._sunMaterial, {
      instanceAttributes: [
        { name: 'a_box', format: 'float32x4' },
        { name: 'a_sun', format: 'float32x4' },
        { name: 'a_range', format: 'float32x4' },
        { name: 'a_beam', format: 'float32x2' },
      ],
    });
    this._compositeBatch = new RenderBatch(this._compositeGeometry, this._compositeMaterial);
    this._debugBatch = new RenderBatch(this._debugGeometry, this._debugMaterial);
    // The same geometry and the same material as the debug overlay: rasterising
    // an edge into a target and drawing it over the frame are one draw pointed
    // at two places. What differs is the width, which is a property of the
    // target rather than of the edge.
    this._maskBatch = new RenderBatch(this._debugGeometry, this._debugMaterial);

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
    this._maskTarget = new RenderTexture(1, 1);
    this._maskPass = new CallbackRenderPass(pass => this._drawMask(pass), {
      target: this._maskTarget,
      clear: Color.transparentBlack,
      label: 'lighting:occluder-mask',
      enabled: false,
    });
    // Built here rather than on demand so its pass can sit between the mask and
    // the accumulation in the frame slot: the pipeline appends, and a filler
    // switched on later would otherwise march after the light field read it.
    this._filler = this.hdr ? new ShadowMarchFiller(this._maskTarget, this._shadowResolution) : null;
    // Both come from the selected renderer rather than from an import here: a
    // project on the quads never links a cascade or a jump flood.
    this._distanceField = options.fields === null || !this.hdr ? null : options.fields.distance(this._maskTarget);
    this._radiance = options.fields === null || this._distanceField === null ? null : options.fields.radiance(this._distanceField.texture, this._target);
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

    this._syncMask();
    this._app.framePasses.addPass(this._maskPass);

    if (this._filler !== null) {
      this._app.framePasses.addPass(this._filler.pass);
    }

    if (this._distanceField !== null) {
      this._app.framePasses.addPass(this._distanceField.pass);
    }

    if (this._radiance !== null) {
      // The emitters go into the mask, so their field is drawn after it and
      // before the cascades that march what the mask seeded.
      this._app.framePasses.addPass(this._radiance.emissionPass).addPass(this._radiance.cascadePass);
    }

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
    const intermediate = view === 'light' || view === 'normals' || view === 'mask' || view === 'distance';

    this._syncMask();
    this._compositeMaterial.setTexture('u_frame', intermediate ? whiteTexture() : this._app.frameTexture);
    this._compositeMaterial.setTexture('u_light', this._debugTexture(view));
  }

  /** The intermediate a debug view multiplies the white frame by. */
  private _debugTexture(view: LightingDebugView): RenderTexture {
    if (view === 'normals') {
      return this._normalTarget;
    }

    if (view === 'distance' && this._distanceField !== null) {
      return this._distanceField.texture;
    }

    return view === 'mask' ? this._maskTarget : this._target;
  }

  /** The accumulated light, for a debug view that wants to show it. @internal */
  public get lightTexture(): RenderTexture {
    return this._target;
  }

  /**
   * The filler actually writing the polar shadow rows, which is what a caller
   * reads back after asking for one: `'gpu'` needs a float render target, and
   * where there is none the request resolves to `'cpu'` rather than failing.
   *
   * `'auto'` is `'cpu'`. The march covers only what the occluder mask holds -
   * the camera's view - so it stays opt-in until its picture is on the record
   * against the segment walk's.
   * @internal
   */
  public get shadowFiller(): 'cpu' | 'gpu' {
    return this._fillerRequest === 'gpu' && this._filler !== null ? 'gpu' : 'cpu';
  }

  public set shadowFiller(filler: ShadowFillerOption) {
    if (this._fillerRequest === filler) {
      return;
    }

    this._fillerRequest = filler;
    this._syncMask();

    for (const batch of this._lightBatches.values()) {
      batch.material?.setTexture('u_shadow', this._boundShadows());
    }
  }

  /**
   * Only what reads the occluder mask can take a drawable instead of its
   * outline: the shadow march, and the cascades that trace the same field.
   */
  public get rasterisesOccluders(): boolean {
    return this._radiance !== null || this.shadowFiller === 'gpu';
  }

  public publish(lights: readonly Light[], ambient: Color, occluders: OccluderField, surfaces: readonly NormalSurface[]): void {
    this._writeSurfaces(surfaces);
    this._resize();
    this._ambient.copy(ambient);

    const marching = this._radiance === null ? this._writeLights(lights, occluders) : false;

    if (this._radiance !== null) {
      this._activeCount = this._radiance.writeEmitters(lights, this._maskTexel());
    }

    this._writeMask(occluders);
    this._writeOccluderDebug(occluders);
    this._updateFields(marching);
  }

  /**
   * Lay out this frame's lights as quads and give each one its shadow row.
   * Answers whether the rows were marched rather than walked, which is what
   * the marcher's own uniforms then have to be pointed at.
   */
  private _writeLights(lights: readonly Light[], occluders: OccluderField): boolean {
    this._growShadowMap(lights.length);

    for (const batch of this._lightBatches.values()) {
      batch.clear();
    }

    const marching = this.shadowFiller === 'gpu';
    // A field of nothing but drawables still casts, but only for the filler
    // that can rasterise one: the segment walk has nothing to walk there.
    const casting = occluders.count > 0 || (marching && occluders.drawableCount > 0);
    const segments = occluders.segments;
    const segmentCount = occluders.count;

    if (casting && marching) {
      this._filler!.begin(lights.length);
    }

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

      if (!casting) {
        scratchInstance.a_shadow[0] = noShadow;
      } else {
        scratchInstance.a_shadow[0] = written;

        this._writeShadowRow(written, radius, segments, segmentCount, marching);
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

    const suns = this._writeSuns(lights, casting, segments, segmentCount);

    if (casting && written > 0 && !marching) {
      this._shadowMap.commit();
    }

    if (casting && suns > 0) {
      this._sunShadowMap.commit();
    }

    this._activeCount = written + suns;

    return casting && marching;
  }

  /**
   * Point whatever reads the mask at this frame's camera, once the mask itself
   * has been written: the marcher steps in mask texels, and the distance field
   * normalizes against what the camera can see.
   */
  private _updateFields(marching: boolean): void {
    const texel = this._maskTexel();

    if (marching) {
      this._filler!.end(this._app.rendering.view.getBounds(), texel);
    }

    if (this._distanceField?.pass.enabled === true) {
      const bounds = this._app.rendering.view.getBounds();

      this._distanceField.update(texel, Math.hypot(bounds.width, bounds.height));
    }

    // After the distance field, which is what tells the cascades the scale
    // their sphere tracing steps in.
    if (this._radiance !== null && this._distanceField !== null) {
      this._radiance.update(this._app.rendering.view, this._app.rendering.view.getBounds(), texel, this._distanceField.far, this._ambient);
    }
  }

  /**
   * Give one light the polar row the shader will sample, from whichever filler
   * is active. The light's position and axis are the ones the caller has just
   * read into the shared scratch.
   */
  private _writeShadowRow(row: number, radius: number, segments: Float32Array, segmentCount: number, marching: boolean): void {
    const bins = this._shadowResolution;

    if (marching) {
      this._filler!.write(row, scratchPosition.x, scratchPosition.y, radius, scratchDirection.x, scratchDirection.y);

      return;
    }

    buildShadowRow(
      segments,
      segmentCount,
      scratchPosition.x,
      scratchPosition.y,
      scratchDirection.x,
      scratchDirection.y,
      radius,
      this._shadowMap.buffer.subarray(row * bins, (row + 1) * bins),
      bins,
    );
  }

  /**
   * Write the directional lights, numbering their rows from zero in a shadow
   * texture of their own.
   *
   * A sun's quad is the camera's own world box and its shadow row is a line of
   * strips across the light rather than a circle of rays around it, because
   * there is no centre to measure angles from. The strips span the same box, so
   * the region the occluder sources were collected for has to cover it - which
   * is what the system arranges by folding the view into that region whenever a
   * sun is registered.
   */
  private _writeSuns(lights: readonly Light[], casting: boolean, segments: Float32Array, segmentCount: number): number {
    this._sunBatch.clear();

    let written = 0;

    for (const light of lights) {
      if (!(light instanceof SunLight) || !light.enabled || light.intensity <= 0) {
        continue;
      }

      const view = this._app.rendering.view.getBounds();
      const halfWidth = Math.max(1, view.width) / 2;
      const halfHeight = Math.max(1, view.height) / 2;
      const centerX = view.left + halfWidth;
      const centerY = view.top + halfHeight;

      light.getWorldDirection(scratchDirection);

      const alongX = scratchDirection.x;
      const alongY = scratchDirection.y;
      const acrossX = -alongY;
      const acrossY = alongX;
      // The box is axis-aligned in world space, so its extent along an
      // arbitrary axis is the sum of each side's projection onto it - no need
      // to walk the corners.
      const acrossReach = Math.abs(acrossX) * halfWidth + Math.abs(acrossY) * halfHeight;
      const alongReach = Math.abs(alongX) * halfWidth + Math.abs(alongY) * halfHeight;
      const acrossCenter = acrossX * centerX + acrossY * centerY;
      const alongCenter = alongX * centerX + alongY * centerY;
      const spanMin = acrossCenter - acrossReach;
      const spanSize = 2 * acrossReach;
      const depthMin = alongCenter - alongReach;
      const depthSpan = 2 * alongReach;

      if (!casting) {
        scratchSun.a_sun[3] = noShadow;
      } else {
        scratchSun.a_sun[3] = written;
        buildSunShadowRow(
          segments,
          segmentCount,
          alongX,
          alongY,
          acrossX,
          acrossY,
          spanMin,
          spanSize,
          depthMin,
          depthSpan,
          this._sunShadowMap.buffer.subarray(written * this._shadowResolution, (written + 1) * this._shadowResolution),
          this._shadowResolution,
        );
      }

      scratchSun.a_box[0] = centerX;
      scratchSun.a_box[1] = centerY;
      scratchSun.a_box[2] = halfWidth;
      scratchSun.a_box[3] = halfHeight;
      scratchSun.a_sun[0] = alongX;
      scratchSun.a_sun[1] = alongY;
      scratchSun.a_sun[2] = light.height;
      scratchSun.a_range[0] = spanMin;
      scratchSun.a_range[1] = spanSize;
      scratchSun.a_range[2] = depthMin;
      scratchSun.a_range[3] = depthSpan;
      scratchSun.a_beam[0] = light.intensity;
      scratchSun.a_beam[1] = light.softness;

      this._transform.set(halfWidth, 0, centerX, 0, halfHeight, centerY);
      this._tint.set(light.color.r, light.color.g, light.color.b, 255);
      this._sunBatch.add(this._transform, this._tint, scratchSun);
      written++;
    }

    return written;
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
    this._app.framePasses.removePass(this._maskPass);

    if (this._filler !== null) {
      this._app.framePasses.removePass(this._filler.pass);
      this._filler.destroy();
    }

    if (this._distanceField !== null) {
      this._app.framePasses.removePass(this._distanceField.pass);
      this._distanceField.destroy();
    }

    if (this._radiance !== null) {
      this._app.framePasses.removePass(this._radiance.emissionPass);
      this._app.framePasses.removePass(this._radiance.cascadePass);
      this._radiance.destroy();
    }
    this._app.framePasses.removePass(this._normalPass);
    this._app.framePasses.removePass(this._lightPass);
    this._app.framePasses.removePass(this._compositePass);
    this._app.framePasses.removePass(this._debugPass);
    this._maskPass.destroy();
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
    this._maskBatch.destroy();
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

    this._maskDrawables.length = 0;
    this._lightBatches.clear();
    this._sunBatch.destroy();
    this._sunMaterial.destroy();

    for (const byNormal of this._normalBatches.values()) {
      for (const batch of byNormal.values()) {
        batch.material?.destroy();
        batch.destroy();
      }
    }

    this._normalBatches.clear();
    this._shadowMap.destroy();
    this._sunShadowMap.destroy();
    this._maskTarget.destroy();
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

    if (this._sunBatch.count > 0) {
      pass.drawBatch(this._sunBatch, { view: this._app.rendering.view });
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

      this._sunMaterial.setTexture('u_normal', this._boundNormals());
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
      textures: { u_shadow: this._boundShadows(), u_normal: this._boundNormals(), u_cookie: cookie },
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

  /** The polar rows the light shader should read: the marched atlas, or the walked ones. */
  private _boundShadows(): DataTexture<TextureFormat.R32F> | RenderTexture {
    return this.shadowFiller === 'gpu' ? this._filler!.texture : this._shadowMap;
  }

  /**
   * Keep the mask pass on for whoever reads the mask - the debug view, or the
   * march - and off for everyone else, and keep its target sized to match.
   */
  private _syncMask(): void {
    const marching = this.shadowFiller === 'gpu';
    const cascades = this._radiance !== null;
    const distance = cascades || (this._debug === 'distance' && this._distanceField !== null);

    this._maskPass.enabled = cascades || this._debug === 'mask' || marching || distance;
    // The cascades fill the light target themselves, ambient included, so the
    // quad accumulation has nothing left to do and its clear would undo them.
    this._lightPass.enabled = !cascades;

    if (this._filler !== null) {
      this._filler.pass.enabled = marching;
    }

    if (this._distanceField !== null) {
      this._distanceField.pass.enabled = distance;
    }

    if (this._radiance !== null) {
      this._radiance.enabled = cascades;
    }

    this._resize();
  }

  /** One mask texel in world units, along whichever axis resolves it worse. */
  private _maskTexel(): number {
    const view = this._app.rendering.view.getBounds();

    return Math.max(view.width / Math.max(1, this._maskTarget.width), view.height / Math.max(1, this._maskTarget.height));
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

  /** Rasterise this frame's blocking edges, through the frame's own view. */
  private _drawMask(pass: PassContext): void {
    const view = this._app.rendering.view;

    if (this._maskBatch.count > 0) {
      pass.drawBatch(this._maskBatch, { view });
    }

    // A drawable blocks light where it is opaque, so what the mask needs from
    // it is the alpha it draws with - which is what drawing it here produces,
    // at its own place, for whatever it happens to be showing this frame.
    for (const drawable of this._maskDrawables) {
      pass.render(drawable, { view });
    }

    // An emitter is something a ray ends on, so it belongs in the mask as much
    // as a wall does - otherwise the cascades would trace straight through the
    // lamp and find whatever is behind it.
    this._radiance?.drawEmitters(pass, view);
  }

  /**
   * One instance per collected segment, widened so no edge can fall between two
   * texels of the mask.
   *
   * The width is a floor rather than a knob. An edge thinner than a texel is an
   * edge a marcher can step over, and a tilemap wall one tile thick is exactly
   * the case that produces: the leak would look like a tuning problem and be a
   * sampling one. Widening here costs a fraction of a texel of shadow and
   * removes the artefact class rather than trading it against a parameter.
   */
  private _writeMask(occluders: OccluderField): void {
    this._maskBatch.clear();
    this._maskDrawables.length = 0;

    if (!this._maskPass.enabled) {
      return;
    }

    for (let index = 0; index < occluders.drawableCount; index++) {
      this._maskDrawables.push(occluders.drawables[index]!);
    }

    const texel = this._maskTexel();
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

      // Lengthened by a texel at each end as well: two edges meeting at a corner
      // would otherwise leave a hole exactly one texel wide at the join.
      this._transform.set(dirX * (length + texel * 2), -dirY * texel, x1 - dirX * texel, dirY * (length + texel * 2), dirX * texel, y1 - dirY * texel);
      this._maskBatch.add(this._transform, Color.white);
    }
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
    this._sunShadowMap.destroy();
    this._shadowMap = new DataTexture({ width: this._shadowResolution, height: rows, format: TextureFormat.R32F });
    this._sunShadowMap = new DataTexture({ width: this._shadowResolution, height: rows, format: TextureFormat.R32F });

    for (const batch of this._lightBatches.values()) {
      batch.material?.setTexture('u_shadow', this._boundShadows());
    }

    this._sunMaterial.setTexture('u_shadow', this._sunShadowMap);
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
    // On the light field's own grid, so a fragment's place in one is its place
    // in the other - which is what a marcher reading both needs.
    this._maskTarget.setSize(this._maskPass.enabled ? width : 1, this._maskPass.enabled ? height : 1);

    if (this._distanceField !== null) {
      // On the mask's own grid, so a texel of one is a texel of the other, and
      // parked at one texel while nothing reads it.
      const wanted = this._distanceField.pass.enabled;

      this._distanceField.setSize(wanted ? width : 1, wanted ? height : 1);
    }

    this._radiance?.setSize(width, height);

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
