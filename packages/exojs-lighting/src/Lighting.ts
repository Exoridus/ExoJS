import { type Application, Color, type Filter } from '@codexo/exojs';

import { ForwardBackend } from './backends/ForwardBackend';
import type { LightingBackend } from './backends/LightingBackend';
import { LightmapBackend } from './backends/LightmapBackend';
import type { Light } from './lights/Light';

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
 * `'light'` shows the accumulated light field on its own, which is how you see
 * where a light reaches without the scene's own colours in the way. A renderer
 * with no such intermediate - `forward` shades inside the sprite shader -
 * ignores it.
 */
export type LightingDebugView = 'light' | null;

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

    return new LightmapBackend({ app: options.app, resolution: options.lightResolution ?? 0.5 });
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
   * `'forward'`. Passing it installs two passes in `app.framePasses` and takes
   * them out again on {@link Lighting.destroy}.
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
   * Lights the `forward` renderer's texture is sized for; lights beyond it are
   * skipped. Defaults to `64`.
   */
  readonly maxLights?: number;
}

/**
 * The lighting system: lights, materials and occluders in, a shaded frame out.
 *
 * ```ts
 * const lighting = new Lighting({ ambient: Color.fromCss('#0b1020') });
 *
 * app.systems.add(lighting);
 * lighting.add(player.addChild(new PointLight({ radius: 260 })));
 * ```
 *
 * # What it owns
 *
 * The renderer and its GPU resources. Lights are scene nodes owned by the tree
 * they hang in - registering one does not transfer ownership, and destroying a
 * registered light unregisters it. Filters passed as `post` are the caller's.
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
  private readonly _backend: LightingBackend;

  public constructor(options: LightingOptions = {}) {
    this.ambient = options.ambient ?? new Color(28, 28, 38);
    this.post = options.post ?? [];
    this._backend = createBackend(options);
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

  /** `System` update phase: publish this frame's lights to the renderer. */
  public update(): void {
    this._backend.publish(this._lights, this.ambient);
  }

  /** Release the renderer's resources. Registered lights are unregistered, not destroyed. */
  public destroy(): void {
    this.clear();
    this._backend.destroy();
  }
}
