import { type Application, Color, type Filter, Rectangle, TextureFormat } from '@codexo/exojs';

import { ForwardBackend } from './backends/ForwardBackend';
import type { LightingBackend } from './backends/LightingBackend';
import { LightmapBackend } from './backends/LightmapBackend';
import type { LightingRenderer } from './backends/radiance';
import type { Light } from './lights/Light';
import { lightRadius } from './lights/reach';
import { SunLight } from './lights/SunLight';
import type { NormalSource } from './normals/Normals';
import type { NormalSurface, NormalSurfaceDrawable } from './normals/NormalSurface';
import { OccluderField } from './occluders/OccluderField';
import type { OccluderSource } from './occluders/OccluderSource';

/**
 * Which renderer shades the scene. The scene never names one: it describes what
 * emits and what blocks, and the system reports which renderer turned that into
 * pixels.
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
 *   each light, so a lit surface lights what is beside it. It is opt-in, needs
 *   a renderable float target, and does NOT make a scene look the way the other
 *   two renderers make it look.
 */
export type LightingQuality = 'forward' | 'lightmap' | 'radiance';

/**
 * What {@link LightingOptions.quality} accepts: one of the two built-in
 * renderers by name, `'auto'` to let the system pick from what it has been
 * given, or a renderer imported as a value.
 *
 * `'auto'` resolves once, at construction, and {@link Lighting.quality} then
 * reports what it settled on - so a scene still never has to name a renderer,
 * and asking which one ran is still answerable.
 *
 * `'radiance'` is deliberately NOT a name here. Its cascades and the distance
 * field they trace are linked only by a project that imports `radiance()`, so
 * naming it as a string would put the whole of it into every bundle that reads
 * `quality` from a config file.
 */
export type LightingQualityOption = 'auto' | 'forward' | 'lightmap' | LightingRenderer;

/**
 * Intermediate to draw instead of the shaded frame. `null` shades normally.
 *
 * - `'light'` shows the accumulated light field on its own, which is how you
 *   see where a light reaches without the scene's own colours in the way.
 * - `'mask'` shows the occluder mask: the same edges the `occluders` view draws,
 *   rasterised into a target of their own at the light field's resolution and
 *   widened so none of them can fall between two texels. It is the input a
 *   GPU-resident occluder field marches, and the view that says whether a wall
 *   is thick enough to be seen at that resolution.
 * - `'distance'` shows the distance field built from that mask: how far the
 *   nearest occluder is, as a ramp from black at a wall to white at the far end
 *   of what the camera can see. It is what a ray steps along instead of
 *   marching a texel at a time, and the view that says whether the field found
 *   the walls at all.
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
export type LightingDebugView = 'distance' | 'light' | 'mask' | 'normals' | 'occluders' | null;

const scratchPosition = { x: 0, y: 0 };

/**
 * Build the renderer the options ask for. `'lightmap'` without an application
 * is a contradiction rather than a degraded mode - it has no frame to multiply -
 * so it is refused at construction rather than silently shading differently,
 * and so is a filter chain with nowhere to run.
 */
const createBackend = (options: LightingOptions, post: readonly Filter[]): LightingBackend => {
  // `auto` resolves on what the caller actually handed over: the lightmap
  // renderer works on the application's frame, so an application is the whole
  // of what it needs, and without one there is no frame to light.
  const requested = options.quality ?? 'auto';
  const renderer = typeof requested === 'object' ? requested : null;
  const resolved: LightingQuality = options.app === undefined ? 'forward' : 'lightmap';
  const named: LightingQuality = requested === 'auto' || typeof requested === 'object' ? resolved : requested;
  const quality: LightingQuality = renderer === null ? named : renderer.quality;

  // A filter chain is a frame pass whichever renderer is in use, and a frame
  // pass needs the frame slot to install itself in. Refusing it is the only
  // answer that is the same in both modes; degrading to "the option was
  // ignored" is what this option did for its first release.
  if (post.length > 0 && options.app === undefined) {
    throw new Error('Lighting({ post }) needs the application whose frame the filters run on: pass `app`.');
  }

  if (quality !== 'forward') {
    if (options.app === undefined) {
      throw new Error(`Lighting({ quality: '${quality}' }) needs the application whose frame it lights: pass \`app\`.`);
    }

    // The cascades live in float targets from end to end - a field of radiance
    // has no ceiling to clamp at - so a surface that cannot render one is
    // refused rather than shaded differently under the same name.
    if (renderer !== null && !options.app.rendering.supportsColorFormat(TextureFormat.Rgba16F)) {
      throw new Error(`Lighting({ quality: ${quality}() }) needs renderable float targets, which this device does not have. Use 'lightmap' or 'auto'.`);
    }

    return new LightmapBackend({
      app: options.app,
      post,
      resolution: options.lightResolution ?? 0.5,
      shadowResolution: Math.max(8, Math.round(options.shadowResolution ?? 256)),
      fields: renderer?._fields ?? null,
    });
  }

  return new ForwardBackend({ maxLights: options.maxLights ?? 64, post, app: options.app ?? null });
};

/** Construction options for {@link Lighting}. */
export interface LightingOptions {
  /**
   * Renderer to shade with, or `'auto'` to take the best one the other options
   * allow. Defaults to `'auto'`, which means `'lightmap'` when
   * {@link LightingOptions.app} was passed and `'forward'` when it was not.
   *
   * It resolves at construction and never changes afterwards;
   * {@link Lighting.quality} reports what it resolved to. Naming a renderer
   * outright is what a scene does when it needs a property only that one has -
   * `'forward'` for normal maps on a `LitMaterial`, `'lightmap'` for shadows
   * and an uncapped light count.
   */
  readonly quality?: LightingQualityOption;
  /**
   * The application whose frame is lit. Required by `'lightmap'` and by a
   * non-empty {@link LightingOptions.post}; a `'forward'` system without
   * filters needs nothing else. Passing it installs the renderer's passes in
   * `app.framePasses` and takes them out again on {@link Lighting.destroy}.
   */
  readonly app?: Application;
  /**
   * Texels per logical unit of the `lightmap` renderer's light target. Light is
   * low-frequency, so half resolution is hard to tell apart and costs a quarter
   * of the fill. Defaults to `0.5`.
   */
  readonly lightResolution?: number;
  /**
   * Baseline colour every lit fragment receives regardless of any light, as a
   * multiplier on the albedo - `255` per channel means "unlit areas keep their
   * full albedo". Stored by reference and re-read every frame.
   */
  readonly ambient?: Color;
  /**
   * Filters applied to the shaded frame, in order. A bloom belongs here rather
   * than on a node: it reads the light the system produced, including the parts
   * no single node drew.
   *
   * They run as one pass in `app.framePasses`, so {@link LightingOptions.app}
   * is required whenever the chain is non-empty, in either renderer. Under
   * `lightmap` the chain reads the composite, which is where the light the
   * system accumulated is still above `1.0` (see {@link Lighting.hdr}); under
   * `forward` it reads the frame the sprite shader shaded.
   *
   * Caller-owned, and fixed for the system's lifetime - the filters' own
   * parameters stay live, which is what an animated effect actually needs.
   */
  readonly post?: readonly Filter[];
  /**
   * Angular bins in each light's shadow map. A bin is the finest shadow edge
   * the renderer can resolve, so a large light on a high-resolution canvas
   * wants more of them; the cost is linear in the light count. Defaults to
   * `256`.
   */
  readonly shadowResolution?: number;
  /**
   * Lights the `forward` renderer's texture is sized for; lights beyond it are
   * skipped. Defaults to `64`.
   */
  readonly maxLights?: number;
}

/**
 * The lighting system: lights, materials and occluders in, a shaded frame out.
 *
 * ```ts
 * const lighting = new Lighting({ quality: 'lightmap', app, ambient: new Color(11, 16, 32) });
 *
 * scene.systems.add(lighting);
 * lighting.add(player.addChild(new PointLight({ radius: 260 })));
 * lighting.occludeFrom(Occluders.fromPhysics(world));
 * ```
 *
 * # What it owns
 *
 * The renderer and its GPU resources. Lights are scene nodes owned by the tree
 * they hang in - registering one does not transfer ownership, and destroying a
 * registered light unregisters it. Occluder sources and filters passed as
 * `post` are the caller's too.
 *
 * # Ordering
 *
 * Register it with the registry that ticks AFTER the code moving the lights, so
 * the frame it shades is the frame that was drawn. `app.systems` runs its update
 * phase before the active scene's, so a system registered there sees lights the
 * scene has not moved yet; `scene.systems` is usually what you want.
 */
export class Lighting {
  /** Baseline colour applied to every lit fragment. Mutable; re-read every frame. */
  public ambient: Color;
  /** Intermediate to show instead of the shaded frame. See {@link LightingDebugView}. */
  public get debug(): LightingDebugView {
    return this._backend.debug;
  }

  public set debug(view: LightingDebugView) {
    this._backend.debug = view;
  }

  private readonly _app: Application | null;
  private readonly _post: readonly Filter[];
  private readonly _lights: Light[] = [];
  private readonly _occluders: OccluderSource[] = [];
  private readonly _surfaces: NormalSurface[] = [];
  private readonly _field = new OccluderField();
  private readonly _region = new Rectangle();
  private readonly _backend: LightingBackend;

  public constructor(options: LightingOptions = {}) {
    this.ambient = options.ambient ?? new Color(28, 28, 38);
    this._app = options.app ?? null;
    this._post = options.post ?? [];
    this._backend = createBackend(options, this._post);
    // Publish once up front: a renderer that has never been told the ambient
    // term shades an untouched scene black, and "black until the first tick"
    // is not a state the vocabulary admits.
    this._backend.publish(this._lights, this.ambient, this._field, this._surfaces);
  }

  /** Filters over the shaded frame, in order. See {@link LightingOptions.post}. */
  public get post(): readonly Filter[] {
    return this._post;
  }

  /** The renderer in use. */
  public get quality(): LightingQuality {
    return this._backend.quality;
  }

  /**
   * Whether light accumulates with headroom above `1.0`, so that overlapping
   * lights add up instead of saturating to white and a filter in
   * {@link post} has something above the clipping point to work with.
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
   * a renderer that takes its normals from a material.
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
   * lighting.occludeFrom(Occluders.fromPhysics(world));
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
   * lighting.normalsFrom(crate, normalMap(crateNormals));
   * ```
   *
   * Only a renderer that shades a light field of its own reads these -
   * `forward` shades inside the sprite stage and takes its normals from
   * {@link LitMaterial} instead. Nothing is required of a drawable that is not
   * registered: it is lit as a plane, which is what the renderer already
   * assumed of everything.
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
   * Gather the occluders for the region the lights jointly reach.
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

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // A directional light has no reach to bound, so what bounds it is what can
    // be seen: its shadows are parallel and every visible occluder casts one.
    // The renderer reads the same view when it builds the strips, so the two
    // agree without the region having to travel between them.
    if (this._app !== null && this._lights.some(light => light instanceof SunLight && light.enabled && light.intensity > 0)) {
      const view = this._app.rendering.view.getBounds();

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
