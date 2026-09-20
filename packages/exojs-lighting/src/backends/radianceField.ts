import {
  CallbackRenderPass,
  type Color,
  Matrix,
  type PassContext,
  RenderTexture,
  ScaleModes,
  ShaderFilter,
  type Texture,
  TextureFormat,
  type UniformFieldAccessors,
  UniformType,
  type View,
} from '@codexo/exojs';

import type { Light } from '../lights/Light';
import { lightRadius } from '../lights/reach';
import { SunLight } from '../lights/SunLight';
import { type transportBounceUniforms, transportCascadeShader, transportGatherShader, type transportUniforms } from './transportShaders';

/** What one cascade level is told about this frame. @internal */
export const cascadeUniforms = {
  uOrigin: UniformType.Vec2,
  uProbes: UniformType.Vec2,
  uRange: UniformType.Vec2,
  uSun: UniformType.Vec4,
  uSunColor: UniformType.Vec3,
  uSpacing: UniformType.Float,
  uTile: UniformType.Float,
  uMerge: UniformType.Float,
  uCone: UniformType.Float,
} as const;

/** What the reconstruction at each fragment is told about this frame. @internal */
export const gatherUniforms = {
  uToWorld: UniformType.Vec4,
  uWorldOffset: UniformType.Vec2,
  uOrigin: UniformType.Vec2,
  uProbes: UniformType.Vec2,
  uAmbient: UniformType.Vec3,
  uSpacing: UniformType.Float,
  uTile: UniformType.Float,
} as const;

/** Levels the chain is allowed to grow to. Each one quadruples the reach, so six cover any surface. */
const MAX_CASCADES = 6;

/**
 * A directional light's angular radius per unit of `softness`, in radians.
 *
 * It is the fraction of its own reach a positional source takes as its
 * emitting radius, read as an angle, so the same `softness` softens a shadow
 * by about as much whichever shape casts it.
 */
const SUN_SIZE = 0.05 * Math.PI;

const scratchDirection = { x: 0, y: 0 };

/**
 * Describe this frame's tables and occluder mask to one filter that walks them.
 *
 * Every filter carries its own uniform block, so each walking filter has to be
 * told separately rather than once for the chain: an unwritten block reads
 * zero, and a walk over a grid of no cells and a mask of no texels reports
 * every stretch as unobstructed and empty. `toField` is the view the mask was
 * drawn through, which is the wider field view rather than the camera's.
 */
const writeTransportUniforms = (target: UniformFieldAccessors<typeof transportUniforms>, binding: TransportBinding, toField: Matrix): void => {
  target.uGridOrigin.set(binding.originX, binding.originY);
  target.uGridCells.set(binding.cellsX, binding.cellsY);
  target.uCellSize.set(binding.cellSize);
  target.uTableWidth.set(binding.tableWidth);
  target.uMaskCells.set(binding.maskWidth, binding.maskHeight);
  target.uMaskBasis.set(toField.a, toField.b, toField.c, toField.d);
  target.uMaskOffset.set(toField.x, toField.y);
  target.uMaskBlocks.set(binding.blocksWidth, binding.blocksHeight);
};

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
  /** Builds the chain from the coarsest level down and gathers it into the light target. */
  public readonly cascadePass: CallbackRenderPass;

  private readonly _options: RadianceFieldOptions;
  private readonly _target: RenderTexture;
  /** What the camera drew before the light was applied: the albedo a bounce is tinted by. */
  private readonly _frame: RenderTexture;
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
  /**
   * The cascade over the transport chunk, built when a walk over geometry is
   * bound. Nothing measures merge weights beforehand: the walk to a coarser
   * probe already reports what reached it.
   */
  private _transportCascade: ShaderFilter<typeof cascadeUniforms & typeof transportUniforms & typeof transportBounceUniforms> | null = null;
  /** The receiver reconstruction over the same walk: a fragment reaches its probes or it does not. */
  private _transportGather: ShaderFilter<typeof gatherUniforms & typeof transportUniforms> | null = null;
  private _walk: TransportBinding | null = null;
  private _walkRevision = -1;
  private _levels = 1;
  private _probesX = 1;
  private _probesY = 1;
  private _spacing = 1;
  private _interval = 1;
  private _emitterCount = 0;
  private _sun: SunLight | null = null;

  public constructor(target: RenderTexture, frame: RenderTexture, options: RadianceFieldOptions) {
    this._target = target;
    this._frame = frame;
    this._options = options;
    this._chain = [
      new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest }),
      new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest }),
    ];
    this._above = new RenderTexture(1, 1, { format: TextureFormat.Rgba16F, scaleMode: ScaleModes.Nearest });
    this.cascadePass = new CallbackRenderPass((pass: PassContext) => this._build(pass), { label: 'lighting:cascades', enabled: false });
  }

  /** Lights the last {@link collectSources} counted, the sky's directional light included. */
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

    this.cascadePass.enabled = enabled;
  }

  /**
   * Take this frame's sky from its lights, and answer how many of them light
   * anything at all.
   *
   * Every positional source reaches the chain as an entry in the transport
   * tables, which carry their own shape and density. A directional light has
   * no place to emit from, so the first enabled one becomes the sky instead:
   * what every ray that reaches the top of the chain unblocked ends in.
   */
  public collectSources(lights: readonly Light[]): number {
    this._sun = null;

    let written = 0;

    for (const light of lights) {
      // A positive test rather than `<= 0`, so a non-finite intensity counts
      // as emitting nothing here too rather than as a source the tables then
      // leave out.
      if (!light.enabled || !(light.intensity > 0)) {
        continue;
      }

      if (light instanceof SunLight) {
        if (this._sun === null) {
          this._sun = light;
          written++;
        }

        continue;
      }

      if (lightRadius(light) > 0) {
        written++;
      }
    }

    this._emitterCount = written;

    return written;
  }

  /**
   * Point the chain at this frame's geometry, or stand it down with `null`.
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
    this._transportGather?.destroy();
    this._transportCascade = ShaderFilter.from(transportCascadeShader(cascadeUniforms), {
      textures: { ...binding.textures, uFrame: this._frame, uHistory: this._target },
    });
    this._transportGather = ShaderFilter.from(transportGatherShader(gatherUniforms), { textures: { ...binding.textures } });
    this._walkRevision = binding.revision;
  }

  /**
   * Lay out the chain for this frame's camera and hand it the terms it shades
   * with.
   *
   * `view` is the camera, whose axis-aligned bounds the probes cover and whose
   * target the gather writes; `field` is the wider view the occluder mask was
   * drawn through, which is how a ray reads it. `texel` is one field texel in
   * world units. The number of levels follows the view's own diagonal, because
   * each level quadruples the reach of the one below.
   */
  public update(view: View, field: View, texel: number, ambient: Color): void {
    const bounds = view.getBounds();
    const spacing = Math.max(1, this._options.probeSpacing) * texel;
    const toField = field.getTransform();
    const toWorld = view.getInverseTransform();

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

    const walking = this._walk;

    if (this._transportCascade !== null && walking !== null) {
      this._transportCascade.uniforms.uOrigin.set(bounds.left, bounds.top);
      writeTransportUniforms(this._transportCascade.uniforms, walking, toField);
    }

    this._writeSun();

    if (this._transportGather !== null) {
      const gather = this._transportGather.uniforms;

      gather.uToWorld.set(toWorld.a, toWorld.b, toWorld.c, toWorld.d);
      gather.uWorldOffset.set(toWorld.x, toWorld.y);
      gather.uOrigin.set(bounds.left, bounds.top);
      gather.uProbes.set(this._probesX, this._probesY);
      gather.uSpacing.set(spacing);
      gather.uTile.set(2);
      gather.uAmbient.set(ambient.r / 255, ambient.g / 255, ambient.b / 255);

      if (walking !== null) {
        writeTransportUniforms(gather, walking, toField);
      }
    }

    if (this._options.bounce > 0) {
      this._writeReprojection(view, toWorld);
    }

    if (this._transportCascade !== null) {
      const cascade = this._transportCascade.uniforms;
      const toClip = this._pendingToClip;

      cascade.uToClip.set(toClip.a, toClip.b, toClip.c, toClip.d);
      cascade.uClipOffset.set(toClip.x, toClip.y);
      cascade.uReproject.set(this._reproject.a, this._reproject.b, this._reproject.c, this._reproject.d);
      cascade.uReprojectOffset.set(this._reproject.x, this._reproject.y);
      cascade.uBounce.set(this._options.bounce);
      // A whole texel back along the ray, which is the texel the stretch came
      // through: half of one can still land inside the texel that stopped it.
      cascade.uBounceStep.set(texel);
      // One pixel of the frame, in world units: what the albedo is quantised
      // by, which is not what the light field is quantised by.
      cascade.uAlbedoStep.set(bounds.width / Math.max(1, this._frame.width));
      cascade.uHistoryValid.set(this._history ? 1 : 0);
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
   * the gathered frame's transform - because that is the space a ray's
   * end point is looked up in.
   *
   * The camera it reprojects FROM is the one the last gather actually ran
   * with, not the last one prepared. Promoting it here instead would pair the
   * light field with a camera it was never rendered through: the system
   * publishes once from its own constructor, and an application is free to
   * update more often than it draws.
   */
  private _writeReprojection(view: View, toWorld: Matrix): void {
    this._reproject.copy(toWorld).combine(this._gatheredToClip);
    this._pendingToClip.copy(view.getTransform());
  }

  public destroy(): void {
    this.cascadePass.destroy();
    this._chain[0].destroy();
    this._chain[1].destroy();
    this._above.destroy();
    this._transportCascade?.destroy();
    this._transportGather?.destroy();
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
    const cascade = this._transportCascade;

    if (cascade === null) {
      return;
    }

    if (sun === null) {
      cascade.uniforms.uSun.set(0, 0, 0, 0);
      cascade.uniforms.uSunColor.set(0, 0, 0);

      return;
    }

    const radius = Math.max(0.001, sun.softness * SUN_SIZE);

    sun.getWorldDirection(scratchDirection);
    cascade.uniforms.uSun.set(scratchDirection.x, scratchDirection.y, radius, (sun.intensity * Math.PI) / radius);
    cascade.uniforms.uSunColor.set(sun.color.r / 255, sun.color.g / 255, sun.color.b / 255);
  }

  /**
   * Build from the coarsest level down, then gather the finest into the light
   * target.
   *
   * Coarse to fine is the whole order of the technique: a level can only add
   * what the level above it already knows, so the merge has to happen on the
   * way down and each level is read exactly once.
   *
   * Nothing is built before the geometry to walk is bound: without the tables
   * a level has nothing to trace against, and a chain built over an unbound
   * walk would gather a frame of whatever its targets happened to hold.
   */
  private _build(pass: PassContext): void {
    const { backend } = pass;
    const [first, second] = this._chain;
    const cascade = this._transportCascade;
    const gather = this._transportGather;

    if (cascade === null || gather === null || this._walk === null) {
      return;
    }

    let source = this._above;
    let flipped = false;

    for (let level = this._levels - 1; level >= 0; level--) {
      const tile = 2 ** (level + 1);
      const start = (this._interval * (4 ** level - 1)) / 3;
      const spacing = this._spacing * 2 ** level;
      const destination = flipped ? second : first;
      const top = level === this._levels - 1;

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

    gather.apply(backend, source, this._target);

    // The light field now holds this frame, so the camera it was gathered
    // through becomes what the next bounce reprojects from - and only now is
    // there anything for it to read at all.
    this._gatheredToClip.copy(this._pendingToClip);
    this._history = true;
  }
}
