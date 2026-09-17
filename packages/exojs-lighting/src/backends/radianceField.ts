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
  type ReadonlyRectangle,
  RenderBatch,
  RenderTexture,
  ScaleModes,
  Shader,
  ShaderFilter,
  TextureFormat,
  UniformType,
  type View,
} from '@codexo/exojs';

import type { Light } from '../lights/Light';
import { lightFalloff, lightHalfLength, lightRadius } from '../lights/reach';
import { SunLight } from '../lights/SunLight';
import cascadeFragment from './shaders/cascade.frag';
import cascadeWgsl from './shaders/cascade.wgsl';
import cascadeGatherFragment from './shaders/cascade-gather.frag';
import cascadeGatherWgsl from './shaders/cascade-gather.wgsl';
import emitterQuadFragment from './shaders/emitter-quad.frag';
import emitterQuadVertex from './shaders/emitter-quad.vert';
import emitterQuadWgsl from './shaders/emitter-quad.wgsl';

const cascadeUniforms = {
  uView: UniformType.Vec4,
  uOrigin: UniformType.Vec2,
  uProbes: UniformType.Vec2,
  uRange: UniformType.Vec2,
  uSpacing: UniformType.Float,
  uTile: UniformType.Float,
  uTexel: UniformType.Float,
  uFar: UniformType.Float,
  uMerge: UniformType.Float,
} as const;

/**
 * One cascade: march every probe's rays over this level's interval, then add
 * what the level above found along the same directions.
 * @internal
 */
export const cascadeShader = createFilterShader({ glsl: { fragment: cascadeFragment }, wgsl: cascadeWgsl, uniforms: cascadeUniforms });

const gatherUniforms = {
  uView: UniformType.Vec4,
  uOrigin: UniformType.Vec2,
  uProbes: UniformType.Vec2,
  uAmbient: UniformType.Vec3,
  uSpacing: UniformType.Float,
  uTile: UniformType.Float,
} as const;

/** The finest cascade, read back out as the light arriving at each fragment. @internal */
export const cascadeGatherShader = createFilterShader({ glsl: { fragment: cascadeGatherFragment }, wgsl: cascadeGatherWgsl, uniforms: gatherUniforms });

/** Unit quad in `-1..1`, which is the emitter's own space. */
const unitQuad = (): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    stride: 8,
    vertexData: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });

/** Levels the chain is allowed to grow to. Each one quadruples the reach, so six cover any surface. */
const MAX_CASCADES = 6;
/**
 * Fraction of an emitter's radius that fades out, so a source has no hard rim.
 *
 * Small rather than soft on purpose: a ray stops a step SHORT of what it hit
 * and reads the radiance a little inside it, so a wide fade would take that
 * reading off the bright part of a source only a few texels across.
 */
const EMITTER_FADE = 0.15;

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
const scratchEmitter = { a_emit: [1, EMITTER_FADE, 0, 0] };

/** Tuning for the radiance field. Every entry has a default derived from the surface. */
export interface RadianceFieldOptions {
  /** Light-field texels between the finest cascade's probes. */
  readonly probeSpacing: number;
  /** Levels in the chain, or `null` to take as many as the view's diagonal needs. */
  readonly cascades: number | null;
  /** The finest cascade's ray length, in probe spacings. */
  readonly interval: number;
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
 * What this buys over the light quads is bounce: a ray that ends on a lit
 * surface carries that surface's radiance, so a red sign tints the wall beside
 * it with no light placed there. What it costs is that a light no longer falls
 * off as `(1 - d/r)^2` - it propagates - so the same scene does not look
 * identical under the two renderers.
 * @internal
 */
export class RadianceField {
  /** Draws the emitters into a field of their own. */
  public readonly emissionPass: CallbackRenderPass;
  /** Builds the chain from the coarsest level down and gathers it into the light target. */
  public readonly cascadePass: CallbackRenderPass;

  private readonly _options: RadianceFieldOptions;
  private readonly _distance: RenderTexture;
  private readonly _target: RenderTexture;
  private readonly _emission: RenderTexture;
  private readonly _geometry: Geometry = unitQuad();
  private readonly _material: MeshMaterial;
  private readonly _batch: RenderBatch;
  /** Ping-pong pair: a level reads the one above it whole, so it cannot write into it. */
  private readonly _chain: readonly [RenderTexture, RenderTexture];
  /** Stands in for the level above the coarsest, which nothing reads. */
  private readonly _above: RenderTexture;
  private readonly _cascadeFilter: ShaderFilter<typeof cascadeUniforms>;
  private readonly _gatherFilter: ShaderFilter<typeof gatherUniforms>;
  private readonly _transform = new Matrix();
  private _view: View | null = null;
  private _levels = 1;
  private _probesX = 1;
  private _probesY = 1;
  private _spacing = 1;
  private _interval = 1;
  private _emitterCount = 0;

  public constructor(distance: RenderTexture, target: RenderTexture, options: RadianceFieldOptions) {
    this._distance = distance;
    this._target = target;
    this._options = options;
    this._emission = new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Linear });
    this._chain = [
      new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest }),
      new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest }),
    ];
    this._above = new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest });
    this._material = new MeshMaterial({
      shader: new Shader({
        glsl: { vertex: `#version 300 es\n${INSTANCE_TRANSFORM_GLSL}\n${emitterQuadVertex}`, fragment: emitterQuadFragment },
        wgsl: `${INSTANCE_TRANSFORM_WGSL}\n${emitterQuadWgsl}`,
      }),
      blendMode: BlendModes.Additive,
    });
    this._batch = new RenderBatch(this._geometry, this._material, { instanceAttributes: [{ name: 'a_emit', format: 'float32x4' }] });
    // Bound once and read live: both fields are this object's own targets and
    // never change identity, which is what lets them ride on the filter's fixed
    // texture bindings while the cascade being read changes per level.
    this._cascadeFilter = ShaderFilter.from(cascadeShader, { textures: { uDistance: this._distance, uEmission: this._emission } });
    this._gatherFilter = ShaderFilter.from(cascadeGatherShader);
    this.emissionPass = new CallbackRenderPass((pass: PassContext) => this._drawEmitters(pass), {
      target: this._emission,
      clear: Color.transparentBlack,
      label: 'lighting:emission',
      enabled: false,
    });
    this.cascadePass = new CallbackRenderPass((pass: PassContext) => this._build(pass), { label: 'lighting:cascades', enabled: false });
  }

  /** The emitters' own field, for a debug view that wants to show it. */
  public get emissionTexture(): RenderTexture {
    return this._emission;
  }

  /** Emitters the last {@link writeEmitters} actually wrote. */
  public get emitterCount(): number {
    return this._emitterCount;
  }

  /** Whether the chain has anything to build. */
  public get enabled(): boolean {
    return this.cascadePass.enabled;
  }

  public set enabled(enabled: boolean) {
    this.emissionPass.enabled = enabled;
    this.cascadePass.enabled = enabled;
  }

  /** Match the light field's grid: the probes are laid out in its texels. */
  public setSize(width: number, height: number): void {
    this._emission.setSize(width, height);
  }

  /**
   * Turn this frame's lights into emitters.
   *
   * A light's SIZE is its `softness` across its own reach, floored at two
   * texels: that property is the only one in the vocabulary that says a light
   * is not a point, and a source with no size at all would cast shadows with no
   * penumbra at any distance - which is the thing this renderer is for.
   *
   * A directional light has no place to emit from and is skipped.
   */
  public writeEmitters(lights: readonly Light[], texel: number): number {
    this._batch.clear();

    let written = 0;

    for (const light of lights) {
      if (!light.enabled || light.intensity <= 0 || light instanceof SunLight) {
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

      light.getWorldPosition(scratchPosition);
      light.getWorldDirection(scratchDirection);
      scratchEmitter.a_emit[0] = light.intensity * EMITTER_GAIN * (falloff / radius);
      scratchEmitter.a_emit[1] = EMITTER_FADE;
      scratchEmitter.a_emit[2] = half;
      this._transform.set(
        radius * (half + 1) * scratchDirection.x,
        -radius * scratchDirection.y,
        scratchPosition.x,
        radius * (half + 1) * scratchDirection.y,
        radius * scratchDirection.x,
        scratchPosition.y,
      );
      this._batch.add(this._transform, light.color, scratchEmitter);
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
   * Lay out the chain for this frame's camera and hand it the terms it shades
   * with.
   *
   * `texel` is one light-field texel in world units and `far` what the distance
   * field's `1.0` stands for. The number of levels follows the view's own
   * diagonal, because each level quadruples the reach of the one below.
   */
  public update(view: View, bounds: ReadonlyRectangle, texel: number, far: number, ambient: Color): void {
    const spacing = Math.max(1, this._options.probeSpacing) * texel;

    this._view = view;
    this._interval = spacing * Math.max(0.25, this._options.interval);
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
    this._cascadeFilter.uniforms.uView.set(bounds.left, bounds.top, Math.max(1, bounds.width), Math.max(1, bounds.height));
    this._cascadeFilter.uniforms.uOrigin.set(bounds.left, bounds.top);
    this._cascadeFilter.uniforms.uTexel.set(texel);
    this._cascadeFilter.uniforms.uFar.set(far);
    this._gatherFilter.uniforms.uView.set(bounds.left, bounds.top, Math.max(1, bounds.width), Math.max(1, bounds.height));
    this._gatherFilter.uniforms.uOrigin.set(bounds.left, bounds.top);
    this._gatherFilter.uniforms.uProbes.set(this._probesX, this._probesY);
    this._gatherFilter.uniforms.uSpacing.set(spacing);
    this._gatherFilter.uniforms.uTile.set(2);
    this._gatherFilter.uniforms.uAmbient.set(ambient.r / 255, ambient.g / 255, ambient.b / 255);
  }

  public destroy(): void {
    this.emissionPass.destroy();
    this.cascadePass.destroy();
    this._cascadeFilter.destroy();
    this._gatherFilter.destroy();
    this._batch.destroy();
    this._material.destroy();
    this._geometry.destroy();
    this._chain[0].destroy();
    this._chain[1].destroy();
    this._above.destroy();
    this._emission.destroy();
    this._emitterCount = 0;
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

  private _drawEmitters(pass: PassContext): void {
    if (this._view !== null) {
      this.drawEmitters(pass, this._view);
    }
  }

  /**
   * Build from the coarsest level down, then gather the finest into the light
   * target.
   *
   * Coarse to fine is the whole order of the technique: a level can only add
   * what the level above it already knows, so the merge has to happen on the
   * way down and each level is read exactly once.
   */
  private _build(pass: PassContext): void {
    const { backend } = pass;
    const [first, second] = this._chain;

    let source = this._above;
    let flipped = false;

    for (let level = this._levels - 1; level >= 0; level--) {
      const tile = 2 ** (level + 1);
      const start = (this._interval * (4 ** level - 1)) / 3;
      const destination = flipped ? second : first;

      this._cascadeFilter.uniforms.uProbes.set(this._probesX / 2 ** level, this._probesY / 2 ** level);
      this._cascadeFilter.uniforms.uSpacing.set(this._spacing * 2 ** level);
      this._cascadeFilter.uniforms.uTile.set(tile);
      this._cascadeFilter.uniforms.uRange.set(start, (this._interval * (4 ** (level + 1) - 1)) / 3);
      this._cascadeFilter.uniforms.uMerge.set(level === this._levels - 1 ? 0 : 1);
      this._cascadeFilter.apply(backend, source, destination);

      source = destination;
      flipped = !flipped;
    }

    this._gatherFilter.apply(backend, source, this._target);
  }
}
