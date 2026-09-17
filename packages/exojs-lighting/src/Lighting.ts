import { type Application, Color, type Filter, Rectangle } from '@codexo/exojs';

import { ForwardBackend } from './backends/ForwardBackend';
import type { LightingBackend } from './backends/LightingBackend';
import { LightmapBackend } from './backends/LightmapBackend';
import type { Light } from './lights/Light';
import { lightRadius } from './lights/reach';
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
 *   the frame by it. No light cap, and the accumulated field is what a shadow
 *   pass writes into; it gives up normal mapping in exchange, because the frame
 *   it multiplies is already flat.
 */
export type LightingQuality = 'forward' | 'lightmap';

/**
 * Intermediate to draw instead of the shaded frame. `null` shades normally.
 *
 * - `'light'` shows the accumulated light field on its own, which is how you
 *   see where a light reaches without the scene's own colours in the way.
 * - `'occluders'` draws the silhouettes the registered sources collected this
 *   frame over the shaded scene, which is how you see what the shadows are
 *   actually being cast from.
 *
 * A renderer with no such intermediate - `forward` shades inside the sprite
 * shader and casts no shadows - ignores it.
 */
export type LightingDebugView = 'light' | 'occluders' | null;

const scratchPosition = { x: 0, y: 0 };

/**
 * Build the renderer the options ask for. `'lightmap'` without an application
 * is a contradiction rather than a degraded mode - it has no frame to multiply -
 * so it is refused at construction rather than silently shading differently.
 */
const createBackend = (options: LightingOptions): LightingBackend => {
  const quality = options.quality ?? 'forward';

  if (quality === 'lightmap') {
    if (options.app === undefined) {
      throw new Error("Lighting({ quality: 'lightmap' }) needs the application whose frame it lights: pass `app`.");
    }

    return new LightmapBackend({
      app: options.app,
      resolution: options.lightResolution ?? 0.5,
      shadowResolution: Math.max(8, Math.round(options.shadowResolution ?? 256)),
    });
  }

  return new ForwardBackend({ maxLights: options.maxLights ?? 64 });
};

/** Construction options for {@link Lighting}. */
export interface LightingOptions {
  /**
   * Renderer to shade with. Defaults to `'forward'`, which needs nothing else;
   * `'lightmap'` needs {@link LightingOptions.app}, because it works on the
   * frame the application drew.
   */
  readonly quality?: LightingQuality;
  /**
   * The application whose frame is lit. Required by `'lightmap'`, unused by
   * `'forward'`. Passing it installs the renderer's passes in
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
  /** Filters applied to the shaded frame, in order. Caller-owned. */
  public post: readonly Filter[];
  /** Intermediate to show instead of the shaded frame. See {@link LightingDebugView}. */
  public get debug(): LightingDebugView {
    return this._backend.debug;
  }

  public set debug(view: LightingDebugView) {
    this._backend.debug = view;
  }

  private readonly _lights: Light[] = [];
  private readonly _occluders: OccluderSource[] = [];
  private readonly _field = new OccluderField();
  private readonly _region = new Rectangle();
  private readonly _backend: LightingBackend;

  public constructor(options: LightingOptions = {}) {
    this.ambient = options.ambient ?? new Color(28, 28, 38);
    this.post = options.post ?? [];
    this._backend = createBackend(options);
    // Publish once up front: a renderer that has never been told the ambient
    // term shades an untouched scene black, and "black until the first tick"
    // is not a state the vocabulary admits.
    this._backend.publish(this._lights, this.ambient, this._field);
  }

  /** The renderer in use. */
  public get quality(): LightingQuality {
    return this._backend.quality;
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

  /** `System` update phase: publish this frame's lights and occluders to the renderer. */
  public update(): void {
    this._collect();
    this._backend.publish(this._lights, this.ambient, this._field);
  }

  /** Release the renderer's resources. Registered lights and sources are unregistered, not destroyed. */
  public destroy(): void {
    this.clear();
    this.clearOccluders();
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
    if (this._occluders.length === 0 || !this._backend.castsShadows) {
      this._field.clear();

      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

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
