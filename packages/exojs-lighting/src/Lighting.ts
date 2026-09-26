import { Color, type Filter, Rectangle } from '@codexo/exojs';

import type { LightingBackend } from './backends/LightingBackend';
import type { LightingHost } from './LightingHost';
import type { Light } from './lights/Light';
import { lightRadius } from './lights/reach';
import { SunLight } from './lights/SunLight';
import type { NormalSource } from './normals/NormalSource';
import type { NormalSurface, NormalSurfaceDrawable } from './normals/NormalSurface';
import { OccluderField } from './occluders/OccluderField';
import type { OccluderSource } from './occluders/OccluderSource';

/**
 * Which renderer shades the scene, as {@link Lighting.quality} reports it.
 *
 * A scene never names one: it constructs the system it wants - see
 * {@link ForwardLighting}, {@link LightmapLighting} and
 * {@link RadianceLighting} - and reads this back to say which one is running.
 *
 * - `forward` shades inside the sprite shader against a capacity-bounded light
 *   texture. One draw, no extra targets, and the only renderer that does normal
 *   mapping - but every lit fragment walks every light, so the count is capped.
 * - `lightmap` accumulates the lights into a target of their own and multiplies
 *   the frame by it. No light cap, shadows from the registered occluder
 *   sources, and normals from a prepass over the registered surfaces rather
 *   than from a material.
 * - `radiance` fills the same light field from a chain of radiance cascades
 *   instead: light propagates from the emitters rather than falling off around
 *   each light, so a lamp fills the room it stands in, thins with distance
 *   instead of ending at a radius, and casts penumbrae that widen the way a
 *   source with a size does. It needs a renderable float target, and does NOT
 *   make a scene look the way the other two renderers make it look.
 */
export type LightingQuality = 'forward' | 'lightmap' | 'radiance';

/**
 * Intermediate to draw instead of the shaded frame. `null` shades normally.
 *
 * - `'light'` shows the accumulated light field on its own, which is how you
 *   see where a light reaches without the scene's own colours in the way.
 * - `'mask'` shows the occluder mask: this frame's blocking edges and
 *   handed-over drawables, rasterised into a target of their own at the light
 *   field's resolution and widened so none of them can fall between two texels.
 *   It reaches past the view by `fieldMargin`; the view shows its own part. It
 *   is the input a GPU-resident occluder field marches, and the view that says
 *   whether a wall is thick enough to be seen at that resolution.
 * - `'normals'` shows the normal prepass: the world-space normals the
 *   registered surfaces described this frame, encoded the way a normal map is.
 *   Black is where nothing described a surface, and light lands there with no
 *   `N dot L` term at all.
 * - `'occluders'` draws the silhouettes the registered sources collected this
 *   frame over the shaded scene, which is how you see what the shadows are
 *   actually being cast from.
 *
 * A renderer with no such intermediate - `forward` shades inside the sprite
 * shader and casts no shadows - ignores it.
 */
export type LightingDebugView = 'light' | 'mask' | 'normals' | 'occluders' | null;

/** What every lighting system takes, whichever renderer it is. */
export interface LightingOptions {
  /**
   * Baseline colour every lit fragment receives regardless of any light, as a
   * multiplier on the albedo - `255` per channel means "unlit areas keep their
   * full albedo". Stored by reference and re-read every frame.
   */
  readonly ambient?: Color;
  /** Filters over the shaded frame, in order. Each concrete system documents what they read. */
  readonly post?: readonly Filter[];
}

const scratchPosition = { x: 0, y: 0 };

/**
 * What a lighting system does with lights, materials and occluders, whichever
 * renderer turns them into pixels.
 *
 * ```ts
 * // In Scene.init(), where the scene's application is attached:
 * const lighting = new LightmapLighting(this.app, { ambient: new Color(11, 16, 32) });
 *
 * this.systems.add(lighting);
 * lighting.add(player.addChild(new PointLight({ radius: 260 })));
 * lighting.occludeFrom(new PhysicsOccluder(world));
 * ```
 *
 * Construct one of {@link ForwardLighting}, {@link LightmapLighting} or
 * {@link RadianceLighting}. They are alternative lighting models rather than
 * layers or quality levels, and a frame is shaded by exactly one of them:
 * forward lighting shades materials as they draw, lightmap lighting shades the
 * composed frame and can use a registered normal prepass, and radiance lighting
 * samples a propagated light field. This class is what they share: the
 * registries, the collection of occluders, and the update and destroy
 * contracts. It links no renderer of its own, which is what keeps a project
 * using one of them from carrying the others.
 *
 * # What it owns
 *
 * The renderer and its GPU resources. Lights are scene nodes owned by the tree
 * they hang in - registering one does not transfer ownership, and destroying a
 * registered light unregisters it. Occluder and normal sources, filters passed
 * as `post`, and the host are the caller's too.
 *
 * # Ordering
 *
 * Register it with the registry that ticks AFTER the code moving the lights, so
 * the frame it shades is the frame that was drawn. `app.systems` runs its update
 * phase before the active scene's, so a system registered there sees lights the
 * scene has not moved yet; `scene.systems` is usually what you want.
 */
export abstract class Lighting {
  /** Baseline colour applied to every lit fragment. Mutable; re-read every frame. */
  public ambient: Color;

  protected readonly _backend: LightingBackend;

  private readonly _host: LightingHost | null;
  private readonly _post: readonly Filter[];
  private readonly _lights: Light[] = [];
  private readonly _occluders: OccluderSource[] = [];
  private readonly _surfaces: NormalSurface[] = [];
  private readonly _field = new OccluderField();
  private readonly _region = new Rectangle();

  /**
   * `backend` is built by the concrete system and belongs to this one from
   * here on; `host` is the caller's and is never destroyed.
   */
  protected constructor(backend: LightingBackend, host: LightingHost | null, options: LightingOptions) {
    this.ambient = options.ambient ?? new Color(28, 28, 38);
    this._host = host;
    this._post = options.post ?? [];
    this._backend = backend;
    // Publish once up front: a renderer that has never been told the ambient
    // term shades an untouched scene black, and "black until the first tick"
    // is not a state the vocabulary admits.
    this._backend.publish(this._lights, this.ambient, this._field, this._surfaces);
  }

  /** Filters over the shaded frame, in order. Caller-owned and fixed for this system's lifetime. */
  public get post(): readonly Filter[] {
    return this._post;
  }

  /** Intermediate to show instead of the shaded frame. See {@link LightingDebugView}. */
  public get debug(): LightingDebugView {
    return this._backend.debug;
  }

  public set debug(view: LightingDebugView) {
    this._backend.debug = view;
  }

  /**
   * Scale applied to the shaded output, `1` by default.
   *
   * It moves the exposure only: the lights, the transport and the bounce
   * history are all untouched, so raising it shows what a light field holds
   * above `1.0` without changing what any of it computed. That is what makes
   * it the right knob for looking at an overbright scene - turning a light
   * down instead would change the scene being looked at. Under `forward`,
   * where nothing is composited, it does nothing.
   *
   * It is not a tone map: values still clip, one stop further along.
   */
  public get debugExposure(): number {
    return this._backend.debugExposure;
  }

  public set debugExposure(exposure: number) {
    this._backend.debugExposure = exposure;
  }

  /** The renderer in use. */
  public get quality(): LightingQuality {
    return this._backend.quality;
  }

  /**
   * Whether light accumulates with headroom above `1.0`, so that overlapping
   * lights add up instead of saturating to white and a filter over the frame
   * has something above the clipping point to work with.
   *
   * `false` under `forward`, which shades straight into the frame, and under
   * `lightmap` on a WebGL2 context without `EXT_color_buffer_float`. The
   * picture is still correct there - it clips earlier, and a bloom keyed on a
   * threshold near `1.0` finds little to bloom.
   */
  public get hdr(): boolean {
    return this._backend.hdr;
  }

  /** Registered lights, in registration order. */
  public get lights(): readonly Light[] {
    return this._lights;
  }

  /**
   * Lights the last frame actually shaded with. Lower than {@link lights} when
   * some are disabled, have no intensity, or fall beyond what the renderer in
   * use can carry.
   */
  public get activeLightCount(): number {
    return this._backend.activeLightCount;
  }

  /**
   * Surfaces the last frame actually took normals from. Lower than
   * {@link surfaces} when some are hidden or carry no texture, and zero under
   * every renderer but `lightmap`. See {@link normalsFrom}.
   */
  public get activeSurfaceCount(): number {
    return this._backend.activeSurfaceCount;
  }

  /** The renderer in use, for a material that has to bind its data. @internal */
  public get backend(): LightingBackend {
    return this._backend;
  }

  /**
   * Register a light and return it, so it can be created, parented and
   * registered in one expression.
   *
   * Registering the same light twice shades it twice; the second registration
   * is ignored instead.
   */
  public add<T extends Light>(light: T): T {
    if (light._lighting === this) {
      return light;
    }

    light._lighting?.remove(light);
    light._lighting = this;
    this._lights.push(light);

    return light;
  }

  /** Unregister a light. Returns `false` when it was not registered here. */
  public remove(light: Light): boolean {
    const index = this._lights.indexOf(light);

    if (index === -1) {
      return false;
    }

    this._lights.splice(index, 1);
    light._lighting = null;

    return true;
  }

  /** Unregister every light. */
  public clear(): this {
    for (const light of this._lights) {
      light._lighting = null;
    }

    this._lights.length = 0;

    return this;
  }

  /** Registered occluder sources, in registration order. */
  public get occluders(): readonly OccluderSource[] {
    return this._occluders;
  }

  /**
   * Register something that blocks light, and return it so it can be built and
   * registered in one expression. Only a renderer with shadows reads them -
   * `forward` has no light field to darken, and skips collecting entirely.
   *
   * ```ts
   * lighting.occludeFrom(new PhysicsOccluder(world));
   * ```
   *
   * The source is asked, once per frame, for the edges in the region the
   * visible lights jointly reach. It is the caller's; the system only reads
   * it. Registering the same source twice collects it twice, so the second
   * registration is ignored instead.
   */
  public occludeFrom<T extends OccluderSource>(source: T): T {
    if (!this._occluders.includes(source)) {
      this._occluders.push(source);
    }

    return source;
  }

  /** Unregister an occluder source. Returns `false` when it was not registered here. */
  public stopOccluding(source: OccluderSource): boolean {
    const index = this._occluders.indexOf(source);

    if (index === -1) {
      return false;
    }

    this._occluders.splice(index, 1);

    return true;
  }

  /** Unregister every occluder source. */
  public clearOccluders(): this {
    this._occluders.length = 0;

    return this;
  }

  /** Registered normal surfaces, in registration order. */
  public get surfaces(): readonly NormalSurface[] {
    return this._surfaces;
  }

  /**
   * Give a drawable surface normals, and return it so it can be created,
   * parented and registered in one expression.
   *
   * ```ts
   * lighting.normalsFrom(crate, new NormalMap(crateNormals));
   * ```
   *
   * Only `lightmap` reads these. `forward` shades inside the sprite stage and
   * takes its normals from {@link LitMaterial} instead, and `radiance` gathers
   * each probe's rays into one arriving colour, which leaves no incident
   * direction at a fragment for a normal to be measured against - under both,
   * registering a surface is recorded and ignored, and
   * {@link activeSurfaceCount} stays at zero. Nothing is required of a
   * drawable that is not registered: it is lit as a plane, which is what the
   * renderer already assumed of everything.
   *
   * The drawable and the source are the caller's; the system only reads them.
   * Registering the same drawable twice replaces its source rather than
   * describing the surface twice.
   */
  public normalsFrom<T extends NormalSurfaceDrawable>(drawable: T, normals: NormalSource): T {
    const index = this._surfaces.findIndex(surface => surface.drawable === drawable);

    if (index === -1) {
      this._surfaces.push({ drawable, normals });
    } else {
      this._surfaces[index] = { drawable, normals };
    }

    return drawable;
  }

  /** Take a drawable's normals away again. Returns `false` when it had none here. */
  public stopNormals(drawable: NormalSurfaceDrawable): boolean {
    const index = this._surfaces.findIndex(surface => surface.drawable === drawable);

    if (index === -1) {
      return false;
    }

    this._surfaces.splice(index, 1);

    return true;
  }

  /** Unregister every normal surface. */
  public clearSurfaces(): this {
    this._surfaces.length = 0;

    return this;
  }

  /** `System` update phase: publish this frame's lights, occluders and surfaces to the renderer. */
  public update(): void {
    this._collect();
    this._backend.publish(this._lights, this.ambient, this._field, this._surfaces);
  }

  /** Release the renderer's resources. Registered lights and sources are unregistered, not destroyed. */
  public destroy(): void {
    this.clear();
    this.clearOccluders();
    this.clearSurfaces();
    this._field.clear();
    this._backend.destroy();
  }

  /**
   * Gather the occluders for the region the renderer asks for, or for the one
   * the lights jointly reach where it asks for none.
   *
   * One region for the whole scene rather than one per light: a source is then
   * walked once a frame however many lights are on screen, and each light
   * filters the result against its own circle when it builds its shadow map.
   */
  private _collect(): void {
    // Asked before the sources are walked, not after: whether a source may
    // hand a drawable over instead of tracing it is the renderer's answer, and
    // a renderer can be switched between frames.
    this._field.rasterisesDrawables = this._backend.rasterisesOccluders;

    if (this._occluders.length === 0 || !this._backend.castsShadows) {
      this._field.clear();

      return;
    }

    // A renderer that transports light through a field answers with the field
    // itself: what it can see is what is worth collecting, and a light's
    // nominal radius bounds neither.
    if (this._backend.collectRegion(this._region)) {
      this._field.collect(this._occluders, this._region);

      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // A directional light has no reach to bound, so what bounds it is what can
    // be seen: its shadows are parallel and every visible occluder casts one.
    // The renderer reads the same view when it builds the strips, so the two
    // agree without the region having to travel between them.
    if (this._host !== null && this._lights.some(light => light instanceof SunLight && light.enabled && light.intensity > 0)) {
      const view = this._host.rendering.view.getBounds();

      minX = view.left;
      minY = view.top;
      maxX = view.right;
      maxY = view.bottom;
    }

    for (const light of this._lights) {
      if (!light.enabled || light.intensity <= 0) {
        continue;
      }

      const radius = lightRadius(light);

      if (radius <= 0) {
        continue;
      }

      light.getWorldPosition(scratchPosition);
      minX = Math.min(minX, scratchPosition.x - radius);
      minY = Math.min(minY, scratchPosition.y - radius);
      maxX = Math.max(maxX, scratchPosition.x + radius);
      maxY = Math.max(maxY, scratchPosition.y + radius);
    }

    if (minX > maxX) {
      this._field.clear();

      return;
    }

    this._region.set(minX, minY, maxX - minX, maxY - minY);
    this._field.collect(this._occluders, this._region);
  }
}
