import {
  BlendModes,
  CallbackRenderPass,
  Color,
  createFilterShader,
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
  ShaderFilter,
  type Texture,
  TextureFormat,
  UniformType,
  type View,
} from '@codexo/exojs';

import type { Light } from '../lights/Light';
import { lightFalloff, lightHalfLength, lightRadius } from '../lights/reach';
import { SpotLight } from '../lights/SpotLight';
import { SunLight } from '../lights/SunLight';
import bounceFragment from './shaders/bounce.frag';
import bounceVertex from './shaders/bounce.vert';
import bounceWgsl from './shaders/bounce.wgsl';
import cascadeFragment from './shaders/cascade.frag';
import cascadeWgsl from './shaders/cascade.wgsl';
import cascadeGatherFragment from './shaders/cascade-gather.frag';
import cascadeGatherWgsl from './shaders/cascade-gather.wgsl';
import emitterConeFragment from './shaders/emitter-cone.frag';
import emitterConeVertex from './shaders/emitter-cone.vert';
import emitterConeWgsl from './shaders/emitter-cone.wgsl';
import emitterQuadFragment from './shaders/emitter-quad.frag';
import emitterQuadVertex from './shaders/emitter-quad.vert';
import emitterQuadWgsl from './shaders/emitter-quad.wgsl';
import probeVisibilityFragment from './shaders/probe-visibility.frag';
import probeVisibilityWgsl from './shaders/probe-visibility.wgsl';
import { transportCascadeShader, type transportUniforms, transportVisibilityShader } from './transportShaders';

const cascadeUniforms = {
  uToField: UniformType.Vec4,
  uFieldOffset: UniformType.Vec2,
  uOrigin: UniformType.Vec2,
  uProbes: UniformType.Vec2,
  uRange: UniformType.Vec2,
  uSun: UniformType.Vec4,
  uSunColor: UniformType.Vec3,
  uSpacing: UniformType.Float,
  uTile: UniformType.Float,
  uTexel: UniformType.Float,
  uFar: UniformType.Float,
  uMerge: UniformType.Float,
  uCone: UniformType.Float,
} as const;

/**
 * One cascade: march every probe's rays over this level's interval, then add
 * what the level above found along the same directions.
 * @internal
 */
export const cascadeShader = createFilterShader({ glsl: { fragment: cascadeFragment }, wgsl: cascadeWgsl, uniforms: cascadeUniforms });

const visibilityUniforms = {
  uToField: UniformType.Vec4,
  uFieldOffset: UniformType.Vec2,
  uOrigin: UniformType.Vec2,
  uProbes: UniformType.Vec2,
  uSpacing: UniformType.Float,
  uTexel: UniformType.Float,
  uFar: UniformType.Float,
} as const;

/**
 * Per probe of one level, how open the way to each of the four coarser probes
 * it merges from is.
 * @internal
 */
export const probeVisibilityShader = createFilterShader({
  glsl: { fragment: probeVisibilityFragment },
  wgsl: probeVisibilityWgsl,
  uniforms: visibilityUniforms,
});

const gatherUniforms = {
  uToWorld: UniformType.Vec4,
  uWorldOffset: UniformType.Vec2,
  uOrigin: UniformType.Vec2,
  uProbes: UniformType.Vec2,
  uAmbient: UniformType.Vec3,
  uSpacing: UniformType.Float,
  uTile: UniformType.Float,
} as const;

/** The finest cascade, read back out as the light arriving at each fragment. @internal */
export const cascadeGatherShader = createFilterShader({ glsl: { fragment: cascadeGatherFragment }, wgsl: cascadeGatherWgsl, uniforms: gatherUniforms });

/**
 * Screen clip of this frame to screen clip of the last one, and whether the
 * last one exists at all.
 */
type BounceUniforms = Readonly<{ uReproject: UniformType.Vec4; uReprojectOffset: UniformType.Vec2; uHistory: UniformType.Float }>;

const bounceUniforms: BounceUniforms = {
  uReproject: UniformType.Vec4,
  uReprojectOffset: UniformType.Vec2,
  uHistory: UniformType.Float,
};

/**
 * The shader pair behind the bounce quad.
 *
 * Exported so the repository's shader-compile gate can compose the uniform
 * block the authored stages read but do not declare, the way it does for the
 * lit sprite. Nothing else should reach for it.
 * @internal
 */
export const bounceShader = new Shader({
  uniforms: bounceUniforms,
  glsl: {
    vertex: `#version 300 es
${INSTANCE_TRANSFORM_GLSL}
${bounceVertex}`,
    fragment: bounceFragment,
  },
  wgsl: `${INSTANCE_TRANSFORM_WGSL}
${bounceWgsl}`,
});

/** Unit quad in `-1..1`, which is the emitter's own space. */
const unitQuad = (): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    stride: 8,
    vertexData: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });

/** Unit quad in `0..1` carrying its own corners as texture coordinates, for the bounce. */
const frameQuad = (): Geometry =>
  new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
    ],
    stride: 16,
    vertexData: new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });

/** Levels the chain is allowed to grow to. Each one quadruples the reach, so six cover any surface. */
const MAX_CASCADES = 6;
/**
 * How far past its shape an emitter's radiance extends, as a multiple of the
 * finest cascade interval.
 *
 * A ray reads radiance from where it STOPPED, and it stops short of the shape
 * by up to its own width - or passes beside it by that much and still counts
 * the source in part. The widest a ray gets over any level is about the finest
 * interval, so a halo of that size is what makes every such read land on the
 * source's colour rather than on the black beside it.
 */
const EMITTER_HALO = 1.25;

/**
 * An emitter's size as a fraction of its reach, per unit of `softness`.
 *
 * It is the same scale the light quads read `softness` at - their penumbra
 * spans at most three percent of a turn - so a light keeps the size it already
 * had rather than becoming an area source the moment the renderer changes.
 * Reading `softness` as the size directly made a default light a quarter of its
 * own reach across, which fills the scene AND blocks it: an emitter goes into
 * the occluder mask, so an oversized one is an oversized wall.
 */
const EMITTER_SIZE = 0.05;

/**
 * A directional light's angular radius per unit of `softness`, in radians: the
 * emitter size read as an angle, so the same `softness` softens a shadow by
 * about as much whichever shape casts it.
 */
const SUN_SIZE = EMITTER_SIZE * Math.PI;

/**
 * What one unit of `intensity` emits, per unit of reach over emitter size.
 *
 * A source delivers its own angular size: `2R / (2 pi d)` of what it emits, at
 * distance `d`. That is the physics, and it is also why a lamp the size of a
 * lamp lights a room at a hundredth of what the light quads put there for the
 * same `intensity` - the quads do not model a source at all, they paint a
 * falloff. Scaling the emitted radiance by `reach / size` makes the two agree
 * at HALF the light's radius, where the quads' own `(1 - d/r)^2` is a quarter,
 * and it is what keeps `softness` a penumbra knob rather than an exposure one:
 * a bigger source emits less per unit area for the same arriving light.
 */
const EMITTER_GAIN = Math.PI / 8;

const scratchPosition = { x: 0, y: 0 };
const scratchDirection = { x: 0, y: 0 };
const scratchEmitter = { a_emit: [1, 0, 0, 0], a_cone: [Math.PI, Math.PI, Math.PI, 0] };

/**
 * What the geometry walk needs bound, as the renderer hands it over.
 *
 * `revision` names the upload: a table that outgrew its texture is a new
 * texture, and a filter binds its textures once, so the filters are rebuilt
 * when this changes rather than every frame.
 * @internal
 */
export interface TransportBinding {
  readonly textures: Readonly<Record<string, RenderTexture | Texture>>;
  readonly revision: number;
  readonly originX: number;
  readonly originY: number;
  readonly cellSize: number;
  readonly cellsX: number;
  readonly cellsY: number;
  readonly maskWidth: number;
  readonly maskHeight: number;
  readonly blocksWidth: number;
  readonly blocksHeight: number;
  readonly tableWidth: number;
}

/** Tuning for the radiance field. Every entry has a default derived from the surface. */
export interface RadianceFieldOptions {
  /** Light-field texels between the finest cascade's probes. */
  readonly probeSpacing: number;
  /** Levels in the chain, or `null` to take as many as the view's diagonal needs. */
  readonly cascades: number | null;
  /** The finest cascade's ray length, in probe spacings. */
  readonly interval: number;
  /** How much of the light landing on a surface it gives off again, in `0..1`. */
  readonly bounce: number;
}

/**
 * Light as radiance that propagates, rather than as a falloff around each
 * light.
 *
 * A cascade is a grid of probes, each holding the radiance arriving along a set
 * of directions over one interval of distance. Coarser levels have fewer probes
 * and more directions over a longer interval, which is the trade that makes the
 * whole thing affordable: detail near a surface comes from the dense level, and
 * detail far away is angular, where the sparse level has it.
 *
 * What this buys over the light quads is transport: a source with a size
 * casts a penumbra that widens with distance, a lamp fills the room it stands
 * in and thins as one over the distance rather than ending at a radius, a lit
 * wall gives part of that light off again in its own colour, and the cost is
 * per probe rather than per light. What it costs is that the same scene does
 * not look identical under the two renderers.
 * @internal
 */
export class RadianceField {
  /** Draws the emitters and the bounce into a field of their own. */
  public readonly emissionPass: CallbackRenderPass;
  /** Draws each emitter's cone over the same capsule, into a field beside the colour. */
  public readonly conePass: CallbackRenderPass;
  /** Builds the chain from the coarsest level down and gathers it into the light target. */
  public readonly cascadePass: CallbackRenderPass;

  private readonly _options: RadianceFieldOptions;
  private readonly _distance: RenderTexture;
  private readonly _target: RenderTexture;
  private readonly _emission: RenderTexture;
  private readonly _geometry: Geometry = unitQuad();
  private readonly _material: MeshMaterial;
  private readonly _batch: RenderBatch;
  private readonly _cone: RenderTexture;
  private readonly _coneMaterial: MeshMaterial;
  private readonly _coneBatch: RenderBatch;
  private readonly _bounceGeometry: Geometry = frameQuad();
  private readonly _bounceMaterial: MeshMaterial<BounceUniforms>;
  private readonly _bounceBatch: RenderBatch;
  private readonly _bounceTint: Color;
  /** World to clip as the camera saw it when the light field was last GATHERED. */
  private readonly _gatheredToClip = new Matrix();
  /** World to clip for the frame being prepared, promoted above once its gather has run. */
  private readonly _pendingToClip = new Matrix();
  private readonly _reproject = new Matrix();
  private _history = false;
  /** Ping-pong pair: a level reads the one above it whole, so it cannot write into it. */
  private readonly _chain: readonly [RenderTexture, RenderTexture];
  /** Stands in for the level above the coarsest, which nothing reads. */
  private readonly _above: RenderTexture;
  /** One level's merge weights, rewritten before each level reads them. */
  private readonly _visibility: RenderTexture;
  private readonly _cascadeFilter: ShaderFilter<typeof cascadeUniforms>;
  private readonly _visibilityFilter: ShaderFilter<typeof visibilityUniforms>;
  /** The same two over the transport chunk, built when a walk over geometry is bound. */
  private _transportCascade: ShaderFilter<typeof cascadeUniforms & typeof transportUniforms> | null = null;
  private _transportVisibility: ShaderFilter<typeof visibilityUniforms & typeof transportUniforms> | null = null;
  private _walk: TransportBinding | null = null;
  private _walkRevision = -1;
  private readonly _gatherFilter: ShaderFilter<typeof gatherUniforms>;
  private readonly _transform = new Matrix();
  private _field: View | null = null;
  private _levels = 1;
  private _probesX = 1;
  private _probesY = 1;
  private _spacing = 1;
  private _interval = 1;
  private _emitterCount = 0;
  private _sun: SunLight | null = null;

  public constructor(distance: RenderTexture, target: RenderTexture, frame: RenderTexture, options: RadianceFieldOptions) {
    this._distance = distance;
    this._target = target;
    this._options = options;
    this._emission = new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Linear });
    this._chain = [
      new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest }),
      new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest }),
    ];
    this._above = new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest });
    this._visibility = new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest });
    this._cone = new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest });
    this._material = new MeshMaterial({
      shader: new Shader({
        glsl: { vertex: `#version 300 es\n${INSTANCE_TRANSFORM_GLSL}\n${emitterQuadVertex}`, fragment: emitterQuadFragment },
        wgsl: `${INSTANCE_TRANSFORM_WGSL}\n${emitterQuadWgsl}`,
      }),
      blendMode: BlendModes.Additive,
    });
    this._batch = new RenderBatch(this._geometry, this._material, { instanceAttributes: [{ name: 'a_emit', format: 'float32x4' }] });
    this._coneMaterial = new MeshMaterial({
      shader: new Shader({
        glsl: { vertex: `#version 300 es\n${INSTANCE_TRANSFORM_GLSL}\n${emitterConeVertex}`, fragment: emitterConeFragment },
        wgsl: `${INSTANCE_TRANSFORM_WGSL}\n${emitterConeWgsl}`,
      }),
      // Summed, not composited. Alpha here is a count of emitters rather than
      // an opacity, and the other channels are a signed description: ordinary
      // source-over would scale whatever a previous emitter wrote by one minus
      // an axis angle. Summing is order-independent, and the count is what
      // lets the tracer notice that no single cone describes the texel.
      blendMode: BlendModes.Additive,
    });
    this._coneBatch = new RenderBatch(this._geometry, this._coneMaterial, {
      instanceAttributes: [
        { name: 'a_emit', format: 'float32x4' },
        { name: 'a_cone', format: 'float32x4' },
      ],
    });
    this._bounceMaterial = new MeshMaterial({
      shader: bounceShader,
      // Declaration order is the group(2) binding order on WebGPU: the frame
      // at bindings 1/2 and last frame's light at 3/4, matching `bounce.wgsl`.
      textures: { u_frame: frame, u_light: target },
      blendMode: BlendModes.Additive,
    });
    this._bounceBatch = new RenderBatch(this._bounceGeometry, this._bounceMaterial);
    this._bounceTint = new Color(255 * options.bounce, 255 * options.bounce, 255 * options.bounce, 255);
    // Bound once and read live: every field is this object's own target and
    // never changes identity, which is what lets them ride on the filter's
    // fixed texture bindings while the cascade being read changes per level.
    this._cascadeFilter = ShaderFilter.from(cascadeShader, {
      textures: { uDistance: this._distance, uEmission: this._emission, uVisibility: this._visibility, uEmitterCone: this._cone },
    });
    this._visibilityFilter = ShaderFilter.from(probeVisibilityShader);
    this._gatherFilter = ShaderFilter.from(cascadeGatherShader);
    this.emissionPass = new CallbackRenderPass((pass: PassContext) => this._drawEmission(pass), {
      target: this._emission,
      clear: Color.transparentBlack,
      label: 'lighting:emission',
      enabled: false,
    });
    this.conePass = new CallbackRenderPass((pass: PassContext) => this._drawCones(pass), {
      target: this._cone,
      clear: Color.transparentBlack,
      label: 'lighting:emitter-cones',
      enabled: false,
    });
    this.cascadePass = new CallbackRenderPass((pass: PassContext) => this._build(pass), { label: 'lighting:cascades', enabled: false });
  }

  /** The emitters' own field, for a debug view that wants to show it. */
  public get emissionTexture(): RenderTexture {
    return this._emission;
  }

  /** Emitters the last {@link writeEmitters} actually wrote, the sky's directional light included. */
  public get emitterCount(): number {
    return this._emitterCount;
  }

  /** Whether the chain has anything to build. */
  public get enabled(): boolean {
    return this.cascadePass.enabled;
  }

  public set enabled(enabled: boolean) {
    if (!enabled) {
      this.invalidateHistory();
    }

    this.emissionPass.enabled = enabled;
    this.conePass.enabled = enabled;
    this.cascadePass.enabled = enabled;
  }

  /** Match the mask's grid: the emission field is read at the same places. */
  public setSize(width: number, height: number): void {
    this._emission.setSize(width, height);
    this._cone.setSize(width, height);
  }

  /**
   * Turn this frame's lights into emitters.
   *
   * A light's SIZE is its `softness` across its own reach, floored at three
   * texels: that property is the only one in the vocabulary that says a light
   * is not a point, and a source with no size at all would cast shadows with no
   * penumbra at any distance - which is the thing this renderer is for.
   *
   * A directional light has no place to emit from: the first enabled one
   * becomes the sky, which every ray that reaches the top of the chain
   * unblocked ends in.
   */
  public writeEmitters(lights: readonly Light[], texel: number): number {
    this._batch.clear();
    this._coneBatch.clear();
    this._sun = null;

    let written = 0;

    for (const light of lights) {
      if (!light.enabled || light.intensity <= 0) {
        continue;
      }

      if (light instanceof SunLight) {
        if (this._sun === null) {
          this._sun = light;
          written++;
        }

        continue;
      }

      const reach = lightRadius(light);

      if (reach <= 0) {
        continue;
      }

      // Floored well above the tracer's own step: a source the size of one step
      // loses the grazing rays that stop on its rim, and loses more of them the
      // further away the probe is.
      const falloff = lightFalloff(light);
      const radius = Math.max(3 * texel, falloff * light.softness * EMITTER_SIZE);
      const half = lightHalfLength(light) / radius;
      const halo = (EMITTER_HALO * this._intervalFor(texel)) / radius;
      const extent = 1 + halo;

      light.getWorldPosition(scratchPosition);
      light.getWorldDirection(scratchDirection);
      scratchEmitter.a_emit[0] = light.intensity * EMITTER_GAIN * (falloff / radius);
      scratchEmitter.a_emit[1] = halo;
      scratchEmitter.a_emit[2] = half;
      scratchEmitter.a_emit[3] = (0.5 * texel) / radius;
      // The quad covers the halo as well as the shape, so the fragment stage
      // can fade the radiance out where nothing reads it any more.
      this._transform.set(
        radius * (half + extent) * scratchDirection.x,
        -radius * extent * scratchDirection.y,
        scratchPosition.x,
        radius * (half + extent) * scratchDirection.y,
        radius * extent * scratchDirection.x,
        scratchPosition.y,
      );
      this._batch.add(this._transform, light.color, scratchEmitter);

      // Only a spot describes a cone. A point light writing an accept-all one
      // would be averaged together with any spot over the same texel and drag
      // that spot's opening wide; leaving it out is what lets the reader tell
      // the two contributions apart by weight instead.
      if (light instanceof SpotLight) {
        writeCone(scratchEmitter.a_cone, light);
        // The axis as its angle, offset into `0..2pi` so the field can sum it.
        scratchEmitter.a_cone[2] = Math.atan2(scratchDirection.y, scratchDirection.x) + Math.PI;
        this._coneBatch.add(this._transform, light.color, scratchEmitter);
      }

      written++;
    }

    this._emitterCount = written;

    return written;
  }

  /**
   * Draw the emitters wherever the caller's pass points. The occluder mask
   * takes the same draw: an emitter is something a ray ends on, and the alpha
   * this batch writes is its shape.
   */
  public drawEmitters(pass: PassContext, view: View): void {
    if (this._batch.count > 0) {
      pass.drawBatch(this._batch, { view });
    }
  }

  /**
   * Point the chain at this frame's geometry, or back at the distance field
   * with `null`.
   *
   * Called before {@link update}, because the terms that describe the tables
   * are written with the rest of the frame's uniforms.
   */
  public useTransport(binding: TransportBinding | null): void {
    this._walk = binding;

    if (binding === null || binding.revision === this._walkRevision) {
      return;
    }

    this._transportCascade?.destroy();
    this._transportVisibility?.destroy();
    this._transportCascade = ShaderFilter.from(transportCascadeShader(cascadeUniforms), {
      textures: { uVisibility: this._visibility, ...binding.textures },
    });
    this._transportVisibility = ShaderFilter.from(transportVisibilityShader(visibilityUniforms), { textures: { ...binding.textures } });
    this._walkRevision = binding.revision;
  }

  /**
   * Lay out the chain for this frame's camera and hand it the terms it shades
   * with.
   *
   * `view` is the camera, whose axis-aligned bounds the probes cover and whose
   * target the gather writes; `field` is the wider view the mask, the distance
   * field and the emission field were drawn through. `texel` is one field
   * texel in world units and `far` what the distance field's `1.0` stands
   * for. The number of levels follows the view's own diagonal, because each
   * level quadruples the reach of the one below.
   */
  public update(view: View, field: View, texel: number, far: number, ambient: Color): void {
    const bounds = view.getBounds();
    const spacing = Math.max(1, this._options.probeSpacing) * texel;
    const toField = field.getTransform();
    const toWorld = view.getInverseTransform();

    this._field = field;
    this._interval = this._intervalFor(texel);
    this._levels = this._levelsFor(Math.hypot(bounds.width, bounds.height));

    // Rounded up to a multiple of what the coarsest level halves by, so every
    // level's probe grid divides its texture exactly and no level has to deal
    // with a partial probe.
    const block = 2 ** (this._levels - 1);

    this._probesX = Math.ceil(Math.ceil(bounds.width / spacing) / block) * block;
    this._probesY = Math.ceil(Math.ceil(bounds.height / spacing) / block) * block;
    this._spacing = spacing;

    // Every level holds the same number of texels: halving the probe grid per
    // axis and doubling the directions per axis leaves the product alone.
    this._chain[0].setSize(this._probesX * 2, this._probesY * 2);
    this._chain[1].setSize(this._probesX * 2, this._probesY * 2);
    this._visibility.setSize(this._probesX, this._probesY);

    const walking = this._walk;

    for (const filter of [this._cascadeFilter, this._visibilityFilter, this._transportCascade, this._transportVisibility]) {
      if (filter === null) {
        continue;
      }

      filter.uniforms.uToField.set(toField.a, toField.b, toField.c, toField.d);
      filter.uniforms.uFieldOffset.set(toField.x, toField.y);
      filter.uniforms.uOrigin.set(bounds.left, bounds.top);
      filter.uniforms.uTexel.set(texel);
      filter.uniforms.uFar.set(far);

      if (walking === null) {
        continue;
      }

      // The mask is read through the view it was drawn with, which is the same
      // transform the fields are read with.
      const chunk = filter.uniforms as unknown as Record<string, { set: (...values: number[]) => void }>;

      chunk.uGridOrigin?.set(walking.originX, walking.originY);
      chunk.uGridCells?.set(walking.cellsX, walking.cellsY);
      chunk.uCellSize?.set(walking.cellSize);
      chunk.uTableWidth?.set(walking.tableWidth);
      chunk.uMaskCells?.set(walking.maskWidth, walking.maskHeight);
      chunk.uMaskBasis?.set(toField.a, toField.b, toField.c, toField.d);
      chunk.uMaskOffset?.set(toField.x, toField.y);
      chunk.uMaskBlocks?.set(walking.blocksWidth, walking.blocksHeight);
    }

    this._writeSun();
    this._gatherFilter.uniforms.uToWorld.set(toWorld.a, toWorld.b, toWorld.c, toWorld.d);
    this._gatherFilter.uniforms.uWorldOffset.set(toWorld.x, toWorld.y);
    this._gatherFilter.uniforms.uOrigin.set(bounds.left, bounds.top);
    this._gatherFilter.uniforms.uProbes.set(this._probesX, this._probesY);
    this._gatherFilter.uniforms.uSpacing.set(spacing);
    this._gatherFilter.uniforms.uTile.set(2);
    this._gatherFilter.uniforms.uAmbient.set(ambient.r / 255, ambient.g / 255, ambient.b / 255);

    // The bounce quad is the camera's own view rectangle, in the world: the
    // unit quad's corners are clip -1 and +1 through the camera's inverse, so
    // each fragment of it lands on the frame's own pixel.
    this._bounceBatch.clear();

    if (this._options.bounce > 0) {
      this._writeReprojection(view, toWorld);
      this._transform.set(2 * toWorld.a, 2 * toWorld.b, toWorld.x - toWorld.a - toWorld.b, 2 * toWorld.c, 2 * toWorld.d, toWorld.y - toWorld.c - toWorld.d);
      this._bounceBatch.add(this._transform, this._bounceTint);
    }
  }

  /**
   * Forget the gathered light field.
   *
   * The bounce reads it as the previous frame's answer, and a target that has
   * just been resized or has never been written holds whatever the driver
   * left there. The next frame bounces nothing and the one after it resumes.
   */
  public invalidateHistory(): void {
    this._history = false;
  }

  /**
   * Point the bounce at where each of this frame's pixels sat when the light
   * field it reads was gathered.
   *
   * Without it a camera that moves by a pixel reads last frame's light one
   * pixel across, and a scene that pans smears its own bounce along the
   * direction of travel. The map is clip to clip - this frame's inverse into
   * the gathered frame's transform - because that is what the quad's corners
   * are expressed in.
   *
   * The camera it reprojects FROM is the one the last gather actually ran
   * with, not the last one prepared. Promoting it here instead would pair the
   * light field with a camera it was never rendered through: the system
   * publishes once from its own constructor, and an application is free to
   * update more often than it draws.
   */
  private _writeReprojection(view: View, toWorld: Matrix): void {
    this._reproject.copy(toWorld).combine(this._gatheredToClip);
    this._bounceMaterial.uniforms.uReproject.set(this._reproject.a, this._reproject.b, this._reproject.c, this._reproject.d);
    this._bounceMaterial.uniforms.uReprojectOffset.set(this._reproject.x, this._reproject.y);
    this._bounceMaterial.uniforms.uHistory.set(this._history ? 1 : 0);
    this._pendingToClip.copy(view.getTransform());
  }

  public destroy(): void {
    this.emissionPass.destroy();
    this.conePass.destroy();
    this.cascadePass.destroy();
    this._cascadeFilter.destroy();
    this._visibilityFilter.destroy();
    this._gatherFilter.destroy();
    this._batch.destroy();
    this._material.destroy();
    this._coneBatch.destroy();
    this._coneMaterial.destroy();
    this._cone.destroy();
    this._geometry.destroy();
    this._bounceBatch.destroy();
    this._bounceMaterial.destroy();
    this._bounceGeometry.destroy();
    this._chain[0].destroy();
    this._chain[1].destroy();
    this._above.destroy();
    this._visibility.destroy();
    this._emission.destroy();
    this._transportCascade?.destroy();
    this._transportVisibility?.destroy();
    this._emitterCount = 0;
    this._sun = null;
  }

  /** The finest cascade's ray length in world units, for a light-field texel of `texel` world units. */
  private _intervalFor(texel: number): number {
    return Math.max(1, this._options.probeSpacing) * texel * Math.max(0.25, this._options.interval);
  }

  /** Levels enough for the coarsest one's interval to reach across `span`, or the count the caller fixed. */
  private _levelsFor(span: number): number {
    const fixed = this._options.cascades;

    if (fixed !== null) {
      return Math.max(1, Math.min(MAX_CASCADES, Math.round(fixed)));
    }

    let levels = 1;

    // Level n covers out to `interval * (4^(n+1) - 1) / 3`, so each one
    // quadruples what the chain has reached so far.
    while (levels < MAX_CASCADES && (this._interval * (4 ** levels - 1)) / 3 < span) {
      levels++;
    }

    return levels;
  }

  /**
   * Hand the chain its sky: the sun's direction of travel, its angular
   * radius, and what one ray pointing straight at it carries.
   *
   * A ray carries `intensity * pi / radius`, so that a probe's average over
   * all of its directions - the fraction `radius / pi` of them see the sun -
   * comes to `intensity`, which is what the sun quad puts everywhere unshadowed.
   */
  private _writeSun(): void {
    const sun = this._sun;

    if (sun === null) {
      this._cascadeFilter.uniforms.uSun.set(0, 0, 0, 0);
      this._cascadeFilter.uniforms.uSunColor.set(0, 0, 0);

      return;
    }

    const radius = Math.max(0.001, sun.softness * SUN_SIZE);

    sun.getWorldDirection(scratchDirection);
    this._cascadeFilter.uniforms.uSun.set(scratchDirection.x, scratchDirection.y, radius, (sun.intensity * Math.PI) / radius);
    this._cascadeFilter.uniforms.uSunColor.set(sun.color.r / 255, sun.color.g / 255, sun.color.b / 255);
  }

  /**
   * The emitters, then the bounce over them: what a surface re-emits is added
   * to what emits outright, and where a lamp stands the frame shows the lamp.
   */
  private _drawEmission(pass: PassContext): void {
    if (this._field === null) {
      return;
    }

    this.drawEmitters(pass, this._field);

    if (this._bounceBatch.count > 0) {
      pass.drawBatch(this._bounceBatch, { view: this._field });
    }
  }

  private _drawCones(pass: PassContext): void {
    if (this._field !== null && this._coneBatch.count > 0) {
      pass.drawBatch(this._coneBatch, { view: this._field });
    }
  }

  /**
   * Build from the coarsest level down, then gather the finest into the light
   * target.
   *
   * Coarse to fine is the whole order of the technique: a level can only add
   * what the level above it already knows, so the merge has to happen on the
   * way down and each level is read exactly once. Before each level but the
   * top, its merge weights are written for it.
   */
  private _build(pass: PassContext): void {
    const { backend } = pass;
    const [first, second] = this._chain;
    // Either pair walks the same probes over the same intervals; what differs
    // is what a ray reads on the way.
    const overGeometry = this._walk !== null ? this._transportCascade : null;
    const waysOverGeometry = this._walk !== null ? this._transportVisibility : null;
    const walking = overGeometry !== null && waysOverGeometry !== null;
    const cascade = overGeometry ?? this._cascadeFilter;
    const visibility = waysOverGeometry ?? this._visibilityFilter;
    // The walk over geometry reads no field, and a filter still needs an
    // input: the placeholder stands in for one.
    const seen = walking ? this._above : this._distance;

    let source = this._above;
    let flipped = false;

    for (let level = this._levels - 1; level >= 0; level--) {
      const tile = 2 ** (level + 1);
      const start = (this._interval * (4 ** level - 1)) / 3;
      const spacing = this._spacing * 2 ** level;
      const destination = flipped ? second : first;
      const top = level === this._levels - 1;

      if (!top) {
        visibility.uniforms.uProbes.set(this._probesX / 2 ** level, this._probesY / 2 ** level);
        visibility.uniforms.uSpacing.set(spacing);
        visibility.apply(backend, seen, this._visibility);
      }

      cascade.uniforms.uProbes.set(this._probesX / 2 ** level, this._probesY / 2 ** level);
      cascade.uniforms.uSpacing.set(spacing);
      cascade.uniforms.uTile.set(tile);
      cascade.uniforms.uRange.set(start, (this._interval * (4 ** (level + 1) - 1)) / 3);
      cascade.uniforms.uMerge.set(top ? 0 : 1);
      // Half the angular sector one ray owns, as a slope: the coarser the
      // level, the more directions it has and the narrower each one is.
      cascade.uniforms.uCone.set(Math.tan(Math.PI / (tile * tile)));
      cascade.apply(backend, source, destination);

      source = destination;
      flipped = !flipped;
    }

    this._gatherFilter.apply(backend, source, this._target);

    // The light field now holds this frame, so the camera it was gathered
    // through becomes what the next bounce reprojects from - and only now is
    // there anything for it to read at all.
    this._gatheredToClip.copy(this._pendingToClip);
    this._history = true;
  }
}

/**
 * A spot's opening as two half-angles in radians rather than as their cosines.
 *
 * The cone field sums its descriptions and divides by the summed weight, so
 * what it holds has to survive being added up - and a cosine near `1`, which
 * is where a tight spot lives, loses two decimal places of angle to half-float
 * there. An angle is linear in the quantity the tracer compares.
 */
const writeCone = (target: number[], light: SpotLight): void => {
  const outer = (Math.max(0, Math.min(90, light.angle)) * Math.PI) / 180;

  // The inner edge sits where the fade begins, so a cone softness of 0 collapses
  // the two and the shader's smoothstep degenerates to a hard edge on its own.
  target[0] = outer;
  target[1] = outer * (1 - Math.min(1, Math.max(0, light.coneSoftness)));
};
